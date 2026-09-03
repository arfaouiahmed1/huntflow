"""HUNTFLOW Crawler Connectors — Base Domain Models & Async Connector Protocol."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Any, Optional, Protocol, runtime_checkable
import httpx

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


def compute_content_hash(data: Any) -> str:
    """Compute SHA-256 hash of serialized content for no-change detection."""
    serialized = json.dumps(data, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


@dataclass
class DiscoveredSource:
    id: str
    name: str
    channel: str
    connector: str
    url: str
    token: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ConnectorItem:
    external_id: str
    title: str
    company: str
    location: str
    url: str
    description: str
    posted_at: Optional[str] = None
    salary: Optional[str] = None
    tags: list[str] = field(default_factory=list)
    raw_payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class ConnectorPage:
    items: list[ConnectorItem]
    next_cursor: Optional[str] = None
    etag: Optional[str] = None
    last_modified: Optional[str] = None
    content_hash: Optional[str] = None
    is_complete: bool = True
    rate_limit_remaining: Optional[int] = None
    retry_after_s: Optional[int] = None
    status: str = "success"  # "success" | "not_modified" | "not_configured" | "error"
    error_message: Optional[str] = None


@runtime_checkable
class Connector(Protocol):
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        """Discover candidate sources / board tokens from a company name or URL."""
        ...

    async def fetch_page(
        self,
        source: dict[str, Any],
        state: dict[str, Any],
        query: Optional[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> ConnectorPage:
        """Fetch one page of jobs with conditional ETag/304 caching and cursor support."""
        ...
