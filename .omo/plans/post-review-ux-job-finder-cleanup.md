# post-review-ux-job-finder-cleanup - Work Plan

## TL;DR (For humans)

- **What you'll get:** a finished, evidence-backed cleanup of Job Finder discovery and crawling, supervised Auto-Apply, Job Detail, Resume Studio, notifications, duplicate-term handling, and optional Cloudinary configuration. Existing partial edits are audited and completed rather than blindly replaced.
- **Why this approach:** the work starts by freezing the dirty-tree baseline and codifying the existing visual system, then establishes typed source/filter contracts before changing UI. Four dependency-aware waves keep the 30-board crawler, application persistence, agent safety, and responsive surfaces independently testable.
- **What it will NOT do:** no FMHY integration or attribution, Redis, hosted vector database, source-taxonomy migration, automatic external submission, public-binding/auth expansion, runtime dependency, broad sidecar rewrite, or destructive cleanup of unrelated uncommitted work.
- **Effort and risk:** architecture-scale—20 implementation-and-test tasks across four waves, followed by four parallel final-verification lanes. Primary risks are the large dirty worktree, unverified third-party board selectors, Next.js 16 client/server boundaries, optional local TeX availability, and completing partially applied edits without regressions.
- **Decisions locked:** crawler concurrency defaults to 1; Source type and Market/location are separate from Experience and Work mode; match score is informational and never an Auto-Apply gate; human submission approval remains mandatory; compiled LaTeX PDF is primary with an explicitly labeled structural fallback; Settings override environment Cloudinary values; tests use TDD at behavior seams plus real-browser QA.

## Scope

### Must have
- A source catalog of the existing 30 boards with explicit, independent `sourceType`, `markets`, `experience`, and `workMode` metadata; FMHY remains absent from runtime data, UI, docs, and attribution.
- Job Finder splits the current mixed `Region / feed` control into **Source type** and **Market/location**, while preserving independent Experience and Work mode filters and usable offline fallback options.
- Crawler cards consume the existing Next.js SSE proxy correctly and visibly transition through queued/running/success/failure; a failed board does not freeze siblings.
- A completed crawl persists wishlist jobs and refreshes Applications; concurrency defaults to 1 across UI, route, Settings fallback, Docker, and sidecar.
- Match scoring remains visible evidence but never blocks Auto-Apply; every Auto-Apply entry point uses the no-gate contract.
- Auto-Apply exposes the 11 supervised steps, current state, reasoning timeline, approval interruption, and compact logs without repeated panels.
- Job detail page and drawer share one information architecture, avoid repeated job brief/salary/skills sections, and lazy-load heavy secondary panels.
- Resume Studio treats the compiled LaTeX PDF as the visual source of truth, automatically attempts an initial compile when possible, and labels HTML as a structural fallback when TeX is unavailable or compilation fails.
- Notification trigger, panel, and toast viewport are responsive, keyboard-operable, safe-area-aware, and do not cover the sidebar footer.
- Duplicate job-description terms are deduplicated at the producer seam, not only at individual renderers.
- Cloudinary Settings-over-environment precedence and local-only fallback are locked by tests.
- Root `DESIGN.md` codifies the existing HUNTFLOW visual system before further UI changes; new work uses existing semantic tokens and documented primitives.

### Must NOT have
- No FMHY source entry, branding, runtime request, user-facing mention, or attribution.
- No Redis, hosted vector database, database migration for source taxonomy, public-binding change, or multi-tenant/auth expansion.
- No new runtime dependency. The only allowed dependency additions are the mandatory development-only React diagnostics, and they must be excluded from production output.
- No new crawler service, source-catalog expansion beyond the current 30 boards, or structural rewrite of the 1,800-line sidecar; only the bounded source-metadata/API changes enter scope.
- No automatic external application submission and no weakening of the existing human approval interruption.
- No broad reset, stash, formatting sweep, or overwrite of unrelated uncommitted work.
- No new component test framework, jsdom, Testing Library, Storybook, or `@playwright/test`; use Vitest for extracted `.ts` logic and the installed Playwright browser API for rendered behavior.
- No pages-router conventions or Server Actions; retain the App Router and existing REST `/api/*` boundary.
- No hardcoded hex colors or new arbitrary visual tokens in product UI.

## Verification strategy

