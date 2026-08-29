# Task 07 — Evidence: Independent Source-type and Market filters

**Date:** 2026-08-29
**Scope:** `src/app/(app)/jobs/page.tsx` + `src/components/crawler/CrawlerDiscoveryControls.tsx` + `src/lib/sourceTaxonomy.ts`

## Implementation

- Replaced mixed `CATEGORIES` / `Region / feed` control with independent `Source type` and `Market / location` Selects driven by `src/lib/sourceTaxonomy.ts`.
- Retained `Experience` and `Work mode` as independent axes — four dimensions total.
- Extracted filter/control cluster into bounded client component `CrawlerDiscoveryControls.tsx` (247 lines) consumed by `jobs/page.tsx`.
- `jobs/page.tsx` pure responsibility reduced: `28503 → 23293` bytes (-~18%, -75 lines of control JSX, removed `CATEGORIES/EXPERIENCE_OPTIONS/WORK_MODE_OPTIONS` constants and `handleCategoryChange`).
- Crawl request now deterministic: `POST /api/crawl { category: "all", keyword, limit, concurrency, sourceIds: [...selectedSourceIds] }` — category is always `"all"`; visible filters only affect which cards are shown, never silently mutate the crawl.

## Contract

| Control | Source | Storage | Behavior |
|---------|--------|---------|----------|
| Source type | `getSourceTypeOptions()` | `sourceType: general/remote_board/community + all` | Filters `parseSourceCatalog` output via `applySourceFilters`; stable across reloads |
| Market | `getMarketOptions()` | `markets: global/europe/mena/americas/apac` | Multi-market boards match under any declared market; independent of workMode |
| Experience | `getExperienceOptions()` | `experience: entry/mid/senior/all` | Preserved alongside new controls |
| Work mode | `getWorkModeOptions()` | `workMode: remote/hybrid/onsite/all` | Independent axis, not conflated with Market |

Offline fallback: when `parseSourceCatalog({sources})` yields no parsed sources (sidecar 503 / empty), `useFilteredSources` returns raw sources unfiltered so controls still render and `Clear filters` restores `DEFAULT_FILTER_SELECTION`.

## Verification

### Gates
- `npx tsc --noEmit` → 0 errors (after replacing `onValueChange` → `onChange` and removing `CATEGORIES` references).
- `npx vitest run src/lib/__tests__/sourceTaxonomy.test.ts` → 23/23 pass (taxonomy unions, option derivation, applySourceFilters, parseSourceCatalog).
- `npx vitest run src/lib/__tests__/crawlerDiscoveryControls.test.ts` → 4/4 pass (see below).

### TDD — `src/lib/__tests__/crawlerDiscoveryControls.test.ts`
1. **Independent axes** — `sourceType=community` → only `forem`; `market=europe` → `wttj + forem`; combined `general/europe/mid/hybrid` → only `wttj`.
2. **Zero-result is intentional** — `remote_board + europe + senior + onsite` → `[]` without crash.
3. **Selection stability** — hidden boards stay in `selectedIds` when filter hides their card: `visible= [remotive]` under `remote_board` but `selected={forem}` retained; counts show `selected in view` vs `selected total` diverge intentionally.
4. **Retains Experience/WorkMode** — `experience=mid` → `wttj`; `workMode=remote` → `remotive`.

### Manual / visual
- Grid at `375px`: `grid-cols-1` (single readable column) → `sm:grid-cols-2` → `lg:grid-cols-3` for source cards; controls stack to `grid-cols-1` on narrow.
- Header counts: `"{visible.length} visible · {selectedInView} selected in view · {total} selected total"` updates deterministically; `Clear filters` appears only when any dimension diverges from `DEFAULT_FILTER_SELECTION`.
- `data-testid="source-card"` + `data-source-id` + `data-selected` on each board for browser QA.

## Files
- Modify `src/app/(app)/jobs/page.tsx` — imports `applySourceFilters/parseSourceCatalog/DEFAULT_FILTER_SELECTION`, `filterSelection` state, `visibleSources = applySourceFilters(parsed, filterSelection)`, delegates JSX to child.
- Create `src/components/crawler/CrawlerDiscoveryControls.tsx` — `"use client"`, `Select` primitives, `useFilteredSources` helper, zero-result dashed panel with `Show all sources`.
- Create `src/lib/__tests__/crawlerDiscoveryControls.test.ts` — 4 behaviors above.

## Risks / notes
- `scrapling-agent/sources.json` still groups boards by storage category (`remote/general/europe/mena/global/posts`) for sidecar sweep; UI filters are derived from per-board `sourceType/markets` and do not repartition storage. Crawl correctness preserved via `category: "all"` + `source_ids`.
- `BoardLiveGrid` continues to render `visibleSources` — its `selectedIds` highlights correctly even when a selected board is temporarily hidden.
