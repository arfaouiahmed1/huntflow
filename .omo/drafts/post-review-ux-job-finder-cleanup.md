---
slug: post-review-ux-job-finder-cleanup
status: plan-ready
intent: clear
review_required: false
classification: architecture
plan_path: .omo/plans/post-review-ux-job-finder-cleanup.md
plan_sha256: null
review_round_id: null
pending-action: execute via $start-work post-review-ux-job-finder-cleanup
approach: Finish and verify the complete post-review UX request across Job Finder taxonomy and live crawling, Auto-Apply visibility, job-detail information architecture, PDF-first Resume Studio, and responsive notifications; preserve the already-applied partial edits and avoid unrelated backend expansion.
---

# Draft: post-review-ux-job-finder-cleanup

## Components (topology ledger)

| id | outcome | status | evidence path |
|---|---|---|---|
| C1 | Job Finder exposes useful, non-overloaded source taxonomy: source type, market/location, experience, and work mode, backed by a broad catalog that excludes FMHY itself | explored-partial | `src/app/(app)/jobs/page.tsx:67-90,443-552`; `scrapling-agent/sources.json` |
| C2 | Crawl execution is understandable live: board cards update from structured events, crawled jobs appear in Applications, and concurrency defaults to 1 | implemented-needs-verification | `src/components/crawler/BoardLiveCard.tsx`; `src/lib/boardUpdate.ts`; `src/app/api/crawl/route.ts`; `scrapling-agent/server.py` |
| C3 | Auto-Apply is action-first and transparent: no match gate, every agent step and reasoning event is visible, secondary actions are decluttered, and application-detail mode uses the same model | implemented-partial | `src/app/(app)/agent/page.tsx`; `src/components/agent/AutoApplyPanel.tsx`; `src/components/agent/AgentPlannerCard.tsx`; `src/components/agent/AgentRunMonitor.tsx` |
| C4 | Job detail avoids repeated information and slow eager panels through a concise overview and lazy secondary tabs in both page and drawer modes | implemented-partial | `src/components/JobDetailView.tsx`; `src/components/JobDetailDrawer.tsx`; `src/app/(app)/jobs/[id]/page.tsx` |
| C5 | Resume Studio presents the compiled LaTeX PDF as the visual source of truth and clearly labels any HTML rendering as a structural approximation | incomplete | `src/app/(app)/resume/page.tsx`; `src/components/resume/*`; `src/lib/pdf/compileLatex.ts` |
| C6 | Notification trigger, panel, and toast stack remain aligned, unclipped, and collision-free across desktop and mobile | implemented-needs-visual-verification | `src/components/NotificationCenter.tsx`; `src/components/Sidebar.tsx`; `src/components/ui/Toaster.tsx` |
| C7 | The full UX delta is proven through focused tests, three viewport classes, and normal quality gates without overwriting unrelated dirty-tree work | pending | QA receipt `bg_88b4ebf5`; relevant Vitest suites; Playwright evidence |

## Recovered user requirements

- Fix the duplicate React key warning for repeated `Docker` terms.
- Ensure crawled jobs appear in Applications.
- Make working crawler cards visibly change instead of remaining idle.
- Clean up Auto-Apply, make it useful, show everything the agent does, and remove the match gate.
- Clean up the application/job-ID view.
- Reduce repeated/slow job-detail content and fix the odd information architecture.
- Make Resume Studio feel genuinely LaTeX-backed rather than like an HTML approximation.
- Default crawler concurrency to 1 or 2; the repository has already adopted 1.
- Add a much larger list of job websites, use the FMHY remote directory only as discovery input, and do not add FMHY itself.
- Add more general Job Finder categories, including experience and location/market; support users beyond the current profile.
- Make the notification component responsive and stop it appearing out of place.
- Keep Cloudinary optional and configurable through the documented environment variables or Settings.

## Findings

