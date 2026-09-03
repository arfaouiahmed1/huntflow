# Huntflow Streamlining Plan — v1.0 (Draft for Review)

> **Goal:** Make Huntflow feel like a focused Job Search OS, not a lab of features. Fix LaTeX/PDF pain, unify visualisation, and reduce clunk via navigation, state, and agent UX streamlining. Looks clean already — make it *coherent*.
>
> **Author:** Prometheus (planner) — 2026-08-21
> **Mode:** Plan-only. No product code edited. All citations are post-survey of `src/`, `src/lib/db.ts`, `src/context/AppContext.tsx`, `src/app/(app)/*`, `src/components/*`, `src/agents/*`, `src/lib/pdf/*`, `src/lib/ats/*`.
> **Approval Gate:** Do **not** start `/start-work` until this plan is marked Approved.

## 1) Executive Summary

Huntflow is functionally rich (12 top-level views, 52 API routes, 17 SQLite tables, 22 LaTeX templates, 11-node LangGraph pipeline) but structurally heavy. The clunk comes from **too many surfaces doing overlapping jobs** and **two rendering truths** (HTML preview vs LaTeX PDF). Visualisation is inconsistent because the same data is shown via 3 board views + drawer + full-page detail + isolated agent consoles without a shared visual grammar.

This plan proposes a **streamlined product shape** with **one pipeline, one preview truth, one design token layer**, and **specialized subagents that own one vertical each** rather than one mega-agent graph.

---

## 2) Ground Truth — What Exists Today

### 2.1 Stack & Scale
- Next.js 16 App Router + React 19 + Tailwind v4 + SQLite (WAL, `DatabaseSync` `src/lib/db.ts:1`)
- `AppContext.tsx` 1568 LOC god object: owns 6 collections (jobs/contacts/emails/interviews/reminders + stats), LLM chain, optimistic rollback helpers, LinkedIn + auto-apply batch runners.
- 11 App Router views: `/`, `/tracker`, `/resume`, `/jobs`, `/agent`, `/assistant`, `/vault`, `/network`, `/outreach`, `/interviews`, `/settings` (sidebar `src/components/Sidebar.tsx:27`)
- 52 API routes (`src/app/api/*`), 22 `.tex` templates (`src/lib/pdf/templates/*.tex`), 17 tables (`src/lib/db.ts:46`)
- Types: `JobApplication` has 30+ optional AI fields (matchScore, skillsGap, employerReview, multiAgentOutputs, starFlashcards, `src/types/index.ts:177`)

### 2.2 Data & Backend
- `jobsRepo`, `contactsRepo`, `emailsRepo`, `interviewsRepo`, `remindersRepo`, `vaultRepo`, `resumeRepo`, `memoryRepo`, `usageRepo` all in `src/lib/db.ts`.
- `computeStats()` runs 8 ad-hoc SQL queries per refresh (`src/lib/db.ts:1156`), no caching, weekly buckets keyed on `applied_date` not `created_date` — sparse when user hasn't applied yet.
- Backup/import is all-or-nothing via `ALL_TABLES_IN_DELETION_ORDER` (`src/lib/db.ts:1264`) — correct but scary UX (no selective export).
- SettingsRepo stores profile/LLM providers/mail/cloudinary as JSON blobs — no schema migration.

### 2.3 Agent Architecture (current)
- **LangGraph multi-agent** `src/agents/multiAgentAppGraph.ts`: 11 nodes (companyIntel, regionalNorms, piiSanitizer, resumeCVTailor, letterTailor, interviewPrep, salaryIntel, outreachEmail, atsAudit, autoApplyExecution, orchestratorGate), fan-out/fan-in edges (`:399`), `SqliteCheckpointSaver` + `interrupt()` HITL.
- **ResumeAgent** `src/agents/resumeAgent.ts`: 5 tasks (draft/improve/tailor/ats/parse_pdf) with deterministic fallbacks.
- **Scrapling-agent** Python sidecar `scrapling-agent/server.py` on `:8001` (seen via `OFFLINE_HINT` in `src/app/(app)/jobs/page.tsx:60` and health checks on `/api/agent/health`).
- **Vault RAG**: `bm25.ts`, `embeddings.ts`, `chunk.ts` — local cosine, no vector DB, `embed_model` mix tracking (`src/lib/vault/*`).
- **LLM routing**: `src/lib/llm/router.ts` / `providers.ts` / `client.ts` — multi-provider chain but no token budget surface in UI.