- **Test decision:** TDD at behavior seams. Write and run a failing Vitest/route test before logic changes; capture a failing Playwright assertion or before-state evidence before visual/layout fixes; then implement the smallest root-cause change.
- **Unit tests:** pure taxonomy filtering, term normalization/deduplication, approval/no-gate decisions, and Cloudinary precedence in `src/lib/__tests__/*.test.ts`.
- **Integration tests:** real isolated SQLite through existing Vitest setup for crawl persistence; route-handler tests for `/api/crawl` and `/api/crawl/stream`; sidecar source-schema validation without touching the real DB.
- **Browser tests:** real Chrome/Playwright at 375×812, 768×1024, and 1280×800 for `/jobs`, `/agent`, `/jobs/[id]`, `/resume`, and notification/toast states. Save screenshots, console logs, and overflow measurements under `.omo/evidence/post-review-ux-job-finder-cleanup/`.
- **Source smoke tests:** one enabled static board, one stealth board, and one posts board with bounded timeouts; a board that cannot return a valid card is disabled by default and records a precise health note rather than producing fake success.
- **Frontend quality:** production build only for Lighthouse; real Chrome mobile and desktop, 3 runs each, median 100 for performance/accessibility/best-practices/SEO; `react-doctor` clean and `react-scan/lite` reports zero unnecessary commits on changed routes.
- **Global gates:** `npm run lint`, `npx tsc --noEmit`, focused Vitest commands, `npm test`, and `npm run build`.
- Previous QA receipt `bg_88b4ebf5` is context only. Fresh evidence from this delta is required for completion.

## Execution strategy

### Parallel waves
- **Wave 1 — Guardrails and typed foundations (Tasks 1-5):** dirty-tree baseline, design-system extraction, development diagnostics, source metadata contract, and pure filter engine.
- **Wave 2 — Job Finder and crawler truth (Tasks 6-10):** validate catalog defaults, split filters, lock SSE mapping, prove live cards, and prove persistence/concurrency.
- **Wave 3 — Agent and job-detail cleanup (Tasks 11-15):** remove the remaining gate, fix duplicate terms at source, then refactor and finish Auto-Apply and Job Detail without growing oversized modules.
- **Wave 4 — Resume, notifications, and adjacent configuration (Tasks 16-20):** extract Resume Studio responsibilities, make PDF primary, harden notifications, and lock Cloudinary precedence.
- **Final verification wave (F1-F4):** four independent, parallel approval lanes after all implementation tasks.

### Dependency matrix
| Tasks | Depends on | Blocks | Parallel with |
|---|---|---|---|
| 1 | — | every task | — |
| 2-5 | 1 | 6-20 | each other |
| 6-10 | 2-5 as noted per task | F1-F4 | each other where file ownership does not overlap |
| 11-15 | 2, then task-local predecessors | F1-F4 | 11-12 can parallelize; 13→14 and 15 are serialized by file ownership |
| 16-20 | 2, then task-local predecessors | F1-F4 | 16→17; 18-20 can parallelize |
| F1-F4 | 1-20 | handoff | each other |

### Dirty-tree discipline
- Before Task 1, capture a path-and-hash manifest. Every worker re-reads its assigned files immediately before editing.
- Workers own disjoint path sets inside a wave. No task may reset, stash, checkout, or rewrite another task's files.
- If a target changed after Task 1, stop that task, refresh the manifest, and reconcile rather than overwriting.

## Todos

- [x] 1. Capture the dirty-tree baseline and Next.js 16 execution contract
  - **What to do:** Record `git status --porcelain=v1`, path hashes for every delta target, current Node/npm/package versions, and the relevant bundled docs (`layouts-and-pages.md`, `server-and-client-components.md`, `use-client.md`, `lazy-loading.md`) into `.omo/evidence/post-review-ux-job-finder-cleanup/task-01-baseline/`. Mark the current untracked/modified targets explicitly.
  - **Must NOT do:** Do not modify product code, stage files, reset, stash, or treat CodeGraph metadata as a substitute for current disk bytes.
  - **References:** `.omo/drafts/post-review-ux-job-finder-cleanup.md`; `.omo/boulder.json`; `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`; `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`; `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`.
  - **Acceptance:** Evidence contains a reproducible baseline manifest and identifies every planned target; later F4 can distinguish pre-existing changes from this delta.
  - **QA happy:** Recompute hashes immediately and obtain an identical manifest; save output as `baseline-repeat.log`.
  - **QA failure:** Change a temporary evidence fixture and prove the comparison reports exactly that path without altering the workspace.
  - **Commit:** N — evidence-only baseline in a dirty worktree.

- [x] 2. Extract the existing HUNTFLOW visual system into root `DESIGN.md`
  - **What to do:** Create all eight required sections from existing truth in `src/lib/theme.ts`, `src/app/globals.css`, fonts in `src/app/layout.tsx`, and shared primitives in `src/components/ui/`. Document app-shell scroll ownership, 375/768/1280 breakpoints, semantic colors, type scale, spacing, depth, motion, focus, safe areas, and the reusable SourceFilter, AgentTimeline, DetailTabs, PdfPreview, NotificationPanel, and ToastViewport contracts. Add `scripts/validate-design-system.mjs` to compare documented token identifiers with exported/CSS token identifiers.
  - **Must NOT do:** Do not invent a new aesthetic, raw colors, new font, or product redesign; codify the current command-center visual language and flag existing deviations as debt.
  - **References:** `src/lib/theme.ts`; `src/app/globals.css`; `src/components/ui/Button.tsx`; `src/components/ui/Select.tsx`; `src/components/ui/Toaster.tsx`; frontend `design-system-architecture.md` and `layout-skill.md` rules loaded during planning.
  - **Acceptance:** `DESIGN.md` has Sections 1-8, names all changed primitives and states, defines one scroll owner per panel, and `node scripts/validate-design-system.mjs` exits 0 with no undocumented new token.
  - **QA happy:** Validator resolves the documented palette/type/spacing identifiers against source and writes `task-02-design-system.json`.
  - **QA failure:** Run the validator against a copied fixture containing an unknown token; it exits non-zero and names that token.
  - **Commit:** N — preserve the uncommitted wave; path-scoped review only.

