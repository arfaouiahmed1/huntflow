"""HUNTFLOW Scrapling Sidecar — Cookie Jar & Session Persistence Engine.

Manages persistent cookies across crawls, seeds standard consent tokens to bypass
intrusive cookie consent walls (OneTrust, CookieBot, Didomi, Cloudflare), and preserves
authenticated session cookies safely.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

log = logging.getLogger("huntflow-cookies")

DEFAULT_COOKIE_JAR_PATH = Path(__file__).resolve().parent / ".agent_runs" / "cookie_jar.json"

# Preset standard consent cookies to prevent blocking modals on common web portals
PRESET_CONSENT_COOKIES = [
    {"name": "CookieConsent", "value": "{stamp:'consent',necessary:true,preferences:true,statistics:true,marketing:true,ver:1,utc:1720000000000}"},
    {"name": "OptanonAlertBoxClosed", "value": "2026-08-01T00:00:00.000Z"},
    {"name": "notice_gdpr_prefs", "value": "0,1,2:"},
    {"name": "eu_consent", "value": "1"},
    {"name": "cookies_accepted", "value": "true"},
]


class CookieJarManager:
    def __init__(self, jar_path: Optional[Path] = None):
        self.jar_path = jar_path or DEFAULT_COOKIE_JAR_PATH
        self.jar_path.parent.mkdir(parents=True, exist_ok=True)
        self._cookies: list[dict[str, Any]] = self._load()

    def _load(self) -> list[dict[str, Any]]:
        if self.jar_path.exists():
            try:
                data = json.loads(self.jar_path.read_text(encoding="utf-8"))
                if isinstance(data, list):
                    return data
            except Exception as e:
                log.warning("Could not read cookie jar %s: %s", self.jar_path, e)
        return []

    def save(self) -> None:
        try:
            self.jar_path.write_text(json.dumps(self._cookies, indent=2), encoding="utf-8")
        except Exception as e:
            log.warning("Could not persist cookie jar: %s", e)

    def get_cookies_for_domain(self, domain: str) -> list[dict[str, Any]]:
        clean_domain = domain.lower().lstrip(".")
        matched = []
        for c in self._cookies:
            cookie_domain = c.get("domain", "").lower().lstrip(".")
            if not cookie_domain or cookie_domain in clean_domain or clean_domain.endswith(cookie_domain):
                matched.append(c)
        return matched

    def add_cookies(self, cookies: list[dict[str, Any]]) -> None:
        """Merge cookies uniquely by domain + name + path."""
        existing_keys = {(c.get("domain", ""), c.get("name", ""), c.get("path", "/")): i for i, c in enumerate(self._cookies)}

        for new_c in cookies:
            key = (new_c.get("domain", ""), new_c.get("name", ""), new_c.get("path", "/"))
            if key in existing_keys:
                self._cookies[existing_keys[key]] = new_c
            else:
                self._cookies.append(new_c)
                existing_keys[key] = len(self._cookies) - 1

        self.save()

    def apply_to_playwright_context(self, context: Any, target_domain: Optional[str] = None) -> None:
        """Apply stored cookies and seed consent cookies to a Playwright context."""
        try:
            cookies_to_add = list(self._cookies)
            if target_domain:
                for consent in PRESET_CONSENT_COOKIES:
                    cookies_to_add.append({
                        "name": consent["name"],
                        "value": consent["value"],
                        "domain": target_domain,
                        "path": "/",
                    })
            if cookies_to_add:
                context.add_cookies(cookies_to_add)
        except Exception as e:
            log.warning("Could not apply cookies to Playwright context: %s", e)

    def extract_from_playwright_context(self, context: Any) -> None:
        """Extract cookies from a finished Playwright session and persist to jar."""
        try:
            cookies = context.cookies()
            if cookies:
                self.add_cookies(cookies)
        except Exception as e:
            log.warning("Could not extract cookies from Playwright context: %s", e)
