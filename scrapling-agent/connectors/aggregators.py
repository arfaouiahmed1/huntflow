"""HUNTFLOW Crawler Connectors — Open & Keyed Aggregator Feeds."""

from __future__ import annotations

import logging
import re
from typing import Any, Optional
import httpx

from connectors.base import (
    ConnectorItem,
    ConnectorPage,
    DiscoveredSource,
    clean_html,
    compute_content_hash,
)

log = logging.getLogger("huntflow-connectors-aggregators")


class ArbeitnowConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        return []

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        cursor = state.get("cursor") or "1"
        url = f"https://www.arbeitnow.com/api/job-board-api?page={cursor}"

        headers = {"Accept": "application/json"}
        if state.get("etag"):
            headers["If-None-Match"] = state["etag"]

        try:
            resp = await client.get(url, headers=headers, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code == 304:
            return ConnectorPage(items=[], status="not_modified", etag=state.get("etag"))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        data = resp.json()
        raw_jobs = data.get("data", []) if isinstance(data, dict) else []
        items: list[ConnectorItem] = []

        for j in raw_jobs:
            ext_id = str(j.get("slug", j.get("id", "")))
            title = j.get("title", "Untitled Role")
            company = j.get("company_name", "Unknown Company")
            loc = j.get("location", "Remote")
            job_url = j.get("url", "")
            desc = clean_html(j.get("description", "")) or f"{title} at {company}"

            tags: list[str] = j.get("tags", []) if isinstance(j.get("tags"), list) else []
            if j.get("remote"):
                tags.append("Remote")
            if j.get("visa_sponsorship"):
                tags.append("Visa Sponsorship")

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=loc,
                    url=job_url,
                    description=desc,
                    posted_at=str(j.get("created_at", "")),
                    tags=tags,
                    raw_payload=j,
                )
            )

        links = data.get("links", {}) if isinstance(data, dict) else {}
        next_page = links.get("next")
        next_cursor = None
        if next_page and "page=" in next_page:
            match = re.search(r"page=(\d+)", next_page)
            if match:
                next_cursor = match.group(1)

        return ConnectorPage(
            items=items,
            next_cursor=next_cursor,
            etag=resp.headers.get("ETag"),
            content_hash=compute_content_hash(data),
            is_complete=next_cursor is None,
            status="success",
        )


class JobicyConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        return []

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        count = query.get("limit", 50) if query else 50
        tag = query.get("keyword", "dev") if query and query.get("keyword") else "dev"
        url = f"https://jobicy.com/api/v2/remote-jobs?count={count}&tag={tag}"

        try:
            resp = await client.get(url, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        data = resp.json()
        raw_jobs = data.get("jobs", []) if isinstance(data, dict) else []
        items: list[ConnectorItem] = []

        for j in raw_jobs:
            ext_id = str(j.get("id", ""))
            title = j.get("jobTitle", "Untitled Role")
            company = j.get("companyName", "Unknown Company")
            loc = j.get("jobGeo", "Remote")
            job_url = j.get("url", "")
            desc = clean_html(j.get("jobDescription", "")) or f"{title} at {company}"

            salary = None
            if j.get("annualSalaryMin") or j.get("annualSalaryMax"):
                cur = j.get("salaryCurrency", "USD")
                salary = f"{cur} {j.get('annualSalaryMin', 0)} - {j.get('annualSalaryMax', 0)}"

            tags: list[str] = []
            if j.get("jobIndustry"):
                tags.append(j["jobIndustry"])
            if j.get("jobType"):
                tags.append(j["jobType"])

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=loc,
                    url=job_url,
                    description=desc,
                    posted_at=j.get("pubDate"),
                    salary=salary,
                    tags=tags,
                    raw_payload=j,
                )
            )

        return ConnectorPage(
            items=items,
            content_hash=compute_content_hash(data),
            is_complete=True,
            status="success",
        )


class RemotiveConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        return []

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        search = query.get("keyword", "software-dev") if query and query.get("keyword") else ""
        url = "https://remotive.com/api/remote-jobs?limit=50&category=software-dev"
        if search:
            url += f"&search={search}"

        headers = {"Accept": "application/json"}
        if state.get("etag"):
            headers["If-None-Match"] = state["etag"]

        try:
            resp = await client.get(url, headers=headers, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code == 304:
            return ConnectorPage(items=[], status="not_modified", etag=state.get("etag"))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        data = resp.json()
        raw_jobs = data.get("jobs", []) if isinstance(data, dict) else []
        items: list[ConnectorItem] = []

        for j in raw_jobs:
            ext_id = str(j.get("id", ""))
            title = j.get("title", "Untitled Role")
            company = j.get("company_name", "Unknown Company")
            loc = j.get("candidate_required_location", "Remote")
            job_url = j.get("url", "")
            desc = clean_html(j.get("description", "")) or f"{title} at {company}"

            tags: list[str] = j.get("tags", []) if isinstance(j.get("tags"), list) else []

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=loc,
                    url=job_url,
                    description=desc,
                    posted_at=j.get("publication_date"),
                    salary=j.get("salary") or None,
                    tags=tags,
                    raw_payload=j,
                )
            )

        return ConnectorPage(
            items=items,
            etag=resp.headers.get("ETag"),
            content_hash=compute_content_hash(data),
            is_complete=True,
            status="success",
        )


class HimalayasConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        return []

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        offset = state.get("cursor") or "0"
        url = f"https://himalayas.app/jobs/api?limit=50&offset={offset}"

        try:
            resp = await client.get(url, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        data = resp.json()
        raw_jobs = data.get("data", data.get("jobs", [])) if isinstance(data, dict) else []
        items: list[ConnectorItem] = []

        for j in raw_jobs:
            ext_id = str(j.get("id", j.get("slug", "")))
            title = j.get("title", "Untitled Role")
            company = j.get("companyName", j.get("company", {}).get("name", "Unknown Company"))
            loc = j.get("location", "Remote")
            job_url = j.get("applicationUrl", j.get("url", ""))
            desc = clean_html(j.get("description", "")) or f"{title} at {company}"

            salary = None
            if j.get("minSalary") and j.get("maxSalary"):
                cur = j.get("currency", "USD")
                salary = f"{cur} {j['minSalary']:,} - {j['maxSalary']:,}"

            tags: list[str] = j.get("skills", []) if isinstance(j.get("skills"), list) else []

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=loc,
                    url=job_url,
                    description=desc,
                    posted_at=j.get("publishedAt"),
                    salary=salary,
                    tags=tags,
                    raw_payload=j,
                )
            )

        next_offset = str(int(offset) + len(items)) if len(items) >= 50 else None

        return ConnectorPage(
            items=items,
            next_cursor=next_offset,
            content_hash=compute_content_hash(data),
            is_complete=next_offset is None,
            status="success",
        )


class ReliefWebConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        return []

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        offset = state.get("cursor") or "0"
        url = f"https://api.reliefweb.int/v1/jobs?appname=huntflow&limit=50&offset={offset}&profile=full"

        headers = {"Accept": "application/json"}
        if state.get("etag"):
            headers["If-None-Match"] = state["etag"]

        try:
            resp = await client.get(url, headers=headers, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code == 304:
            return ConnectorPage(items=[], status="not_modified", etag=state.get("etag"))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        data = resp.json()
        raw_data = data.get("data", []) if isinstance(data, dict) else []
        items: list[ConnectorItem] = []

        for entry in raw_data:
            fields = entry.get("fields", {})
            ext_id = str(entry.get("id", ""))
            title = fields.get("title", "Untitled Role")
            source_org = fields.get("source", [{}])
            company = source_org[0].get("name", "International Organization") if source_org else "International Organization"
            country_list = fields.get("country", [{}])
            loc = country_list[0].get("name", "Global") if country_list else "Global"
            job_url = fields.get("url", f"https://reliefweb.int/job/{ext_id}")
            desc = clean_html(fields.get("body", "")) or f"{title} at {company}"

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=loc,
                    url=job_url,
                    description=desc,
                    posted_at=fields.get("date", {}).get("created"),
                    tags=[t.get("name", "") for t in fields.get("type", []) if t.get("name")],
                    raw_payload=entry,
                )
            )

        total_count = data.get("totalCount", 0)
        next_offset = str(int(offset) + len(items)) if int(offset) + len(items) < total_count else None

        return ConnectorPage(
            items=items,
            next_cursor=next_offset,
            etag=resp.headers.get("ETag"),
            content_hash=compute_content_hash(data),
            is_complete=next_offset is None,
            status="success",
        )