- [x] 3. Install and production-gate the mandatory React development diagnostics
  - **What to do:** Add `react-grab`, `react-scan`, and react-doctor tooling as development-only dependencies/configuration; wire runtime diagnostics behind `NODE_ENV === "development"` and `NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS !== "1"` without converting the root layout into a Client Component. Add the static react-doctor command to the documented quality workflow.
  - **Must NOT do:** No production script leak, CDN script in production HTML, runtime dependency, framework migration, or unrelated package upgrade.
  - **References:** `package.json`; `package-lock.json`; `src/app/layout.tsx`; bundled Next.js Server/Client Component guidance; frontend `react-dev-tooling-skill.md`.
  - **Acceptance:** Diagnostics work in development; a production build contains no react-grab/react-scan script or overlay; root layout remains a Server Component.
  - **QA happy:** Run development once, confirm both runtime tools initialize, and save console evidence.
  - **QA failure:** Build/start production with the disable flag unset and assert HTML/DOM contains zero diagnostic scripts; any match fails the task.
  - **Commit:** N — dev-only tooling remains part of the reviewed delta.

- [x] 4. Make source type and market explicit in the sidecar source contract
  - **What to do:** Add typed `sourceType` (`general | remote_board | community`) and non-empty `markets` tags (`global | europe | mena | americas | apac`) to every current board in `scrapling-agent/sources.json`; extend `_meta.schema`; pass both fields through the explicit `/sources` whitelist in `scrapling-agent/server.py`; extend the frontend `CrawlerSource` boundary type. Keep the existing top-level groups as storage organization only.
  - **Must NOT do:** No SQLite migration, new board, FMHY string, arbitrary metadata passthrough, or sidecar structural refactor.
  - **References:** `scrapling-agent/sources.json:1-563`; `scrapling-agent/server.py` `/sources` whitelist around lines 539-563; `src/types/index.ts` `CrawlerSource`; `src/app/api/agent/sources/route.ts`.
  - **Acceptance:** All 30 IDs are unique and carry valid sourceType/markets/experience/workMode; `/api/agent/sources` returns those fields unchanged; serialized catalog contains no case-insensitive `fmhy`.
  - **QA happy:** Start sidecar, call `/sources`, validate all 30 entries with the schema, and save JSON evidence.
  - **QA failure:** Validate a copied malformed source with an empty market or duplicate ID; the validator rejects it and names the board.
  - **Commit:** N — no automatic commits in the dirty worktree.

- [x] 5. Add a pure, exhaustive source-taxonomy parser and filter engine
  - **What to do:** Create `src/lib/sourceTaxonomy.ts` with Zod boundary parsing, readonly literal unions, exhaustive labels, stable option derivation, and `applySourceFilters` for sourceType, market, experience, and workMode. Supply a minimal static option fallback when the sidecar returns 503, but never fabricate source cards. Add `src/lib/__tests__/sourceTaxonomy.test.ts` first.
  - **Must NOT do:** No filtering logic inside JSX, no `any`/assertion escape hatch, no hardcoded board IDs, and no automatic selection changes when the visible filter changes.
  - **References:** `src/app/(app)/jobs/page.tsx:67-90,443-452`; `src/app/api/agent/sources/route.ts`; `src/lib/validation.ts`; TypeScript data-boundary rules.
  - **Acceptance:** Tests cover each dimension independently, combined filters, multi-market boards, stable ordering, zero matches, malformed API input, and offline options; all return types are readonly and exhaustive.
  - **QA happy:** A remote-board + Europe + entry + remote fixture returns only matching IDs in catalog order.
  - **QA failure:** Unknown sourceType/market from the API produces a typed parse failure and no partially trusted objects.
  - **Commit:** N — implementation and tests remain path-scoped.

- [ ] 6. Validate the 30-board catalog and keep only proven defaults enabled
  - **What to do:** Add a bounded `uv` validation test/script for selector shape and one live smoke per source mechanism (static, stealth, posts). Run every `enabledByDefault` source with a short timeout; sources that cannot return a structurally valid card become disabled by default with a precise note. Preserve blocked but legitimate non-default sources as visible unavailable candidates.
  - **Must NOT do:** Do not claim every external board works, bypass bot protection, increase the catalog, or turn failures into fake jobs.
  - **References:** `scrapling-agent/sources.json`; `scrapling-agent/server.py` crawl dispatch and selector extraction; `scrapling-agent/test_linkedin_states.py` test style; AGENTS sidecar commands.
  - **Acceptance:** Every enabled default passes a current valid-card smoke; each source has valid selectors for its declared mechanism; failures are isolated and explained.
  - **QA happy:** One static, one stealth, and one posts fixture produce normalized title/company/location/url objects within timeout.
  - **QA failure:** Known 403/unavailable source reports failed/unavailable without crashing the run or emitting a job.
  - **Commit:** N — catalog health adjustments stay reviewable.

