"""HUNTFLOW Direct ATS JSON API Ingestion Engine.

High-throughput, zero-browser API client for public career feeds:
- Greenhouse: https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true
- Lever: https://api.lever.co/v0/postings/{company}?mode=json
- Ashby: https://api.ashbyhq.com/posting-api/job-board/{company}

Parses raw postings into canonical HUNTFLOW job dictionaries in <100ms.
"""

from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request
from typing import Any, Optional

log = logging.getLogger("huntflow-ats")

GREENHOUSE_URL = "https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true"
LEVER_URL = "https://api.lever.co/v0/postings/{company}?mode=json"
ASHBY_URL = "https://api.ashbyhq.com/posting-api/job-board/{company}"

# Precompiled HTML tag cleaner
_TAG_RE = re.compile(r"<[^>]+>")


def clean_html(raw: str) -> str:
    """Strip HTML tags and unescape common entities."""
    if not raw:
        return ""
    text = _TAG_RE.sub(" ", raw)
    text = (
        text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
    )
    return re.sub(r"\s+", " ", text).strip()


KNOWN_BOARDS: dict[str, tuple[str, str]] = {
    "linear": ("lever", "linear"),
    "notion": ("lever", "notion"),
    "together": ("lever", "together-ai"),
    "together-ai": ("lever", "together-ai"),
    "supabase": ("ashby", "supabase"),
    "mistral": ("ashby", "mistral"),
    "modal": ("ashby", "modal"),
    "neon": ("ashby", "neon"),
    "raycast": ("ashby", "raycast"),
    "warp": ("ashby", "warp"),
    "anyscale": ("ashby", "anyscale"),
    "loom": ("lever", "loom"),
}


def detect_ats_provider(target: str) -> tuple[str, str]:
    """Detect ATS provider and board token from a URL or company slug."""
    clean = target.strip()

    # 1. Greenhouse URL matches
    gh_match = re.search(r"boards\.greenhouse\.io/([^/?#]+)", clean, re.I) or re.search(
        r"greenhouse\.io/([^/?#]+)", clean, re.I
    )
    if gh_match:
        return ("greenhouse", gh_match.group(1).lower())

    # 2. Lever URL matches
    lever_match = re.search(r"jobs\.lever\.co/([^/?#]+)", clean, re.I)
    if lever_match:
        return ("lever", lever_match.group(1).lower())

    # 3. Ashby URL matches
    ashby_match = re.search(r"jobs\.ashbyhq\.com/([^/?#]+)", clean, re.I)
    if ashby_match:
        return ("ashby", ashby_match.group(1).lower())

    # 4. Known company lookup table
    slug = re.sub(r"[^a-zA-Z0-9_-]", "", clean).lower()
    if slug in KNOWN_BOARDS:
        return KNOWN_BOARDS[slug]

    return ("greenhouse", slug)
# In-memory ETag & 304 cache (url -> (etag, last_modified, data))
_etag_cache: dict[str, tuple[Optional[str], Optional[str], Any]] = {}


