"""HUNTFLOW Scrapling Sidecar — Community Filter List Driven AdBlocker & Shield.

Replaces hardcoded regexes with standard community filter lists (EasyList, EasyPrivacy,
Peter Lowe's List, uBlock Origin cosmetic rules).

Features:
- Fast domain suffix tree & hash-set matching for O(1) domain lookups
- Whitelist exception rule processing (@@ rules)
- Dynamic cosmetic CSS element hiding injection (## rules)
- Anti-adblock trap defusing (window.canRunAds = true)
- Automated cadence checking via sync_filterlists.py
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

from sync_filterlists import (
    COMPILED_RULES_FILE,
    compile_rule_database,
)

log = logging.getLogger("huntflow-adblock")

# ---------------------------------------------------------------------------
# In-Memory Compiled Rules Cache
# ---------------------------------------------------------------------------

_RULES_CACHE: Optional[dict[str, Any]] = None
_BLOCKED_DOMAINS: set[str] = set()
_WHITELIST_DOMAINS: set[str] = set()
_PATH_PATTERNS: list[re.Pattern[str]] = []
_COSMETIC_CSS: str = ""


def load_rules(force_reload: bool = False) -> dict[str, Any]:
    global _RULES_CACHE, _BLOCKED_DOMAINS, _WHITELIST_DOMAINS, _PATH_PATTERNS, _COSMETIC_CSS

    if _RULES_CACHE is not None and not force_reload:
        return _RULES_CACHE

    if not COMPILED_RULES_FILE.exists() or force_reload:
        rules = compile_rule_database(force_offline=True)
    else:
        try:
            rules = json.loads(COMPILED_RULES_FILE.read_text(encoding="utf-8"))
        except Exception as e:
            log.warning("Could not parse %s: %s (recompiling)", COMPILED_RULES_FILE, e)
            rules = compile_rule_database(force_offline=True)

    _RULES_CACHE = rules
    _BLOCKED_DOMAINS = set(rules.get("blocked_domains", []))
    _WHITELIST_DOMAINS = set(rules.get("whitelist_domains", []))

    # Compile path regexes
    _PATH_PATTERNS = [re.compile(p, re.IGNORECASE) for p in rules.get("path_patterns", [])]

    # Assemble cosmetic hiding CSS
    selectors = rules.get("cosmetic_selectors", [])
    if selectors:
        _COSMETIC_CSS = f"""
{", ".join(selectors)} {{
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  height: 0 !important;
  max-height: 0 !important;
}}
"""
    else:
        _COSMETIC_CSS = ""

    return rules


# Initial load
load_rules()


def is_domain_blocked(domain: str) -> bool:
    """Check whether a domain or any of its parent domain suffixes is in the blocklist."""
    if not domain:
        return False
    d = domain.lower().strip().rstrip(".")

    # Exact or suffix match
    parts = d.split(".")
    for i in range(len(parts) - 1):
        sub = ".".join(parts[i:])
        if sub in _WHITELIST_DOMAINS:
            return False
        if sub in _BLOCKED_DOMAINS:
            return True

    return False


def should_block_url(url: str) -> bool:
    """Returns True if the URL matches standard community ad/tracker/telemetry rules."""
    if not url:
        return False
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower().split(":")[0]

        # 1. Whitelist check
        if host in _WHITELIST_DOMAINS:
            return False

        # 2. Blocked domain check (EasyList / EasyPrivacy / Peter Lowe)
        if is_domain_blocked(host):
            return True

        # 3. Path pattern check (e.g. /pagead.js, /widget/ads., /fbevents.js)
        path = parsed.path
        if any(pat.search(path) or pat.search(url) for pat in _PATH_PATTERNS):
            return True

        return False
    except Exception:
        return False


def setup_adblock_routes(page: Any) -> None:
    """Attach network-level request interceptor to Playwright page to abort ad/tracker calls."""
    try:
        def route_handler(route: Any) -> None:
            req = route.request
            url = req.url

            if should_block_url(url):
                try:
                    route.abort("blockedbyclient")
                except Exception:
                    pass
                return

            try:
                route.continue_()
            except Exception:
                pass

        page.route("**/*", route_handler)
    except Exception as e:
        log.warning("Could not attach adblock route interceptor: %s", e)


def inject_cosmetic_adblock(page: Any) -> None:
    """Inject cosmetic CSS to hide visual ad containers, textads, and consent overlays."""
    try:
        if _COSMETIC_CSS:
            page.add_style_tag(content=_COSMETIC_CSS)
    except Exception as e:
        log.warning("Could not inject cosmetic adblock CSS: %s", e)


def get_ublock_extension_args(extensions_dir: Optional[Path] = None) -> list[str]:
    """Returns Chromium launch arguments for loading uBlock Origin / uBlock Origin Lite if installed."""
    base = extensions_dir or Path(__file__).resolve().parent / "extensions"
    ublock_dir = base / "ublock0.chromium"
    ublock_lite_dir = base / "ublock0.lite.chromium"

    target_dir = None
    if ublock_lite_dir.exists() and (ublock_lite_dir / "manifest.json").exists():
        target_dir = ublock_lite_dir
    elif ublock_dir.exists() and (ublock_dir / "manifest.json").exists():
        target_dir = ublock_dir

    if target_dir:
        ext_path = str(target_dir.resolve())
        return [
            f"--disable-extensions-except={ext_path}",
            f"--load-extension={ext_path}",
        ]
    return []
