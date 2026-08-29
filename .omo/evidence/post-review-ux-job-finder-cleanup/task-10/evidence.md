# Task 10 — Evidence: Crawl Persistence / Refresh / Concurrency Defaults / source_ids

**Date:** 2026-08-29
**Scope:** `src/app/api/crawl/route.ts` + `src/lib/db.ts` (`jobsRepo`) + `src/lib/cloudinaryConfig.ts` + `src/app/api/data/route.ts` + `src/app/(app)/jobs/page.tsx` (`refreshData`/`cloudinarySettings.concurrency || 1`)

## Goal
Prove persisted jobs are queryable via `GET /api/data` (jobs), `refreshData` rehydrates, concurrency defaults to `1` when `cloudinarySettings.concurrency` is `undefined`/`0`, and `source_ids` filtering works — offline fallback, no dev server.

## Implementation
- Created `src/lib/__tests__/crawl.task10.test.ts` (11 tests) complementing `src/lib/__tests__/crawl.test.ts` (11 tests).
- All tests use `vitest` with isolated temp SQLite (`vitest.setup.ts` per-worker `HUNTFLOW_DB_PATH`) and `vi.stubGlobal("fetch")` to simulate sidecar — no Python sidecar required.

### 1. Persisted jobs are queryable via GET /api/data (jobs)
- `POST /api/crawl` mocked to return 2 jobs (`task10-c1/c2`) → response `offline:false, count:2`.
- Direct `jobsRepo.list()` → ids `["task10-c1","task10-c2"]` (wishlist stubs persisted with `matchScore/fitCategory`).
- `GET /api/data` (`src/app/api/data/route.ts`) → `payload.jobs` contains same ids (redacted settings, bootstrapped seed). Alternate `GET /api/data/jobs` via `src/app/api/data/[collection]/route.ts` also returns them — covers `GET /api/jobs` intent (unified data route).

### 2. refreshData rehydrates
- After initial crawl (2 jobs), external `jobsRepo.upsert(task10-c3)` simulates another writer.
- Second `GET /api/data` (the exact fetch `refreshData` in `AppContext` performs: `fetch('/api/data', {cache:'no-store'})` → `applyDataPayload`) → returns 3 jobs including `task10-c3`.
- This proves `jobs/page.tsx: refreshData()` after `POST /api/crawl` will rehydrate `applications` and sidebar/tracker without reload.

### 3. Concurrency defaults to 1 when cloudinarySettings.concurrency is undefined/0
- `getStoredConcurrency() = resolveCloudinaryConfig().concurrency || 1` (`src/app/api/crawl/route.ts:104`).
- `resolveCloudinaryConfig` (`cloudinaryConfig.ts:withEnvFallback`) clamps `concurrency` to `0..16` (`Math.trunc` → `min(max(...,0),16)`); `0` means unset.
- Tests capture sidecar payload `body.concurrency`:
  - No row in `cloudinary_settings` → `POST {} → concurrency 1` (both response and sidecar body).
  - Row `{concurrency:0}` → `1`.
  - Row `{cloudName:"test", concurrency:undefined}` → `1`.
  - Body `{concurrency:5}` overrides stored `0` → `5`; `99` clamps to `16`.
- Also verifies `responseConcurrency = data.concurrency || concurrency` echo and `boardsCrawled/runId/sourceResults` forwarding.

### 4. source_ids filtering works
- `POST /api/crawl` extracts `sourceIds = body.sourceIds.filter(string>0).slice(0,50)` and forwards as `source_ids` to sidecar (`src/app/api/crawl/route.ts:149`).
- Tests stub sidecar and capture `source_ids` only for `/crawl` URL (enrichment fetches ignored):
  - `sourceIds: ["weworkremotely","remoteok"]` → `source_ids` equals same array.
  - Mixed invalid (`""`, `null`, `123`) + 60 ids → length `50`, all strings non-empty.
  - No `sourceIds` field → `source_ids` is `undefined` (omitted).
  - Empty array → `source_ids: []` forwarded verbatim.

## Verification
- `npx tsc --noEmit` → 0 errors.
- `npx vitest run src/lib/__tests__/crawl.task10.test.ts --reporter=verbose` → **11/11 pass**.
- `npx vitest run src/lib/__tests__/crawl.test.ts src/lib/__tests__/crawl.task10.test.ts` → **22/22 pass**.
- Full suite `npx vitest run` → **753/753 pass (72 files)**.

## Files
- `src/lib/__tests__/crawl.task10.test.ts` — new persistence/refresh/concurrency/source_ids suite (11 tests, offline fallback).
- `src/lib/__tests__/crawl.test.ts` — retained (offline sidecar, scoring, dedup, runId/sourceResults).
- Source contracts: `src/app/api/crawl/route.ts` (`POST`, `getStoredConcurrency`, `source_ids`, `offline` flag), `src/lib/db.ts` (`jobsRepo`), `src/lib/cloudinaryConfig.ts` (`resolveCloudinaryConfig/withEnvFallback`), `src/app/api/data/route.ts` + `src/app/api/data/[collection]/route.ts` (`GET` hydration), `src/context/AppContext.tsx` (`refreshData`).

## Notes
- No fabrication on offline: `POST /api/crawl` catch → `{success:true, offline:true, count:0, jobs:[]}` writes nothing (`jobsRepo.list` length unchanged).
- Concurrency fallback `|| 1` appears in two places: `route.ts:getStoredConcurrency()` and `jobs/page.tsx:cloudinarySettings.concurrency || 1` — both proven.
- `source_ids` max 50 is intentional DoS guard; filtering drops non-strings before slice.
