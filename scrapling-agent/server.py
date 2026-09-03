"""HUNTFLOW Agent — Scrapling-powered job scraping & auto-apply server.

Run with: uv run uvicorn server:app --port 8001
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import shutil
import threading
import time
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
import concurrent.futures
from dataclasses import dataclass
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import httpx
from connectors.registry import get_connector
from connectors.ats import detect_ats_provider
from rate_limiter import CrawlerRateLimiter

_rate_limiter = CrawlerRateLimiter(default_rps=2.0)

class AtsCrawlTarget(BaseModel):
    provider: str = "greenhouse"
    token: str
    company_name: Optional[str] = None
class AtsCrawlRequest(BaseModel):
    boards: list[AtsCrawlTarget] = Field(default_factory=list)
    keyword: Optional[str] = None
    limit: int = 100

class AtsDiscoverRequest(BaseModel):
    query: str
AGENT_TOKEN = os.environ.get("HUNTFLOW_AGENT_TOKEN", "")

# ---------------------------------------------------------------------------
# Dynamic Agent Config (Cloudinary & Concurrency)
# ---------------------------------------------------------------------------

@dataclass
class AgentConfig:
    cloudinary_cloud_name: str = os.environ.get("CLOUDINARY_CLOUD_NAME", "")
    cloudinary_api_key: str = os.environ.get("CLOUDINARY_API_KEY", "")
    cloudinary_api_secret: str = os.environ.get("CLOUDINARY_API_SECRET", "")
    max_concurrency: int = int(os.environ.get("HUNTFLOW_CRAWL_CONCURRENCY", "1"))
    enabledByDefault: bool = True

config = AgentConfig()

# Per-board enabledByDefault overrides (in-memory only, no auto-write to sources.json)
_enabled_overrides: dict[str, bool] = {}

# Uptime tracking for health detail
_START_TS = time.time()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("huntflow-agent")

# ---------------------------------------------------------------------------
# Activity bus — lets the website watch every agent step in real time
# ---------------------------------------------------------------------------

RUN_DIR = Path(__file__).resolve().parent / ".agent_runs"
RUN_DIR.mkdir(exist_ok=True)

_activity_lock = threading.Lock()
_activity: list[dict[str, Any]] = []       # bounded event log (client-facing)
_activity_seq = 0
_runs: dict[str, dict[str, Any]] = {}      # run_id -> summary
_active_runs: dict[str, dict[str, Any]] = {}  # concurrent active runs: run_id -> summary


def record(run_id: str, message: str, kind: str = "info", data: Optional[dict[str, Any]] = None) -> None:
    """Append one event to the live activity stream (thread-safe, bounded)."""
    global _activity_seq
    with _activity_lock:
        _activity_seq += 1
        event = {
            "id": _activity_seq,
            "run_id": run_id,
            "ts": datetime.now().strftime("%H:%M:%S"),
            "kind": kind,
            "message": message,
            "data": data or {},
        }
        _activity.append(event)
        if len(_activity) > 600:
            del _activity[: len(_activity) - 600]
        run = _runs.get(run_id)
        if run:
            run["last_ts"] = event["ts"]
            run["events"] += 1


def start_run(kind: str, url: str, label: str = "", data: Optional[dict[str, Any]] = None) -> str:
    """Register a new run and mark it active for the live console."""
    run_id = uuid.uuid4().hex[:12]
    with _activity_lock:
        summary = {
            "run_id": run_id,
            "kind": kind,
            "url": url,
            "label": label,
            "started": datetime.now().strftime("%H:%M:%S"),
            "started_ts": time.time(),
            "finished": None,
            "finished_ts": None,
            "status": "running",
            "events": 0,
        }
        _runs[run_id] = summary
        _active_runs[run_id] = summary
        if len(_runs) > 40:
            oldest = sorted(_runs, key=lambda k: _runs[k]["started"])[0]
            del _runs[oldest]
            if oldest in _active_runs:
                del _active_runs[oldest]
    record(run_id, f"🚀 {label or kind} dispatched for {url}", "info", data)
    return run_id


def end_run(run_id: str, status: str, message: str, data: Optional[dict[str, Any]] = None) -> None:
    """Finalize a run (success / failed / manual_required / skipped)."""
    with _activity_lock:
        run = _runs.get(run_id)
        if run:
            run["status"] = status
            run["finished"] = datetime.now().strftime("%H:%M:%S")
            run["finished_ts"] = time.time()
        if run_id in _active_runs:
            del _active_runs[run_id]
    event_kind = "success" if status in ("success", "applied") else "error" if status == "failed" else "warning"
    record(run_id, message, event_kind, data)


def _cloudinary_upload_url(cloud_name: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,255}", cloud_name):
        raise ValueError("Invalid Cloudinary cloud name")
    return f"https://api.cloudinary.com/v1_1/{cloud_name}/image/upload"


def _cloudinary_upload(file_path: Path) -> Optional[str]:
    """Upload a PNG to Cloudinary with a signed request."""
    cloud_name = config.cloudinary_cloud_name or os.environ.get("CLOUDINARY_CLOUD_NAME", "")
    api_key = config.cloudinary_api_key or os.environ.get("CLOUDINARY_API_KEY", "")
    api_secret = config.cloudinary_api_secret or os.environ.get("CLOUDINARY_API_SECRET", "")

    if not (cloud_name and api_key and api_secret):
        return None
    try:
        timestamp = int(time.time())
        params_to_sign = f"timestamp={timestamp}"
        signature = hmac.new(
            api_secret.encode(), params_to_sign.encode(), hashlib.sha1
        ).hexdigest()
        url = _cloudinary_upload_url(cloud_name)

        with open(file_path, "rb") as fh:
            file_bytes = fh.read()

        boundary = f"----huntflow-{uuid.uuid4().hex}"

        def _field(name: str, value: str) -> bytes:
            return (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode("utf-8")

        body = b"".join([
            _field("api_key", api_key),
            _field("timestamp", str(timestamp)),
            _field("signature", signature),
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'
                f"Content-Type: image/png\r\n\r\n"
            ).encode("utf-8") + file_bytes + b"\r\n",
            f"--{boundary}--\r\n".encode("utf-8"),
        ])

        req = urllib.request.Request(url, data=body, method="POST")
        req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        secure_url = payload.get("secure_url")
        if secure_url:
            log.info("📡 Cloudinary upload OK — %s", secure_url)
        else:
            log.warning("Cloudinary upload returned no secure_url: %s", payload)
        return secure_url
    except Exception as e:  # noqa: BLE001
        log.warning("Cloudinary upload failed: %s", e)
        return None


def shot(run_id: str, page, label: str) -> Optional[str]:
    """Capture a screenshot of the live browser page into the run folder."""
    try:
        import re as _re
        safe = _re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")[:40] or "step"
        name = f"{safe}-{datetime.now().strftime('%H%M%S')}.png"
        path = RUN_DIR / run_id / name
        path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(path))
        data: dict[str, Any] = {"screenshot": f"{run_id}/{name}"}
        cloudinary_url = _cloudinary_upload(path)
        if cloudinary_url:
            data["cloudinary"] = cloudinary_url
        record(run_id, f"📸 Snapshot — {label}", "shot", data)
        return cloudinary_url or f"{run_id}/{name}"
    except Exception as e:  # noqa: BLE001
        record(run_id, f"⚠ Screenshot failed: {e}", "warning")
        return None


app = FastAPI(title="HUNTFLOW Agent", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3999",
        "http://127.0.0.1:3999",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_token(x_huntflow_token: Optional[str] = Header(default=None)) -> None:
    """Reject calls from anything that isn't the Next.js app.

    When HUNTFLOW_AGENT_TOKEN is set, every automation endpoint requires
    the same token in the X-Huntflow-Token header — otherwise any webpage
    could drive this local browser-automation agent. If the token is empty
    (default local dev), requests are accepted for backward compat.
    """
    if AGENT_TOKEN and x_huntflow_token != AGENT_TOKEN:
        raise HTTPException(status_code=401, detail="Missing or invalid X-Huntflow-Token")


class ConfigPayload(BaseModel):
    cloudinary_cloud_name: Optional[str] = None
    cloudinary_api_key: Optional[str] = None
    cloudinary_api_secret: Optional[str] = None
    max_concurrency: Optional[int] = None
    enabledByDefault: Optional[bool] = None
    enabled_overrides: Optional[dict[str, bool]] = None
    sources_enabled: Optional[dict[str, bool]] = None


def _iter_sources(data: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(data, dict):
        return []
    if "sources" in data and isinstance(data["sources"], list):
        return [s for s in data["sources"] if isinstance(s, dict)]
    out: list[dict[str, Any]] = []
    for cat, boards in data.items():
        if cat.startswith("_") or not isinstance(boards, list):
            continue
        for b in boards:
            if isinstance(b, dict):
                b_copy = dict(b)
                if "category" not in b_copy:
                    b_copy["category"] = cat
                out.append(b_copy)
    return out


def _sources_with_effective_enabled() -> list[dict[str, Any]]:
    try:
        _, data = _load_crawl_sources()
    except Exception:
        return []
    out: list[dict[str, Any]] = []
    for b in _iter_sources(data):
        bid = b.get("id", "")
        default_enabled = b.get("enabledByDefault", True)
        effective = _enabled_overrides.get(bid, default_enabled)
        out.append({
            "id": bid,
            "name": b.get("name", bid),
            "channel": b.get("channel", "ats"),
            "category": b.get("category", b.get("channel", "ats")),
            "experience": b.get("experience", "all"),
            "workMode": b.get("workMode", "all"),
            "enabledByDefault": default_enabled,
            "effectiveEnabled": effective,
            "overridden": bid in _enabled_overrides,
        })
    return out


@app.get("/config")
def get_config(_auth: None = Depends(require_token if AGENT_TOKEN else lambda: None)):
    sources = _sources_with_effective_enabled()
    return {
        "status": "ok",
        "cloudinary_configured": bool(
            (config.cloudinary_cloud_name or os.environ.get("CLOUDINARY_CLOUD_NAME", ""))
            and (config.cloudinary_api_key or os.environ.get("CLOUDINARY_API_KEY", ""))
            and (config.cloudinary_api_secret or os.environ.get("CLOUDINARY_API_SECRET", ""))
        ),
        "cloudinary_cloud_name": config.cloudinary_cloud_name or os.environ.get("CLOUDINARY_CLOUD_NAME", ""),
        "max_concurrency": config.max_concurrency,
        "enabledByDefault": config.enabledByDefault,
        "sources": sources,
        "enabled_overrides": dict(_enabled_overrides),
    }


@app.post("/config")
def update_config(payload: ConfigPayload, _auth: None = Depends(require_token if AGENT_TOKEN else lambda: None)):
    if payload.cloudinary_cloud_name is not None:
        config.cloudinary_cloud_name = payload.cloudinary_cloud_name.strip()
    if payload.cloudinary_api_key is not None:
        config.cloudinary_api_key = payload.cloudinary_api_key.strip()
    if payload.cloudinary_api_secret is not None:
        config.cloudinary_api_secret = payload.cloudinary_api_secret.strip()
    if payload.max_concurrency is not None:
        try:
            raw = int(payload.max_concurrency)
        except Exception:
            raise HTTPException(status_code=400, detail="max_concurrency must be an integer 1..16")
        if raw < 1 or raw > 16:
            raise HTTPException(status_code=400, detail="max_concurrency must be between 1 and 16")
        config.max_concurrency = max(1, min(raw, 16))
    if payload.enabledByDefault is not None:
        config.enabledByDefault = bool(payload.enabledByDefault)
    overrides = payload.enabled_overrides if payload.enabled_overrides is not None else payload.sources_enabled
    if overrides is not None:
        if not isinstance(overrides, dict):
            raise HTTPException(status_code=400, detail="enabled_overrides must be a map of board id to boolean")
        for bid, val in overrides.items():
            if not isinstance(bid, str) or not bid.strip():
                continue
            _enabled_overrides[bid.strip()] = bool(val)
        log.info("⚙ enabledByDefault overrides updated — %s", _enabled_overrides)
    log.info(
        "⚙ Config updated — Cloudinary: %s, Concurrency: %d, enabledByDefault: %s",
        bool(config.cloudinary_cloud_name and config.cloudinary_api_key and config.cloudinary_api_secret),
        config.max_concurrency,
        config.enabledByDefault,
    )
    sources = _sources_with_effective_enabled()
    return {
        "status": "ok",
        "cloudinary_configured": bool(config.cloudinary_cloud_name and config.cloudinary_api_key and config.cloudinary_api_secret),
        "cloudinary_cloud_name": config.cloudinary_cloud_name,
        "max_concurrency": config.max_concurrency,
        "enabledByDefault": config.enabledByDefault,
        "sources": sources,
        "enabled_overrides": dict(_enabled_overrides),
    }

def ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


# ---------------------------------------------------------------------------
# Scrape
# ---------------------------------------------------------------------------

class ScrapeRequest(BaseModel):
    url: str


class ApplyRequest(BaseModel):
    url: str
    profile: dict[str, Any] = Field(default_factory=dict)
    documents: dict[str, str] = Field(default_factory=dict)
    submit: bool = False


def _parse_json_ld(page) -> Optional[dict]:
    """Best effort: pull the JobPosting JSON-LD off the page."""
    for node in page.css('script[type="application/ld+json"]'):
        try:
            data = json.loads(node.text)
        except (json.JSONDecodeError, TypeError):
            continue
        candidates = data if isinstance(data, list) else [data]
        for item in candidates:
            if isinstance(item, dict) and item.get("@type") == "JobPosting":
                return item
    return None


def _body_text(page) -> str:
    parts = []
    for text in page.css("body *::text").getall():
        t = str(text).strip()
        if len(t) > 1:
            parts.append(t)
    text = " ".join(parts)
    return re.sub(r"\s+", " ", text)[:4000]


def _extract_job(page, url: str) -> dict[str, str]:
    title = ""
    company = ""
    location = ""
    salary = ""

    ld = _parse_json_ld(page)
    if ld:
        title = ld.get("title") or ""
        company = (ld.get("hiringOrganization") or {}).get("name") or ""
        jl = ld.get("jobLocation") or {}
        addr = (jl.get("address") or {}) if isinstance(jl, dict) else {}
        if isinstance(addr, dict):
            location = addr.get("addressLocality") or addr.get("addressRegion") or ""
        bs = ld.get("baseSalary") or {}
        if isinstance(bs, dict) and isinstance(bs.get("value"), dict):
            v = bs["value"]
            currency = bs.get("currency", "")
            lo, hi = v.get("minValue"), v.get("maxValue")
            salary = " ".join(x for x in [lo, hi, currency] if x is not None)

    if not title:
        title = (page.css('meta[property="og:title"]::attr(content)').get()
                 or page.css("title::text").get() or "")
    title = re.split(r" \| | - ", title)[0].strip()

    if not company:
        company = (page.css('meta[property="og:site_name"]::attr(content)').get()
                   or page.css('meta[name="author"]::attr(content)').get() or "")
        if not company:
            og_title = page.css('meta[property="og:title"]::attr(content)').get() or page.css("title::text").get() or ""
            m = re.search(r"\bat\s+([A-Z][A-Za-z0-9\s&.'-]{1,40})\.?$", og_title.strip())
            if m:
                company = m.group(1).strip()
        if not company:
            logo = (page.css('a[class*="logo"] img::attr(alt)').get()
                    or page.css('img[class*="logo"]::attr(alt)').get() or "")
            if logo:
                company = re.sub(r"\s*logo\s*$", "", logo, flags=re.I).strip()
        if not company:
            host = re.sub(r"^www\.", "", url.split("//")[-1].split("/")[0])
            company = host.split(".")[0].upper()

    title = re.sub(r"\b(apply|hiring|job|careers)\b", "", title, flags=re.I).strip() or "Software Engineer"

    return {
        "title": title,
        "company": company,
        "location": location or "Remote / Flexible",
        "salary": salary or "Competitive Salary",
        "description": _body_text(page) or "Job description extracted from link.",
    }


def _fetch_static(url: str):
    """Fetch a listing page with TLS impersonation and return the parsed document."""
    from scrapling.fetchers import Fetcher

    page = Fetcher.get(url, impersonate="chrome", timeout=20000)
    if page.status >= 400:
        raise RuntimeError(f"HTTP {page.status}")
    return page


def _fetch_dynamic(url: str):
    """Fetch a listing page in a real stealth browser and return the parsed document."""
    from scrapling.fetchers import StealthyFetcher

    page = StealthyFetcher.fetch(url, headless=True, network_idle=True, timeout=45000)
    return page


def _fetch_dynamic_with_shot(url: str, run_id: str, label: str):
    """Dynamic fetch that also captures one proof screenshot for the run.

    Returns (page, shot_result) where shot_result is a Cloudinary URL or a
    local "<run_id>/<file>.png" path served under /screenshots.
    """
    from scrapling.fetchers import DynamicFetcher

    shot_result = None

    def page_action(page):
        nonlocal shot_result
        if run_id:
            shot_result = shot(run_id, page, label)

    try:
        page = DynamicFetcher.fetch(url, headless=True, network_idle=True, page_action=page_action, timeout=45000)
        return page, shot_result
    except Exception:
        return _fetch_dynamic(url), shot_result


def _scrape_static(url: str) -> dict[str, str]:
    """Fast HTTP path — TLS impersonation, no browser needed."""
    return _extract_job(_fetch_static(url), url)


def _scrape_dynamic(url: str, run_id: str = "") -> dict[str, str]:
    """Real-browser path for JS-heavy pages (Scrapling DynamicFetcher) with live screenshot."""
    from scrapling.fetchers import DynamicFetcher

    shot_result = None

    def page_action(page):
        nonlocal shot_result
        if run_id:
            shot_result = shot(run_id, page, "job description page")

    try:
        page = DynamicFetcher.fetch(url, headless=True, network_idle=True, page_action=page_action, timeout=45000)
        job_data = _extract_job(page, url)
        if shot_result:
            job_data["screenshot"] = shot_result
            if "cloudinary" in str(shot_result) or str(shot_result).startswith("http"):
                job_data["cloudinary"] = shot_result
        return job_data
    except Exception:
        # Fallback to StealthyFetcher if DynamicFetcher encounters page_action issues
        page = _fetch_dynamic(url)
        return _extract_job(page, url)


@app.post("/scrape")
def scrape(req: ScrapeRequest, _auth: None = Depends(require_token if AGENT_TOKEN else lambda: None)):
    run_id = start_run("scrape", req.url, "Scrape")
    try:
        record(run_id, "⚡ Static fetch via TLS impersonation…", "info")
        result = _scrape_static(req.url)
        end_run(run_id, "success", f"✅ Scraped in {result['company']} — {result['title']}")
        return result
    except Exception as e:  # noqa: BLE001
        log.info("Static fetch failed (%s), falling back to stealth browser…", e)
        record(run_id, f"⚠ Static fetch failed ({e}) — launching stealth browser…", "warning")
        try:
            result = _scrape_dynamic(req.url, run_id=run_id)
            end_run(run_id, "success", f"✅ Stealth browser scraped {result['company']} — {result['title']}")
            return result
        except Exception as e2:  # noqa: BLE001
            log.error("Dynamic fetch failed too: %s", e2)
            end_run(run_id, "failed", f"✕ Scrape failed: {e2}")
            raise RuntimeError(f"Scrapling could not fetch {req.url}: {e2}") from e2


class CrawlRequest(BaseModel):
    category: str = "all"  # "remote" | "general" | "europe" | "mena" | "global" | "posts" | "all"
    keyword: str = "developer"
    limit: int = 20
    concurrency: Optional[int] = None
    capture_screenshot: bool = False
    source_ids: Optional[list[str]] = None


def _load_crawl_sources() -> tuple[Path, dict[str, Any]]:
    sources_file = Path(__file__).resolve().parent / "sources.json"
    if not sources_file.exists():
        raise FileNotFoundError("sources.json not found")
    with open(sources_file, "r", encoding="utf-8") as f:
        return sources_file, json.load(f)


@app.get("/sources")
def crawl_sources(_auth: None = Depends(require_token if AGENT_TOKEN else lambda: None)):
    """Return safe, user-facing crawler controls without leaking selectors."""
    try:
        _path, sources_data = _load_crawl_sources()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to load crawl sources: {e}") from e

    sources: list[dict[str, Any]] = []
    for board in _iter_sources(sources_data):
        bid = board.get("id", "")
        default_enabled = board.get("enabledByDefault", True)
        effective_enabled = _enabled_overrides.get(bid, default_enabled)
        channel = board.get("channel", "ats")
        regions = board.get("regions") or board.get("markets") or ["global"]
        source_type = board.get("sourceType")
        if not source_type:
            if channel == "community":
                source_type = "community"
            elif channel == "aggregator":
                source_type = "remote_board"
            else:
                source_type = "general"

        sources.append({
            "id": bid,
            "name": board.get("name", bid),
            "channel": channel,
            "connector": board.get("connector", board.get("type", "html_static")),
            "regions": regions,
            "countryCodes": board.get("countryCodes", []),
            "languages": board.get("languages", []),
            "capabilities": board.get("capabilities", ["search"]),
            "authMode": board.get("authMode", "none"),
            "crawlPolicy": board.get("crawlPolicy", "automatic"),
            "cadenceMinutes": board.get("cadenceMinutes", 180),
            "perDomainRps": board.get("perDomainRps", 2.0),
            "termsUrl": board.get("termsUrl", ""),
            "attribution": board.get("attribution", {"name": board.get("name", bid), "url": board.get("url", "")}),
            "enabled": effective_enabled,
            "enabledByDefault": default_enabled,
            "health": "healthy" if board.get("crawlPolicy") != "disabled" else "disabled",
            "description": board.get("description", board.get("_comment", "")),
            "category": board.get("category", channel),
            "type": board.get("type", "static"),
            "url": board.get("url", board.get("attribution", {}).get("url", "")),
            "sourceType": source_type,
            "markets": regions,
            "experience": board.get("experience", "all"),
            "workMode": board.get("workMode", "all"),
            "note": board.get("_comment", ""),
        })
    return {"sources": sources, "count": len(sources)}

# ---------------------------------------------------------------------------
# Card-level crawl — iterate job cards per board using sources.json selectors
# ---------------------------------------------------------------------------

_HTML_TAGS = {
    "a", "abbr", "address", "article", "aside", "b", "blockquote", "body",
    "button", "canvas", "caption", "cite", "code", "col", "dd", "del",
    "details", "div", "dl", "dt", "em", "fieldset", "figcaption", "figure",
    "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header",
    "hr", "html", "i", "iframe", "img", "input", "label", "li", "main",
    "mark", "menu", "meta", "nav", "noscript", "ol", "option", "p", "pre",
    "q", "s", "script", "section", "select", "small", "span", "strong",
    "style", "sub", "summary", "sup", "table", "tbody", "td", "textarea",
    "tfoot", "th", "thead", "time", "title", "tr", "ul", "var", "video",
}

# Location hints used when parsing HN-style "| Company |" hiring posts.
_LOCATION_HINTS = (
    "remote", "onsite", "hybrid", "worldwide", "anywhere", "global",
    "us", "usa", "united states", "europe", "eu", "uk", "united kingdom",
    "london", "berlin", "amsterdam", "paris", "new york", "san francisco",
    "sf", "mena", "tunisia", "qatar", "dubai", "toronto", "austin",
    "seattle", "boston", "singapore", "tokyo", "canada", "germany",
)


def _looks_literal(value: str) -> bool:
    """True when the configured field value is a literal string, not a CSS selector.

    Selectors contain structural punctuation (``[ . # : >``) or are bare tag
    names (e.g. ``h4``, ``span``). Plain phrases like "Remote", "Qatar / MENA"
    or "YCombinator Network" are returned as-is.
    """
    v = value.strip()
    if not v:
        return True
    if any(ch in v for ch in "[].#:>"):
        return False
    if re.fullmatch(r"[a-zA-Z][a-zA-Z0-9]*", v):
        return v.lower() not in _HTML_TAGS
    return True


def _host_company(url: str) -> str:
    """Derive a display company from a URL's host (e.g. remoteok.com -> REMOTEOK)."""
    try:
        host = re.sub(r"^www\.", "", url.split("//")[-1].split("/")[0])
        return host.split(".")[0].upper()
    except Exception:  # noqa: BLE001
        return ""


def _resolve_card_field(card, board, field: str, base_url: str) -> str:
    """Resolve one job field from a card using the board's selector config.

    Special tokens:
      - "text"   -> the card's own text
      - "href"   -> first link href, urljoined against base_url when relative
      - "domain" -> company derived from the href host
    Literal values (locations, fixed company names) are returned as-is;
    anything else is treated as a CSS selector scoped to the card.
    """
    value = (board.get("selectors") or {}).get(field, "")
    try:
        if value == "text":
            return (card.text or "").strip()
        if value == "href":
            href_el = card.css("a[href]").first
            el = href_el if href_el is not None else card
            href = el.attrib.get("href", "") if el is not None else ""
            href = (href or "").strip()
            if not href:
                return ""
            if href.startswith("http://") or href.startswith("https://"):
                return href
            from urllib.parse import urljoin

            return urljoin(base_url, href)
        if value == "domain":
            href = _resolve_card_field(card, board, "url", base_url) or base_url
            return _host_company(href)
        if _looks_literal(value):
            return value
        sub = card.css(value).first
        return (sub.text or "").strip() if sub is not None else ""
    except Exception:  # noqa: BLE001
        return ""


def _card_snippet(card, fallback: str = "") -> str:
    """Normalized whitespace-collapsed card text (~1500 chars) for scoring."""
    try:
        text = card.text or card.get_all_text() or fallback
    except Exception:  # noqa: BLE001
        text = fallback
    return re.sub(r"\s+", " ", str(text)).strip()[:1500]


def _extract_cards(page, board, base_url: str, per_board_limit: int) -> list[dict[str, Any]]:
    """Iterate a board's job cards and resolve structured fields per card."""
    item_sel = (board.get("selectors") or {}).get("item", "")
    if not item_sel:
        return []
    cap = min(per_board_limit, int(board.get("maxCards") or per_board_limit))
    jobs: list[dict[str, Any]] = []
    for card in page.css(item_sel)[:cap]:
        try:
            title = _resolve_card_field(card, board, "title", base_url)
            company = _resolve_card_field(card, board, "company", base_url)
            location = _resolve_card_field(card, board, "location", base_url)
            url = _resolve_card_field(card, board, "url", base_url)
            if not title or not url:
                continue
            snippet = _card_snippet(card, f"{title} at {company}.")
            jobs.append({
                "id": f"crawl_{uuid.uuid4().hex[:8]}",
                "title": title,
                "company": company or _host_company(url),
                "location": location or "Remote / Flexible",
                "salary": "",
                "url": url,
                "jobDescription": snippet or f"{title} at {company}. See posting for details.",
                "source": board.get("name", ""),
                "category": board.get("category", ""),
                "board_id": board.get("id", ""),
            })
        except Exception:  # noqa: BLE001
            continue
    return jobs


def _parse_hiring_post(text: str) -> Optional[dict[str, str]]:
    """Parse an HN Who-is-Hiring style "| Company |" comment into a candidate.

    Returns None when the post has no recognizable company/role block.
    """
    body = re.sub(r"\s+", " ", text).strip()
    parts = [p.strip() for p in re.split(r"\s*\|\s*", body) if p.strip()]
    if len(parts) < 2:
        return None

    company = parts[0]
    domain = ""
    m = re.search(r"\(([a-zA-Z0-9][a-zA-Z0-9.\-]+\.[a-z]{2,})\)", company)
    if m:
        domain = m.group(1)
        company = re.sub(r"\s*\([^)]*\)\s*$", "", company).strip()
    if len(company) < 2:
        return None

    role = parts[1]
    # A role must contain real words — "Full-Time", "Remote" alone aren't roles.
    if len(role) < 2 or not re.search(r"[a-zA-Z]{3,}", role):
        return None

    location = ""
    salary = ""
    for part in parts[2:]:
        low = part.lower()
        if not location and any(hint in low for hint in _LOCATION_HINTS):
            location = part
        if not salary and re.search(r"[$€£]|\b(usd|eur|gbp)\b", part, re.I):
            salary = part
    if not location:
        # Most Who-is-Hiring posts are remote; flag as generic otherwise.
        location = "Remote / Flexible"

    return {
        "company": company,
        "role": role,
        "location": location,
        "salary": salary,
        "domain": domain,
    }


def _extract_hiring_posts(page, board, base_url: str, per_board_limit: int) -> list[dict[str, Any]]:
    """Parse forum/thread posts (HN Who-is-Hiring style) as job candidates."""
    sels = board.get("selectors") or {}
    item_sel = sels.get("item", "")
    text_sel = sels.get("text") or sels.get("title") or ""
    if not item_sel:
        return []
    cap = min(per_board_limit, int(board.get("maxCards") or per_board_limit))
    jobs: list[dict[str, Any]] = []
    for card in page.css(item_sel)[:cap]:
        try:
            text = ""
            if text_sel:
                node = card.css(text_sel).first
                text = node.text if node is not None else ""
            if not text:
                text = card.get_all_text() or ""
            text = re.sub(r"\s+", " ", str(text)).strip()

            parsed = _parse_hiring_post(text)
            if not parsed:
                continue

            comment_id = ""
            try:
                comment_id = str(card["id"])
            except Exception:  # noqa: BLE001
                comment_id = str(card.attrib.get("id", ""))

            apply_url = ""
            try:
                for link in card.css(".commtext a[href]"):
                    href = link.attrib.get("href", "")
                    if href and "news.ycombinator.com" not in href:
                        apply_url = href
                        break
            except Exception:  # noqa: BLE001
                pass

            url = apply_url or (f"{base_url}#{comment_id}" if comment_id else base_url)
            jobs.append({
                "id": f"crawl_{uuid.uuid4().hex[:8]}",
                "title": parsed["role"],
                "company": parsed["company"],
                "location": parsed["location"],
                "salary": parsed["salary"],
                "url": url,
                "jobDescription": text[:1500],
                "source": board.get("name", ""),
                "category": board.get("category", ""),
                "board_id": board.get("id", ""),
                "hiring_post": True,
            })
        except Exception:  # noqa: BLE001
            continue
    return jobs


@app.post("/crawl")
def crawl(req: CrawlRequest, _auth: None = Depends(require_token if AGENT_TOKEN else lambda: None)):
    max_workers = max(1, min(req.concurrency or config.max_concurrency, 16))
    run_id = start_run("crawl", f"category={req.category}", f"Parallel Crawl ({req.category}, {max_workers} workers)")
    try:
        _sources_file, sources_data = _load_crawl_sources()
    except Exception as e:  # noqa: BLE001
        end_run(run_id, "failed", f"Failed to load sources: {e}")
        return {"run_id": run_id, "jobs": [], "concurrency": max_workers, "boards_crawled": 0, "source_results": []}

    limit = max(1, min(req.limit, 150))
    # Collect board tasks
    all_sources = _iter_sources(sources_data)
    tasks: list[dict[str, Any]] = []
    for raw_board in all_sources:
        cat = raw_board.get("category") or raw_board.get("channel") or "general"
        if req.category != "all" and req.category not in (cat, raw_board.get("channel")):
            continue
        b = dict(raw_board)
        b["category"] = cat
        tasks.append(b)
    selected_ids = {source_id for source_id in (req.source_ids or []) if source_id}
    if req.source_ids is not None:
        tasks = [board for board in tasks if board.get("id") in selected_ids]

    if not tasks:
        end_run(run_id, "success", "No board sources configured")
        return {"run_id": run_id, "jobs": [], "concurrency": max_workers, "boards_crawled": 0, "source_results": []}

    record(run_id, f"⚡ Launching parallel crawl across {len(tasks)} boards with {max_workers} concurrent workers…", "info")

    def board_event(
        board: dict[str, Any],
        status: str,
        found: int = 0,
        matched: int = 0,
        error: Optional[str] = None,
        screenshot: Optional[str] = None,
        cloudinary: Optional[str] = None,
    ) -> dict[str, Any]:
        event: dict[str, Any] = {
            "type": "board",
            "source_id": board.get("id", ""),
            "source_name": board.get("name") or board.get("id") or board.get("category", ""),
            "category": board.get("category", ""),
            "status": status,
            "found": found,
            "matched": matched,
        }
        if error:
            event["error"] = str(error)[:300]
        if screenshot:
            event["screenshot"] = screenshot
        if cloudinary:
            event["cloudinary"] = cloudinary
        return event

    # Static boards yield no live page, so the first captured shot is shared
    # run-wide as every participating card's PROOF thumbnail.
    run_shots: dict[str, Optional[str]] = {"screenshot": None, "cloudinary": None}

    kw = (req.keyword or "").strip().lower()

    def _remember_shot(shot_result: Optional[str]) -> None:
        if not shot_result or run_shots["screenshot"] or run_shots["cloudinary"]:
            return
        if str(shot_result).startswith("http"):
            run_shots["cloudinary"] = shot_result
        else:
            run_shots["screenshot"] = shot_result

    def crawl_board(board: dict[str, Any], worker_id: int) -> tuple[dict[str, Any], list[dict[str, Any]], int, Optional[str]]:
        board_name = board.get("name") or board.get("id") or board.get("category", "")
        cat = board.get("category", "")
        record(run_id, f"🔍 [Worker #{worker_id}] Crawling {board_name} ({cat})…", "info",
               data=board_event(board, "running"))
        per_board_limit = int(board.get("maxCards") or 30)
        found: list[dict[str, Any]] = []
        try:
            board_type = board.get("type", "static")
            board_shot = None
            if board_type == "posts":
                page = _fetch_static(board["url"])
                found = _extract_hiring_posts(page, board, board["url"], per_board_limit)
            elif board_type == "stealth":
                if req.capture_screenshot:
                    page, board_shot = _fetch_dynamic_with_shot(board["url"], run_id, f"{board_name} results")
                else:
                    page, board_shot = _fetch_dynamic(board["url"]), None
                found = _extract_cards(page, board, board["url"], per_board_limit)
            else:
                page = _fetch_static(board["url"])
                found = _extract_cards(page, board, board["url"], per_board_limit)

            board_kw = ((board.get("keyword") or kw) or "").strip().lower()
            matched_cards: list[dict[str, Any]] = []
            for job in found:
                if board_kw:
                    haystack = " ".join([
                        str(job.get("title", "")),
                        str(job.get("company", "")),
                        str(job.get("location", "")),
                        str(job.get("jobDescription", "")),
                    ]).lower()
                    if board_kw not in haystack:
                        continue
                if board_shot:
                    job["screenshot"] = board_shot
                    if str(board_shot).startswith("http"):
                        job["cloudinary"] = board_shot
                matched_cards.append(job)

            _remember_shot(board_shot)
            success_data = board_event(board, "success", len(found), len(matched_cards))
            if board_shot:
                if str(board_shot).startswith("http"):
                    success_data["cloudinary"] = board_shot
                else:
                    success_data["screenshot"] = board_shot
            record(run_id, f"✅ [Worker #{worker_id}] {board_name} yielded {len(found)} candidate card(s)", "info",
                   data=success_data)
            return board, matched_cards, len(found), None
        except Exception as e:  # noqa: BLE001
            record(run_id, f"⚠ [Worker #{worker_id}] Skipped {board_name}: {e}", "warning",
                   data=board_event(board, "failed", error=str(e)))
            return board, [], 0, str(e)

    discovered_jobs: list[dict[str, Any]] = []
    source_results: list[dict[str, Any]] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_board = {
            executor.submit(crawl_board, board, idx + 1): board
            for idx, board in enumerate(tasks)
        }
        for future in concurrent.futures.as_completed(future_to_board):
            board = future_to_board[future]
            try:
                _b, cards, found_count, source_error = future.result()
                discovered_jobs.extend(cards)
                result_entry: dict[str, Any] = {
                    "id": board.get("id", ""),
                    "name": board.get("name", board.get("id", "")),
                    "category": board.get("category", ""),
                    "status": "failed" if source_error else "success",
                    "found": found_count,
                    "matched": len(cards),
                    "error": source_error,
                }
                if run_shots["cloudinary"]:
                    result_entry["cloudinary"] = run_shots["cloudinary"]
                elif run_shots["screenshot"]:
                    result_entry["screenshot"] = run_shots["screenshot"]
                source_results.append(result_entry)
            except Exception as e:  # noqa: BLE001
                record(run_id, f"⚠ Worker exception on {board.get('name')}: {e}", "warning",
                       data=board_event(board, "failed", error=str(e)))
                source_results.append({
                    "id": board.get("id", ""),
                    "name": board.get("name", board.get("id", "")),
                    "category": board.get("category", ""),
                    "status": "failed",
                    "found": 0,
                    "matched": 0,
                    "error": str(e),
                })

    # Limit and deduplicate
    seen_urls = set()
    unique_jobs: list[dict[str, Any]] = []
    for j in discovered_jobs:
        u = j.get("url") or j.get("id")
        if u and u in seen_urls:
            continue
        if u:
            seen_urls.add(u)
        unique_jobs.append(j)
        if len(unique_jobs) >= limit:
            break

    end_data: dict[str, Any] = {
        "type": "run",
        "status": "success",
        "boards_crawled": len(tasks),
        "found": len(unique_jobs),
        "matched": len(unique_jobs),
    }
    if run_shots["cloudinary"]:
        end_data["cloudinary"] = run_shots["cloudinary"]
    elif run_shots["screenshot"]:
        end_data["screenshot"] = run_shots["screenshot"]
    end_run(run_id, "success",
            f"🎉 Parallel crawl completed across {len(tasks)} boards — found {len(unique_jobs)} job(s)",
            data=end_data)
    return {
        "run_id": run_id,
        "jobs": unique_jobs,
        "count": len(unique_jobs),
        "concurrency": max_workers,
        "boards_crawled": len(tasks),
        "source_results": sorted(source_results, key=lambda item: item["name"]),
    }


# ---------------------------------------------------------------------------
# Apply (auto-fill automation)
# ---------------------------------------------------------------------------

FIELD_RULES = [
    # (pattern, key, kind)
    (r"full\s*name|first\s*name|last\s*name|applicant\s*name", "name", "text"),
    (r"email", "email", "text"),
    (r"phone|mobile", "phone", "text"),
    (r"linkedin", "linkedin", "text"),
    (r"portfolio|website|github|url", "portfolio", "text"),
    (r"cover\s*letter|why\s*(you|this)|message|motivation", "cover", "textarea"),
    (r"resume|cv|attachment|upload", "resume", "file"),
    (r"location|city|address", "location", "text"),
    (r"skill|stack|tech", "skills", "text"),
    (r"summary|bio|about", "summary", "textarea"),
    (r"current\s*(company|employer)|company", "current_company", "text"),
]


def _profile_value(profile: dict, key: str) -> Optional[str]:
    if key == "name":
        return profile.get("name")
    if key == "email":
        return profile.get("email")
    if key == "phone":
        return profile.get("phone")
    if key == "location":
        return profile.get("location")
    if key == "summary":
        return profile.get("summary")
    if key == "skills":
        skills = profile.get("skills") or []
        return ", ".join(skills[:10]) if skills else None
    if key == "portfolio":
        return profile.get("portfolio") or profile.get("github")
    if key == "linkedin":
        return profile.get("linkedin") or "linkedin.com/in/"
    if key == "cover":
        return (profile.get("documents") or {}).get("coverLetter") or "I am very excited about this opportunity."
    if key == "current_company":
        exp = profile.get("experience") or []
        return exp[0].get("company") if exp else None
    return None


def _detect_and_fill(page, profile: dict, documents: dict, logs: list, submit: bool, run_id: str = ""):
    """Finds the application form and fills every mapped field via Playwright."""

    logs.append({"timestamp": ts(), "message": "🔍 Inspecting form DOM schema…", "type": "info"})
    record(run_id, "🔍 Inspecting form DOM schema…", "info")
    form = page.locator("form").first
    if form.count() == 0:
        record(run_id, "✕ No <form> element found on the page", "error")
        raise RuntimeError("No <form> element found on the page.")
    shot(run_id, page, "form detected")

    # Synchronous DOM snapshot — avoids 60s implicit waits on async/nth() elements.
    schema = form.locator("input, textarea, select").evaluate_all(
        """(els) => els.map((el) => ({
            tag: el.tagName.toLowerCase(),
            type: (el.getAttribute("type") || el.tagName.toLowerCase()).toLowerCase(),
            name: (el.getAttribute("name") || "").toLowerCase(),
            id: (el.getAttribute("id") || "").toLowerCase(),
            placeholder: (el.getAttribute("placeholder") || "").toLowerCase(),
            disabled: el.disabled,
        }))"""
    )
    msg = f"✅ Detected {len(schema)} form fields"
    logs.append({"timestamp": ts(), "message": msg, "type": "info"})
    record(run_id, msg, "info")

    mapped = 0
    filled_fields: list[str] = []
    for i, el_meta in enumerate(schema):
        el_type = el_meta["type"]
        el_name = el_meta["name"]
        el_id = el_meta["id"]
        label = (el_id + " " + el_name + " " + el_meta["placeholder"]).replace("_", " ").replace("-", " ")

        if el_type in ("hidden", "submit", "button", "checkbox", "radio"):
            continue
        if el_type == "file":
            msg = "📎 Resume upload field — manual attach required"
            logs.append({"timestamp": ts(), "message": msg, "type": "warning"})
            record(run_id, msg, "warning")
            continue

        rule_key = None
        for pattern, key, _kind in FIELD_RULES:
            if re.search(pattern, label):
                rule_key = key
                break

        value = _profile_value(profile, rule_key) if rule_key else None
        if value is None:
            continue

        locator = form.locator("input, textarea, select").nth(i)
        try:
            if el_type == "select" or el_meta["tag"] == "select":
                options = locator.locator("option").all_text_contents()
                match = next((o for o in options if any(
                    kw in o.lower() for kw in value.lower().split()[:2] or [value.lower()]
                )), None)
                if match:
                    locator.select_option(label=match)
                    target = el_name or el_id or el_type
                    record(run_id, f"⌨ Selected an option for {target}", "info", {"action": "select", "target": target})
                continue
            locator.fill(value, timeout=4000)
            mapped += 1
            filled_fields.append(el_name or el_id or el_type)
            target = el_name or el_id or el_type
            record(run_id, f"✏ Filled {target} ({rule_key or 'auto'})", "info", {"action": "fill", "target": target})
        except Exception as e:  # noqa: BLE001
            msg = f"⚠ Could not fill '{el_name or el_id or el_type}' — {e}"
            logs.append({"timestamp": ts(), "message": msg, "type": "warning"})
            record(run_id, msg, "warning")

    msg = f"💉 Injected {mapped} fields from profile + AI documents"
    logs.append({"timestamp": ts(), "message": msg, "type": "info"})
    record(run_id, msg, "info")
    shot(run_id, page, "fields injected")

    if not submit:
        msg = "🧪 Prefill mode — human review & submit required"
        logs.append({"timestamp": ts(), "message": msg, "type": "warning"})
        record(run_id, msg, "warning")
        return ("manual_required", filled_fields)

    submit_btn = form.locator("button[type='submit'], input[type='submit'], button:has-text('Submit'), button:has-text('Apply')").first
    if submit_btn.count() == 0:
        msg = "⚠ Submit button not found — human review required"
        logs.append({"timestamp": ts(), "message": msg, "type": "warning"})
        record(run_id, msg, "warning")
        return ("manual_required", filled_fields)

    msg = "⚡ Clicking the submit control…"
    logs.append({"timestamp": ts(), "message": msg, "type": "info"})
    record(run_id, msg, "warning", {"action": "click", "target": "submit"})
    before_url = page.url
    submit_btn.click()
    page.wait_for_timeout(3500)
    shot(run_id, page, "after submit click")

    confirmation = page.locator(
        "text=/thank you|application (was )?(received|submitted)|successfully submitted|submission confirmed/i"
    ).first
    confirmed = confirmation.count() > 0 or bool(
        re.search(r"thank|success|confirm|submitted", str(page.url), re.I)
        and str(page.url) != str(before_url)
    )
    if not confirmed:
        msg = "⚠ Submit was clicked, but no confirmation evidence was detected — verify manually"
        logs.append({"timestamp": ts(), "message": msg, "type": "warning"})
        record(run_id, msg, "warning", {"action": "verify", "target": "submission"})
        return ("manual_required", filled_fields)

    msg = "🎉 Submission confirmation detected"
    logs.append({"timestamp": ts(), "message": msg, "type": "success"})
    record(run_id, msg, "success", {"action": "verify", "target": "submission"})
    return ("applied", filled_fields)


@app.post("/apply")
def apply(req: ApplyRequest, _auth: None = Depends(require_token if AGENT_TOKEN else lambda: None)):
    logs: list[dict[str, str]] = []
    run_id = start_run("apply", req.url, "Auto-apply")

    logs.append({"timestamp": ts(), "message": f"🚀 Scrapling agent dispatched for {req.url}", "type": "info"})
    record(run_id, "🧭 Navigating to application page…", "info")

    skills = req.profile.get("skills") or []
    if skills:
        msg = "🧠 Skills payload: " + ", ".join(skills[:8]) + ("…" if len(skills) > 8 else "")
        logs.append({"timestamp": ts(), "message": msg, "type": "info"})
        record(run_id, msg, "info")

    try:
        from scrapling.fetchers import DynamicFetcher

        result: list[str] = []
        final_status = "failed"

        def page_action(page):
            nonlocal result, final_status
            final_status, filled = _detect_and_fill(page, req.profile, req.documents, logs, req.submit, run_id)
            result = filled

        DynamicFetcher.fetch(
            req.url,
            headless=True,
            network_idle=True,
            page_action=page_action,
            timeout=60000,
        )
        status = final_status
        msg = f"✅ Agent finished. Status: {status}"
        logs.append({"timestamp": ts(), "message": msg, "type": "info"})
        end_run(run_id, status, f"✅ Run complete — {status}")
        return {"status": status, "logs": logs, "fields": result}
    except RuntimeError as e:
        msg = f"✕ Automation error: {e}"
        logs.append({"timestamp": ts(), "message": msg, "type": "error"})
        end_run(run_id, "failed", f"✕ Automation error: {e}")
        return {"status": "failed", "logs": logs, "fields": []}


@app.get("/activity")
def activity(
    since: int = Query(0, description="Return only events with id > since"),
    _auth: None = Depends(require_token if AGENT_TOKEN else lambda: None),
):
    """Poll endpoint for the live agent console with multi-worker telemetry."""
    with _activity_lock:
        events = [e for e in _activity if e["id"] > since][-200:]
        runs = sorted(_runs.values(), key=lambda r: r["started"], reverse=True)
        active_list = [dict(r) for r in _active_runs.values()]
        active = active_list[0] if active_list else None
    return {
        "active": active,
        "active_runs": active_list,
        "concurrency": len(active_list),
        "events": events,
        "runs": runs,
    }


@app.get("/health")
def health():
    fetchers_ok = True
    browser_ok = True
    stealth_ok = True
    try:
        from scrapling.fetchers import Fetcher  # noqa: F401
    except Exception:  # noqa: BLE001
        fetchers_ok = False
    try:
        from scrapling.fetchers import DynamicFetcher  # noqa: F401
    except Exception:  # noqa: BLE001
        browser_ok = False
    try:
        from scrapling.fetchers import StealthyFetcher  # noqa: F401
    except Exception:  # noqa: BLE001
        stealth_ok = False

    sources_total = 0
    sources_enabled_default = 0
    try:
        _, sdata = _load_crawl_sources()
        for b in _iter_sources(sdata):
            sources_total += 1
            if b.get("enabledByDefault", True):
                sources_enabled_default += 1
    except Exception:
        pass
    effective_enabled = 0
    try:
        for s in _sources_with_effective_enabled():
            if s.get("effectiveEnabled"):
                effective_enabled += 1
    except Exception:
        effective_enabled = sources_enabled_default

    uptime_s = int(time.time() - _START_TS) if "_START_TS" in globals() else 0

    return {
        "status": "ok",
        "scrapling_fetchers": fetchers_ok,
        "browser_automation": browser_ok,
        "fetcher": "Fetcher ok" if fetchers_ok else "Fetcher unavailable",
        "fetchers": {
            "Fetcher": "ok" if fetchers_ok else "unavailable",
            "DynamicFetcher": "ok" if browser_ok else "unavailable",
            "StealthyFetcher": "ok" if stealth_ok else "unavailable",
        },
        "detail": {
            "fetcher": "Fetcher ok" if fetchers_ok else "Fetcher unavailable",
            "dynamicFetcher": "ok" if browser_ok else "unavailable",
            "stealthFetcher": "ok" if stealth_ok else "unavailable",
            "sources_total": sources_total,
            "sources_enabled_default": sources_enabled_default,
            "sources_effective_enabled": effective_enabled,
            "max_concurrency": config.max_concurrency,
            "enabledByDefault": config.enabledByDefault,
            "uptime_s": uptime_s,
        },
        "sources": {
            "total": sources_total,
            "enabledByDefault": sources_enabled_default,
            "effectiveEnabled": effective_enabled,
        },
        "concurrency": config.max_concurrency,
        "uptime_s": uptime_s,
    }


class HealSelectorsPayload(BaseModel):
    board_ids: Optional[list[str]] = None
    dry_run: bool = True


@app.post("/heal-selectors")
def heal_selectors(payload: HealSelectorsPayload, _auth: None = Depends(require_token if AGENT_TOKEN else lambda: None)):
    try:
        _, sdata = _load_crawl_sources()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to load sources: {e}") from e

    target_ids = {bid.strip() for bid in (payload.board_ids or []) if isinstance(bid, str) and bid.strip()}
    drifts: list[dict[str, Any]] = []
    scanned = 0

    for b in _iter_sources(sdata):
        cat = b.get("category") or b.get("channel") or "general"
        bid = b.get("id", "")
        if target_ids and bid not in target_ids:
            continue
        scanned += 1
        selectors: dict[str, Any] = b.get("selectors") or {}
        missing = [k for k in ("item", "title", "url") if not selectors.get(k)]
        drift_detected = bool(missing)
        drift_entry: dict[str, Any] = {
            "id": bid,
            "name": b.get("name", bid),
            "category": cat,
            "type": b.get("type", "static"),
            "selectors": selectors,
            "missing_required": missing,
            "drift": drift_detected,
            "enabledByDefault": b.get("enabledByDefault", True),
            "effectiveEnabled": _enabled_overrides.get(bid, b.get("enabledByDefault", True)),
            "would_heal": False,
            "note": "no auto-write — report only; sources.json not modified" if drift_detected else "ok",
        }
        if drift_detected:
            log.warning("🩹 heal-selectors drift — board %s (%s) missing %s — no auto-write", bid, cat, missing)
        else:
            log.info("🩹 heal-selectors ok — board %s (%s) selectors present", bid, cat)
        drifts.append(drift_entry)

    return {
        "status": "ok",
        "dry_run": True,
        "scanned": scanned,
        "drifts": drifts,
        "drift_count": sum(1 for d in drifts if d["drift"]),
        "note": "selector healing stub — logs drift only, no auto-write to sources.json",
        "auto_write": False,
    }


# ---------------------------------------------------------------------------
# LinkedIn (persistent headful session + profile/jobs extraction)
# ---------------------------------------------------------------------------

SESSION_DIR = Path(__file__).resolve().parent / ".linkedin_session"
SESSION_DIR.mkdir(exist_ok=True)

LINKEDIN_LOGIN_URL = "https://www.linkedin.com/login"
_linkedin_lock = threading.Lock()


def _li_launch(playwright, headless: bool = False):
    """Persistent Chromium context — cookies/session survive between requests."""
    from adblock import get_ublock_extension_args
    ext_args = get_ublock_extension_args()
    args = ["--disable-blink-features=AutomationControlled"] + ext_args
    return playwright.chromium.launch_persistent_context(
        str(SESSION_DIR),
        headless=headless,
        viewport={"width": 1280, "height": 900},
        args=args,
    )

def _li_classify_page(page) -> str:
    """Classify the current page without navigating away from a login/challenge."""
    if page.is_closed():
        return "window_closed"
    url = page.url.lower()
    if "checkpoint" in url or "challenge" in url:
        return "checkpoint"
    if "authwall" in url:
        return "authwall"
    if "/login" in url or "/uas/login" in url:
        return "signed_out"
    if any(path in url for path in ("/feed", "/mynetwork", "/jobs", "/in/")):
        return "signed_in"
    try:
        checkpoint = page.locator("#challenge-modal, [data-challenge-url], form[action*='checkpoint'], form[action*='challenge']")
        if checkpoint.count() and checkpoint.first.is_visible():
            return "checkpoint"
    except Exception:  # noqa: BLE001
        pass
    try:
        if page.locator("nav.global-nav, header.global-nav, [data-test-global-nav]").first.is_visible():
            return "signed_in"
    except Exception:  # noqa: BLE001
        pass
    return "signed_out"


def _li_login_state(page) -> str:
    """Navigate to LinkedIn feed and classify the resulting authenticated state."""
    try:
        page.goto("https://www.linkedin.com/feed/", wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(2500)
    except Exception:  # noqa: BLE001
        return "error"
    return _li_classify_page(page)


def _li_diagnostics(state: str, method: str, detail: str | None = None) -> dict[str, Any]:
    messages = {
        "signed_in": ("LinkedIn authenticated the persistent local session.", "No action required."),
        "signed_out": ("LinkedIn returned the sign-in page; no valid session was found.", "Use the visible login window, then keep it open until Huntflow confirms the session."),
        "authwall": ("LinkedIn redirected the session to its authentication wall.", "Sign in with the visible browser flow; cookie-only authentication may be rejected for this session."),
        "checkpoint": ("LinkedIn requires a security checkpoint or verification challenge.", "Complete the challenge in the visible window. Huntflow now keeps that window open while verification is pending."),
        "window_closed": ("The visible login window was closed before authentication completed.", "Open the login window again and wait for the success confirmation before closing it."),
        "login_in_progress": ("A visible LinkedIn login flow is already running.", "Finish or close the existing login window before starting another session check."),
        "session_locked": ("Chromium could not open the persistent LinkedIn profile because it is already in use.", "Close any previous Huntflow LinkedIn window and retry."),
        "error": ("The LinkedIn session could not be checked because browser automation failed.", "Check the Agent Console for the exact browser event, then retry."),
    }
    reason, recovery = messages.get(state, messages["error"])
    return {
        "authenticated": state == "signed_in",
        "state": state,
        "checkpoint": state == "checkpoint",
        "reason": detail or reason,
        "recovery": recovery,
        "method": method,
        "checkedAt": datetime.now().astimezone().isoformat(),
    }


@app.post("/linkedin/login")
def linkedin_login(_auth: None = Depends(require_token)):
    """Open a visible Chromium window so the user can sign in manually.
    The session is persisted on disk; checkpoints remain visible for up to 8 minutes."""
    from playwright.sync_api import sync_playwright

    run_id = start_run("linkedin", LINKEDIN_LOGIN_URL, "LinkedIn sign-in")
    record(run_id, "🪟 Opening visible Chromium window — sign in manually", "info")
    state = "signed_out"
    context = None
    try:
        with _linkedin_lock, sync_playwright() as p:
            context = _li_launch(p, headless=False)
            page = context.pages[0] if context.pages else context.new_page()
            page.goto(LINKEDIN_LOGIN_URL, wait_until="domcontentloaded", timeout=45000)
            deadline = time.monotonic() + 480
            last_state = ""
            while time.monotonic() < deadline:
                state = _li_classify_page(page)
                if state != last_state:
                    record(run_id, f"LinkedIn state: {state}", "warning" if state == "checkpoint" else "info")
                    last_state = state
                if state in ("signed_in", "window_closed"):
                    break
                page.wait_for_timeout(1500)
            if state == "signed_in":
                page.wait_for_timeout(2500)
    except Exception as exc:  # noqa: BLE001
        message = str(exc)
        state = "session_locked" if "user data directory is already in use" in message.lower() else "error"
        record(run_id, f"⚠ LinkedIn browser flow failed: {message}", "warning")
    finally:
        if context is not None:
            try:
                context.close()
            except Exception:  # noqa: BLE001
                pass
    ok = state == "signed_in"
    end_run(run_id, "success" if ok else "failed",
            "✅ LinkedIn session saved" if ok else f"⚠ LinkedIn login ended in state: {state}")
    return _li_diagnostics(state, "visible_browser")


class LinkedInCookiePayload(BaseModel):
    cookie: str


@app.post("/linkedin/cookie")
def linkedin_cookie(payload: LinkedInCookiePayload, _auth: None = Depends(require_token)):
    """Authenticate LinkedIn using a user-provided li_at session cookie."""
    from playwright.sync_api import sync_playwright

    raw_cookie = payload.cookie.strip()
    if not raw_cookie:
        raise HTTPException(status_code=400, detail="Cookie string is required")
    if "li_at=" in raw_cookie:
        match = re.search(r'li_at=([^;]+)', raw_cookie)
        li_at = match.group(1).strip('"\' ') if match else raw_cookie
    else:
        li_at = raw_cookie.strip('"\' ')

    run_id = start_run("linkedin", LINKEDIN_LOGIN_URL, "LinkedIn cookie authentication")
    record(run_id, "🍪 Injecting LinkedIn session cookie...", "info")
    state = "signed_out"
    context = None
    try:
        with _linkedin_lock, sync_playwright() as p:
            context = _li_launch(p, headless=True)
            context.add_cookies([
                {
                    "name": "li_at",
                    "value": li_at,
                    "domain": ".linkedin.com",
                    "path": "/",
                    "httpOnly": True,
                    "secure": True,
                    "sameSite": "None",
                }
            ])
            page = context.new_page()
            state = _li_login_state(page)
            context.close()
            context = None
    except Exception as exc:  # noqa: BLE001
        message = str(exc)
        record(run_id, f"⚠ Error verifying cookie: {message}", "warning")
        state = "session_locked" if "user data directory is already in use" in message.lower() else "error"
    finally:
        if context is not None:
            try:
                context.close()
            except Exception:  # noqa: BLE001
                pass

    ok = state == "signed_in"
    end_run(run_id, "success" if ok else "failed",
            "✅ LinkedIn session authenticated via cookie" if ok else "⚠ Cookie authentication failed or expired")
    return _li_diagnostics(state, "session_cookie")


@app.get("/linkedin/session")
def linkedin_session(_auth: None = Depends(require_token)):
    """Report whether a persistent logged-in LinkedIn session exists."""
    return _li_session_status()


def _li_session_status() -> dict[str, Any]:
    from playwright.sync_api import sync_playwright

    if not _linkedin_lock.acquire(timeout=1):
        return _li_diagnostics("login_in_progress", "session_check")
    try:
        with sync_playwright() as p:
            context = None
            try:
                context = _li_launch(p, headless=True)
                page = context.new_page()
                state = _li_login_state(page)
                return _li_diagnostics(state, "session_check")
            except Exception as exc:  # noqa: BLE001
                state = "session_locked" if "user data directory is already in use" in str(exc).lower() else "error"
                return _li_diagnostics(state, "session_check")
            finally:
                if context is not None:
                    context.close()
    finally:
        _linkedin_lock.release()


@app.post("/linkedin/logout")
def linkedin_logout(_auth: None = Depends(require_token)):
    """Clear the persisted LinkedIn session (cookies, local storage, etc.)."""
    run_id = start_run("linkedin", LINKEDIN_LOGIN_URL, "LinkedIn sign-out")
    try:
        with _linkedin_lock:
            if SESSION_DIR.is_dir():
                for child in SESSION_DIR.iterdir():
                    if child.is_dir():
                        shutil.rmtree(child, ignore_errors=True)
                    else:
                        child.unlink(missing_ok=True)
        record(run_id, "🚪 LinkedIn session cleared", "info")
        end_run(run_id, "success", "🚪 LinkedIn session cleared")
        return {"authenticated": False, "state": "signed_out"}
    except Exception as e:  # noqa: BLE001
        record(run_id, f"⚠ Failed to clear session: {e}", "warning")
        end_run(run_id, "failed", f"⚠ Failed to clear session: {e}")
        return {"authenticated": False, "state": "signed_out"}


def _li_text(page, *selectors: str) -> str:
    for sel in selectors:
        try:
            el = page.locator(sel).first
            if el.count() and el.is_visible():
                return el.inner_text().strip()
        except Exception:  # noqa: BLE001
            continue
    return ""


def _li_parse_profile(page) -> dict[str, Any]:
    profile: dict[str, Any] = {
        "name": _li_text(page, "h1", ".top-card-layout__title"),
        "headline": _li_text(page, ".text-body-medium, .top-card-layout__headline"),
        "location": _li_text(page, ".text-body-small.inline, .top-card-layout__second-subline"),
    }

    # About
    about = _li_text(page, "section#about span[aria-hidden='true'], section#about .inline-show-more-text")
    if about:
        profile["about"] = about

    # Experience
    experience: list[dict[str, Any]] = []
    exp_section = page.locator("section#experience, #experience-section")
    if exp_section.count():
        for item in exp_section.first.locator("[data-section-id] li, .pvs-entity").all()[:10]:
            txt = item.inner_text().strip()
            lines = [l for l in txt.split("\n") if l.strip()]
            if len(lines) >= 2:
                experience.append({
                    "role": lines[0],
                    "company": lines[1] if len(lines) > 1 else "",
                    "duration": lines[2] if len(lines) > 2 else "",
                    "details": lines[3:] if len(lines) > 3 else [],
                })
    profile["experience"] = experience

    # Education
    education: list[dict[str, Any]] = []
    edu_section = page.locator("section#education, #education-section")
    if edu_section.count():
        for item in edu_section.first.locator("li, .pvs-entity").all()[:5]:
            txt = item.inner_text().strip()
            lines = [l for l in txt.split("\n") if l.strip()]
            if lines:
                education.append({"degree": lines[0], "school": lines[1] if len(lines) > 1 else ""})
    profile["education"] = education

    # Skills
    skills: list[str] = []
    sk_section = page.locator("section#skills, #skills-section")
    if sk_section.count():
        for chip in sk_section.first.locator("a[href*='skills'] span[dir='ltr'], .pvs-entity").all()[:25]:
            name = chip.inner_text().strip()
            if name and len(name) < 60:
                skills.append(name)
    profile["skills"] = list(dict.fromkeys(skills))

    return profile


@app.post("/linkedin/profile")
def linkedin_profile(req: ScrapeRequest, _auth: None = Depends(require_token)):
    """Fetch a public LinkedIn profile with the persisted session and parse it."""
    from playwright.sync_api import sync_playwright

    handle = req.url.strip().rstrip("/")
    if "linkedin.com/in/" not in handle:
        handle = f"https://www.linkedin.com/in/{handle}"
    if not handle.startswith("http"):
        handle = "https://" + handle

    run_id = start_run("linkedin", handle, "Profile scrape")
    with _linkedin_lock, sync_playwright() as p:
        context = _li_launch(p, headless=True)
        try:
            page = context.new_page()
            record(run_id, "🌐 Opening profile in persistent session…", "info")
            page.goto(handle, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(3500)
            if "authwall" in page.url or "login" in page.url:
                end_run(run_id, "failed", "⚠ Auth wall — session required")
                return {"authenticated": False, "error": "LinkedIn session required — open Settings → LinkedIn → Sign in."}
            shot(run_id, page, "profile loaded")
            data = _li_parse_profile(page)
            end_run(run_id, "success", f"✅ Parsed profile — {data.get('name') or 'unknown'}")
            return {"authenticated": True, "profile": data}
        finally:
            context.close()


@app.post("/linkedin/import")
def linkedin_import(req: ScrapeRequest, _auth: None = Depends(require_token)):
    """Import a public LinkedIn profile using the persisted session.

    Unlike /linkedin/profile it first verifies the session is active and
    reports the auth state alongside the parsed profile, so the UI can
    auto-import right after sign-in.
    """
    from playwright.sync_api import sync_playwright

    handle = req.url.strip().rstrip("/")
    if "linkedin.com/in/" not in handle:
        handle = f"https://www.linkedin.com/in/{handle}"
    if not handle.startswith("http"):
        handle = "https://" + handle

    run_id = start_run("linkedin", handle, "Profile import")
    with _linkedin_lock, sync_playwright() as p:
        context = _li_launch(p, headless=True)
        try:
            page = context.new_page()
            state = _li_login_state(page)
            if state != "signed_in":
                end_run(run_id, "failed", "⚠ Auth wall — session required")
                return {"authenticated": False, "state": state,
                        "error": "LinkedIn session required — open Settings → LinkedIn → Sign in."}
            record(run_id, "🌐 Opening profile in persistent session…", "info")
            page.goto(handle, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(3500)
            if "authwall" in page.url or "login" in page.url:
                end_run(run_id, "failed", "⚠ Auth wall — session required")
                return {"authenticated": False, "state": "authwall",
                        "error": "LinkedIn session required — open Settings → LinkedIn → Sign in."}
            shot(run_id, page, "profile loaded")
            data = _li_parse_profile(page)
            end_run(run_id, "success", f"✅ Parsed profile — {data.get('name') or 'unknown'}")
            return {"authenticated": True, "state": "signed_in", "profile": data}
        finally:
            context.close()


@app.post("/linkedin/jobs")
def linkedin_jobs_search(req: ScrapeRequest, _auth: None = Depends(require_token)):
    """Search LinkedIn Jobs with the persisted session. URL must be a linkedin.com/jobs/search URL."""
    from playwright.sync_api import sync_playwright

    url = req.url.strip()
    if "linkedin.com/jobs" not in url:
        raise RuntimeError("Provide a linkedin.com/jobs/search/?keywords=…&location=… URL")

    run_id = start_run("linkedin", url, "Jobs search")
    with _linkedin_lock, sync_playwright() as p:
        context = _li_launch(p, headless=True)
        try:
            page = context.new_page()
            record(run_id, "🔎 Searching LinkedIn Jobs…", "info")
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(4000)
            if "authwall" in page.url or "login" in page.url:
                end_run(run_id, "failed", "⚠ Auth wall — session required")
                return {"authenticated": False, "error": "LinkedIn session required — open Settings → LinkedIn → Sign in."}
            shot(run_id, page, "jobs results")

            jobs: list[dict[str, str]] = []
            cards = page.locator(
                "li[data-occludable-job-id], .job-card-container, .jobs-search-results__list-item"
            )
            for i in range(min(cards.count(), 25)):
                card = cards.nth(i)
                try:
                    title = card.locator("a[data-tracking-control-name*='job'], .job-card-list__title").first.inner_text().strip()
                    company = card.locator(".artdeco-entity-lockup__subtitle, .job-card-container__primary-description").first.inner_text().strip()
                    location = card.locator(".job-card-container__metadata-item, .artdeco-entity-lockup__caption").first.inner_text().strip()
                    href = card.locator("a[href*='/jobs/view/']").first.get_attribute("href") or ""
                    if title:
                        jobs.append({
                            "title": title,
                            "company": company,
                            "location": location,
                            "url": href if href.startswith("http") else f"https://www.linkedin.com{href}",
                        })
                except Exception:  # noqa: BLE001
                    continue
            end_run(run_id, "success", f"✅ Found {len(jobs)} job cards")
            return {"authenticated": True, "count": len(jobs), "jobs": jobs}
        finally:
            context.close()


@app.post("/ats/crawl")
async def crawl_ats_boards(req: AtsCrawlRequest, _auth: None = Depends(require_token)):
    """Crawl multiple ATS JSON API boards directly in parallel using the Connector SDK."""
    run_id = start_run("crawl", "https://ats.huntflow.local", label=f"ATS direct crawl ({len(req.boards)} boards)")
    record(run_id, f"⚡ Starting direct ATS ingestion across {len(req.boards)} board(s)...")

    all_jobs: list[dict[str, Any]] = []
    keyword_lower = (req.keyword or "").lower().strip()

    async with httpx.AsyncClient(timeout=12.0) as client:
        for board in req.boards:
            conn = get_connector(board.provider)
            if not conn:
                continue
            try:
                page = await conn.fetch_page(
                    {"id": board.token, "token": board.token, "name": board.company_name, "connector": board.provider},
                    {},
                    {"keyword": req.keyword},
                    client,
                )
                for item in page.items:
                    job_dict = {
                        "id": f"{board.provider}_{board.token}_{item.external_id}",
                        "title": item.title,
                        "company": item.company,
                        "location": item.location,
                        "salary": item.salary,
                        "url": item.url,
                        "jobDescription": item.description,
                        "source": f"{board.provider.title()} ({item.company})",
                        "status": "wishlist",
                        "tags": item.tags,
                        "atsType": board.provider,
                    }
                    if keyword_lower:
                        match_text = (item.title + " " + item.description).lower()
                        if keyword_lower not in match_text:
                            continue
                    all_jobs.append(job_dict)
                record(run_id, f"✓ {board.provider.title()} ({board.company_name or board.token}): fetched {len(page.items)} job(s)")
            except Exception as e:
                record(run_id, f"⚠ Error fetching {board.token}: {e}", kind="warning")

    if req.limit and len(all_jobs) > req.limit:
        all_jobs = all_jobs[: req.limit]

    end_run(run_id, "success", f"✅ Ingested {len(all_jobs)} structured ATS job(s)")
    return {"ok": True, "count": len(all_jobs), "jobs": all_jobs, "runId": run_id}


@app.post("/ats/discover")
async def discover_ats_board(req: AtsDiscoverRequest, _auth: None = Depends(require_token)):
    """Detect ATS provider and company board token from career URL or name."""
    provider, token = detect_ats_provider(req.query)
    conn = get_connector(provider)
    sample_jobs: list[dict[str, Any]] = []
    if conn:
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                page = await conn.fetch_page({"id": token, "token": token, "connector": provider}, {}, None, client)
                for item in page.items:
                    sample_jobs.append({
                        "id": f"{provider}_{token}_{item.external_id}",
                        "title": item.title,
                        "company": item.company,
                        "location": item.location,
                        "url": item.url,
                        "jobDescription": item.description,
                        "tags": item.tags,
                    })
            except Exception as e:
                log.warning("Discovery fetch failed: %s", e)

    return {
        "ok": True,
        "provider": provider,
        "boardToken": token,
        "activeJobsCount": len(sample_jobs),
        "sampleJobs": sample_jobs[:3],
    }


app.mount("/screenshots", StaticFiles(directory=RUN_DIR), name="screenshots")


@app.middleware("http")
async def protect_screenshots(request: Request, call_next):  # noqa: ANN001
    """Guard the /screenshots static mount (holds user's browser screenshots).

    The token check is duplicated here because FastAPI mount routes do not
    participate in the endpoint dependency injection. When a token is set,
    a missing/invalid X-Huntflow-Token is rejected for screenshot paths.
    """
    if request.url.path.startswith("/screenshots") and AGENT_TOKEN:
        if request.headers.get("x-huntflow-token") != AGENT_TOKEN:
            return JSONResponse(status_code=401, content={"detail": "Missing or invalid X-Huntflow-Token"})
    return await call_next(request)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001)
