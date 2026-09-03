"""HUNTFLOW Crawler Connectors — Reviewed Static HTML, Stealth & Forum Posts Feeds."""

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

log = logging.getLogger("huntflow-connectors-html")

_TAG_RE = re.compile(r"<[^>]+>")
_LOCATION_HINTS = (
    "remote", "onsite", "hybrid", "worldwide", "anywhere", "global",
    "us", "usa", "united states", "europe", "eu", "uk", "united kingdom",
    "london", "berlin", "amsterdam", "paris", "new york", "san francisco",
    "sf", "mena", "tunisia", "qatar", "dubai", "toronto", "austin",
    "seattle", "boston", "singapore", "tokyo", "canada", "germany",
)


def _looks_literal(value: str) -> bool:
    v = value.strip()
    if not v:
        return True
    if any(ch in v for ch in "[].#:>"):
        return False
    return True


class StaticHtmlConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        return []

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        policy = source.get("crawlPolicy", "disabled")
        if policy == "disabled":
            return ConnectorPage(
                items=[],
                status="disabled",
                error_message=f"Source '{source.get('id')}' is disabled pending live canary verification.",
            )

        url = source.get("url") or source.get("attribution", {}).get("url", "")
        if not url:
            return ConnectorPage(items=[], status="error", error_message="Missing URL")

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }

        try:
            resp = await client.get(url, headers=headers, timeout=12.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        items: list[ConnectorItem] = []
        # Return success with parsed content_hash
        return ConnectorPage(
            items=items,
            content_hash=compute_content_hash(resp.text[:5000]),
            is_complete=True,
            status="success",
        )


class StealthHtmlConnector:
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
            error_message="Stealth dynamic fetcher is operator-initiated.",
        )


class PostsHtmlConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        return []

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        url = "https://news.ycombinator.com/submitted?id=whoishiring"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        try:
            resp = await client.get(url, headers=headers, timeout=10.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {resp.status_code}")

        # Find latest "Ask HN: Who is hiring?" thread
        thread_match = re.search(r'href="(item\?id=\d+)">Ask HN: Who is hiring\?', resp.text)
        if not thread_match:
            return ConnectorPage(items=[], content_hash=compute_content_hash(resp.text[:1000]), status="success")

        thread_url = f"https://news.ycombinator.com/{thread_match.group(1)}"
        try:
            thread_resp = await client.get(thread_url, headers=headers, timeout=12.0)
        except Exception as e:
            return ConnectorPage(items=[], status="error", error_message=str(e))

        if thread_resp.status_code != 200:
            return ConnectorPage(items=[], status="error", error_message=f"HTTP {thread_resp.status_code}")

        # Extract comments
        comments = re.findall(r'<tr class="athing comtr" id="(\d+)".*?<div class="comment">.*?<span class="commtext[^"]*">(.*?)</span>', thread_resp.text, re.DOTALL)
        items: list[ConnectorItem] = []

        for comment_id, comment_html in comments[:50]:
            clean_text = clean_html(comment_html)
            first_line = clean_text.split("\n")[0].strip()
            if "|" not in first_line and " - " not in first_line:
                continue

            parts = [p.strip() for p in re.split(r"\s*[|•]\s*", first_line) if p.strip()]
            if len(parts) < 2:
                continue

            company = parts[0]
            title = parts[1] if len(parts) > 1 else "Software Engineer"
            loc = parts[2] if len(parts) > 2 else "Remote"

            job_url = f"https://news.ycombinator.com/item?id={comment_id}"

            items.append(
                ConnectorItem(
                    external_id=comment_id,
                    title=title,
                    company=company,
                    location=loc,
                    url=job_url,
                    description=clean_text,
                    tags=["Hacker News", "Community"],
                    raw_payload={"comment_id": comment_id, "text": clean_text},
                )
            )

        return ConnectorPage(
            items=items,
            content_hash=compute_content_hash(thread_resp.text[:5000]),
            is_complete=True,
            status="success",
        )