### 2.4 Frontend Visual Layer
- **Design tokens**: `src/lib/theme.ts` rawPalette + CSS vars in `globals.css` — not consistently consumed (some components inline hex, some `var(--chartreuse)`).
- **JobDetail duality**: `JobDetailView.tsx` 789 LOC with `mode="drawer"|"page"` plus duplicate chrome (status, dates, notes, recommendation banner) — drawer re-implements page logic.
- **Board views**: Kanban (`tracker/page.tsx` not shown but exists) + Table + Deck (`JobSwipeDeck`) + Matrix (`JobMatrixView`) — 3 implementations for same collection.
- **Resume Studio** `src/app/(app)/resume/page.tsx` 1300+ LOC: split-pane with manual `leftWidthPercent` drag (`:178`), mobile 3-tab switcher, HTML `document-paper` fake preview (`:1130`) vs real LaTeX PDF via `/api/resume/compile` (`src/app/api/resume/compile/route.ts:24`). User complaint: "looks like paper but isn't the PDF."
- **Tracker crawl** `src/app/(app)/jobs/page.tsx` 599 LOC: source picker + category + keyword + limit + live console + last-run chips + deck/matrix toggle — one page does five jobs.
- **Empty/loading states**: ad-hoc `Loader2` + offline `WifiOff` panels, no skeleton, no shared `EmptyState` component.

---

## 3) Gaps — The Streamlining Backlog

### 3.1 G1 — LaTeX PDF Pain (Primary User Complaint)
| # | Gap | Evidence | Severity |
|---|---|---|---|
| G1.1 | **Two truths: HTML preview ≠ PDF output.** Preview is hand-rolled divs with per-template border colors (`resume/page.tsx:1137`). PDF is pdflatex output. User never sees real typography until export. | `resume/page.tsx:1113` "Web preview approximates ... exported PDF is the typography source of truth" | High |
| G1.2 | **No live PDF preview.** Compile only on Export (`downloadPdf()` `:621` calls `/api/resume/compile` then `window.open`). No `<iframe>` / PDF.js. | `compileLatex.ts:43` `runRuns` 60s timeout, tmpdir `huntflow-tex-` | High |
| G1.3 | **LaTeX engine dependency.** `findEngine()` (`compileLatex.ts:23`) probes PATH for pdflatex/xelatex/lualatex; fails on Windows without TeXLive. Docker `Dockerfile` likely bakes it but local dev is fragile. | `PdfError` 422, no fallback | High |
| G1.4 | **Template sprawl (22 templates) with no visual chooser.** `resumeTemplatesMeta.ts:16` defines 22 metas, but UI is a select dropdown + `filteredTemplates` memo (`resume/page.tsx:184`). No thumbnails, no ATS score explainer until ATS panel. | `templateMeta()` lookup | Medium |
| G1.5 | **Duplicated `texToText` / `stripDefinitions`.** Exists in both `resumeTemplates.ts:165` and `sanitize.ts:114` — drift risk. ATS `layout` check (`analyze.ts:152`) scans raw tex string for `\begin{tabular}` but `tabular-german.tex` legitimately uses it → false "breaker" flag. | `analyzeAts` layout check | Medium |
| G1.6 | **No HTML→PDF fallback.** `templates.ts:18` PREAMBLE is LaTeX-only; no alternative path for users who want great PDF without TeX. | `buildDocumentTex` | Medium |
| G1.7 | **Letter vs resume rendering split.** `renderTemplate` (`resumeTemplates.ts:130`) branches on `isLetter(content)` (paragraphs presence), but `templates.ts` has separate `letterTemplate`/`resumeTemplate` — two parallel systems. | `resumeTemplates.ts:137` | Low |

**Risk if untouched:** Every resume edit requires mental context switch ("is what I see what I get? No."). Users distrust exports, abandon the studio.

