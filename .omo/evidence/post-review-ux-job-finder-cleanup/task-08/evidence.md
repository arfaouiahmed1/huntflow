# Task 08 — Evidence: Crawler SSE Proxy Contract Lock

**Date:** 2026-08-29
**Scope:** `src/app/api/crawl/stream/route.ts` (SSE proxy) + `src/lib/boardUpdate.ts` (reducer) + `src/lib/sse.ts`
**Test:** `src/app/api/crawl/stream/route.test.ts` (NextRequest mock, no dev server)

## Implementation

- Rewrote `route.ts` 229 → 94 lines (bounded <150, ~59% reduction) while locking contract.
- Enforces `runId` query required → `400 {error: "runId query required"}` (was optional/nullable).
- Heartbeat: `": keepalive\n\n"` SSE comment via `setInterval(15_000)` — valid SSE comment line, keeps proxies from buffering.
- Offline fallback: sidecar `!upstream.ok` (503/502/...) → emits `error` + `log` warning, **no** synthetic `board_update` fabricating cards. Previous version fabricated a `board_update` with `offline` id on 503.
- Resilience: `upstream.json()` wrapped in `try/catch` → emits `error`+`log` and continues polling; per-event `try/catch` so single malformed event doesn't crash stream; string `data` fields attempted `JSON.parse` with fallback to `{raw}`; `cursor` only advances on well-formed own-run events; `board_update` forwarded for structured `type:"board"|"run"` or regex `isBoardProgress`, but reducer ignores missing `source_id`.
- Preserved `since` cursor parsing with monotonic advance, terminal `run` detection (`payload.runs`), abort handling, `sseHeaders` (`text/event-stream`, `no-cache`, `X-Accel-Buffering: no`).

**File:** `src/app/api/crawl/stream/route.ts` — 94 lines (5.3K), `dynamic = "force-dynamic"`, `runtime = "nodejs"`.

## Contract

| # | Assertion | Request | Expected Response | Status |
|---|-----------|---------|-------------------|--------|
| 1 | **runId isolation — missing** | `GET /api/crawl/stream` (no `runId`) | `400 JSON {error: /runId/}` | ✅ |
| 2 | **runId isolation — blank** | `GET /api/crawl/stream?runId=   ` | `400` | ✅ |
| 3 | **runId isolation — filtering** | `?runId=run-abc` with events for `run-abc`+`other-run` | Only `run-abc` `log`/`board_update` forwarded; `done.since` = highest own-run id (not sibling) | ✅ |
| 4 | **Heartbeat SSE format** | Any valid `runId` SSE stream | Headers `content-type: text/event-stream`, `cache-control: no-cache`, `x-accel-buffering: no`; frames `event: X\ndata: JSON\n\n`; interval enqueues `": keepalive\n\n"` (SSE comment, `^: keepalive\n\n$`) ; `connected` then `done` | ✅ |
| 5 | **Offline fallback (no fake cards)** | Sidecar `fetch → 503` then success | Stream emits `error` (`/offline|503/i`) + `log` `⚠ Agent offline` ; **zero** `board_update` containing `Agent offline` / `source_id: offline`; only terminal `board_update` allowed | ✅ |
| 6 | **Cursor handling** | `?since=5` with events `id 6 (own)`, `99 (other)`, `8 (own)` | `done.since == 8`, not `99`; malformed shape (missing `id`) skipped without moving cursor; `initialSince` negative/NaN → 0 | ✅ |
| 7 | **Malformed NDJSON / JSON chunk** | First `fetch → Response("not json")` (`.json()` throws), second valid | Stream emits `error` `/malformed/i` + `log` warning, then recovers and forwards next poll's `log` id:1 ; never crashes (status 200, ends with `done`) | ✅ |
| 8 | **Malformed `data` field** | Events with `data: "not-an-object"` / `"{bad json"` | Per-event try/catch: string `data` → `JSON.parse` or `{raw: string}` ; both `log` forwarded, stream ends `done` without throw | ✅ |
| 9 | **board_update missing `board_id`** | `reduceBoardUpdate(prev, {data:{}})` / `{data:{type:"board",status:"success"}}` no `source_id` | Reducer returns `prev` (same ref, `===`) — no throw, no card mutation; valid `source_id: "board-a"` still mutates to `success` | ✅ |

## Verification

### Gates

- `npx tsc --noEmit` → **0 errors** (exit 0)
- `npx vitest run src/app/api/crawl/stream/route.test.ts` → **9/9 pass** (4.03s)
- File bounded: `wc -l route.ts` → **94 lines** (<150; was 229)

### TDD — `src/app/api/crawl/stream/route.test.ts` (9 tests, no dev server, `NextRequest` mock, `vi.stubGlobal("fetch")`)

```
 ✓ 400 when runId missing (isolation guard) 9ms
 ✓ 400 when runId blank 1ms
 ✓ SSE headers + heartbeat format + connected frame 329ms
 ✓ isolates by runId (sibling runs ignored) and cursor advances 309ms
 ✓ offline fallback: sidecar 503 surfaces error without fabricating cards 1220ms
 ✓ malformed JSON chunk does not crash stream 1122ms
 ✓ malformed data field (string instead of object) does not crash 310ms
 ✓ board_update with missing board_id is handled (reducer returns prev) 2ms
 ✓ cursor only advances on own-run events (not on malformed/sibling) 308ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  4.12s
```

Parsed SSE helper: splits on `\n\n`, ignores `: keepalive` comments for event parsing, JSON-parses `data:` line.

### Manual invariants

- `sseFrame("connected", {runId, since})` → `'event: connected\ndata: {"runId":"…","since":N}\n\n'` verified.
- Heartbeat literal `": keepalive\n\n"` matches `/^: keepalive\n\n$/`.
- Offline path emits exactly `error` + `log`, no card fabrication; verified board_update messages none match `/Agent offline/i` and none carry `source_id: "offline"`.
- `reduceBoardUpdate` contract: terminal `run` without `targetId` finalizes all `running|idle` cards; missing `board_id` returns same ref.

## Files

- **Modify** `src/app/api/crawl/stream/route.ts` — locked contract: `runId` 400, heartbeat comment, offline→error (no fake `board_update`), `try/catch` around `up.json()` + per-event, string-data tolerant, cursor monotonic, ~94 lines.
- **Create** `src/app/api/crawl/stream/route.test.ts` — 9 vitest cases covering  9 rows above via `NextRequest` + `vi.stubGlobal("fetch")` mocking `new Response(JSON.stringify({events,runs}))` and `new Response("not json")`; no dev server.
- Evidence: `.omo/evidence/post-review-ux-job-finder-cleanup/task-08/evidence.md`

## Risks / notes

- Route uses `AbortSignal.timeout(4_000)` for sidecar polling; timeout surfaces as `error`+`log` warning, not crash, and polling continues (matches previous 800ms cadence).
- `board_update` forwarding still regex-gated (`isBoardProgress`) for legacy string-only frames; structured `type:"board"|"run"` always forwarded — reducer handles missing identity gracefully (returns `prev`).
- File now 94 lines; could expand to ~130 with blank lines/comments and still satisfy bounded <150; current 94 keeps readability while well under budget.
