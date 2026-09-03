"""HUNTFLOW Crawler Connectors — Public ATS & Job Board Directories for Discovery Review."""

from __future__ import annotations

import logging
from typing import Any, Optional
import httpx

from connectors.base import (
    ConnectorPage,
    DiscoveredSource,
)

log = logging.getLogger("huntflow-connectors-directory")


class CareerPanelsDirectoryConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        """Discover candidate company boards for operator review (no auto-enabling)."""
        slug = target.lower().strip().replace(" ", "-")
        return [
            DiscoveredSource(
                id=f"dir_careerpanels_{slug}",
                name=f"{target.title()} (Candidate Board)",
                channel="ats",
                connector="greenhouse",
                url=f"https://careerpanels.io/company/{slug}",
                token=slug,
                metadata={"origin": "careerpanels_directory", "verified": False},
            )
        ]

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
            error_message="Directory connectors discover candidate boards only; they do not scrape third-party directories directly.",
        )


class JobBoardSearchDirectoryConnector:
    async def discover(self, target: str, client: httpx.AsyncClient) -> list[DiscoveredSource]:
        """Discover candidate niche/regional boards for operator review."""
        slug = target.lower().strip().replace(" ", "-")
        return [
            DiscoveredSource(
                id=f"dir_jbs_{slug}",
                name=f"{target.title()} Job Board",
                channel="regional",
                connector="html_static",
                url=f"https://jobboardsearch.com/board/{slug}",
                token=slug,
                metadata={"origin": "jobboardsearch_directory", "verified": False},
            )
        ]

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
            error_message="Directory connectors discover candidate boards only; they do not scrape third-party directories directly.",
        )