### 3.2 G2 — Visualisation & Design System
| # | Gap | Severity |
|---|---|---|
| G2.1 | **No shared chart/visual grammar.** Funnel `computeStats: funnel` is rendered differently in dashboard vs tracker vs agent stats; colors ad-hoc (`palette.chartreuse` vs inline hex). | High |
| G2.2 | **Board view divergence.** Kanban, Table/Matrix, Deck each have own card component (`JobCard.tsx`, `JobSwipeDeck/*`, `JobMatrixView/*`) with different fields/badges. User sees 3 dialects of a job. | High |
| G2.3 | **Detail view duplication.** Drawer + Page re-implement header (logo, status, score badge, notes). 789 LOC single file, hard to evolve. | High |
| G2.4 | **Token leakage.** `theme.ts:9` palette has 15 raw values, but `globals.css` vars and `cn()` calls mix `var(--chartreuse)` and `palette.chartreuse` and literal `#b9ed57`. No lint rule enforcing token usage. | Medium |
| G2.5 | **Responsive debt.** Resume studio `leftWidthPercent` drag is JS-calculated `e.clientX / totalWidth` (`:505`) with no persistence; `< lg` falls back to tab switcher (`mobileTab` `:182`) but preview zoom (`zoom` `:181`) only applies to center pane. Tracker 4-column crawl form collapses awkwardly at `md:grid-cols`. | Medium |
| G2.6 | **Empty/loading/success states inconsistent.** `JobsPage` has bespoke offline panel (`:547`), `DashboardPage` has no skeletons, `AgentPage` has inline stats grid — no `EmptyState`/`SkeletonCard`/`ErrorPanel` primitives. | Medium |
| G2.7 | **Motion overuse.** Every sidebar link `motion.div whileHover x:3` (`Sidebar.tsx:135`), drawer tabs `layoutId` — cute but adds layout thrash when 11 nav items + 7 tabs animate together. | Low |

