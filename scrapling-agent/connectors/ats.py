"""HUNTFLOW Crawler Connectors — Direct ATS JSON & XML Feeds."""

from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET
from typing import Any, Optional
from urllib.parse import urlparse
import httpx
from connectors.base import (
    ConnectorItem,
    ConnectorPage,
    DiscoveredSource,
    clean_html,
    compute_content_hash,
)

log = logging.getLogger("huntflow-connectors-ats")

GREENHOUSE_URL = "https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true"
LEVER_URL = "https://api.lever.co/v0/postings/{company}?mode=json"
ASHBY_URL = "https://api.ashbyhq.com/posting-api/job-board/{company}"
SMARTRECRUITERS_URL = "https://api.smartrecruiters.com/v1/companies/{company}/postings"
PERSONIO_URL = "https://{company}.jobs.personio.de/xml"
RECRUITEE_URL = "https://{company}.recruitee.com/api/offers"
WORKABLE_URL = "https://apply.workable.com/api/v1/widget/accounts/{company}"
TEAMTAILOR_URL = "https://api.teamtailor.com/v1/jobs"

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

_SAFE_TOKEN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,99}$", re.IGNORECASE)


def _validated_token(value: object, label: str) -> str:
    token = str(value or "").strip().lower()
    if not _SAFE_TOKEN.fullmatch(token):
        raise ValueError(f"Invalid {label} token")
    return token


def _validated_api_url(url: str, expected_host: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != expected_host or parsed.username or parsed.password:
        raise ValueError("Invalid ATS API URL")
    return url


def detect_ats_provider(target: str) -> tuple[str, str]:
    """Detect ATS provider and board token from a URL or company slug."""
    clean = target.strip()

    gh_match = re.search(r"boards\.greenhouse\.io/([^/?#]+)", clean, re.I) or re.search(
        r"greenhouse\.io/([^/?#]+)", clean, re.I
    )
    if gh_match:
        return ("greenhouse", gh_match.group(1).lower())

    lever_match = re.search(r"jobs\.lever\.co/([^/?#]+)", clean, re.I)
    if lever_match:
        return ("lever", lever_match.group(1).lower())

    ashby_match = re.search(r"jobs\.ashbyhq\.com/([^/?#]+)", clean, re.I)
    if ashby_match:
        return ("ashby", ashby_match.group(1).lower())

    sr_match = re.search(r"jobs\.smartrecruiters\.com/([^/?#]+)", clean, re.I)
    if sr_match:
        return ("smartrecruiters", sr_match.group(1).lower())

    personio_match = re.search(r"([a-z0-9_-]{1,100})\.jobs\.personio\.de", clean, re.I)
    if personio_match:
        return ("personio", personio_match.group(1).lower())

    recruitee_match = re.search(r"([a-z0-9_-]{1,100})\.recruitee\.com", clean, re.I)
    if recruitee_match:
        return ("recruitee", recruitee_match.group(1).lower())

    workable_match = re.search(r"apply\.workable\.com/([^/?#]+)", clean, re.I)
    if workable_match:
        return ("workable", workable_match.group(1).lower())

    slug = re.sub(r"[^a-zA-Z0-9_-]", "", clean).lower()
    if slug in KNOWN_BOARDS:
        return KNOWN_BOARDS[slug]

    return ("greenhouse", slug)


class GreenhouseConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        provider, token = detect_ats_provider(target)
        if provider != "greenhouse":
            return []
        name = token.replace("-", " ").title()
        return [
            DiscoveredSource(
                id=f"gh_{token}",
                name=f"{name} (Greenhouse)",
                channel="ats",
                connector="greenhouse",
                url=f"https://boards.greenhouse.io/{token}",
                token=token,
            )
        ]

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        raw_token = source.get("token") or source.get("config", {}).get("token") or source.get("id", "").replace("gh_", "")
        token = _validated_token(raw_token, "Greenhouse")
        url = _validated_api_url(GREENHOUSE_URL.format(board=token), "boards-api.greenhouse.io")

        headers: dict[str, str] = {"Accept": "application/json"}
        if state.get("etag"):
            headers["If-None-Match"] = state["etag"]
        if state.get("last_modified"):
            headers["If-Modified-Since"] = state["last_modified"]

        try:
            resp = await client.get(url, headers=headers, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code == 304:
            return ConnectorPage(items=[], status="not_modified", etag=state.get("etag"), last_modified=state.get("last_modified"))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        try:
            data = resp.json()
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=f"JSON parse error: {e}")

        company = source.get("name", token.replace("-", " ").title())
        raw_jobs = data.get("jobs", []) if isinstance(data, dict) else []
        items: list[ConnectorItem] = []

        for j in raw_jobs:
            ext_id = str(j.get("id", ""))
            title = j.get("title", "Untitled Role")
            loc = j.get("location", {}).get("name", "Remote") if isinstance(j.get("location"), dict) else "Remote"
            job_url = j.get("absolute_url", f"https://boards.greenhouse.io/{token}/jobs/{ext_id}")
            desc = clean_html(j.get("content", "")) or f"{title} at {company}"

            tags: list[str] = []
            for dep in j.get("departments", []):
                if isinstance(dep, dict) and dep.get("name"):
                    tags.append(dep["name"])
            for off in j.get("offices", []):
                if isinstance(off, dict) and off.get("name"):
                    tags.append(off["name"])

            salary_match = re.search(r"(\$[\d,]+(?:\s*-\s*\$[\d,]+)?(?:\s*(?:USD|CAD|a\s+year|per\s+year|/yr))?)", desc, re.I)
            salary = salary_match.group(1) if salary_match else None

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=loc,
                    url=job_url,
                    description=desc,
                    posted_at=j.get("updated_at"),
                    salary=salary,
                    tags=tags,
                    raw_payload=j,
                )
            )

        etag = resp.headers.get("ETag")
        last_mod = resp.headers.get("Last-Modified")
        content_hash = compute_content_hash(data)

        return ConnectorPage(
            items=items,
            etag=etag,
            last_modified=last_mod,
            content_hash=content_hash,
            is_complete=True,
            status="success",
        )


class LeverConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        provider, token = detect_ats_provider(target)
        if provider != "lever":
            return []
        name = token.replace("-", " ").title()
        return [
            DiscoveredSource(
                id=f"lever_{token}",
                name=f"{name} (Lever)",
                channel="ats",
                connector="lever",
                url=f"https://jobs.lever.co/{token}",
                token=token,
            )
        ]

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        raw_token = source.get("token") or source.get("config", {}).get("token") or source.get("id", "").replace("lever_", "")
        token = _validated_token(raw_token, "Lever")
        url = _validated_api_url(LEVER_URL.format(company=token), "api.lever.co")

        headers: dict[str, str] = {"Accept": "application/json"}
        if state.get("etag"):
            headers["If-None-Match"] = state["etag"]
        if state.get("last_modified"):
            headers["If-Modified-Since"] = state["last_modified"]

        try:
            resp = await client.get(url, headers=headers, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code == 304:
            return ConnectorPage(items=[], status="not_modified", etag=state.get("etag"), last_modified=state.get("last_modified"))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        try:
            data = resp.json()
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=f"JSON parse error: {e}")

        company = source.get("name", token.replace("-", " ").title())
        raw_jobs = data if isinstance(data, list) else []
        items: list[ConnectorItem] = []

        for j in raw_jobs:
            if not isinstance(j, dict):
                continue
            ext_id = str(j.get("id", ""))
            title = j.get("text", "Untitled Role")
            cats = j.get("categories", {}) if isinstance(j.get("categories"), dict) else {}
            loc = cats.get("location", "Remote")
            job_url = j.get("hostedUrl", f"https://jobs.lever.co/{token}/{ext_id}")
            desc = clean_html(j.get("descriptionPlain", "") or j.get("description", "")) or f"{title} at {company}"

            tags: list[str] = []
            if cats.get("team"):
                tags.append(cats["team"])
            if cats.get("commitment"):
                tags.append(cats["commitment"])

            salary = None
            salary_obj = j.get("salaryRange")
            if isinstance(salary_obj, dict) and salary_obj.get("min") and salary_obj.get("max"):
                currency = salary_obj.get("currency", "USD")
                salary = f"{currency} {salary_obj['min']:,} - {salary_obj['max']:,}"

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=loc,
                    url=job_url,
                    description=desc,
                    posted_at=str(j.get("createdAt", "")),
                    salary=salary,
                    tags=tags,
                    raw_payload=j,
                )
            )

        etag = resp.headers.get("ETag")
        last_mod = resp.headers.get("Last-Modified")
        content_hash = compute_content_hash(data)

        return ConnectorPage(
            items=items,
            etag=etag,
            last_modified=last_mod,
            content_hash=content_hash,
            is_complete=True,
            status="success",
        )


class AshbyConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        provider, token = detect_ats_provider(target)
        if provider != "ashby":
            return []
        name = token.replace("-", " ").title()
        return [
            DiscoveredSource(
                id=f"ashby_{token}",
                name=f"{name} (Ashby)",
                channel="ats",
                connector="ashby",
                url=f"https://jobs.ashbyhq.com/{token}",
                token=token,
            )
        ]

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        raw_token = source.get("token") or source.get("config", {}).get("token") or source.get("id", "").replace("ashby_", "")
        token = _validated_token(raw_token, "Ashby")
        url = _validated_api_url(ASHBY_URL.format(company=token), "api.ashbyhq.com")

        headers: dict[str, str] = {"Accept": "application/json"}
        if state.get("etag"):
            headers["If-None-Match"] = state["etag"]
        if state.get("last_modified"):
            headers["If-Modified-Since"] = state["last_modified"]

        try:
            resp = await client.get(url, headers=headers, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code == 304:
            return ConnectorPage(items=[], status="not_modified", etag=state.get("etag"), last_modified=state.get("last_modified"))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        try:
            data = resp.json()
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=f"JSON parse error: {e}")

        company = source.get("name", token.replace("-", " ").title())
        raw_jobs = data.get("jobPostings", []) if isinstance(data, dict) else []
        items: list[ConnectorItem] = []

        for j in raw_jobs:
            if not isinstance(j, dict):
                continue
            ext_id = str(j.get("id", ""))
            title = j.get("title", "Untitled Role")
            loc = j.get("locationName", "Remote")
            job_url = j.get("jobUrl", f"https://jobs.ashbyhq.com/{token}/{ext_id}")
            desc = clean_html(j.get("descriptionHtml", "") or j.get("descriptionPlain", "")) or f"{title} at {company}"

            tags: list[str] = []
            if j.get("departmentName"):
                tags.append(j["departmentName"])
            if j.get("employmentType"):
                tags.append(j["employmentType"])

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=loc,
                    url=job_url,
                    description=desc,
                    posted_at=j.get("publishedAt"),
                    salary=None,
                    tags=tags,
                    raw_payload=j,
                )
            )

        etag = resp.headers.get("ETag")
        last_mod = resp.headers.get("Last-Modified")
        content_hash = compute_content_hash(data)

        return ConnectorPage(
            items=items,
            etag=etag,
            last_modified=last_mod,
            content_hash=content_hash,
            is_complete=True,
            status="success",
        )


class SmartRecruitersConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        provider, token = detect_ats_provider(target)
        if provider != "smartrecruiters":
            return []
        name = token.replace("-", " ").title()
        return [
            DiscoveredSource(
                id=f"sr_{token}",
                name=f"{name} (SmartRecruiters)",
                channel="ats",
                connector="smartrecruiters",
                url=f"https://jobs.smartrecruiters.com/{token}",
                token=token,
            )
        ]

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        raw_token = source.get("token") or source.get("config", {}).get("token") or source.get("id", "").replace("sr_", "").replace("smartrecruiters_", "")
        token = _validated_token(raw_token, "SmartRecruiters")
        url = _validated_api_url(SMARTRECRUITERS_URL.format(company=token), "api.smartrecruiters.com")

        try:
            resp = await client.get(url, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        data = resp.json()
        raw_jobs = data.get("content", []) if isinstance(data, dict) else []
        company = source.get("name", token.replace("-", " ").title())
        items: list[ConnectorItem] = []

        for j in raw_jobs:
            ext_id = str(j.get("id", ""))
            title = j.get("name", "Untitled Role")
            loc_data = j.get("location", {})
            loc = loc_data.get("city", loc_data.get("country", "Remote")) if isinstance(loc_data, dict) else "Remote"
            job_url = f"https://jobs.smartrecruiters.com/{token}/{ext_id}"

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=loc,
                    url=job_url,
                    description=f"{title} at {company}",
                    posted_at=j.get("releasedDate"),
                    tags=[j.get("department", {}).get("label", "")] if isinstance(j.get("department"), dict) else [],
                    raw_payload=j,
                )
            )

        return ConnectorPage(items=items, content_hash=compute_content_hash(data), status="success")


class PersonioConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        provider, token = detect_ats_provider(target)
        if provider != "personio":
            return []
        name = token.replace("-", " ").title()
        return [
            DiscoveredSource(
                id=f"personio_{token}",
                name=f"{name} (Personio)",
                channel="ats",
                connector="personio",
                url=f"https://{token}.jobs.personio.de",
                token=token,
            )
        ]

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        raw_token = source.get("token") or source.get("config", {}).get("token") or source.get("id", "").replace("personio_", "")
        token = _validated_token(raw_token, "Personio")
        url = PERSONIO_URL.format(company=token)

        try:
            resp = await client.get(url, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        try:
            root = ET.fromstring(resp.text)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=f"XML parse error: {e}")

        company = source.get("name", token.replace("-", " ").title())
        items: list[ConnectorItem] = []

        for position in root.findall(".//position"):
            ext_id = position.findtext("id", "")
            title = position.findtext("name", "Untitled Role")
            office = position.findtext("office", "Remote")
            dept = position.findtext("department", "")
            sched = position.findtext("schedule", "")

            desc_parts = []
            for desc_elem in position.findall(".//jobDescription"):
                name_elem = desc_elem.findtext("name", "")
                val_elem = desc_elem.findtext("value", "")
                if val_elem:
                    desc_parts.append(f"{name_elem}:\n{clean_html(val_elem)}")

            full_desc = "\n\n".join(desc_parts) if desc_parts else f"{title} at {company}"
            job_url = f"https://{token}.jobs.personio.de/job/{ext_id}"

            tags = [t for t in [dept, sched] if t]

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=office,
                    url=job_url,
                    description=full_desc,
                    tags=tags,
                    raw_payload={"id": ext_id, "title": title, "office": office, "department": dept},
                )
            )

        return ConnectorPage(items=items, content_hash=compute_content_hash(resp.text), status="success")


class RecruiteeConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        provider, token = detect_ats_provider(target)
        if provider != "recruitee":
            return []
        name = token.replace("-", " ").title()
        return [
            DiscoveredSource(
                id=f"recruitee_{token}",
                name=f"{name} (Recruitee)",
                channel="ats",
                connector="recruitee",
                url=f"https://{token}.recruitee.com",
                token=token,
            )
        ]

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        raw_token = source.get("token") or source.get("config", {}).get("token") or source.get("id", "").replace("recruitee_", "")
        token = _validated_token(raw_token, "Recruitee")
        url = RECRUITEE_URL.format(company=token)

        try:
            resp = await client.get(url, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        data = resp.json()
        raw_offers = data.get("offers", []) if isinstance(data, dict) else []
        company = source.get("name", token.replace("-", " ").title())
        items: list[ConnectorItem] = []

        for o in raw_offers:
            ext_id = str(o.get("id", ""))
            title = o.get("title", "Untitled Role")
            loc = o.get("location", o.get("city", "Remote"))
            job_url = o.get("careers_url", f"https://{token}.recruitee.com/o/{o.get('slug', ext_id)}")
            desc = clean_html(o.get("description", "")) or f"{title} at {company}"

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=loc or "Remote",
                    url=job_url,
                    description=desc,
                    posted_at=o.get("created_at"),
                    tags=[o.get("department", "")] if o.get("department") else [],
                    raw_payload=o,
                )
            )

        return ConnectorPage(items=items, content_hash=compute_content_hash(data), status="success")


class WorkableConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        provider, token = detect_ats_provider(target)
        if provider != "workable":
            return []
        name = token.replace("-", " ").title()
        return [
            DiscoveredSource(
                id=f"workable_{token}",
                name=f"{name} (Workable)",
                channel="ats",
                connector="workable",
                url=f"https://apply.workable.com/{token}",
                token=token,
            )
        ]

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        raw_token = source.get("token") or source.get("config", {}).get("token") or source.get("id", "").replace("workable_", "")
        token = _validated_token(raw_token, "Workable")
        url = WORKABLE_URL.format(company=token)

        try:
            resp = await client.get(url, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        data = resp.json()
        raw_jobs = data.get("jobs", []) if isinstance(data, dict) else []
        company = source.get("name", token.replace("-", " ").title())
        items: list[ConnectorItem] = []

        for j in raw_jobs:
            ext_id = str(j.get("shortcode", j.get("id", "")))
            title = j.get("title", "Untitled Role")
            loc = j.get("city", j.get("country", "Remote")) or "Remote"
            job_url = j.get("url", f"https://apply.workable.com/{token}/j/{ext_id}")

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=loc,
                    url=job_url,
                    description=f"{title} at {company}",
                    tags=[j.get("department", "")] if j.get("department") else [],
                    raw_payload=j,
                )
            )

        return ConnectorPage(items=items, content_hash=compute_content_hash(data), status="success")


class TeamtailorConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        return []

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        api_key = source.get("api_key") or source.get("config", {}).get("api_key")
        if not api_key:
            return ConnectorPage(items=[], status="not_configured", error_message="Teamtailor API key not configured")

        headers = {"Authorization": f"Token token={api_key}", "X-Api-Version": "20210218"}
        try:
            resp = await client.get(TEAMTAILOR_URL, headers=headers, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        data = resp.json()
        raw_jobs = data.get("data", []) if isinstance(data, dict) else []
        items: list[ConnectorItem] = []

        for j in raw_jobs:
            attrs = j.get("attributes", {})
            ext_id = str(j.get("id", ""))
            title = attrs.get("title", "Untitled Role")
            body = clean_html(attrs.get("body", ""))
            links = j.get("links", {})
            job_url = links.get("careersite-job-url", "")

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company="Teamtailor Client",
                    location="Remote",
                    url=job_url,
                    description=body or title,
                    posted_at=attrs.get("created-at"),
                    raw_payload=j,
                )
            )

        return ConnectorPage(items=items, content_hash=compute_content_hash(data), status="success")


class WorkdayConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        return []

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        return ConnectorPage(
            items=[],
            status="manual_only",
            error_message="Workday CXS is a manual tenant-assisted connector.",
        )


class BambooHRConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        return []

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        return ConnectorPage(
            items=[],
            status="manual_only",
            error_message="BambooHR public feeds are manual tenant-assisted connectors.",
        )