class TheMuseConnector:
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
        page = state.get("cursor") or "1"
        url = f"https://www.themuse.com/api/public/jobs?page={page}"
        if api_key:
            url += f"&api_key={api_key}"

        try:
            resp = await client.get(url, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code == 403 or resp.status_code == 401:
            return ConnectorPage(items=[], status="not_configured", error_message="The Muse API key invalid or required")

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        data = resp.json()
        raw_results = data.get("results", []) if isinstance(data, dict) else []
        items: list[ConnectorItem] = []

        for j in raw_results:
            ext_id = str(j.get("id", ""))
            title = j.get("name", "Untitled Role")
            company = j.get("company", {}).get("name", "Unknown Company")
            locs = [loc.get("name", "") for loc in j.get("locations", []) if loc.get("name")]
            loc = ", ".join(locs) if locs else "Remote"
            job_url = j.get("refs", {}).get("landing_page", "")
            desc = clean_html(j.get("contents", "")) or f"{title} at {company}"

            levels = [lvl.get("name", "") for lvl in j.get("levels", []) if lvl.get("name")]

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=loc,
                    url=job_url,
                    description=desc,
                    posted_at=j.get("publication_date"),
                    tags=levels,
                    raw_payload=j,
                )
            )

        page_count = data.get("page_count", 1)
        curr_page = int(page)
        next_page = str(curr_page + 1) if curr_page < page_count else None

        return ConnectorPage(
            items=items,
            next_cursor=next_page,
            content_hash=compute_content_hash(data),
            is_complete=next_page is None,
            status="success",
        )


class AdzunaConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        return []

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        app_id = source.get("app_id") or source.get("config", {}).get("app_id")
        app_key = source.get("app_key") or source.get("config", {}).get("app_key")
        if not app_id or not app_key:
            return ConnectorPage(items=[], status="not_configured", error_message="Adzuna app_id/app_key not configured")

        country = source.get("country_code", "gb").lower()
        page = state.get("cursor") or "1"
        search = query.get("keyword", "developer") if query and query.get("keyword") else "developer"
        url = f"https://api.adzuna.com/v1/api/jobs/{country}/search/{page}?app_id={app_id}&app_key={app_key}&what={search}&results_per_page=50"

        try:
            resp = await client.get(url, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        data = resp.json()
        raw_results = data.get("results", []) if isinstance(data, dict) else []
        items: list[ConnectorItem] = []

        for j in raw_results:
            ext_id = str(j.get("id", ""))
            title = j.get("title", "Untitled Role")
            company = j.get("company", {}).get("display_name", "Unknown Company")
            loc = j.get("location", {}).get("display_name", "Remote")
            job_url = j.get("redirect_url", "")
            desc = clean_html(j.get("description", "")) or f"{title} at {company}"

            salary = None
            if j.get("salary_min") and j.get("salary_max"):
                salary = f"{j.get('salary_min'):,} - {j.get('salary_max'):,}"

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=loc,
                    url=job_url,
                    description=desc,
                    posted_at=j.get("created"),
                    salary=salary,
                    tags=[j.get("category", {}).get("label", "")] if j.get("category") else [],
                    raw_payload=j,
                )
            )

        return ConnectorPage(items=items, content_hash=compute_content_hash(data), status="success")