- [ ] 7. Split Job Finder into Source type and Market/location filters
  - **What to do:** Replace the mixed `CATEGORIES`/`Region / feed` control with independent Source type and Market/location selects driven by Task 5; retain Experience and Work mode; show selected/visible counts and an intentional zero-result state; keep source selection stable when filters hide cards. Reduce `jobs/page.tsx` by extracting the filter/control cluster rather than adding more responsibility to the oversized page.
  - **Must NOT do:** No device-specific CSS, no raw colors, no filter-driven crawl before the user presses Start, and no silent deselection of hidden sources.
  - **References:** `src/app/(app)/jobs/page.tsx:67-90,443-563`; `src/components/ui/Select.tsx`; `src/lib/sourceTaxonomy.ts`; `DESIGN.md`; bundled Next lazy-loading/client-boundary docs.
  - **Acceptance:** Four independent controls expose All options, source cards react deterministically, current selection survives filter changes, 375px has one readable column and no horizontal scroll.
  - **QA happy:** Playwright selects Remote board + Europe and observes the expected visible IDs/count at all three viewports.
  - **QA failure:** A zero-match combination renders a clear empty state and preserves previously selected IDs when filters reset.
  - **Commit:** N — do not mix with unrelated jobs-page changes.

- [ ] 8. Lock the Next.js crawler SSE proxy contract with route tests
  - **What to do:** Add route-level tests that script sidecar `/activity` cursor responses and assert `/api/crawl/stream` maps them to `connected`, `board_update`, `log`, heartbeat, and terminal `done` frames with runId isolation, malformed-frame tolerance, bounded polling, and abort cleanup.
  - **Must NOT do:** Do not describe the FastAPI sidecar as an SSE server; it exposes activity polling and the Next route owns SSE.
  - **References:** `src/app/api/crawl/stream/route.ts`; `scrapling-agent/server.py` `/activity`; `src/lib/__tests__/crawl.test.ts`; `src/lib/__tests__/boardUpdate.test.ts`.
  - **Acceptance:** Deterministic fake-timer tests prove event mapping, cursor progression, heartbeat, sibling-run exclusion, offline behavior, and cancellation without real sleeps.
  - **QA happy:** Scripted two-board activity yields ordered board updates followed by one terminal done frame.
  - **QA failure:** Sidecar 500 or malformed event yields a typed warning/error terminal path, not a hung stream or uncaught rejection.
  - **Commit:** N — tests and any minimal route fix are atomic in review.

- [ ] 9. Prove and finish live board-card state transitions
  - **What to do:** Audit `BoardLiveGrid` against the tested reducer; fix only gaps between SSE payloads and reducer actions; guarantee queued→running→success|failed transitions, found/matched counts, failure isolation, reconnect cursor handling, and terminal cleanup. Add pure reducer tests before changes and stable `data-testid` hooks for browser evidence.
  - **Must NOT do:** No regex parsing of human log strings, poll loop in the component, remount-per-event, or sibling cancellation when one board fails.
  - **References:** `src/components/crawler/BoardLiveCard.tsx`; `src/lib/boardUpdate.ts`; `src/lib/__tests__/boardUpdate.test.ts`; `src/app/api/crawl/stream/route.ts`.
  - **Acceptance:** Every board reaches a terminal state; counts update monotonically; reconnect does not duplicate events; component cleanup closes EventSource.
  - **QA happy:** Browser run shows two boards progress independently and saves a running plus terminal screenshot.
  - **QA failure:** Kill the sidecar mid-run; active cards become failed/offline, no card spins forever, and the page remains usable.
  - **Commit:** N — preserve unrelated crawler edits.

- [ ] 10. Prove crawl persistence, Applications refresh, and concurrency default 1 end-to-end
  - **What to do:** Extend crawl integration tests and the existing crawl→track→apply scenario to prove persisted wishlist stubs, idempotent deduplication, `refreshData()` visibility in Applications, source metadata retention, and concurrency fallback 1 from omitted/blank Settings through route to sidecar.
  - **Must NOT do:** No auto-application, duplicate persisted jobs, real user DB access, or default above 1.
  - **References:** `src/app/api/crawl/route.ts:218-232`; `src/app/(app)/jobs/page.tsx:161-211`; `src/context/AppContext.tsx`; `src/lib/__tests__/crawl.test.ts`; `tests/e2e/tier3-combinations/crawl-track-apply.test.ts`; `scrapling-agent/server.py` concurrency clamp.
  - **Acceptance:** One crawled result appears once in Applications as wishlist after refresh; repeat crawl remains one row; omitted concurrency is 1 everywhere; explicit valid values still clamp 1..16.
  - **QA happy:** Isolated DB test crawls two jobs, refreshes context, and observes both in Applications with source fields.
  - **QA failure:** Repeated same URL/title/company plus invalid concurrency creates no duplicate and resolves concurrency to 1.
  - **Commit:** N — persistence proof remains uncommitted until user review.

