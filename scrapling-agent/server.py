"""HUNTFLOW Agent — Scrapling-powered job scraping & auto-apply server.

Run with: uv run uvicorn server:app --port 8001
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

AGENT_TOKEN = os.environ.get("HUNTFLOW_AGENT_TOKEN", "")

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
_active_run: Optional[dict[str, Any]] = None


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


def start_run(kind: str, url: str, label: str = "") -> str:
    """Register a new run and mark it active for the live console."""
    global _active_run
    run_id = uuid.uuid4().hex[:12]
    with _activity_lock:
        _runs[run_id] = {
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
        if len(_runs) > 20:
            oldest = sorted(_runs, key=lambda k: _runs[k]["started"])[0]
            del _runs[oldest]
        _active_run = _runs[run_id]
    record(run_id, f"🚀 {label or kind} dispatched for {url}", "info")
    return run_id


def end_run(run_id: str, status: str, message: str) -> None:
    """Finalize a run (success / failed / manual_required / skipped)."""
    global _active_run
    with _activity_lock:
        run = _runs.get(run_id)
        if run:
            run["status"] = status
            run["finished"] = datetime.now().strftime("%H:%M:%S")
            run["finished_ts"] = time.time()
        if _active_run and _active_run.get("run_id") == run_id:
            _active_run = None
    record(run_id, message, "success" if status == "success" else "warning")


def shot(run_id: str, page, label: str) -> Optional[str]:
    """Capture a screenshot of the live browser page into the run folder."""
    try:
        import re as _re
        safe = _re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")[:40] or "step"
        name = f"{safe}-{datetime.now().strftime('%H%M%S')}.png"
        path = RUN_DIR / run_id / name
        path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(path))
        record(run_id, f"📸 Snapshot — {label}", "shot", {"screenshot": f"{run_id}/{name}"})
        return name
    except Exception as e:  # noqa: BLE001
        record(run_id, f"⚠ Screenshot failed: {e}", "warning")
        return None

app = FastAPI(title="HUNTFLOW Agent", version="0.1.0")
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
    min_match: float = 0.0
    match_score: Optional[float] = None


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


def _scrape_static(url: str) -> dict[str, str]:
    """Fast HTTP path — TLS impersonation, no browser needed."""
    from scrapling.fetchers import Fetcher

    page = Fetcher.get(url, impersonate="chrome", timeout=20000)
    if page.status >= 400:
        raise RuntimeError(f"HTTP {page.status}")
    return _extract_job(page, url)


def _scrape_dynamic(url: str) -> dict[str, str]:
    """Real-browser path for JS-heavy pages (Scrapling StealthyFetcher)."""
    from scrapling.fetchers import StealthyFetcher

    page = StealthyFetcher.fetch(url, headless=True, network_idle=True, timeout=45000)
    return _extract_job(page, url)


@app.post("/scrape")
def scrape(req: ScrapeRequest, _auth: None = Depends(require_token)):
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
            result = _scrape_dynamic(req.url)
            end_run(run_id, "success", f"✅ Stealth browser scraped {result['company']} — {result['title']}")
            return result
        except Exception as e2:  # noqa: BLE001
            log.error("Dynamic fetch failed too: %s", e2)
            end_run(run_id, "failed", f"✕ Scrape failed: {e2}")
            raise RuntimeError(f"Scrapling could not fetch {req.url}: {e2}") from e2


class CrawlRequest(BaseModel):
    category: str = "all"  # "remote" | "europe" | "mena" | "global" | "all"
    keyword: Optional[str] = "developer"
    limit: int = 10


@app.post("/crawl")
def crawl(req: CrawlRequest, _auth: None = Depends(require_token)):
    run_id = start_run("crawl", f"category={req.category}", f"Crawl ({req.category})")
    sources_file = Path(__file__).resolve().parent / "sources.json"
    if not sources_file.exists():
        end_run(run_id, "failed", "sources.json not found")
        return {"jobs": []}

    try:
        with open(sources_file, "r", encoding="utf-8") as f:
            sources_data = json.load(f)
    except Exception as e:  # noqa: BLE001
        end_run(run_id, "failed", f"Failed to load sources: {e}")
        return {"jobs": []}

    target_categories = [req.category] if req.category in sources_data else list(sources_data.keys())
    discovered_jobs: list[dict[str, Any]] = []

    for cat in target_categories:
        boards = sources_data.get(cat, [])
        for board in boards:
            if len(discovered_jobs) >= req.limit:
                break
            record(run_id, f"🔍 Crawling {board['name']} ({cat})…", "info")
            try:
                if board.get("type") == "stealth":
                    res = _scrape_dynamic(board["url"])
                else:
                    res = _scrape_static(board["url"])
                
                if res and res.get("title"):
                    discovered_jobs.append({
                        "id": f"crawl_{uuid.uuid4().hex[:8]}",
                        "title": res["title"],
                        "company": res["company"],
                        "location": res["location"],
                        "salary": res.get("salary", "Competitive Salary"),
                        "url": board["url"],
                        "jobDescription": res.get("description", "Job description extracted via Scrapling crawler."),
                        "source": board["name"],
                        "category": cat,
                    })
            except Exception as e:  # noqa: BLE001
                record(run_id, f"⚠ Skipped {board['name']}: {e}", "warning")

    end_run(run_id, "success", f"🎉 Crawl completed — found {len(discovered_jobs)} job(s)")
    return {"jobs": discovered_jobs}


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
    from playwright.sync_api import Page  # type: ignore

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
        label = (el_id + " " + el_name + " " + el_meta["placeholder"])

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
                    record(run_id, f"⌨ Selected '{match}' for {el_name or el_id or el_type}", "info")
                continue
            locator.fill(value, timeout=4000)
            mapped += 1
            filled_fields.append(el_name or el_id or el_type)
            record(run_id, f"✏ Filled {el_name or el_id or el_type} ({rule_key or 'auto'})", "info")
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

    msg = "⚡ Clicking submit…"
    logs.append({"timestamp": ts(), "message": msg, "type": "info"})
    record(run_id, msg, "info")
    submit_btn.click()
    page.wait_for_timeout(3500)
    shot(run_id, page, "submitted")
    msg = f"🎉 Application submitted to {profile.get('name', 'the company')}"
    logs.append({"timestamp": ts(), "message": msg, "type": "success"})
    record(run_id, msg, "success")
    return ("applied", filled_fields)


@app.post("/apply")
def apply(req: ApplyRequest, _auth: None = Depends(require_token)):
    logs: list[dict[str, str]] = []
    run_id = start_run("apply", req.url, "Auto-apply")

    match_score = req.match_score
    min_match = req.min_match
    if match_score is not None and min_match > 0 and match_score < min_match:
        logs.append({
            "timestamp": ts(),
            "message": f"🛑 Match {match_score}% below threshold {min_match:.0f}% — agent skipped auto-apply",
            "type": "warning",
        })
        record(run_id, f"🛑 Match {match_score}% below threshold {min_match:.0f}% — held fire", "warning")
        end_run(run_id, "skipped", "🛑 Match gate blocked this application")
        return {"status": "manual_required", "logs": logs, "fields": []}

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

        def page_action(page):
            nonlocal result
            _status, filled = _detect_and_fill(page, req.profile, req.documents, logs, req.submit, run_id)
            result = filled

        page = DynamicFetcher.fetch(
            req.url,
            headless=True,
            network_idle=True,
            page_action=page_action,
            timeout=60000,
        )
        status = "applied" if req.submit else "manual_required"
        msg = f"✅ Agent finished. Status: {status}"
        logs.append({"timestamp": ts(), "message": msg, "type": "info"})
        end_run(run_id, "success", f"✅ Run complete — {status}")
        return {"status": status, "logs": logs, "fields": result}
    except RuntimeError as e:
        msg = f"✕ Automation error: {e}"
        logs.append({"timestamp": ts(), "message": msg, "type": "error"})
        end_run(run_id, "failed", f"✕ Automation error: {e}")
        return {"status": "failed", "logs": logs, "fields": []}


@app.get("/activity")
def activity(since: int = Query(0, description="Return only events with id > since")):
    """Poll endpoint for the live agent console."""
    with _activity_lock:
        events = [e for e in _activity if e["id"] > since][-200:]
        runs = sorted(_runs.values(), key=lambda r: r["started"], reverse=True)
        active = dict(_active_run) if _active_run else None
    return {"active": active, "events": events, "runs": runs}


@app.get("/health")
def health():
    fetchers_ok = True
    browser_ok = True
    try:
        from scrapling.fetchers import Fetcher  # noqa: F401
    except Exception:  # noqa: BLE001
        fetchers_ok = False
    try:
        from scrapling.fetchers import DynamicFetcher  # noqa: F401
    except Exception:  # noqa: BLE001
        browser_ok = False
    return {"status": "ok", "scrapling_fetchers": fetchers_ok, "browser_automation": browser_ok}


# ---------------------------------------------------------------------------
# LinkedIn (persistent headful session + profile/jobs extraction)
# ---------------------------------------------------------------------------

SESSION_DIR = Path(__file__).resolve().parent / ".linkedin_session"
SESSION_DIR.mkdir(exist_ok=True)

LINKEDIN_LOGIN_URL = "https://www.linkedin.com/login"


def _li_launch(playwright, headless: bool = False):
    """Persistent Chromium context — cookies/session survive between requests."""
    return playwright.chromium.launch_persistent_context(
        str(SESSION_DIR),
        headless=headless,
        viewport={"width": 1280, "height": 900},
        args=["--disable-blink-features=AutomationControlled"],
    )


def _li_is_logged_in(page) -> bool:
    try:
        page.goto("https://www.linkedin.com/feed/", wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(2500)
    except Exception:  # noqa: BLE001
        return False
    url = page.url
    if "login" in url or "authwall" in url:
        return False
    try:
        return page.locator("nav.global-nav, header.global-nav").first.is_visible()
    except Exception:  # noqa: BLE001
        return False


@app.post("/linkedin/login")
def linkedin_login(_auth: None = Depends(require_token)):
    """Open a visible Chromium window so the user can sign in manually.
    The session is persisted on disk; closes after login or 4 minutes."""
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

    run_id = start_run("linkedin", LINKEDIN_LOGIN_URL, "LinkedIn sign-in")
    record(run_id, "🪟 Opening visible Chromium window — sign in manually", "info")
    with sync_playwright() as p:
        context = _li_launch(p, headless=False)
        page = context.new_page()
        page.goto(LINKEDIN_LOGIN_URL, wait_until="domcontentloaded", timeout=45000)
        try:
            # After a successful login LinkedIn redirects to /feed — wait for it.
            page.wait_for_url(re.compile(r"(feed|mynetwork|checkpoint)", re.I), timeout=240000)
            page.wait_for_timeout(3000)  # let cookies flush
        except PWTimeout:
            pass
        context.close()
    ok = _li_session_status()
    end_run(run_id, "success" if ok else "failed",
            "✅ LinkedIn session saved" if ok else "⚠ No session detected — login window closed early")
    return {"authenticated": ok}


@app.get("/linkedin/session")
def linkedin_session(_auth: None = Depends(require_token)):
    """Report whether a persistent logged-in LinkedIn session exists."""
    return {"authenticated": _li_session_status()}


def _li_session_status() -> bool:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        context = _li_launch(p, headless=True)
        try:
            page = context.new_page()
            return _li_is_logged_in(page)
        except Exception:  # noqa: BLE001
            return False
        finally:
            context.close()


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
    with sync_playwright() as p:
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


@app.post("/linkedin/jobs")
def linkedin_jobs_search(req: ScrapeRequest, _auth: None = Depends(require_token)):
    """Search LinkedIn Jobs with the persisted session. URL must be a linkedin.com/jobs/search URL."""
    from playwright.sync_api import sync_playwright

    url = req.url.strip()
    if "linkedin.com/jobs" not in url:
        raise RuntimeError("Provide a linkedin.com/jobs/search/?keywords=…&location=… URL")

    run_id = start_run("linkedin", url, "Jobs search")
    with sync_playwright() as p:
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
