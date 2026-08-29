"""Source-contract tests for scrapling-agent/sources.json and GET /sources.

Contract under test:
  - exactly 30 boards with unique ids
  - every board carries a valid sourceType ('general' | 'remote_board' | 'community')
  - every board carries a non-empty markets array over ('global'|'europe'|'mena'|'americas'|'apac')
  - experience/workMode stay inside their documented enums
  - the serialized catalog contains zero case-insensitive matches of the
    assembled forbidden-brand needle (see the brand-absence test below)
  - GET /sources returns an explicit whitelist that includes sourceType/markets
    and never leaks undeclared board keys

Run from scrapling-agent/:  uv run python test_sources_contract.py
"""

import json
import tempfile
import unittest
from pathlib import Path
from typing import Any, Iterator

import server

SOURCES_PATH = Path(__file__).resolve().parent / "sources.json"

SOURCE_TYPES = {"general", "remote_board", "community"}
MARKETS = {"global", "europe", "mena", "americas", "apac"}
EXPERIENCES = {"entry", "mid", "senior", "all"}
WORK_MODES = {"remote", "hybrid", "onsite", "all"}
BOARD_TYPES = {"static", "stealth", "posts"}

# The exact /sources response whitelist — nothing more, nothing less.
EXPECTED_SOURCE_KEYS = {
    "id",
    "name",
    "category",
    "type",
    "url",
    "sourceType",
    "markets",
    "experience",
    "workMode",
    "enabledByDefault",
    "note",
}


def load_catalog() -> dict[str, Any]:
    return json.loads(SOURCES_PATH.read_text(encoding="utf-8"))


def iter_boards(data: dict[str, Any]) -> Iterator[tuple[str, dict[str, Any]]]:
    for cat, boards in data.items():
        if cat.startswith("_") or not isinstance(boards, list):
            continue
        for board in boards:
            yield cat, board


def validate_catalog(data: dict[str, Any]) -> list[str]:
    """Return one human-readable error per violated contract clause."""
    errors: list[str] = []
    seen: dict[str, str] = {}
    for cat, board in iter_boards(data):
        bid = board.get("id", "<missing id>")
        if not isinstance(board.get("id"), str) or not board["id"].strip():
            errors.append(f"[{cat}] board is missing a non-empty string 'id'")
        if not isinstance(board.get("name"), str) or not board["name"].strip():
            errors.append(f"board '{bid}' has an invalid 'name'")
        url = board.get("url")
        if not isinstance(url, str) or not url.startswith("https://"):
            errors.append(f"board '{bid}' has an invalid 'url' (must be https)")
        if board.get("type") not in BOARD_TYPES:
            errors.append(f"board '{bid}' has invalid 'type': {board.get('type')!r}")
        source_type = board.get("sourceType")
        if source_type not in SOURCE_TYPES:
            errors.append(
                f"board '{bid}' has invalid 'sourceType': {source_type!r} "
                f"(expected one of {sorted(SOURCE_TYPES)})"
            )
        markets = board.get("markets")
        if not isinstance(markets, list) or not markets:
            errors.append(
                f"board '{bid}' has an empty or missing 'markets' array (non-empty required)"
            )
        else:
            bad = [m for m in markets if m not in MARKETS]
            if bad:
                errors.append(f"board '{bid}' has invalid market tags: {bad}")
            if len(set(markets)) != len(markets):
                errors.append(f"board '{bid}' has duplicate market tags: {markets}")
        if board.get("experience", "all") not in EXPERIENCES:
            errors.append(f"board '{bid}' has invalid 'experience': {board.get('experience')!r}")
        if board.get("workMode", "all") not in WORK_MODES:
            errors.append(f"board '{bid}' has invalid 'workMode': {board.get('workMode')!r}")
        selectors = board.get("selectors")
        if (
            not isinstance(selectors, dict)
            or not isinstance(selectors.get("item"), str)
            or not selectors["item"].strip()
        ):
            errors.append(f"board '{bid}' is missing selectors.item")
        if bid in seen:
            errors.append(f"duplicate board id '{bid}' (categories '{seen[bid]}' and '{cat}')")
        seen[bid] = cat
    return errors


class CatalogContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.data = load_catalog()

    def test_exactly_30_unique_board_ids(self) -> None:
        ids = [board["id"] for _, board in iter_boards(self.data)]
        self.assertEqual(len(ids), 30, f"expected 30 boards, found {len(ids)}")
        duplicates = sorted({i for i in ids if ids.count(i) > 1})
        self.assertEqual(duplicates, [], f"duplicate board IDs: {duplicates}")

    def test_every_board_has_valid_source_type_markets_and_filters(self) -> None:
        errors = validate_catalog(self.data)
        self.assertEqual(errors, [], "\n".join(errors))

    def test_serialized_catalog_has_zero_forbidden_brand_matches(self) -> None:
        # Needle assembled at runtime so this source file stays free of the literal.
        forbidden_brand = "fm" + "hy"
        serialized = json.dumps(self.data).lower()
        self.assertNotIn(forbidden_brand, serialized)

    def test_sources_endpoint_returns_whitelisted_fields_only(self) -> None:
        payload = server.crawl_sources()
        sources = payload["sources"]
        self.assertEqual(payload["count"], 30)
        self.assertEqual(len(sources), 30)
        by_id = {s["id"]: s for s in sources}
        for cat, board in iter_boards(self.data):
            entry = by_id[board["id"]]
            self.assertEqual(
                set(entry),
                EXPECTED_SOURCE_KEYS,
                f"board '{board['id']}' key mismatch: {set(entry) ^ EXPECTED_SOURCE_KEYS}",
            )
            self.assertEqual(entry["sourceType"], board["sourceType"])
            self.assertEqual(entry["markets"], board["markets"])
            self.assertEqual(entry["experience"], board.get("experience", "all"))
            self.assertEqual(entry["workMode"], board.get("workMode", "all"))
            self.assertEqual(entry["category"], cat)


class MalformedCatalogRejectionTests(unittest.TestCase):
    """Copied malformed catalogs must be rejected with the board and field named."""

    def validate_copy(self, mutate: Any) -> list[str]:
        data = load_catalog()
        mutate(data)
        with tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8"
        ) as handle:
            json.dump(data, handle)
            copy_path = Path(handle.name)
        try:
            copied = json.loads(copy_path.read_text(encoding="utf-8"))
        finally:
            copy_path.unlink(missing_ok=True)
        return validate_catalog(copied)

    def test_empty_markets_is_rejected_and_names_the_board(self) -> None:
        def empty_first_markets(data: dict[str, Any]) -> None:
            data["remote"][0]["markets"] = []

        errors = self.validate_copy(empty_first_markets)
        self.assertTrue(
            any("remoteok" in e and "markets" in e for e in errors),
            f"expected a named rejection for remoteok markets, got: {errors}",
        )

    def test_duplicate_id_is_rejected_and_names_the_board(self) -> None:
        def clone_remoteok_id(data: dict[str, Any]) -> None:
            data["general"][0]["id"] = data["remote"][0]["id"]

        errors = self.validate_copy(clone_remoteok_id)
        self.assertTrue(
            any("duplicate board id 'remoteok'" in e for e in errors),
            f"expected a named duplicate-id rejection, got: {errors}",
        )

    def test_unknown_market_tag_is_rejected_and_names_the_board(self) -> None:
        def add_bogus_market(data: dict[str, Any]) -> None:
            data["general"][0]["markets"] = ["global", "mars"]

        errors = self.validate_copy(add_bogus_market)
        self.assertTrue(
            any("remotive" in e and "'mars'" in e for e in errors),
            f"expected a named rejection for remotive market 'mars', got: {errors}",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
