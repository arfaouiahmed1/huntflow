"""Source-contract tests for scrapling-agent/sources.json v2 and GET /sources.

Contract under test:
  - sources.json is valid v2 with schemaVersion 2 and unique source IDs
  - every source carries channel ('ats' | 'aggregator' | 'regional' | 'community' | 'directory')
  - every source carries a non-empty regions array over ('global'|'americas'|'europe'|'mena'|'africa'|'apac')
  - authMode in ('none'|'optional_key'|'required_key'|'user_session')
  - crawlPolicy in ('automatic'|'manual_only'|'disabled')
  - valid cadenceMinutes (>0), perDomainRps (>0), termsUrl, and attribution ({name, url})
  - the serialized catalog contains zero case-insensitive matches of forbidden needles
  - GET /sources returns the safe whitelist and never leaks selectors, credentials, or private configs
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from typing import Any, Iterator

import server

SOURCES_PATH = Path(__file__).resolve().parent / "sources.json"

CHANNELS = {"ats", "aggregator", "regional", "community", "directory"}
REGIONS = {"global", "americas", "europe", "mena", "africa", "apac"}
AUTH_MODES = {"none", "optional_key", "required_key", "user_session"}
CRAWL_POLICIES = {"automatic", "manual_only", "disabled"}
CAPABILITIES = {
    "search",
    "location_filter",
    "pagination",
    "structured_salary",
    "structured_remote",
    "rss_feed",
    "rate_limit_headers",
    "etag_caching",
}

# The exact /sources response whitelist — nothing more, nothing less.
EXPECTED_SOURCE_KEYS = {
    "id",
    "name",
    "channel",
    "connector",
    "regions",
    "countryCodes",
    "languages",
    "capabilities",
    "authMode",
    "crawlPolicy",
    "cadenceMinutes",
    "perDomainRps",
    "termsUrl",
    "attribution",
    "enabled",
    "enabledByDefault",
    "health",
    "description",
    # Backward compatibility fields
    "category",
    "type",
    "url",
    "sourceType",
    "markets",
    "experience",
    "workMode",
    "note",
}


def load_catalog() -> dict[str, Any]:
    return json.loads(SOURCES_PATH.read_text(encoding="utf-8"))


def iter_sources(data: dict[str, Any]) -> Iterator[dict[str, Any]]:
    if "sources" in data and isinstance(data["sources"], list):
        for source in data["sources"]:
            if isinstance(source, dict):
                yield source
    else:
        for cat, boards in data.items():
            if cat.startswith("_") or not isinstance(boards, list):
                continue
            for board in boards:
                if isinstance(board, dict):
                    b_copy = dict(board)
                    b_copy.setdefault("channel", cat)
                    b_copy.setdefault("regions", b_copy.get("markets", ["global"]))
                    yield b_copy


def validate_catalog(data: dict[str, Any]) -> list[str]:
    """Return one human-readable error per violated contract clause."""
    errors: list[str] = []
    if data.get("schemaVersion") != 2:
        errors.append(f"expected schemaVersion 2, got {data.get('schemaVersion')!r}")

    seen: set[str] = set()
    for s in iter_sources(data):
        sid = s.get("id", "<missing id>")
        if not isinstance(s.get("id"), str) or not s["id"].strip():
            errors.append(f"source '{sid}' is missing a non-empty string 'id'")
        if not isinstance(s.get("name"), str) or not s["name"].strip():
            errors.append(f"source '{sid}' has an invalid 'name'")
        channel = s.get("channel")
        if channel not in CHANNELS:
            errors.append(f"source '{sid}' has invalid 'channel': {channel!r}")
        if not isinstance(s.get("connector"), str) or not s["connector"].strip():
            errors.append(f"source '{sid}' has missing or invalid 'connector'")
        regions = s.get("regions") or s.get("markets")
        if not isinstance(regions, list) or not regions:
            errors.append(f"source '{sid}' has an empty or missing 'regions' array")
        else:
            bad = [r for r in regions if r not in REGIONS]
            if bad:
                errors.append(f"source '{sid}' has invalid region tags: {bad}")
            if len(set(regions)) != len(regions):
                errors.append(f"source '{sid}' has duplicate region tags: {regions}")
        auth_mode = s.get("authMode")
        if auth_mode not in AUTH_MODES:
            errors.append(f"source '{sid}' has invalid 'authMode': {auth_mode!r}")
        crawl_policy = s.get("crawlPolicy")
        if crawl_policy not in CRAWL_POLICIES:
            errors.append(f"source '{sid}' has invalid 'crawlPolicy': {crawl_policy!r}")
        cadence = s.get("cadenceMinutes")
        if not isinstance(cadence, (int, float)) or cadence <= 0:
            errors.append(f"source '{sid}' has invalid 'cadenceMinutes': {cadence!r}")
        rps = s.get("perDomainRps")
        if not isinstance(rps, (int, float)) or rps <= 0:
            errors.append(f"source '{sid}' has invalid 'perDomainRps': {rps!r}")
        terms_url = s.get("termsUrl")
        if not isinstance(terms_url, str) or not terms_url.strip():
            errors.append(f"source '{sid}' has missing or empty 'termsUrl'")
        attribution = s.get("attribution")
        if not isinstance(attribution, dict) or not attribution.get("name") or not attribution.get("url"):
            errors.append(f"source '{sid}' has missing or invalid 'attribution' object")
        if sid in seen:
            errors.append(f"duplicate source id '{sid}'")
        seen.add(sid)
    return errors


class CatalogContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.data = load_catalog()

    def test_sources_present_and_unique(self) -> None:
        ids = [s["id"] for s in iter_sources(self.data)]
        self.assertGreaterEqual(len(ids), 20, f"expected at least 20 sources, found {len(ids)}")
        duplicates = sorted({i for i in ids if ids.count(i) > 1})
        self.assertEqual(duplicates, [], f"duplicate source IDs: {duplicates}")

    def test_every_source_has_valid_channel_regions_and_contracts(self) -> None:
        errors = validate_catalog(self.data)
        self.assertEqual(errors, [], "\n".join(errors))

    def test_serialized_catalog_has_zero_forbidden_brand_matches(self) -> None:
        forbidden_brand = "fm" + "hy"
        serialized = json.dumps(self.data).lower()
        self.assertNotIn(forbidden_brand, serialized)

    def test_sources_endpoint_returns_whitelisted_fields_only(self) -> None:
        payload = server.crawl_sources()
        sources = payload["sources"]
        self.assertGreaterEqual(len(sources), 20)
        by_id = {s["id"]: s for s in sources}
        for s in iter_sources(self.data):
            entry = by_id[s["id"]]
            self.assertEqual(
                set(entry),
                EXPECTED_SOURCE_KEYS,
                f"source '{s['id']}' key mismatch: {set(entry) ^ EXPECTED_SOURCE_KEYS}",
            )
            self.assertEqual(entry["channel"], s.get("channel"))
            self.assertEqual(entry["regions"], s.get("regions"))
            self.assertEqual(entry["authMode"], s.get("authMode"))
            self.assertEqual(entry["crawlPolicy"], s.get("crawlPolicy"))
            # Ensure selectors or private configs never leak
            self.assertNotIn("selectors", entry)
            self.assertNotIn("config", entry)


class MalformedCatalogRejectionTests(unittest.TestCase):
    """Copied malformed catalogs must be rejected with the source and field named."""

    def setUp(self) -> None:
        self.data = load_catalog()

    def validate_copy(self, mutate: Any) -> list[str]:
        data = load_catalog()
        mutate(data)
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as handle:
            json.dump(data, handle)
            copy_path = Path(handle.name)
        try:
            copied = json.loads(copy_path.read_text(encoding="utf-8"))
        finally:
            copy_path.unlink(missing_ok=True)
        return validate_catalog(copied)

    def test_empty_regions_is_rejected_and_names_the_source(self) -> None:
        def empty_first_regions(data: dict[str, Any]) -> None:
            data["sources"][0]["regions"] = []

        errors = self.validate_copy(empty_first_regions)
        sid = self.data["sources"][0]["id"]
        self.assertTrue(
            any(sid in e and "regions" in e for e in errors),
            f"expected a named rejection for {sid} regions, got: {errors}",
        )

    def test_duplicate_id_is_rejected_and_names_the_source(self) -> None:
        def duplicate_id(data: dict[str, Any]) -> None:
            data["sources"][1]["id"] = data["sources"][0]["id"]

        errors = self.validate_copy(duplicate_id)
        sid = self.data["sources"][0]["id"]
        self.assertTrue(
            any(f"duplicate source id '{sid}'" in e for e in errors),
            f"expected a named duplicate-id rejection, got: {errors}",
        )

    def test_unknown_region_tag_is_rejected_and_names_the_source(self) -> None:
        def add_bogus_region(data: dict[str, Any]) -> None:
            data["sources"][0]["regions"] = ["global", "mars"]

        errors = self.validate_copy(add_bogus_region)
        sid = self.data["sources"][0]["id"]
        self.assertTrue(
            any(sid in e and "'mars'" in e for e in errors),
            f"expected a named rejection for {sid} region 'mars', got: {errors}",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
