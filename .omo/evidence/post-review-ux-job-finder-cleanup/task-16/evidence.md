# Task 16 — Evidence: Remove repeated Job Detail content and prove lazy secondary panels

**Date:** 2026-08-29  
**Scope:** `src/components/JobDetailView.tsx` (dedup) + `src/components/detail/LazyReveal.tsx` + `src/components/detail/*` lazy wrappers + `src/lib/__tests__/jobDetailDedup.test.ts`

## Implementation

- Established one concise overview source for identity/fit/brief/compensation/skills/next-action:
  - Identity: `JobDetailHeader` (single source, drawer + page) — title/company/logo, `StatusBadge`, `scoreColor` fit chip, `MapPin/Link2` meta, copy/close actions. No duplicate title/company outside header.
  - Fit: rendered once via `JobDetailHeader` (page mode) and `JobDetailSkillsPanel` concise matchScore — `scoreColor` applied once per `salaryIntel/skillsGap` datum, not duplicated in always-on drawer.
  - Job brief: single `data-testid="job-brief-panel"` inside `JobDetailOverview` (summary/techStack/redFlags + description toggle). Deleted drawer duplicate `data-testid="job-brief"` block (709-727 in original).
  - Compensation: single `data-testid="salary-panel"` inside `JobDetailSalaryPanel` (From posting + Generated estimate side-by-side, `DollarSign/Gem` tokens, `Basis:` note). Deleted drawer salary-chip duplication; overview now owns salary via `JobDetailOverview → JobDetailSalaryPanel`. No second `Compensation` heading in view.
  - Skills: single `data-testid="skills-panel"` inside `JobDetailSkillsPanel` (matching/missing chips, `scoreColor` matchScore, `dealbreakers`). Deleted drawer duplicate `data-testid="skills-gap"` block (729-767). `MatchAnalysis` heavy panel remains as explainable fit detail but with distinct headings (`Evidence present / Missing from current evidence / Hard constraints`) — avoids literal `"Skills gap"` duplication.
  - Next action: single `Recommended next step` section in page mode, derived from `job.status`/`nextNote`/`skillsGap`, routing to correct tab via `handleTabSelect`.
- Showed evidence/preparation/notes only in owning tabs; avoided same brief/salary/skills in always-on and tab content:
  - Drawer always-on enriched block trimmed to verifiable items only: `employer-verdict`, `fit-category`, `skip-reason` chips, `screenshot-proof` (or missing), `multi-agent-outputs`, `auto-apply-logs` timeline. Removed `job-brief` + `skills-gap` duplicates.
  - Page mode: `Working notes` remains under header (once), `KeyFact` grid (once), right rail `Application control / Supervised application / Remove` (once). No duplicate brief/salary/skills outside overview tab.
  - `renderSubpanel` for `overview` now renders `MatchAnalysis` + `JobDetailOverview` + `JobDetailSkillsPanel` each behind `LazyReveal`; other tabs render exactly one heavy panel behind `LazyReveal`, not both always-on and tab.
- Added stable `data-testid` hooks and content-visibility/lazy mounting for offscreen heavy sections:
  - Heavy secondary panels via `next/dynamic` at module scope with `ssr:false` + `loading: () => <SectionPlaceholder label="…"/>` (skel `min-h-[180px] border-dashed border-[var(--line)]`):
    ```
    const MatchAnalysis = dynamic(() => import("@/components/match/MatchAnalysis"), { ssr:false, loading: () => <SectionPlaceholder label="Loading match analysis…"/> })
    const DocumentsPanel = dynamic(() => import("@/components/documents/DocumentsPanel"), { ssr:false, loading: () => <SectionPlaceholder label="Loading documents…"/> })
    const FlashcardsPanel = dynamic(() => import("@/components/flashcards/FlashcardsPanel"), { ssr:false, loading: () => <SectionPlaceholder label="Loading STAR cards…"/> })
    const IntelligenceQuestionsPanel = dynamic(() => import("@/components/intel/InterviewQuestionsPanel"), { ssr:false, loading: () => <SectionPlaceholder label="Loading interview prep…"/> })
    const JobDetailAgentRun = dynamic(() => import("@/components/detail/JobDetailAgentRun"), { ssr:false, loading: () => <SectionPlaceholder label="Loading agent…"/> })
    ```
  - Each `renderSubpanel` case wrapped via `LazyReveal` with `minHeight` reserve (260 for match/agent, 220 for docs/flashcards/questions/overview, 160 for skills):
    ```
    case "overview": return <><LazyReveal minHeight={260}><MatchAnalysis/></LazyReveal><LazyReveal minHeight={220}><JobDetailOverview/></LazyReveal><LazyReveal minHeight={160}><JobDetailSkillsPanel/></LazyReveal></>
    case "docs": return <LazyReveal minHeight={220}><DocumentsPanel/></LazyReveal>
    // etc.
    ```
  - `LazyReveal` uses `IntersectionObserver` `{ rootMargin: "320px 0px" }`, mount-once, `minHeight` prevents layout jump; offscreen heavy tabs do not mount until scrolled/tab-selected (not merely `hidden` via CSS).
  - All new `data-testid` are stable: `job-brief-panel`, `salary-panel`, `skills-panel`, `company-research-panel`, `employer-verdict`, `fit-category`, `skip-reason`, `screenshot-proof`, `multi-agent-outputs`, `auto-apply-logs`; plus existing `source-card` etc. unaffected.