- [ ] 11. Remove the remaining match gate from every Auto-Apply entry point
  - **What to do:** Set batch and single-run orchestration to the no-gate contract (`minMatch: 0` or remove the parameter where safe), delete threshold controls/copy, and retain match score only as visible evidence. Preserve approval/submit acknowledgment and supervised execution.
  - **Must NOT do:** Do not remove deterministic fit analysis, approval interruption, submit acknowledgment, or safety validators.
  - **References:** `src/app/(app)/jobs/page.tsx:378-390`; `src/app/api/agent/multi-apply/route.ts`; `src/components/agent/AutoApplyPanel.tsx`; `src/components/agent/AgentRunMonitor.tsx`; `tests/e2e/tier1-feature/agent-pipeline.test.ts`.
  - **Acceptance:** No UI or request path enforces a match threshold; low-score jobs can enter supervised preparation; external submit remains blocked until explicit acknowledgment/approval.
  - **QA happy:** A low-score fixture reaches the first agent step with submit false and shows its score informationally.
  - **QA failure:** Submit true without acknowledgment remains disabled/rejected even though the match gate is gone.
  - **Commit:** N — no mixed safety-policy changes.

- [ ] 12. Deduplicate extracted job terms at the producer seam
  - **What to do:** Add failing tests for a profile skill also present in `COMMON_TECH`, then normalize and deduplicate `extractJdTerms` by normalized term while preserving first display spelling, aggregated count, `inResume`, stable order, and the 12-term cap. Keep renderer-side dedup as defense but make downstream data correct.
  - **Must NOT do:** No array-index keys, case-sensitive-only dedup, or per-component patch as the primary fix.
  - **References:** `src/lib/prompts/commonPrompts.ts:4-43`; `src/lib/prompts/generationPrompts.ts:178-230`; `src/components/match/MatchAnalysis.tsx:13-41`; `src/components/JobDetailView.tsx`; `src/lib/__tests__/fitScoring.test.ts`.
  - **Acceptance:** `Docker`, `docker`, and profile/Common-Tech overlap produce one term with correct count; `matchFallback`, brief tech stack, and all job-detail consumers receive unique normalized values.
  - **QA happy:** Test fixture with Docker duplicated across sources returns exactly one Docker term and no React duplicate-key console warning.
  - **QA failure:** Whitespace/case/alias duplicates cannot create two output terms; reverting dedup makes the red test fail.
  - **Commit:** N — producer fix and tests are one review unit.

- [ ] 13. Refactor Auto-Apply into bounded, single-responsibility components
  - **What to do:** Before adding behavior, split oversized `AutoApplyPanel`/monitor responsibilities into typed client leaves: run controls, step checklist, reasoning timeline, approval panel, and collapsible raw log. Extract one pure approval-state decision module tested in `.test.ts`; remove dead duplicated props/derivation and preserve existing test IDs and API payloads.
  - **Must NOT do:** No new framework, context, state library, duplicated approval implementation, or file above 250 pure LOC without a specific `SIZE_OK` justification.
  - **References:** `src/components/agent/AutoApplyPanel.tsx`; `src/components/agent/AgentPlannerCard.tsx:40-274`; `src/components/agent/AgentRunMonitor.tsx`; `src/app/(app)/agent/page.tsx`; `DESIGN.md` AgentTimeline contract.
  - **Acceptance:** Each touched component owns one named responsibility, orchestration behavior is unchanged, approval decisions are unit-tested, and `npx tsc --noEmit` remains clean.
  - **QA happy:** Existing run fixture produces identical request payload and step sequence before/after extraction.
  - **QA failure:** Unacknowledged submit is disabled in both page and job-detail surfaces by the same tested decision function.
  - **Commit:** N — refactor stays behavior-preserving and path-scoped.

- [ ] 14. Finish the transparent, action-first Auto-Apply UX
  - **What to do:** Make the primary Run supervised preparation action dominant; show all 11 steps and statuses, reasoning events with timestamps/source, compact progress summary, explicit paused-for-review state, and raw logs behind progressive disclosure. Keep quick actions secondary and ensure application-ID mode uses the same monitor.
  - **Must NOT do:** No hidden agent action, fake progress, decorative animation, repeated checklist, or automatic submission.
  - **References:** outputs of Task 13; `src/agents/multiAgentAppGraph.ts` reasoning events; `src/types/index.ts` agent log types; `src/app/(app)/agent/page.tsx`; `src/components/JobDetailView.tsx`; `DESIGN.md`.
  - **Acceptance:** Every emitted reasoning/step event has one visible representation; status is understandable without opening raw logs; mobile control order remains action→progress→review→details.
  - **QA happy:** Playwright drives a run through queued/running/interrupted/resumed states and captures each visible milestone.
  - **QA failure:** Simulated node failure marks exactly that step failed, exposes its reason, leaves previous steps intact, and offers no false success.
  - **Commit:** N — UX completion follows the refactor without unrelated page redesign.

