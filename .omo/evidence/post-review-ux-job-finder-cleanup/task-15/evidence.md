# Task 15 — Evidence: Extract Job Detail into bounded lazy-loaded responsibilities

**Date:** 2026-08-29
**Scope:** `src/components/JobDetailView.tsx` + `src/components/detail/*` + `src/components/JobDetailDrawer.tsx` + `src/app/(app)/jobs/[id]/page.tsx`

## Implementation

- Shrunk `JobDetailView.tsx` from **1241 → 332 lines** (-73%, -909 lines) well under <900 target via bounded extraction.
- Created 5 bounded `"use client"` detail components:
  - `JobDetailHeader.tsx` — 101 lines (title/company/logo, StatusSelect, matchScore badge, dates)
  - `JobDetailOverview.tsx` — 149 lines (Role brief single source, composes Salary/Skills panels)
  - `JobDetailSalaryPanel.tsx` — 48 lines (Compensation)
  - `JobDetailSkillsPanel.tsx` — 59 lines (Skills gap)
  - `JobDetailAgentRun.tsx` — 3 lines re-export of `src/components/agent/JobDetailAgentRun.tsx` (62 lines) to keep detail boundary tidy
  - `LazyReveal.tsx` — 55 lines (IntersectionObserver, rootMargin 320px, placeholder min-h-[180px])
- Heavy secondary panels via `next/dynamic` + `LazyReveal` + `SectionPlaceholder` (`min-h-[180px]`):
  ```ts
  dynamic(() => import("@/components/match/MatchAnalysis"), { ssr:false, loading: () => <SectionPlaceholder /> })
  dynamic(() => import("@/components/documents/DocumentsPanel"), …)
  dynamic(() => import("@/components/flashcards/FlashcardsPanel"), …)
  dynamic(() => import("@/components/intel/InterviewQuestionsPanel"), …)
  dynamic(() => import("@/components/detail/JobDetailAgentRun"), …)
  ```
  Each heavy panel has `ssr:false` + loading skeleton; `LazyReveal` wraps with IntersectionObserver `rootMargin: 320px`.
- Drawer (`JobDetailDrawer.tsx` 55 lines) and page (`jobs/[id]/page.tsx`) now share single `JobDetailView` orchestration (one information architecture), drawer simply renders `<JobDetailView>` inside motion overlay.

## Verification

- `npx tsc --noEmit` → 0 (after fixing `jobDetailDedup.test.ts` `gs` regex).
- `wc -l` all detail components <150; `JobDetailView` 332 <900.
- `grep` dynamic imports present and `LazyReveal` wraps ≥5 panels.

## Files

- Modify `src/components/JobDetailView.tsx` (1241→332)
- Create `src/components/detail/JobDetailHeader.tsx`, `JobDetailOverview.tsx`, `JobDetailSalaryPanel.tsx`, `JobDetailSkillsPanel.tsx`, `JobDetailAgentRun.tsx`
- Reuse `src/components/detail/LazyReveal.tsx`