- `scrapling-agent/sources.json` now contains 30 boards across `remote`, `general`, `europe`, `mena`, `global`, and `posts`; FMHY is absent. Each board carries `experience` and `workMode` metadata.
- `jobs/page.tsx` already renders Experience and Work Mode filters, but its `Region / feed` selector still conflates market (`europe`, `mena`) with source type (`general`, `remote`, `posts`). A dedicated market/location dimension is the remaining taxonomy gap.
- Several newly added board selectors are explicitly marked unverified. Catalog completion must include source-contract validation and graceful unavailable/selector-drift states, not merely a larger JSON list.
- Crawl concurrency is already initialized to 1, passed from Settings with a fallback of 1, and crawled data triggers `refreshData()` after persistence (`jobs/page.tsx:114,173-203`).
- The cancelled UX worker completed reasoning-log types, graph reasoning events, minMatch=0 handling, an 11-step status checklist, an AgentRunMonitor, Auto-Apply decluttering, and the JobDetailView restructuring. Its Resume Studio PDF-first work remained in progress, and final global verification did not complete.
- The notification worker completed the responsive fixed panel and bottom-right toaster placement before cancellation. Those edits still require browser evidence and safe-area/long-content checks.
- Hands-on QA `bg_88b4ebf5` passed 25/25 P0, 20/20 P1, and 7/7 P2 scenarios with no blocker, but it predates completion of this post-review UX delta and did not test all requested viewport-specific behavior.
- Codebase-memory coverage is current-generation but reports metadata-changed freshness for the target files; `resume/page.tsx` has parse-partial single-line ranges. Current CodeGraph/direct-source evidence is authoritative for planning, and the executor must re-read changed targets before editing.
- The working tree contains the completed XL plan plus post-plan edits. Every task must preserve unrelated changes and reject broad resets/stashes.

## Decisions

- Preserve completed fixes instead of reimplementing them; begin with a delta audit against the recovered requirements.
- Default concurrency remains 1, satisfying the user's “1 or 2” preference conservatively.
- Keep FMHY out of runtime data, UI, documentation, and attribution; it may only have informed discovery.
- Recommended taxonomy: separate **Source type** (`general`, `remote board`, `community/posts`) from **Market/location** (`global`, `Europe`, `MENA`, and country/region tags), while retaining Experience and Work Mode as independent filters.
- Keep source taxonomy in sidecar configuration/API metadata, not SQLite; no migration is needed.
- Preserve existing APIs, local-first behavior, semantic design tokens, and `useToast` context contract; add no runtime dependency. Development-only React diagnostics are the sole dependency exception and must be absent from production output.
- Use TDD at behavior seams, supplemented by mandatory browser visual and interaction QA for rendered changes.

## Scope IN

- Audit and finish the 30-board source catalog, metadata, source endpoint shape, and Job Finder filters.
- Separate market/location from source type in the Job Finder UI and source metadata; include an All option for every dimension.
- Preserve and verify experience (`entry`, `mid`, `senior`, `all`) and work mode (`remote`, `hybrid`, `onsite`, `all`) filters.
- Verify structured board progress, persistence-to-Applications, refresh behavior, failure isolation, and concurrency default 1.
- Finish Auto-Apply and job-detail UX changes already partially applied, including the no-gate contract and visible reasoning/steps.
- Finish PDF-first Resume Studio and approximation disclosure.
- Finish responsive NotificationCenter/toaster behavior.
- Verify the duplicate-term aggregation and Cloudinary Settings-over-env resolver as adjacent completed requirements.
- Run focused unit/API tests, full lint/typecheck/test/build, and browser QA at 375×812, 768×1024, and 1280×800.

## Scope OUT (Must NOT have)

- No FMHY source entry, branding, runtime fetch, or user-facing reference.
- No Redis, hosted vector DB, new crawler service, or runtime dependency; only the plan's production-gated development diagnostics may be added.
- No database migration for source taxonomy.
- No change to public binding, auth model, or local-first trust boundary.
- No automatic application submission or weakening of supervised execution.
- No unrelated P2 cleanup from the general QA report unless it blocks this UX delta.
- No broad reset, stash, formatter pass, or overwrite of unrelated dirty-tree changes.

## Resolved owner decision

- **Approved:** split the current mixed `Region / feed` field into dedicated `Source type` and `Market/location` filters, with multi-region tags in source metadata.

## Verification strategy

- TDD for source metadata/filtering, board reducer state transitions, Auto-Apply no-gate behavior, job-detail lazy panels, PDF-first state, and toast stability.
- Browser QA: mobile, tablet, and desktop screenshots plus keyboard and overflow interactions.
- Source catalog QA must test one valid static board, one stealth board, one posts board, one unavailable/403 board, selector-drift handling, and filter combinations that produce zero and many sources.
- Final commands: `npm run lint`; `npx tsc --noEmit`; focused Vitest suites; `npm test`; `npm run build`.

## Approval gate

status: approved
approach: Complete the full seven-component UX delta in dependency order: first stabilize source metadata/taxonomy, then verify crawler state and persistence, finish Auto-Apply/job-detail/resume/notification surfaces, and close with focused and full verification. Preserve all already-applied changes and edit only proven gaps.
approval-result: User approved the full scope, split taxonomy, and recommended defaults; approval authorized plan generation only.
pending-action: execute via `$start-work post-review-ux-job-finder-cleanup`
