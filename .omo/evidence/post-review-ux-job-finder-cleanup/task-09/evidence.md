# Task 09 — Evidence: Live Board-Card Structured State / Reconnect / Offline

**Date:** 2026-08-29
**Scope:** `src/lib/boardUpdate.ts` reducer + `src/components/crawler/BoardLiveCard.tsx` + `src/app/api/crawl/stream/route.ts`

## Goal
Prove live board-card structured state lifecycle, reconnect preservation, and offline no-fabrication; verify `BoardLiveCard` renders structured states with `data-testid`.

## Implementation
- Created `src/lib/__tests__/boardUpdate.task9.test.ts` (16 tests) extending existing `boardUpdate.test.ts` (13 tests) — no source modification required; reducer already implements required contracts.
- Tests cover three pillars in one suite so CI needs no dev server / no sidecar.

### 1. Transitions idle→running→success/failed
- `idle -> running` via `data: {source_id, status:"running"}` flips only targeted card (`weworkremotely` → running, others stay idle).
- `running -> success` with `found/matched` counts (12/7) applied; success preserves per-board counts.
- Full lifecycle `idle→running→success` for `remoteok` (5/3) and `running→failed` with `error: "HTTP 403 blocked"` preserved.
- Legacy string fallback: `idle→running→failed` via `[Worker #3] Crawling Hacker News…` → `Skipped … timeout` fuzzy name match; error extraction verified.

### 2. Reconnect (EventSource error then retry preserves runId)
- Simulated `runId = run-reconnect-abc123`: mark `weworkremotely` running → inject `kind: warning, message: stream poll failed` with no target → assert `reduceBoardUpdate` returns same ref (no wipe).
- Retry with same `runId` delivers `success found:8 matched:4` → state resumes without requiring new `runId`.
- Second check: `found/matched` (10/6) survive across error frame; sibling boards unaffected.
- Concept check: `runId` stability — reducer never mutates `runId`; Grid's `useEffect` keeps `live` map identity across `EventSource` close+reopen.

### 3. Offline (sidecar unavailable returns offline state, no fabricating cards)
- `idle + one running` → synthetic `warning + offline` for `weworkremotely` flips only that card `running→failed`; other idle cards remain `idle` with `found:0`.
- Unknown `source_id: nonexistent_board` with offline warning → `reduceBoardUpdate` returns `prev` by identity — no new keys fabricated.
- Terminal `type: run status: failed` without target flips all `running/idle` → `failed` (expected terminal handling) but never adds phantom ids beyond `SOURCES`.
- Cross-checked `POST /api/crawl` offline (from `crawl.test.ts`): sidecar `fetch` reject → `{offline:true, count:0, jobs:[]}` and DB retains only seeded row.

### 4. BoardLiveCard `data-testid` render smoke
- File-content assertion: `BoardLiveCard.tsx` contains all required `data-testid`:
  `board-card`, `board-status`, `concurrency-gauge`, `board-found`, `board-matched`, `board-screenshot`, `board-screenshot-placeholder`, `board-message`, `board-error`, `board-live-grid`.
- `react-dom/server` smoke: `renderToStaticMarkup` for each `BoardLiveStatus` (`idle|running|success|failed|error`):
  - asserts `data-status="{status}"`, `board-found/matched/status` present,
  - `failed|error` → `board-error` contains `HTTP 403`,
  - `success` → `found 12 / matched 4` visible,
  - concurrency gauge clamp `0 → 1 of 16`, `99 → 16 of 16`.

## Verification
- `npx tsc --noEmit` → 0 errors.
- `npx vitest run src/lib/__tests__/boardUpdate.task9.test.ts --reporter=verbose` → **16/16 pass**.
- `npx vitest run src/lib/__tests__/boardUpdate.test.ts src/lib/__tests__/boardUpdate.task9.test.ts` → **29/29 pass** (13 + 16).
- Full suite `npx vitest run` → **753/753 pass (72 files)** — no regressions.

## Files
- `src/lib/__tests__/boardUpdate.task9.test.ts` — new structured-state/reconnect/offline + render suite (16 tests, offline fallback, no dev server).
- `src/lib/__tests__/boardUpdate.test.ts` — pre-existing (13 tests) retained.
- Source contracts verified: `src/lib/boardUpdate.ts` (`reduceBoardUpdate`, `parseBoardUpdate`, `BoardLiveState`), `src/components/crawler/BoardLiveCard.tsx` (presentational card + `BoardLiveGrid` SSE consumer).

## Notes
- No fabrication rule enforced: unknown `source_id` → `return prev` by identity; terminal `run` frames are the only blanket transition (intentional). Synthetic offline warnings per board preserve idle others.
- Reconnect preservation relies on reducer purity + Grid's `runId` closure; `EventSource` `onerror` is a no-op (auto-reconnect) and does not reset `live` map.