### 3.3 G3 — Clunk: Information Architecture & Flow
| # | Gap | Severity |
|---|---|---|
| G3.1 | **11 top-level nav items** (`Sidebar.tsx:27`) with no grouping. Mental model collapse: "Where do I go to apply?" (Jobs? Tracker? Agent? Job [id] → Apply tab?). | High |
| G3.2 | **Tracker vs Jobs split is confusing.** `/tracker` is kanban board for committed pipeline, `/jobs` is discovery crawl — names don't convey "discover vs manage." Users treat them interchangeably. | High |
| G3.3 | **Every AI capability is a manual button** (`generateMatchAnalysis`, `generateDocuments`, `generateSTARCards`, `generateInterviewQuestions`, `generateJobBrief`, `generateSalaryIntel` in `AppContext.tsx:147`). User must remember to click 6 things per role. | High |
| G3.4 | **Context bloat: AppContext god object** 1568 LOC, 30+ callbacks in `value` memo (`:1444`). Every consumer re-renders on any slice change; `updateProviders` nests 3 closures (`:534`). | High |
| G3.5 | **No progressive disclosure.** First-run user sees empty charts + "Add a job" but no guided tour, no sample role walkthrough, no "do this next" outside the small recommendation banner in `JobDetailView:572`. | Medium |
| G3.6 | **Optimistic update feedback is toast-only.** `persistEntityWithRollback` (`:319`) and `deleteEntityWithRollback` (`:350`) silently rollback; user sees transient toast then list snaps back — no inline undo affordance. | Medium |
| G3.7 | **Search & filtering is fragmented.** Jobs search lives in crawl form, tracker has no global search, vault has its own `vault/search` BM25 — no unified command palette (sidebar hints `Cmd+K → /assistant` but that's chat, not command). | Medium |

### 3.4 G4 — Agent Orchestration Gaps
| # | Gap | Severity |
|---|---|---|
| G4.1 | **Graph is 11 nodes but user sees only logs.** No visual pipeline (which node ran, which failed, which was skipped via `minMatch`). `AgentPage` shows a static `PIPELINE` array (`:39`) unrelated to real graph state. | High |
| G4.2 | **Parallel fan-out is correct but not surfaced.** Code does `START → 4 nodes parallel` then fan-in/out (`multiAgentAppGraph.ts:400`); UI shows sequential logs, not concurrent lanes. Users assume it's slow/serial. | Medium |
| G4.3 | **HITL `interrupt()` is opaque.** `autoApplyExecutionNode` calls `interrupt({type:"human_review", ...})` (`:306`) but UI for approval lives only via `/api/agent/resume` polling — no dedicated review inbox. Users miss the pause. | High |
| G4.4 | **Scrapling-agent boundary.** Python FastAPI on `:8001` is separate process (`dev` runs `next dev` + `uvicorn` concurrently `package.json:8`); health is polled every 15s (`Sidebar.tsx:49`); no single `docker-compose` health gate documented in `AGENT-OPERATIONS.md`. | Medium |
| G4.5 | **Vault ↔ Resume copilot disconnect.** Vault evidence is BM25 searchable (`/api/vault/search`) but `runResumeAgent` only optionally pulls it via `extractJdTerms` — no automatic "inject top 3 vault facts" step in tailoring. | Medium |
| G4.6 | **No agent registry.** `applyAgent`, `multiAgentAppGraph`, `resumeAgent`, `orchestrator` each have own settings LLm key; `AgentBehaviorSettings` not shown in Settings UI. | Low |

### 3.5 G5 — Data & Backend Coherence
| # | Gap | Severity |
|---|---|---|
| G5.1 | **Stats staleness.** `computeStats` + `refreshStats` is called after every optimistic mutation (`addApplication:650`, `updateApplication:694`, `deleteApplication:718`) — N queries per keystroke. | Medium |
| G5.2 | **Export bundle is opaque.** `/api/data/export` returns `BackupData` with `jobs.contacts.emails.interviews.reminders.memories.vault.usage.resumeDocs.notifications` — user can't choose subsets. | Low |
| G5.3 | **LLM settings persistence race.** `updateProviders` writes `localStorage` synchronously then fires `persistSettingsWithRollback` void (`AppContext.tsx:542`) — tab A/B divergence possible. | Low |

---

## 4) Design Principles for the Streamline

1.  **One Pipeline.** Consolidate Discover → Assess → Prepare → Apply → Follow-up into a single navigable pipeline; tracker kanban is the source of truth, finder is its intake.
2.  **One Preview Truth.** Every doc surface renders the *same* pixels the user will download. PDF is not an afterthought.
3.  **Progressive Disclosure.** Show 5 primary destinations by default; relegated tools live inside context (job workspace, settings drawer).
4.  **Evidence-First.** Any AI claim surfaces its source (vault chunk, job posting line, company research fact) or it doesn't ship.
5.  **Deterministic by Default, LLM on Request.** Every AI button has a heuristic result instantly, then upgrades to LLM when available — never blocks.
6.  **Small Agents, Composable Workflows.** Prefer 4 focused agents over 1 mega-graph; expose graph state visually.

---

## 5) Proposed Information Architecture (Target)

### 5.1 Top-Level Navigation (5 + 1)

| Route | Label | Replaces |
|---|---|---|
| `/` | **Pulse** (today, overdue follow-ups, next interviews, agent inbox) | Current `/` dashboard, folded `DashboardPage` + excerpt of `/tracker` |
| `/pipeline` | **Pipeline** (Kanban only; table is a view toggle, not a route) | `/tracker` (rename), absorbs status kanban |
| `/discover` | **Discover** (crawl + swipe deck/matrix, same page) | `/jobs` (rename) |
| `/resumes` | **Resumes** (studio) | `/resume` (rename, keep) |
| `/library` | **Library** (Vault + Interviews + Network + Outreach unified with tabs) | `/vault`, `/network`, `/outreach`, `/interviews` consolidated |

**Settings, Agent Console, Assistant** move to:
- `Cmd+K` Command Palette → `Ask Huntflow`, `Run agent on this role`, `Open settings`.
- Global **Agent Inbox** FAB/bell (existing `NotificationCenter` already in sidebar header `:126`) surfaces HITL interrupts + failed runs.

Rationale: 11 → 5 reduces choice paralysis by 55%; grouping aligns with user journey, not data tables.

### 5.2 Role Workspace (`/pipeline/[id]`) — Unify Drawer + Page
- Remove `mode` branching. Single `RoleWorkspace` component, mounted as:
  - **Drawer** when opened from kanban (`/pipeline?open=id`)
  - **Page** when navigated directly (`/pipeline/[id]`)
- Journey tabs collapse from 7 → 4 phases (already designed in `JobDetailView:84`): **Analyze → Prepare → Apply → Interview**. Each phase owns 1–2 subpanels, lazy-loaded.

---

## 6) Streamlining Tracks — 6 Specialized Workstreams

> Each track is scoped for a dedicated worker/subagent so they can run in parallel with minimal merge conflict. Order within track is dependency order.

### Track A — PDF & Resume Fidelity (Owner: `resume-pdf-specialist`)
**Problem:** Two truths + no live PDF.
**Approach — Adopt: HTML-to-PDF primary, LaTeX as power-user export:**

| Step | What | Why | Touches |
|---|---|---|---|
| A1 | **Introduce live PDF preview** via server-rendered PDF bytes in `<iframe>` (existing `/api/resume/compile?token=&save=1` GET `:25`). Poll compile on debounced `resume` change (800ms) and show `<iframe src=blobUrl>`. Keep HTML `document-paper` only as fallback before first compile. | Closes G1.1/G1.2 without waiting for full LaTeX replacement | `resume/page.tsx`, `compileLatex.ts`, new `useLivePdf.ts` hook |
| A2 | **Deduplicate `texToText`/`stripDefinitions`** into `src/lib/pdf/texText.ts` single canonical export; remove duplicate in `sanitize.ts` / `resumeTemplates.ts`. | G1.5 drift | `sanitize.ts`, `resumeTemplates.ts`, `analyze.ts` |
| A3 | **Add React-PDF / WeasyPrint parity renderer.** Create `src/lib/pdf/htmlRenderer.tsx` (React-PDF) that takes `ResumeContent + templateMeta` and emits `@react-pdf/renderer` Document. Reuse same fragments (`experienceFrag` etc.) but as React nodes. Gate with `NEXT_PUBLIC_RESUME_RENDERER=latex|html` env flag; default `html` for instant preview, `latex` on explicit "Export LaTeX PDF". | Gives "don't like LaTeX" escape hatch; G1.3/G1.6 | New file, `renderTemplate`, `resumeTemplatesMeta` |
| A4 | **Redesign template chooser** as visual grid: thumbnail SVG preview + `atsScore` badge + `fontFamily` tag; filter by `kinds`. Keep `RESUME_TEMPLATES` meta as source. Single-select, persisted in `resumeDoc.templateId`. | G1.4 | `resume/page.tsx:740` toggle + new `TemplateGallery.tsx` |
| A5 | **Fix ATS layout check.** Make `hasLayoutBreakers` conditional: if `templateId === "tabular-german"` allow `tabular` but still flag `includegraphics`. Move check to `analyzeAts(templateId, tex)` signature. | G1.5 false positive | `analyze.ts:153` |
| A6 | **Unify letter/resume rendering.** Deprecate `src/lib/pdf/templates.ts` PREAMBLE helpers; keep single `renderTemplate` path for both. Letters just inject `paragraphs/recipient` into same PREAMBLE wrapper. | G1.7 | `templates.ts` marked deprecated |

**Acceptance:** Preview pixels match download bytes (pixel diff < 1% on 2 sample resumes). No TeX install required to get a good export. Remaining LaTeX path still passes existing `resumeTemplates.test.ts`.

### Track B — Visual Grammar & Design Tokens (Owner: `ui-visual-engineer`)
**Approach — Adopt: `frontend-design` + existing `theme.ts` as law:**

| Step | What |
|---|---|
| B1 | **Freeze tokens.** Extract `globals.css` + `theme.ts:9` into `src/styles/tokens.ts` exporting `semanticColors`, `chartScale`, `spacing`, `radius`, `shadow`. ESLint rule: ban literal `#...` outside tokens file (via `no-restricted-syntax`). |
| B2 | **Unify Job Card.** Single `UniversalJobCard` with variants `compact|board|deck|matrix-row`; replaces `JobCard.tsx` + deck card + matrix row. Props: job + density, not 3 components. |
| B3 | **Shared data-viz layer.** Wrap charts (funnel, weekly applied vs interviews, response rate) with one `StatCard` primitive (icon tint, sparkline, trend delta). Use same `computeStats` hook but with `useSWR` caching + 30s dedupe (fixes G5.1 N-query churn). |
| B4 | **State primitives.** New `src/components/ui/EmptyState.tsx`, `SkeletonCard.tsx`, `ErrorPanel.tsx` — used in `/discover`, `/pipeline`, `/library/*` instead of bespoke `WifiOff` panels. |
| B5 | **Motion budget.** Gate `framer-motion` behind `prefers-reduced-motion`; remove `whileHover x:3` on nav, keep motion for pipeline step transitions only. |

### Track C — Information Architecture & State Decomposition (Owner: `app-shell-architect`)
| Step | What |
|---|---|
| C1 | **Sidebar regroup → 5 items.** Implement nav config in `src/config/navigation.ts` with `primary`/`secondary` sections. Keep 11 routes mounted but demote to `secondary` (accessible via `More…` or `Cmd+K`). No breaking URL change — just visual grouping. |
| C2 | **Rename without breaking links.** Add Next.js `redirects` in `next.config.ts`: `/tracker → /pipeline`, `/jobs → /discover`. Old links still work. |
| C3 | **Decompose AppContext.** Split into 4 contexts: `PipelineContext` (jobs + kanban), `LibraryContext` (contacts/emails/interviews/reminders), `ProfileContext`, `AgentContext` (LLM chain + stats). Shared optimistic helpers move to `src/lib/persist/optimistic.ts`. Each context owns its API persistence — no god memo. |
| C4 | **Unified command palette.** `Cmd+K` opens palette (existing shortcut in `Sidebar.tsx:59` currently pushes to `/assistant`) → becomes `CommandPalette` with fuzzy search over jobs, contacts, resume docs, actions. Backed by `src/lib/search/commandIndex.ts`. |
| C5 | **Pipeline intake redesign.** `/discover` becomes single crawl form (keyword + region) + source chips + results; remove separate category select that duplicated source filtering. Single "Save to Pipeline" action moves card from Discover to Kanban with toast undo (`NotificationCenter` already supports). |

### Track D — Crawl → Pipeline Pipeline Telemetry (Owner: `crawl-pipeline-specialist`)
| Step | What |
|---|---|
| D1 | **Source model unification.** `CrawlerSource` already pulled from `/api/agent/sources` (`jobs/page.tsx:219`) — but type lives only in page file. Move to `src/types/crawler.ts` and share with API contract tests. |
| D2 | **Dedup contract hardening.** `dedupKey` (`src/lib/dedup.ts`) + `decisions` map (`jobs/page.tsx:93`) pruned at 500 — add UI affordance: "Skipped 12 duplicates from last run — clear?" instead of silent filter. |
| D3 | **Crawl → Pipeline trace.** Persist `crawl_run` row linking `sourceResults → jobs` so `Pipeline` card can show provenance chip: "via RemoteOK · crawl 8f2e… · 2h ago". |

### Track E — Agent Orchestration Refactor (Owner: `agent-orchestrator-specialist`)
| Step | What |
|---|---|
| E1 | **Make graph state visible.** Extend `streamMultiAgentApp` (`multiAgentAppGraph.ts:483`) SSE events (`node_start`/`node_finish`/`interrupt`/`complete`) to a `PipelineVisualizer` component (horizontal lane per parallel branch, live badges). `AgentPage`'s static `PIPELINE` array (`agent/page.tsx:39`) becomes live. |
| E2 | **Promote HITL inbox.** New `AgentInbox` surface (in `NotificationCenter` bell + dedicated `/pipeline?inbox`) lists interrupted runs (`autoApplyExecutionNode:306`) with Approve/Reject/EditPitch CTA. Uses `resumeMultiAgentApp` (`:541`) already implemented. |
| E3 | **Consolidate resume agent.** `resumeAgent.ts` tasks overlap with `multiAgentAppGraph` tailoring nodes — route all tailoring through `resumeAgent tailor` as the single keywording engine; multi-agent graph calls it instead of duplicating `extractJdTerms` heuristics. |
| E4 | **Vault-grounded tailoring loop.** In `resumeCVTailorNode` (`:162`) after skill extraction, call `vault/search` top-k and inject into pitch: "Grounded in chunk doc X §2." Makes vault useful without user remembering to click. |
| E5 | **Agent settings surface.** Expose `AgentBehaviorSettings` + LLM chain choice in Settings → Agent tab (today SettingsPage only shows vault + profile). Add per-agent concurrency cap UI, reusing `concurrency` already stored in `cloudinarySettings` (abuse) — move to proper `agent_settings` row. |

### Track F — Performance & Accessibility Polish (Owner: `perf-a11y-specialist`)
| Step | What |
|---|---|
| F1 | **SWR/caching for stats.** Replace ad-hoc `fetch('/api/data/stats')` in `AppContext:501` + `computeStats` in `db.ts` with `useSWR('/api/data/stats', {dedupingInterval: 30000})`. Invalidate explicitly on mutations, not on every render. |
| F2 | **LaTeX compile off main thread.** Move `compileWithSynctex` into a Next.js Route Handler worker boundary — don't block request thread 60s (`compileLatex.ts:53` timeout). Add abort signal. |
| F3 | **A11y sweep.** Keyboard trap audit: drawer focus lock (`JobDetailDrawer.tsx`), command palette, template gallery. Contrast check on `var(--dim)` text (today `paperDim: "#9ca7a1"` on `ink: "#0a0e13"` is ~6.8:1 ok, but `paperDim` on `inkCard` is ~5.1:1 — needs bump to `#a8b5b0`). |
| F4 | **Empty state onboarding.** When `applications.length === 0`, Pulse shows a 3-card starter: "Discover a role → Assess fit → Tailor & apply" with seeded demo job expanded — reuses `initialJobs`. One-click dismiss. |

---

## 7) Execution Order & Milestones

### Phase 0 — Scaffolding (1–2 days, no user-visible change)
- [ ] Add `src/config/navigation.ts`, token lint rule, `src/lib/pdf/texText.ts`, `src/lib/persist/optimistic.ts` shells.
- [ ] Add redirects in `next.config.ts`, introduce `NEXT_PUBLIC_RESUME_RENDERER` flag (default `latex` to keep green builds).
- [ ] Mark plan Approved and cut `feat/huntflow-streamline` branch.

### Phase 1 — De-risk the PDF (highest user pain) — Track A steps A1–A2 + F2
- [ ] Live `<iframe>` preview with debounce; verify `findEngine()` error now shows inline fallback CTA ("Use HTML export" vs "Install TeX").
- [ ] Deduplicate `texToText`.
- Verify: `vitest run src/lib/__tests__/resumeTemplates.test.ts` + manual print diff.

### Phase 2 — IA & Navigation (biggest clunk win) — Track C steps C1–C3 + B4
- [ ] 5-item nav regroup, `CommandPalette`, `AppContext` split (keep old import alias `useApp` shim to avoid massive churn).
- Verify: no URL breaks (visit `/tracker`, `/jobs` still land), keyboard nav passes.

### Phase 3 — Visual Grammar Unification — Track B + D1–D2
- [ ] `UniversalJobCard`, `StatCard`, `EmptyState` rollout across `/pipeline`, `/discover`, `/library`.
- Verify: screenshot diff before/after on key pages, light visual QA (`/visual-qa` skill).

### Phase 4 — Agent Visibility — Track E
- [ ] `PipelineVisualizer` + `AgentInbox` promotion.
- Verify: start a crawl + interrupt run + approve flow E2E; SSE streaming UI matches logs.

### Phase 5 — HTML renderer parity + polish — Tracks A3–A6 + F1,F3,F4
- [ ] React-PDF / WeasyPrint parity + template gallery + a11y + SWR caching.
- Verify: ATS score unchanged for sample resume before/after renderer swap; Lighthouse a11y 95+.

---

## 8) What We Are **Not** Doing in This Streamline

- No new data tables. `jobs.*` JSON columns already hold enough; adding columns for each subpanel would re-sprawl.
- No vector DB swap for vault (BM25 + local cosine is the deterministic fallback contract — keep it; vector DB is a future track).
- No auth rewrite. Profile stays local-first + SQLite `settings.profile` (`src/lib/db.ts:325`).
- No Scrapling rewrite. Keep Python sidecar boundary; just make its health and logs observable.

---

## 9) Risk & Rollback

| Risk | Mitigation | Rollback |
|---|---|---|
| Decomposing `AppContext` breaks 12 views at once | Keep `useApp()` shim that re-exports from 4 new contexts for 1 release; migrate views incrementally | Revert shim commit single PR, keep god context as fallback |
| Live PDF compile hammers `/api/resume/compile` | Debounce 800ms, cap `MAX_TEX:20000` check (`compile/route.ts:5`), cache last `token` in memory | Feature-flag off (`NEXT_PUBLIC_RESUME_RENDERER=latex`) restores old Export-only flow |
| IA rename confuses bookmarks | `next.config.ts` redirects preserve old routes; no DB migration | Keep both labels for one release (badge "formerly Tracker") |
| LangGraph visualizer exposes too much internal detail | Read-only view, no node mutation; reuse existing `MultiAgentStreamEvent` contract (`multiAgentAppGraph.ts:29`) | Collapse to single "Pipeline running" banner fallback |

---

## 10) Open Questions — Need Your Call Before Worker Starts

1.  **LaTeX disposition:** Keep LaTeX as optional "power export" behind a toggle, or sunset it entirely in favor of HTML→PDF? Plan defaults to *keep both* behind env flag (no forced migration).
2.  **Nav labels:** Proposed `/pipeline`, `/discover`, `/library` — do these resonate, or prefer `/tracker`→`/board`, `/jobs`→`/finder` naming you already teach users?
3.  **Vault/Interviews/Network merge:** Comfortable collapsing them into one `/library` with tabs, or do you want to keep one (e.g., `/vault`) as standalone?
4.  **Motion budget:** Ok to dial down sidebar/table motion per B5, or is the micro-motion part of brand?
5.  **Delivery shape:** Ship as single `feat/huntflow-streamline` gated by flags, or slice into 5 incremental PRs (PDF → IA → cards → agent viz → parity)? Plan is written for 5 PRs.

Reply with decisions (or "approve as-is, start with Phase 1") and I'll mark the plan Approved and prep the worker branch.

---

## 11) Appendix — Files & Contracts Touched (for worker scoping)

**Highest churn:**
- `src/app/(app)/resume/page.tsx` (1300 LOC) — preview pivot, template gallery
- `src/context/AppContext.tsx` (1568 LOC) — split into 4 contexts, `src/lib/persist/optimistic.ts`
- `src/components/JobDetailView.tsx` (789 LOC) — unify drawer/page into `RoleWorkspace`
- `src/app/(app)/jobs/page.tsx` (599 LOC) — become `/discover`
- `src/components/Sidebar.tsx` (203 LOC) — 5-item nav
- `src/lib/pdf/*` (`resumeTemplates.ts`, `sanitize.ts`, `compileLatex.ts` 218 LOC) — dedupe + renderer parity
- `src/agents/multiAgentAppGraph.ts` (500+ LOC) — visualizer + resumeAgent consolidation
- `src/lib/db.ts` (1450+ LOC) — stats caching layer

**Contracts preserved:**
- `/api/resume/compile` POST `{tex}` → `{ok, token}`, GET `?token` → `application/pdf` (`compile/route.ts:7`)
- `/api/resume/render` POST `{templateId, content}` → `{tex}` (used live by studio)
- `MultiAgentStreamEvent` `kind: "node_start"|"node_finish"|"log"|"interrupt"|"complete"|"error"` (`multiAgentAppGraph.ts:29`)
- `AppContext` public methods (`addApplication`, `generateMatchAnalysis`, `triggerAutoApply`, etc.) — shimmed so existing `vitest` suites (`src/lib/__tests__/*`, `tests/adversarial/*`) stay green
- `BackupData` shape (`db.ts:1343`) — export/import untouched in Phase 0–2

**Requested skills for worker phase:**
- `frontend-design` (already installed) for B-track token/visual gallery work
- `next-version-compat` (this Next.js is breaking-change per `AGENTS.md:1` — worker must read `node_modules/next/dist/docs/`)
- `new-component` for every UI primitive in B-track (follow `forwardRef`, `cn()` conventions)
