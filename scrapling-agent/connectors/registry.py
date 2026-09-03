"""HUNTFLOW Crawler Connectors — Registry and Dispatcher."""

from __future__ import annotations

from typing import Optional
from connectors.base import Connector
from connectors.ats import (
    GreenhouseConnector,
    LeverConnector,
    AshbyConnector,
    SmartRecruitersConnector,
    PersonioConnector,
    RecruiteeConnector,
    WorkableConnector,
    TeamtailorConnector,
    WorkdayConnector,
    BambooHRConnector,
)
from connectors.aggregators import (
    ArbeitnowConnector,
    JobicyConnector,
    RemotiveConnector,
    HimalayasConnector,
    ReliefWebConnector,
    TheMuseConnector,
    AdzunaConnector,
    JoobleConnector,
    FindworkConnector,
    USAJobsConnector,
)
from connectors.html import (
    StaticHtmlConnector,
    StealthHtmlConnector,
    PostsHtmlConnector,
)
from connectors.directory import (
    CareerPanelsDirectoryConnector,
    JobBoardSearchDirectoryConnector,
)

_CONNECTORS: dict[str, Connector] = {
    # ATS
    "greenhouse": GreenhouseConnector(),
    "lever": LeverConnector(),
    "ashby": AshbyConnector(),
    "smartrecruiters": SmartRecruitersConnector(),
    "personio": PersonioConnector(),
    "recruitee": RecruiteeConnector(),
    "workable": WorkableConnector(),
    "teamtailor": TeamtailorConnector(),
    "workday": WorkdayConnector(),
    "bamboohr": BambooHRConnector(),
    # Aggregators
    "arbeitnow": ArbeitnowConnector(),
    "jobicy": JobicyConnector(),
    "remotive": RemotiveConnector(),
    "himalayas": HimalayasConnector(),
    "reliefweb": ReliefWebConnector(),
    "themuse": TheMuseConnector(),
    "adzuna": AdzunaConnector(),
    "jooble": JoobleConnector(),
    "findwork": FindworkConnector(),
    "usajobs": USAJobsConnector(),
    # HTML / Regional
    "html_static": StaticHtmlConnector(),
    "html_stealth": StealthHtmlConnector(),
    "html_posts": PostsHtmlConnector(),
    # Directory
    "directory_careerpanels": CareerPanelsDirectoryConnector(),
    "directory_jobboardsearch": JobBoardSearchDirectoryConnector(),
}


def get_connector(connector_id: str) -> Optional[Connector]:
    """Retrieve connector instance by id, falling back to static HTML if unknown."""
    if connector_id in _CONNECTORS:
        return _CONNECTORS[connector_id]
    if "greenhouse" in connector_id:
        return _CONNECTORS["greenhouse"]
    if "lever" in connector_id:
        return _CONNECTORS["lever"]
    if "ashby" in connector_id:
        return _CONNECTORS["ashby"]
    return _CONNECTORS.get("html_static")


def list_connectors() -> list[str]:
    """List all registered connector identifiers."""
    return sorted(_CONNECTORS.keys())