- [ ] 15. Split JobDetailView before completing its information architecture
  - **What to do:** Extract header, overview, evidence, preparation, notes, and destructive actions into typed components under `src/components/detail/`; leave `JobDetailView` as tab/mode orchestration under 250 pure LOC. Preserve the shared page/drawer contract and lazy Client Component imports per bundled Next docs.
  - **Must NOT do:** No duplicated data fetching, mode-specific business logic, new route, eager heavy import, or behavior change during extraction.
  - **References:** `src/components/JobDetailView.tsx`; `src/components/JobDetailDrawer.tsx`; `src/app/(app)/jobs/[id]/page.tsx`; `src/components/detail/*`; bundled `lazy-loading.md` and `use-client.md`.
  - **Acceptance:** Page and drawer render the same job data model; heavy panels remain dynamically imported at module scope; extracted files meet single-responsibility/size rules; existing tests/build pass.
  - **QA happy:** Before/after DOM contract for a populated job has the same core identity/actions and tab targets.
  - **QA failure:** Missing optional salary/brief/skills renders intentional absence once, without blank duplicate cards or exceptions.
  - **Commit:** N — structural extraction precedes visible Job Detail changes.

- [ ] 16. Remove repeated Job Detail content and prove lazy secondary panels
  - **What to do:** Establish one concise overview source for identity, fit, job brief, compensation, skills, and next action; show evidence/preparation/notes only in their owning tabs; avoid the same brief/salary/skills in always-on and tab content. Add stable test IDs and content-visibility/lazy mounting for offscreen heavy sections.
  - **Must NOT do:** No information loss, forced equal-height cards, nested unexplained scrollbars, or eager mounting merely hidden by CSS.
  - **References:** Task 15 components; `src/components/detail/LazyReveal.tsx`; `src/components/match/MatchAnalysis.tsx`; `src/components/documents/DocumentsPanel.tsx`; `DESIGN.md` list-detail/scroll ownership.
  - **Acceptance:** Populated page and drawer each contain exactly one job brief, salary block, and skills summary; unopened heavy tabs do not mount; long descriptions and URLs do not create horizontal overflow.
  - **QA happy:** Playwright asserts one instance of each primary section and observes lazy panel loading only after tab selection.
  - **QA failure:** Empty job evidence produces a composed empty state, not repeated empty containers or a layout jump.
  - **Commit:** N — visible cleanup remains isolated from Task 15 refactor evidence.

- [ ] 17. Extract Resume Studio preview responsibilities from the oversized page
  - **What to do:** Move the HTML structural renderer, compiled-PDF frame, preview state banner, and preview controls into focused components under `src/components/resume/`; create a typed preview state union (`idle | compiling | compiled | stale | no_tex | failed`) with exhaustive rendering. Keep the page as orchestration and reduce its pure LOC materially before changing default behavior.
  - **Must NOT do:** No second compile implementation, type assertions, duplicated preview state, raw hex, or HTML screenshot presented as a PDF.
  - **References:** `src/app/(app)/resume/page.tsx`; `src/components/resume/ResumeDiff.tsx`; `src/components/resume/SynctexViewer.tsx`; `src/lib/pdf/compileLatex.ts`; `tests/e2e/tier1-feature/resume-studio.test.ts`.
  - **Acceptance:** Preview states are exhaustive and unit-testable; page behavior remains equivalent before Task 18; extracted components obey DESIGN.md and size limits.
  - **QA happy:** Existing compiled-token fixture renders identical PDF URL/download and structure-preview content after extraction.
  - **QA failure:** Failed compile state preserves editable TeX and diagnostics without stale PDF masquerading as current.
  - **Commit:** N — behavior-preserving extraction only.

- [ ] 18. Make the compiled LaTeX PDF the primary Resume Studio view
  - **What to do:** Attempt one initial compile per stable TeX revision when source exists and TeX is available; show compiled PDF first on success; mark it stale after edits; keep HTML behind an explicitly labeled “Structure approximation” disclosure; show actionable no-TeX/compile-failure fallback without loops. Preserve manual compile, download, log, diff, and SyncTeX controls.
  - **Must NOT do:** No simulated PDF shown as real, repeated auto-compile loop, hidden compiler error, ATS guarantee, or remote compile service.
  - **References:** Task 17 preview state; `src/app/api/resume/compile/route.ts`; `src/lib/pdf/compileLatex.ts`; `src/agents/resumeAgent.ts`; `docs/RESUME-ENGINE.md`; bundled client/lazy-loading docs.
  - **Acceptance:** With TeX present the initial source produces a visible compiled PDF without manual view switching; edits mark PDF stale; no-TeX and failed compile show labeled HTML fallback and diagnostics; download bytes start `%PDF`.
  - **QA happy:** Browser opens Resume Studio with TeX available and asserts the compiled frame is primary, then edits source and sees stale state.
  - **QA failure:** Run with TeX removed from PATH; no-TeX banner and structure approximation appear, no compile loop or crash occurs.
  - **Commit:** N — PDF-first behavior and tests remain one unit.