class JoobleConnector:
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
            return ConnectorPage(items=[], status="not_configured", error_message="Jooble API key not configured")

        url = f"https://jooble.org/api/{api_key}"
        keywords = query.get("keyword", "developer") if query and query.get("keyword") else "developer"
        payload = {"keywords": keywords, "page": int(state.get("cursor") or 1)}

        try:
            resp = await client.post(url, json=payload, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        data = resp.json()
        raw_jobs = data.get("jobs", []) if isinstance(data, dict) else []
        items: list[ConnectorItem] = []

        for j in raw_jobs:
            ext_id = str(j.get("id", ""))
            title = j.get("title", "Untitled Role")
            company = j.get("company", "Unknown Company")
            loc = j.get("location", "Remote")
            job_url = j.get("link", "")
            desc = clean_html(j.get("snippet", "")) or f"{title} at {company}"

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=loc,
                    url=job_url,
                    description=desc,
                    posted_at=j.get("updated"),
                    salary=j.get("salary") or None,
                    raw_payload=j,
                )
            )

        return ConnectorPage(items=items, content_hash=compute_content_hash(data), status="success")


class FindworkConnector:
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
            return ConnectorPage(items=[], status="not_configured", error_message="Findwork.dev API token not configured")

        headers = {"Authorization": f"Token {api_key}"}
        search = query.get("keyword", "python") if query and query.get("keyword") else "python"
        url = f"https://findwork.dev/api/jobs/?search={search}"

        try:
            resp = await client.get(url, headers=headers, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        data = resp.json()
        raw_results = data.get("results", []) if isinstance(data, dict) else []
        items: list[ConnectorItem] = []

        for j in raw_results:
            ext_id = str(j.get("id", ""))
            title = j.get("role", "Untitled Role")
            company = j.get("company_name", "Unknown Company")
            loc = j.get("location", "Remote")
            job_url = j.get("url", "")
            desc = clean_html(j.get("text", "")) or f"{title} at {company}"

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=loc,
                    url=job_url,
                    description=desc,
                    posted_at=j.get("date_posted"),
                    tags=j.get("keywords", []),
                    raw_payload=j,
                )
            )

        return ConnectorPage(items=items, content_hash=compute_content_hash(data), status="success")


class USAJobsConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        return []

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        auth_key = source.get("auth_key") or source.get("config", {}).get("auth_key")
        user_agent = source.get("user_agent") or source.get("config", {}).get("user_agent") or "huntflow@example.com"
        if not auth_key:
            return ConnectorPage(items=[], status="not_configured", error_message="USAJobs Authorization-Key not configured")

        headers = {
            "User-Agent": user_agent,
            "Authorization-Key": auth_key,
            "Host": "data.usajobs.gov",
        }
        keyword = query.get("keyword", "technology") if query and query.get("keyword") else "technology"
        url = f"https://data.usajobs.gov/api/search?Keyword={keyword}&ResultsPerPage=50"

        try:
            resp = await client.get(url, headers=headers, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        data = resp.json()
        search_result = data.get("SearchResult", {})
        raw_items = search_result.get("SearchResultItems", [])
        items: list[ConnectorItem] = []

        for item in raw_items:
            matched = item.get("MatchedObjectDescriptor", {})
            ext_id = str(matched.get("PositionID", item.get("MatchedObjectId", "")))
            title = matched.get("PositionTitle", "Untitled Role")
            company = matched.get("OrganizationName", "US Federal Government")
            loc_list = matched.get("PositionLocation", [])
            loc = loc_list[0].get("LocationName", "United States") if loc_list else "United States"
            job_url = matched.get("PositionURI", "")
            desc = clean_html(matched.get("UserArea", {}).get("Details", {}).get("JobSummary", "")) or f"{title} at {company}"

            remun = matched.get("PositionRemuneration", [{}])
            salary = None
            if remun and remun[0].get("MinimumRange") and remun[0].get("MaximumRange"):
                salary = f"USD {remun[0]['MinimumRange']} - {remun[0]['MaximumRange']} ({remun[0].get('Description', 'Per Year')})"

            items.append(
                ConnectorItem(
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=loc,
                    url=job_url,
                    description=desc,
                    posted_at=matched.get("PublicationStartDate"),
                    salary=salary,
                    tags=[matched.get("DepartmentName", "")] if matched.get("DepartmentName") else [],
                    raw_payload=item,
                )
            )

        return ConnectorPage(items=items, content_hash=compute_content_hash(data), status="success")
