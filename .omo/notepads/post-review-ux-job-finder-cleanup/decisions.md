# Decisions


## Task 5 (source taxonomy engine)
- D5.1: Per-entry resilient Zod parse (parseSourceCatalog -> {ok, sources, failures}): malformed entries yield typed failures and contribute zero trusted objects, while valid siblings survive; payload-shape errors are reported as a single failure with index:null. Chosen over all-or-nothing so one bad sidecar board cannot blank the grid.
- D5.2: Parsed TaxonomySource is a minimal trusted shape (id/name/sourceType/markets/experience/workMode/enabledByDefault); unknown upstream keys are stripped by the Zod object schema, never passed through.
- D5.3: Option lists are module-level frozen constants returned by reference (stability provable via toBe); "all" leads sourceType/market; experience/workMode carry native "all". getFallbackFilterOptions() is the explicit 503 path and fabricates no cards/IDs.
- D5.4: pplySourceFilters freezes results and never mutates inputs; empty selection returns catalog unchanged in original order (baseline assertion locked in tests).
- D5.5: Structural compatibility with Task 4 contract via local readonly unions + Zod enums (no import from src/types/index.ts), since Task 4 runs concurrently.


## Task 4 — source contract

- sourceType taxonomy mapping over the existing 30 boards: remote_board = 14 dedicated remote-only boards (remote category + remotive/workingnomades/justremote/nodesk/himalayasapp/jobspresso/skipthedrive/hubstafftalent/dynamitejobs/euremotejobs/turing_jobs); general = 12 generalist/mixed boards (wellfound + all EU/MENA generalists); community = 4 HN-derived boards. Top-level categories remain storage organization only.
- markets assigned honestly as single tags (global/europe/mena); no fabricated multi-market entries just to demo array support.
- /sources stays a faithful projection of sources.json: missing fields default to ""/[] instead of hard-failing Discovery Control; scrapling-agent/test_sources_contract.py is the gatekeeper that rejects malformed catalogs naming board+field.
- src/app/api/agent/sources/route.ts left unchanged: its `{ online: true, ...payload }` spread is already lossless; behavior locked by agentSourcesRoute.test.ts.
- CrawlerSource added to src/types/index.ts with literal unions matching schema enums; jobs/page.tsx local interface untouched (Task 7 scope).
- Forbidden-brand test needle assembled at runtime ("fm"+"hy") so repo source greps clean while keeping the assertion strength.