- [ ] 19. Harden NotificationCenter and toast placement for mobile and safe areas
  - **What to do:** Preserve fixed viewport anchoring and bottom-right toasts; add logical safe-area offsets, dynamic viewport max height, long/unbroken text wrapping, stable z-index layering, focus return to the bell, Escape/outside-click close, and 375px reflow. Keep polling/API semantics unchanged.
  - **Must NOT do:** No notification data/API redesign, nested scrollbars, sidebar-relative clipping, toast overlap with AgentStatus, or change to the stable `useToast` context identity/four-toast cap.
  - **References:** `src/components/NotificationCenter.tsx:127-282`; `src/components/Sidebar.tsx:104-202`; `src/components/ui/Toaster.tsx:35-128`; `DESIGN.md` NotificationPanel/ToastViewport contracts.
  - **Acceptance:** Panel stays within viewport/safe areas at all breakpoints; 30 notifications scroll inside it; close returns focus; toast stack never covers the sidebar footer or exceeds four items.
  - **QA happy:** Playwright opens the panel, keyboard-navigates, closes with Escape, and records mobile/tablet/desktop screenshots.
  - **QA failure:** Seed long URL-like notification text and five simultaneous toasts; no horizontal scroll, only four toasts, and background remains clickable after close.
  - **Commit:** N — responsive notification delta stays isolated.

- [ ] 20. Lock Cloudinary Settings-over-env and local-only fallback behavior
  - **What to do:** Add focused tests for `resolveCloudinaryConfig`, masked/blank Settings handling, env fallback, Settings precedence, concurrency clamp/default 1, and the route that syncs effective config to the sidecar. Update docs only if tests expose drift.
  - **Must NOT do:** No live Cloudinary upload, hardcoded credential, secret snapshot, environment-file commit, or requirement that Cloudinary be configured.
  - **References:** `src/lib/cloudinaryConfig.ts`; `src/app/(app)/settings/page.tsx`; `src/app/api/data/[collection]/route.ts`; `src/app/api/crawl/route.ts`; `src/lib/__tests__/api-data.test.ts`; README Cloudinary section.
  - **Acceptance:** Tests prove Settings > env > unset/local-only, masked values never overwrite real secrets, and unset Cloudinary does not block screenshots or crawling.
  - **QA happy:** Distinct Settings/env fixture selects Settings values and concurrency 2 while returning no secret in API output.
  - **QA failure:** Blank/masked Settings fall back to env; fully unset config yields local-only mode and concurrency 1 without throwing.
  - **Commit:** N — tests-only unless documentation drift is proven.

## Final verification wave

- [ ] F1. Plan compliance and requirement audit
  - Read the approved draft and every Task 1-20 evidence artifact; verify each recovered user requirement and Must-NOT guardrail against current source, not worker summaries.
  - Require exact evidence for: FMHY absence, four independent filters, no match gate, visible 11-step reasoning, one-copy Job Detail sections, PDF-first resume, responsive notifications, concurrency 1, Applications persistence, producer-level dedup, and optional Cloudinary.
  - **References:** `.omo/drafts/post-review-ux-job-finder-cleanup.md`; Tasks 1-20 evidence under `.omo/evidence/post-review-ux-job-finder-cleanup/`; the final source paths named by each task.
  - **Acceptance:** Approve only if all requirements have direct source plus fresh command/browser evidence and no scope item is silently dropped.
  - **QA happy:** Build a requirement-to-source-to-evidence matrix with every row passing and save it as `.omo/evidence/post-review-ux-job-finder-cleanup/f1/requirement-audit.md`.
  - **QA failure:** Remove one copied evidence reference from a verifier fixture and prove the audit marks that requirement incomplete rather than inferring success from worker prose.
  - **Commit:** N — independent verification only.

- [ ] F2. Code quality, architecture, and security review
  - Review the complete delta for TypeScript strictness, Zod boundaries, exhaustive unions, file-size/single-responsibility limits, client/server boundaries, async cleanup, SSE abort handling, secret masking, path safety, and no new runtime dependency.
  - Run `npx react-doctor@latest --json`, TypeScript no-excuse checks where available, lint, and focused tests; reject raw hex, `any`, assertion escape hatches, dead duplicated UI, or production diagnostic leakage.
  - **References:** `AGENTS.md`; `DESIGN.md`; `package.json`; every changed `.ts`, `.tsx`, `.py`, JSON, and configuration path in the Task 1 final manifest.
  - **Acceptance:** Approve only if no CRITICAL/MAJOR finding remains and all security findings are LOW/NONE under the local-only trust boundary.
  - **QA happy:** Save diagnostics, lint, focused-test, dependency, and production-bundle inspection receipts under `.omo/evidence/post-review-ux-job-finder-cleanup/f2/` with zero unresolved major finding.
  - **QA failure:** Seed a copied review fixture with one forbidden assertion escape hatch and one exposed credential field; the review must reject both with exact path/line evidence.
  - **Commit:** N — independent verification only.