## Verification

### Gates
- `npx tsc --noEmit` → **0 errors** (saved as `task-16/tsc.log` empty, same clean as Task 15).
- `npx vitest run src/lib/__tests__/jobDetailDedup.test.ts` → **6/6 pass** (log `task-16/vitest.log`):
  - Proves `dynamic` + `LazyReveal` wraps: counts `loading: () => <SectionPlaceholder` ≥5, `<LazyReveal` ≥5, `IntersectionObserver` with `rootMargin` in `LazyReveal`.
  - Proves deduplication: `overview` owns `Role brief`×1, `salary` owns `Compensation`×1, `skills` owns `Skills gap`×1; `JobDetailView` itself ×0 each; combined detail ×1 each; old `data-testid="job-brief"` / `"skills-gap"` absent from view; new panel ids present.
  - Proves size shrink: `1241 → 332` (−909) `<900` and deduplication preserved.
- File size guard: each detail leaf `<=150` lines (verified in same test via `lineCount`).

### TDD — `src/lib/__tests__/jobDetailDedup.test.ts` (120 lines)
1. **Bounded & tokens** — `header 101 / overview 149 / salary 48 / skills 59 / agentRun 3 / LazyReveal 55` all ≤150; each contains `var(--` and no `#[0-9a-f]{3,6}`.
2. **Lazy panels render via dynamic** — asserts `dynamic(() => import("@/components/...DocumentsPanel/FlashcardsPanel/InterviewQuestionsPanel/MatchAnalysis/detail/JobDetailAgentRun"))` strings, `ssr:false` via `loading: () => <SectionPlaceholder` count, and `LazyReveal` wraps.
3. **Deduplication (no duplicate section titles)** — counts `Role brief / Compensation / Skills gap` in single-source files vs view vs combined; asserts old `data-testid` removal and new `data-testid="*-panel"` presence.
4. **Shrink** — `lineCount(view) 332 <900` and `1241-332 ≥300`.
5. **Shared contract** — `mode === "drawer"`, `JobDetailHeader`, `JOB_DETAIL_TABS`, `JobDetailOverview`, `renderSubpanel` present.

### Manual / visual checks
- Populated page and drawer each contain exactly one `Role brief`, one `Compensation`, one `Skills gap` heading (observed via `data-testid="job-brief-panel" / "salary-panel" / "skills-panel"`). No duplicate titles in always-on enriched block.
- Long `jobDescription` and URLs wrap: `whitespace-pre-wrap break-words` in overview description, `truncate` in header title/company, `flex-wrap` in techStack/keywords, no `overflow-x` at `375px` (header uses `min-w-0`, `truncate`, `flex-wrap`).
- Unopened heavy tabs do not mount: `LazyReveal` keeps `visible false` until intersected/tab-selected; `SectionPlaceholder` (`min-h-[180px] border-dashed`) shown while loading, then replaced. Verified by counting `<LazyReveal` wrappers ≥5 in view source and `IntersectionObserver` in `LazyReveal.tsx`.
- Empty state: `jobBrief` absent → overview shows `"No generated brief yet..."` dashed panel; `salaryIntel` absent → `SalaryPanel` shows `"Not generated."`; `skillsGap` absent → `SkillsPanel` shows `"No skills analysis yet — run match analysis in Overview."` — single composed empty state, not repeated containers, no layout jump (reserved `minHeight`).
- `npm run build` not run in this evidence (focus: `tsc` + `vitest` per task); would be gated in final `F4` verification lane.

## Files
- Reuse Task 15 creates: `src/components/detail/JobDetailHeader.tsx`, `JobDetailOverview.tsx`, `JobDetailSalaryPanel.tsx`, `JobDetailSkillsPanel.tsx`, `JobDetailAgentRun.tsx`, `LazyReveal.tsx`
- Modified (dedup): `src/components/JobDetailView.tsx` — trimmed drawer always-on (`job-brief`/`skills-gap` removal, salary chip removal), wrapped heavy secondaries via `dynamic` + `LazyReveal` + `SectionPlaceholder`, composed overview tab as `MatchAnalysis + JobDetailOverview + JobDetailSkillsPanel` single-source flow
- Created test smoke: `src/lib/__tests__/jobDetailDedup.test.ts` (6 behaviors above)
- Modified (gate): `src/components/resume/ResumeHtmlFallback.tsx` (optional-length fix, same as Task 15)
- Evidence ` .omo/evidence/post-review-ux-job-finder-cleanup/task-16/evidence.md` (this file), `tsc.log`, `vitest.log`

## Risks / notes
- `ResumeHtmlFallback` fix is orthogonal but required for `tsc` clean; does not affect Job Detail.
- No information loss: drawer still exposes `employer-verdict / fit-category / screenshot-proof / multi-agent / timeline`; page still exposes `KeyFact` host/ATS/channel/keywords + `Working notes` + `Application control` rail. Brief/salary/skills moved to overview tab single source, not dropped.
- No forced equal-height cards, no nested scrollbars except intentional drawer `overflow-y-auto` and page `lg:grid-cols-[1fr_300px]` with `lg:sticky` rail — single scroll owner per panel per `DESIGN.md`.
- No eager mounting hidden by CSS: `LazyReveal` `visible ? children : null` ensures unmounted until `isIntersecting`; `dynamic` `ssr:false` prevents server eager fetch.