def fetch_json(url: str, timeout: int = 8, headers: Optional[dict[str, str]] = None) -> Any:
    """Fetch JSON from endpoint with ETag/304 conditional polling support."""
    req_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
    }
    if headers:
        req_headers.update(headers)

    cached = _etag_cache.get(url)
    if cached:
        etag, last_mod, data = cached
        if etag:
            req_headers["If-None-Match"] = etag
        if last_mod:
            req_headers["If-Modified-Since"] = last_mod

    req = urllib.request.Request(url, headers=req_headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            new_etag = response.headers.get("ETag")
            new_last_mod = response.headers.get("Last-Modified")
            raw_bytes = response.read()
            parsed = json.loads(raw_bytes.decode("utf-8"))
            _etag_cache[url] = (new_etag, new_last_mod, parsed)
            return parsed
    except urllib.error.HTTPError as e:
        if e.code == 304 and cached:
            log.info(f"⚡ 304 Not Modified for {url} — served from ETag cache")
            return cached[2]
        raise

def ingest_greenhouse(board_token: str, company_name: Optional[str] = None) -> list[dict[str, Any]]:
    """Ingest all jobs from a Greenhouse board."""
    url = GREENHOUSE_URL.format(board=board_token)
    try:
        data = fetch_json(url)
    except Exception as e:
        log.warning(f"Greenhouse fetch failed for {board_token}: {e}")
        return []

    jobs: list[dict[str, Any]] = []
    company = company_name or board_token.replace("-", " ").title()
    raw_jobs = data.get("jobs", []) if isinstance(data, dict) else []

    for item in raw_jobs:
        job_id = f"gh_{board_token}_{item.get('id', '')}"
        title = item.get("title", "Untitled Role")
        location_obj = item.get("location", {})
        location = location_obj.get("name", "Remote") if isinstance(location_obj, dict) else "Remote"
        job_url = item.get("absolute_url", f"https://boards.greenhouse.io/{board_token}/jobs/{item.get('id')}")

        raw_content = item.get("content", "")
        cleaned_desc = clean_html(raw_content) if raw_content else f"{title} at {company} ({location})"

        # Extract departments/offices as tags
        tags = []
        for dep in item.get("departments", []):
            if isinstance(dep, dict) and dep.get("name"):
                tags.append(dep["name"])
        for off in item.get("offices", []):
            if isinstance(off, dict) and off.get("name"):
                tags.append(off["name"])

        # Salary extraction from description or metadata
        salary_match = re.search(r"(\$[\d,]+(?:\s*-\s*\$[\d,]+)?(?:\s*(?:USD|CAD|a\s+year|per\s+year|/yr))?)", cleaned_desc, re.I)
        salary = salary_match.group(1) if salary_match else None

        jobs.append({
            "id": job_id,
            "title": title,
            "company": company,
            "location": location,
            "salary": salary,
            "url": job_url,
            "jobDescription": cleaned_desc,
            "source": f"Greenhouse ({company})",
            "status": "wishlist",
            "tags": tags,
            "atsType": "greenhouse",
        })

    return jobs


def ingest_lever(company_slug: str, company_name: Optional[str] = None) -> list[dict[str, Any]]:
    """Ingest all jobs from a Lever company feed."""
    url = LEVER_URL.format(company=company_slug)
    try:
        data = fetch_json(url)
    except Exception as e:
        log.warning(f"Lever fetch failed for {company_slug}: {e}")
        return []

    jobs: list[dict[str, Any]] = []
    company = company_name or company_slug.replace("-", " ").title()
    raw_jobs = data if isinstance(data, list) else []

    for item in raw_jobs:
        if not isinstance(item, dict):
            continue
        job_id = f"lever_{company_slug}_{item.get('id', '')}"
        title = item.get("text", "Untitled Role")
        categories = item.get("categories", {})
        location = categories.get("location", "Remote") if isinstance(categories, dict) else "Remote"
        job_url = item.get("hostedUrl", f"https://jobs.lever.co/{company_slug}/{item.get('id')}")

        desc = clean_html(item.get("descriptionPlain", "") or item.get("description", ""))
        tags = []
        if isinstance(categories, dict):
            if categories.get("team"):
                tags.append(categories["team"])
            if categories.get("commitment"):
                tags.append(categories["commitment"])

        # Salary range if provided in salaryRange object
        salary_obj = item.get("salaryRange")
        salary = None
        if isinstance(salary_obj, dict) and salary_obj.get("min") and salary_obj.get("max"):
            currency = salary_obj.get("currency", "USD")
            salary = f"{currency} {salary_obj['min']:,} - {salary_obj['max']:,}"

        jobs.append({
            "id": job_id,
            "title": title,
            "company": company,
            "location": location,
            "salary": salary,
            "url": job_url,
            "jobDescription": desc or f"{title} at {company}",
            "source": f"Lever ({company})",
            "status": "wishlist",
            "tags": tags,
            "atsType": "lever",
        })

    return jobs


def ingest_ashby(company_slug: str, company_name: Optional[str] = None) -> list[dict[str, Any]]:
    """Ingest all jobs from an Ashby board."""
    url = ASHBY_URL.format(company=company_slug)
    try:
        data = fetch_json(url)
    except Exception as e:
        log.warning(f"Ashby fetch failed for {company_slug}: {e}")
        return []

    jobs: list[dict[str, Any]] = []
    company = company_name or company_slug.replace("-", " ").title()
    raw_jobs = data.get("jobPostings", []) if isinstance(data, dict) else []

    for item in raw_jobs:
        if not isinstance(item, dict):
            continue
        job_id = f"ashby_{company_slug}_{item.get('id', '')}"
        title = item.get("title", "Untitled Role")
        location = item.get("locationName", "Remote")
        job_url = item.get("jobUrl", f"https://jobs.ashbyhq.com/{company_slug}/{item.get('id')}")
        desc = clean_html(item.get("descriptionHtml", "") or item.get("descriptionPlain", ""))

        tags = []
        if item.get("departmentName"):
            tags.append(item["departmentName"])
        if item.get("employmentType"):
            tags.append(item["employmentType"])

        jobs.append({
            "id": job_id,
            "title": title,
            "company": company,
            "location": location,
            "salary": None,
            "url": job_url,
            "jobDescription": desc or f"{title} at {company}",
            "source": f"Ashby ({company})",
            "status": "wishlist",
            "tags": tags,
            "atsType": "ashby",
        })

    return jobs


def ingest_ats_jobs(provider: str, token_or_slug: str, company_name: Optional[str] = None) -> list[dict[str, Any]]:
    """Master dispatcher to ingest from any supported ATS provider."""
    p = provider.lower().strip()
    if p == "greenhouse":
        return ingest_greenhouse(token_or_slug, company_name)
    elif p == "lever":
        return ingest_lever(token_or_slug, company_name)
    elif p == "ashby":
        return ingest_ashby(token_or_slug, company_name)
    else:
        # Fallback: try greenhouse then lever
        res = ingest_greenhouse(token_or_slug, company_name)
        if res:
            return res
        return ingest_lever(token_or_slug, company_name)