- [ ] F3. Real-browser visual, interaction, accessibility, and performance QA
  - Use `/visual-qa` on a production build for `/jobs`, `/agent`, a populated `/jobs/[id]`, `/resume`, and notification/toast states at 375×812, 768×1024, and 1280×800; drive hover/focus/active/loading/empty/error/interrupted states and reduced motion.
  - Assert no horizontal overflow, one declared scroll owner per panel, readable long content, full keyboard reachability, focus return, no console errors, and screenshot evidence.
  - Run real-Chrome Lighthouse mobile+desktop three times per changed route and take medians; require 100/100/100/100 plus zero unnecessary react-scan commits.
  - **References:** `DESIGN.md`; changed UI paths from Tasks 7, 9, 13-19; `.omo/evidence/post-review-ux-job-finder-cleanup/`.
  - **Acceptance:** Approve only if both visual-defect and design-system reviewers approve fresh evidence and every required route/state/viewport has a named artifact.
  - **QA happy:** Save screenshots, accessibility snapshots, overflow measurements, console logs, Lighthouse reports, and react-scan output under `.omo/evidence/post-review-ux-job-finder-cleanup/f3/`; all assertions pass.
  - **QA failure:** Exercise long unbroken content, sidecar-offline, compile-failure, zero-source, and agent-step-failure states; any clipping, false success, inaccessible control, or missing artifact rejects the lane.
  - **Commit:** N — independent verification only.

- [ ] F4. Full gates, dirty-tree integrity, and scope-fidelity audit
  - Run `npm run lint`, `npx tsc --noEmit`, all focused suites, `npm test`, and `npm run build`; run sidecar validation through `uv`; compare final status/hashes with Task 1.
  - Verify no pre-existing modified/deleted/untracked file was reset or overwritten, and every new delta path is expected.
  - **References:** Task 1 baseline manifest; `package.json`; `vitest.config.ts`; `.github/workflows/ci.yml`; `scrapling-agent/pyproject.toml`; final workspace status.
  - **Acceptance:** Approve only if all commands exit 0, the production build succeeds, the final manifest shows only authorized delta changes, and no background server/process remains.
  - **QA happy:** Save exact commands, exit codes, full logs, final path/hash diff, and process cleanup evidence under `.omo/evidence/post-review-ux-job-finder-cleanup/f4/`.
  - **QA failure:** Compare against a copied manifest containing one unauthorized changed path and prove the audit rejects completion even when all quality commands pass.
  - **Commit:** N — verification must not mutate or commit the worktree.

## Commit strategy

- Default is **no automatic commit** because the base worktree already contains the completed XL plan and roughly 180 uncommitted paths.
- Keep changes reviewable by wave and preserve Task 1 manifests. If the user later requests commits, create delta-scoped atomic commits only after F1-F4 approval; never include unrelated pre-existing paths.
- Suggested future commit groups: `docs(ui): codify huntflow design system`; `feat(discovery): split source taxonomy and validate boards`; `fix(crawler): prove live state and persistence`; `refactor(agent): simplify transparent supervised apply`; `refactor(job-detail): dedupe and lazy-load detail`; `feat(resume): make compiled pdf primary`; `fix(ui): harden notifications and config tests`.

## Success criteria

- Job Finder shows independent Source type, Market/location, Experience, and Work mode controls derived from validated sidecar metadata, and the 30-board catalog contains no FMHY reference.
- Every enabled default source currently produces a valid normalized card; blocked or drifting sources fail honestly without breaking sibling boards.
- A crawl visibly updates cards, persists unique wishlist jobs, refreshes Applications, and defaults to one worker.
- No Auto-Apply path rejects a job based on match score; all 11 supervised steps and reasoning events are visible; submit remains explicitly acknowledged and approved.
- Duplicate normalized terms are absent at the producer and no changed browser route emits duplicate-key warnings.
- Job Detail page/drawer show each core information block once and mount heavy panels only when requested.
- Resume Studio shows a real compiled PDF first when possible and a clearly labeled structural fallback otherwise.
- Notification panel and toasts fit safe areas and do not overlap critical UI at all required viewports.
- Cloudinary remains optional with proven Settings-over-env precedence and no secret exposure.
- `DESIGN.md` exists and all changed UI follows it; React diagnostics remain development-only.
- F1-F4 all return APPROVE on fresh evidence; lint, typecheck, tests, build, browser QA, Lighthouse, and dirty-tree integrity all pass.
