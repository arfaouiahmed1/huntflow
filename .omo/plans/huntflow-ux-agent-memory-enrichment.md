# huntflow-ux-agent-memory-enrichment - Work Plan

## TL;DR (For humans)

**What you'll get:** A noticeably denser, evidence-rich Huntflow — every job/vault/resume view shows the hidden DB evidence, crawlers stream live per-board progress, the 11-node pipeline becomes truly agentic with web search + reasoning, and a short/long memory harness (no Redis) with window/state/compression keeps all agents in sync.

**Why this approach:** Keep your local-first SQLite + LangGraph + BM25 stack intact and layer agentic behavior, streaming, and memory on top — no infra migration, no hosted vector DB, no Redis sidecar. The plan upgrades RAG just enough to fit this app (query expansion + local rerank + eval), not an academic IR system.

**What it will NOT do:** No Redis, no Pinecone/hosted vector DB, no framework switch, no multi-tenant auth, no public binding change, no encrypted-at-rest change, no ATS guarantee. Existing 11-provider LLM router and TeX Live toolchain stay.

**Effort:** XL
**Risk:** Medium - touches DB/migrations, 11-node graph, vault RAG, and 6 UI surfaces; mitigated by deterministic BM25/memory ranking tests and standalone LaTeX tracing.
**Decisions I made for you:** No Redis (SQLite durable only, per your call); RAG = hybrid BM25 + local 256-d + RRF k60 + light query expansion + local rerank + chunk inspector + tiny eval set — fits app without new infra; 7 deterministic nodes → LLM+search agentic with PII rules as validator; live crawlers via SSE over polling; short TTL 7-30d per job/run + long 90d global with nightly summarizer — veto any at handoff.

Your next move: say `/start-work huntflow-ux-agent-memory-enrichment` to execute, or ask for high-accuracy re-review. Full execution detail follows below.

---

> TL;DR (machine): XL · Medium risk · 38 todos + 4 verifiers — RAG-live-agentic-memory harness without Redis

## Scope
### Must have
- C1 LIVE: `jobs/page.tsx` DiscoveryControl streams live per-board crawl progress (found/matched/error), runId timeline, concurrency gauge, screenshot thumbnails, source-select grid; fix dropped `runId` telemetry
- C1: Tracker/job drawer surfaces 8 hidden `jobs` cols (`employer_review`, `salary_intel`, `skills_gap`, `job_brief`, `fitCategory`, `multi_agent_outputs`, `screenshot_url`, `skip_reason`) with badges/timeline
- C1: Vault doc enrichment — stats already shown; add chunk inspector `GET /api/vault/chunks?docId`, RRF score breakdown, model/terms display; fix missing inspection
- C1.1: Profile vault link — inject vault hits into resume tailoring, fix fake 400ms save, add sync badge
- C2: User stories rewritten around Discover→Rank→Analyze→Prepare→Apply→Track→Learn with Gherkin, mapped to pages
- C3: LLM assists diffuse into tracker/vault/outreach/assistant + AbortController cancellation
- C3-AGENTIC: 7 deterministic nodes (regionalNorms/piiSanitizer/resumeCVTailor/letterTailor/interviewPrep/outreachEmail/atsAudit) become `callLLM JSON + sidecar /scrape search proxy + reasoning`
- C5-RAG fit-for-app: query expansion (2 rewrites) + hybrid BM25+vector per `distinctEmbedModels` + local rerank + citation viewer + eval harness (Recall@50/nDCG@10)
- C5: Short (per-job `job_id` + per-search `threadId` TTL 7-30d ephemerals) vs Long (global summarized `memory` + `memory_embeddings` cosine 0.12, accessible via `buildSharedContext` 8k)
- C5a: Window/state harness — `budgetFor`/`truncateHeadTail`/`truncateToTokens` sliding window + compressor node + `SqliteCheckpointSaver` continue via `Command` resume + checkpoint prune
- C4: LaTeX agentic loop `draft→compile→parse log→LLM patch→ATS audit→approve` with streamed diff + Synctex
- C6: Scrapling hardening, per-board health, background enrichment queue on crawl results
- C7: UI↔backend wiring sweep — audit 55 `/api` routes, add missing endpoints, fix offline/import hydration gaps
- C8: Security sweep — document plaintext `settings.value`, tighten import guard, per-doc embedding consent, path traversal guard
- C9: Green `lint && tsc --noEmit && test && build` + new deterministic tests + docs diagram (profile→vault→agent)

### Must NOT have (guardrails, anti-slop, scope boundaries)
- No Redis (per your call) — SQLite stays durable
- No Pinecone/Qdrant/hosted vector DB
- No LangGraph→other framework switch (stay 1.4.8)
- No multi-tenant auth/RBAC, no `127.0.0.1` exposure change
- No new provider billing — reuse 11-provider chain (`openrouter` gemini-2.5-flash default)
- No pages router / server actions — REST `/api/*` stays
- No at-rest encryption change (roadmap, not this plan)
- No guarantee of ATS outcome

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after + TDD for new pure fns (BM25, memory ranking, chunk inspect) — vitest `forks` pool, 60s timeout, per-worker temp DB via `HUNTFLOW_DB_PATH` in `vitest.setup.ts`
- Evidence: `.omo/evidence/ulw/<session>/huntflow-ux-agent-memory-enrichment/a<attempt>/task-<N>-*.log|png|json` (outside ulw-loop use `.omo/evidence/task-<N>-*.log`)
- Key commands: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` — all must pass; `npx vitest run src/lib/__tests__/vaultBm25.test.ts` for RAG determinism; `npx vitest run -t "relevantMemory"` for harness
- Manual QA uses Playwright headless to prove live crawl SSE, chunk inspect, agentic node logs

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.
- Wave 1 — Backend harness foundation (C5/C5a): migrations, `memory_embeddings`, short/long repos, `buildSharedContext v2`, checkpoint pruning
- Wave 2 — RAG fit-for-app + vault UI (C5-RAG/C1/C1.1): expansion+rerank+inspect + profile↔vault link
- Wave 3 — Live crawlers + UI density (C1 LIVE/C1/C7): SSE streaming, board cards, hidden job cols, bug fixes
- Wave 4 — Agentic upgrade + LLM diffusion (C3-AGENTIC/C3/C3.1): 7 nodes → agentic, mid-run refresh, diffusion into pages
- Wave 5 — LaTeX agentic loop + scraping hardening (C4/C6): compile→patch→audit loop + health+queue
- Wave 6 — Stories/security/tests/docs (C2/C8/C9): Gherkin stories, security notes, green gate, diagrams

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1-8 | — | 9-15 | each other |
| 9-15 | 1-8 | 16-22 | each other |
| 16-22 | 9-15 | 23-30 | each other |
| 23-30 | 16-22 | 31-38 | each other |
| 31-38 | 23-30 | F1-F4 | each other |
| F1-F4 | 1-38 | — | each other |

## Todos
> Implementation + Test = ONE todo. Never separate.

- [x] 1. Add `memory_embeddings` + TTL columns and idempotent migrations
  What to do / Must NOT do: Extend `src/lib/db.ts:migrate` with `memory_embeddings(id, memory_id FK, embedding TEXT, model TEXT)` + `ALTER TABLE memory ADD COLUMN expires_at TEXT, ADD COLUMN run_id TEXT`; wire `addColumn` checks; update `ALL_TABLES_IN_DELETION_ORDER`, `exportAllData`/`importAllData`, `vaultRepo` pattern; Must NOT require Redis or hosted vector DB
  Parallelization: Wave 1 | Blocked by: — | Blocks: 2,5,7
  References (executor has NO interview context - be exhaustive): src/lib/db.ts:157-172 memory DDL, :266-282 addColumn, :1264-1282 ALL_TABLES_IN_DELETION_ORDER, :1358-1444 backup/restore, :206-228 checkpoint DDL, src/lib/vault/embeddings.ts:11 LOCAL_DIMS 256
  Acceptance criteria (agent-executable): `npx tsc --noEmit` passes after migration; fresh DB `node -e "import('./src/lib/db.ts').then(m=>m.getDb())"` shows `PRAGMA table_info(memory)` contains `expires_at, run_id` and `memory_embeddings` exists; `npm test` still green
  QA scenarios (name the exact tool + invocation): happy `npx vitest run src/lib/__tests__/vaultBm25.test.ts` still passes; failure `DELETE FROM memory_embeddings` cascade must not drop `memory` rows (verify via sqlite)
  Commit: Y | feat(db): add memory_embeddings and TTL columns

- [x] 2. Implement short vs long memory repos (TTL-aware, jobId+runId scoped)
  What to do / Must NOT do: Extend `src/lib/db.ts:memoryRepo` with `addWithTTL`, `listShort({jobId,runId})`, `listLong`, `pruneExpired`, `embedFor(memoryId, embedding, model)`; implement `src/lib/agents/memory.ts` `rememberShort` (per-job and per-search run) + TTL 7-30d and `rememberLong` consolidator; Must NOT add Redis
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3,4,6
  References: src/lib/db.ts:742-800 memoryRepo, src/lib/agents/memory.ts:5-38 remember/rememberUnique, :54-80 relevantMemory, src/lib/agents/context.ts:59-68 memoryQuery
  Acceptance criteria: `rememberShort({jobId:'j1', runId:'r1'})` row has `expires_at` ≈ now+7d; `memoryRepo.list({jobId:'j1'})` returns it; `pruneExpired()` deletes expired only; unit test asserts
  QA scenarios: happy `npx vitest run -t "memory short/long"` passes; failure duplicate `rememberUnique` still dedups across normalized content
  Commit: Y | feat(memory): short vs long repos with TTL

- [x] 3. Build `buildSharedContext v2` with long-memory semantic ranking + TTL filter
  What to do / Must NOT do: Evolve `src/lib/agents/context.ts:buildSharedContext` to query both short (`jobIds+runId`) and long (`importance*6` + cosine on `memory_embeddings` via `cosine` from `vault/embeddings.ts:114`) filtered by `expires_at > now`; rank `jobScore 40+overlap*4+importance*6+globalDecision 3+recency`; truncate to `maxTokens 8000` via `truncateToTokens`; Must NOT mix `local` hash vs `openai` without model guard
  Parallelization: Wave 1 | Blocked by: 2 | Blocks: 15,19,23
  References: src/lib/agents/context.ts:45-124, src/lib/agents/memory.ts:54-80, src/lib/llm/tokens.ts:42 truncateHeadTail, src/lib/vault/embeddings.ts:114 cosine
  Acceptance criteria: With mixed short+long rows, `buildSharedContext({jobs:[open], profile})` returns 40 items where job-scoped short outranks expired; `npx vitest run -t "relevantMemory"` green
  QA scenarios: happy `tokens ≤8000` via `estimateTokens`; failure expired memory not returned after `pruneExpired`
  Commit: Y | feat(agents): sharedContext v2 with short/long

- [x] 4. Add context window manager (budgetFor + truncateHeadTail + sliding window) plus compressor node helper
  What to do / Must NOT do: Create `src/lib/agents/contextWindow.ts` exposing `fitToWindow(text, budgetKey) → {text, truncated}` using `budgetFor` from `llm/context.ts:27` + `truncateHeadTail`/`truncateToTokens`; add `compressContextIfNeeded` that calls `callLLM json:false` summarizer when `estimateTokens>maxPrompt*0.85`; wire used by orchestrator and multiAgent nodes; Must NOT invent new budget table — reuse 25 `GEN_BUDGETS`
  Parallelization: Wave 1 | Blocked by: 2 | Blocks: 19,23
  References: src/lib/llm/context.ts:6-29 GEN_BUDGETS, :27 budgetFor, src/lib/llm/tokens.ts:5-50, src/lib/llm/router.ts:149 callLLM, src/agents/orchestrator.ts:60 route prompt
  Acceptance criteria: `apply` pitch budget stays 4k/500; summarizer test stubs LLM fallback to deterministic head/tail
  QA scenarios: happy `npx vitest run src/lib/__tests__/tokens.test.ts` if exists else manual token count; failure budgetFor unknown key falls back 12k/3k
  Commit: Y | feat(llm): window manager and compressor

- [x] 5. Add state compress/prune helpers for `SqliteCheckpointSaver` and `agent_run_history`
  What to do / Must NOT do: Extend `src/lib/agents/checkpointer.ts` with `pruneThread(threadId, keepLast=10)` + `summarizeCheckpoint(threadId)` that `put`-s a summary checkpoint; wire `memoryRepo.prune(500)` → TTL-aware `pruneExpired`; expose `continueFrom(threadId, Command)` alias; Must NOT drop retryPolicy `DEFAULT_RETRY_POLICY` at `multiAgentAppGraph.ts:378`
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 15
  References: src/lib/agents/checkpointer.ts:10-268, src/agents/multiAgentAppGraph.ts:378-382 retry, :541-563 resume, src/lib/db.ts:1489 agentRunHistoryRepo
  Acceptance criteria: After 12 `put`s, `pruneThread(keepLast=5)` leaves 5; `resumeMultiAgentApp(thread, {approved:true})` resumes from latest
  QA scenarios: happy `npx vitest run src/agents/__tests__/orchestrator.test.ts -t "checkpoint"`; failure mid-run profile reload not stale
  Commit: Y | feat(agents): checkpoint prune and continue

- [x] 6. Implement nightly long-memory consolidator (LLM summarizer, no Redis)
  What to do / Must NOT do: Add `src/lib/agents/consolidator.ts` `consolidateMemory({limit=100})` — groups per-job episodic `fact/insight` → `callLLM JSON` → writes single `rememberLong("decision", consolidated, importance:3)` + `embedFor` with model guard; schedule via `POST /api/memory/consolidate` (manual/7d cron stub, not actual cron infra); Must NOT require external queue
  Parallelization: Wave 1 | Blocked by: 2 | Blocks: 3
  References: src/lib/agents/memory.ts:21 rememberUnique, src/lib/llm/router.ts:149 callLLM, src/lib/vault/embeddings.ts:58 embedTexts, src/app/api/memory/route.ts:6
  Acceptance criteria: After 5 per-job facts, `consolidateMemory` creates one deduplicated long fact; `isMasked` round-trip still redacted
  QA scenarios: happy de-duplicate same content via normalized compare; failure no LLM → consolidator no-ops, does not delete source
  Commit: Y | feat(memory): long-memory consolidator

- [x] 7. Add `GET /api/vault/chunks?docId=` detail endpoint (chunk inspector backend)
  What to do / Must NOT do: New route `src/app/api/vault/chunks/route.ts` returns `chunksFor(docId)` with `idx/content/tokens/embedding.length` plus doc's `embedModel`; guard SSRF/path traversal none (docId is UUID TEXT PK); Must NOT expose raw embedding vectors beyond length
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 11
  References: src/lib/db.ts:929 chunksFor, :857 rowToVaultChunk, src/app/api/vault/route.ts:5-62, src/lib/db.ts:258 idx_vault_chunks_doc_id
  Acceptance criteria: `curl "/api/vault/chunks?docId=<id>"` returns chunk array matching `vaultRepo.stats().chunks`; 404 for unknown
  QA scenarios: happy `npx vitest run tests -t "vault chunks"`; failure missing docId → 400
  Commit: Y | feat(vault): chunk detail endpoint

- [x] 8. Extend export/import to include `memory_embeddings` and TTL state
  What to do / Must NOT do: Update `exportAllData`/`importAllData` in `src/lib/db.ts:1358-1437` to persist `memory_embeddings` inside same `BEGIN`/`COMMIT` txn; include in `GET /api/data/export` redacted stream; Must NOT break existing `ALL_TABLES_IN_DELETION_ORDER` txn
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 38
  References: src/lib/db.ts:1264-1282, :1376-1464 importAllData, src/app/api/data/export/route.ts, src/app/api/data/import/route.ts
  Acceptance criteria: `exportAllData()` round-trips via `importAllData()` with memory embeddings preserved; `npm test` passes
  QA scenarios: happy import with 10k chunks under 100k cap; failure malformed backup → ROLLBACK, no partial wipe
  Commit: Y | feat(db): backup embeddings

- [x] 9. Upgrade RAG to fit-for-app (query expansion + hybrid per model + local rerank)
  What to do / Must NOT do: Evolve `src/lib/vault/index.ts:searchVault` — expand query via `callLLM json:true` 2 rewrites (fallback to original when no provider), then per `distinctEmbedModels` groups: BM25 + cosine `threshold 0.12` + `RRF_K 60` fusion L136, add lightweight local reranker pass (term overlap boost) before slicing `k`; preserve 700/90 chunk contract; Must NOT require Pinecone
  Parallelization: Wave 2 | Blocked by: 1-4 | Blocks: 10,11
  References: src/lib/vault/index.ts:95-175, :24-75 ingestDocument, src/lib/vault/chunk.ts:8-9, src/lib/vault/bm25.ts:28, src/lib/vault/embeddings.ts:11, docs/RAG-AND-DOCUMENT-VAULT.md
  Acceptance criteria: `searchVault("LangGraph production")` with stub LLM returns ranked hits with `strategy hybrid` and `matchedTerms`; local fallback still deterministic
  QA scenarios: happy `npx vitest run src/lib/__tests__/vaultBm25.test.ts` green; failure no provider → no expansion, still returns hybrid hits
  Commit: Y | feat(vault): fit-for-app expansion and rerank

- [x] 10. Wire vault RAG proactively into agent `sharedContext` (not on-demand only)
  What to do / Must NOT do: At `src/lib/agents/context.ts` inject top 3 vault hits per `relevantMemory` query into `## REMEMBERED` or new `## VAULT EVIDENCE` section (cite `docName#chunkIndex model`); `runAssistant` and `runMultiAgentApp` now pass `vaultHits` without agent needing `search_vault` tool; Must NOT exceed 8k truncation (fits via window manager)
  Parallelization: Wave 2 | Blocked by: 9 | Blocks: 19
  References: src/lib/agents/context.ts:45-124, src/agents/orchestrator.ts:157 executeTool search_vault, src/lib/vault/index.ts:95 searchVault, src/agents/multiAgentAppGraph.ts:79 companyIntelNode
  Acceptance criteria: With a vault doc "LangGraph in prod at ACME", `buildSharedContext` with `targetTitle LangGraph` includes `## VAULT EVIDENCE` citing that doc
  QA scenarios: happy citation present; failure no docs → section says "No vault evidence"
  Commit: Y | feat(agents): proactive vault in context

- [x] 11. Build vault chunk inspector UI (fix missing implementation)
  What to do / Must NOT do: In `src/app/(app)/vault/page.tsx:670-860` add per-doc "Inspect chunks" drawer calling `GET /api/vault/chunks?docId`, table `idx | tokens | model | content slice 0..300` + RRF score when searched; reuse `cn()` + semantic tokens; Must NOT expose full embeddings
  Parallelization: Wave 2 | Blocked by: 7,9 | Blocks: 12
  References: src/app/(app)/vault/page.tsx:88-865, src/components/ui/Button.tsx, src/lib/utils.ts cn, docs/RAG-AND-DOCUMENT-VAULT.md
  Acceptance criteria: Click Inspect → fetch chunks, shows token counts and model; Playwright proves drawer opens; lint + tsc pass
  QA scenarios: happy 3 chunks shown; failure doc with 0 chunks → empty state `No chunks yet`
  Commit: Y | feat(vault-ui): chunk inspector

- [x] 12. Build RAG citation viewer + per-hit score breakdown
  What to do / Must NOT do: Upgrade `vault/page.tsx:777-825` hits map to show `semanticRank/lexicalRank`, `semanticScore/lexicalScore`, `rrfScore` badges, `model` + `strategy` filter chips, matchedTerms pills already L810; add "Cite" copy button; Must NOT claim ATS guarantee
  Parallelization: Wave 2 | Blocked by: 9,11 | Blocks: —
  References: src/app/(app)/vault/page.tsx:777-825, src/lib/vault/index.ts:146-174 hit shape, docs/RAG-AND-DOCUMENT-VAULT.md:28-35
  Acceptance criteria: After search, each hit shows Lexical # / Vector # and strategy chip matching `retrieval.strategy`
  QA scenarios: happy vector # present when provider key set; failure threshold 0.12 yields no vector hits → lexical only, still shown
  Commit: Y | feat(vault-ui): citation breakdown

- [x] 13. Link profile↔vault (inject vault evidence into resume tailoring) + fix fake-save
  What to do / Must NOT do: In `src/app/(app)/vault/page.tsx:111-126 saveProfileInfo`, replace `setTimeout 400ms` fake-save with `await fetch("/api/data", …)` real error path + disable Save during pending; add `ProfileSyncBadge` "Agent source-of-truth ✓ last synced <time>" when `settingsRepo.get("profile")` matches form; in `src/agents/resumeAgent.ts` tailor path, pass `searchVault(profile.targetTitle+topSkills 3, k=3)` hits as evidence to `callLLM`; expose `autoLabel` edit inline; Must NOT send vault text externally unless embedding provider configured
  Parallelization: Wave 2 | Blocked by: 3 | Blocks: 27
  References: src/app/(app)/vault/page.tsx:111-126, src/context/AppContext.tsx updateProfile, src/agents/resumeAgent.ts, src/lib/vault/index.ts:95, src/app/(app)/vault/page.tsx:71 autoLabel
  Acceptance criteria: Save fails offline → error toast, Save stays enabled after; `resumeAgent` tailor prompt includes vault citation when doc exists
  QA scenarios: happy online save shows Synced badge; failure offline shows error, no navigation loss
  Commit: Y | feat(vault): profile link and real save

- [x] 14. Seed tiny deterministic RAG eval set (fits app)
  What to do / Must NOT do: Add `src/lib/__tests__/vaultEval.test.ts` with 20 synthetic docs + 10 queries asserting `Recall@5 ≥ 0.8` and `MRR ≥ 0.6` on the deterministic local embed+BM25+RRF path; seed fixture, no network; Must NOT mock ranking
  Parallelization: Wave 2 | Blocked by: 9 | Blocks: 37
  References: src/lib/vault/bm25.ts, src/lib/vault/embeddings.ts:114, src/lib/vault/index.ts:136 RRF_K 60, docs/INTELLIGENCE-PRINCIPLES.md evaluation roadmap
  Acceptance criteria: `npx vitest run src/lib/__tests__/vaultEval.test.ts` passes locally and in CI
  QA scenarios: happy seeded docs retrieved by exact terms; failure random query returns no hits without crash
  Commit: Y | test(vault): eval set

- [x] 15. Fix agents' mid-run staleness (refresh profile + preserve context across HITL)
  What to do / Must NOT do: At `src/agents/multiAgentAppGraph.ts` each node preamble `loadFreshProfile = JSON.parse(settingsRepo.get("profile")!)` before using `state.profile`; propagate refreshed `profile` via returned state; after `interrupt` resume at `resumeMultiAgentApp L541`, rebuild `sharedContext` so resumed `autoApplyExecutionNode L302` sees fresh `atsScore`/`pitch`; Must NOT break `interrupt` payload contract (`approved,submit,editedPitch`)
  Parallelization: Wave 2 | Blocked by: 3,5 | Blocks: 23
  References: src/agents/multiAgentAppGraph.ts:79-368 nodes, :302 interrupt, :541 resume, src/lib/db.ts:681 settingsRepo, src/lib/agents/context.ts:45
  Acceptance criteria: Change `profile.name` mid-run before `atsAudit` → resumed node sees new name; manual test via `runPartialPipeline stopAfter=atsAudit`
  QA scenarios: happy resume with `editedPitch` flows to `executeApply`; failure `submit:false` → `manual_required` still, not `failed`
  Commit: Y | fix(agents): fresh profile across nodes

- [x] 16. Stream live crawler SSE backend (`GET /api/crawl/stream` + `GET /api/agent/activity` fix)
  What to do / Must NOT do: Add `src/app/api/crawl/stream/route.ts` SSE that proxies `scrapling-agent/server.py:1073 /activity?since=` and `server.py:835 crawl` `sourceResults`; forward as `event: board_update`/`log` frames; fix `jobs/page.tsx:138 crawl` dropped `runId` by binding `lastCrawl.runId` to SSE session; Must NOT open to public — reuse sidecar token guard `agentClient.ts:10-17`
  Parallelization: Wave 3 | Blocked by: — | Blocks: 17
  References: src/app/api/crawl/route.ts:98-238, src/lib/agentClient.ts, scrapling-agent/server.py:77 record, :714 crawl, :1073 activity, src/app/(app)/jobs/page.tsx:138-182
  Acceptance criteria: `curl -N /api/crawl/stream` yields `board_update` events during a crawl run; SSE closed cleanly on abort
  QA scenarios: happy offline sidecar → stream sends `offline` event, not crash; failure `HUNTFLOW_AGENT_TOKEN` missing → stream still works in local dev
  Commit: Y | feat(crawl): live SSE stream

- [x] 17. Build LIVE board-card UI (replace poll, show per-board progress)
  What to do / Must NOT do: Evolve `src/app/(app)/jobs/page.tsx:398-529` `visibleSources` grid + `lastCrawl` section into streaming `BoardLiveGrid` component (`src/components/crawler/BoardLiveCard.tsx` new, follows `cn()`+`forwardRef`+`lucide` per `src/components/ui/*`) showing per `CrawlSourceResult` status found/matched/error + concurrency gauge `validation.ts:214 max16` + screenshot thumbs from `server.py:181 shot()`; consume SSE from 16; Must NOT remount deck on each event
  Parallelization: Wave 3 | Blocked by: 16 | Blocks: 22
  References: src/app/(app)/jobs/page.tsx, src/components/crawler/JobSwipeDeck.tsx, src/components/crawler/JobMatrixView.tsx, src/lib/utils.ts cn
  Acceptance criteria: During crawl, per-board cards flip `running→success|failed` live, no poll `setInterval`; Playwright records timeline
  QA scenarios: happy 3 boards success; failure one board fails → card shows `!` and error line-clamp, others still stream
  Commit: Y | feat(jobs-ui): live board grid

- [x] 18. Surface hidden job cols in tracker/drawer (fix UI↔DB disconnect)
  What to do / Must NOT do: Upgrade `src/app/(app)/tracker/page.tsx`, `src/components/JobDetailDrawer.tsx`, `JobSwipeDeck` cards to render `employer_review` (verdict), `salary_intel` disclosed vs estimated split, `skills_gap` matched/missing, `job_brief`, `fitCategory` badge, `auto_apply_logs` timeline, `multi_agent_outputs` chips, proof `screenshot_url`/`cloudinary_url`, `skip_reason`; Must NOT hardcode hex — use semantic tokens
  Parallelization: Wave 3 | Blocked by: — | Blocks: 22
  References: src/lib/db.ts:47-81 jobs cols, src/app/(app)/tracker/page.tsx, src/components/JobDetailDrawer.tsx, src/components/crawler/JobSwipeDeck.tsx
  Acceptance criteria: A job with `employer_review` + `salary_intel` populated shows both badges in drawer; Playwright screenshot diff baseline
  QA scenarios: happy drawer shows timeline; failure job with no employerReview → section hidden, no empty card
  Commit: Y | feat(tracker): surface hidden job evidence

- [x] 19. Add tracker inline "Explain fit" LLM assist + vault cite
  What to do / Must NOT do: In `tracker` drawer add "Explain fit" button calling `POST /api/generate` `type=match_analysis` with `budgetFor("match_analysis" 10k/2k)` + `cleanSkillsGap` sanitizer + vault top hits injected; streams via `assistant` `MAX_ITERATIONS 3` guard; Must NOT invent pipeline facts (reuse `sanitize.ts:ASSISTANT_TOOLS` discipline)
  Parallelization: Wave 3 | Blocked by: 4,10 | Blocks: —
  References: src/app/api/generate/route.ts:58-211 fallback `matchFallback`, src/lib/llm/context.ts:6-29, src/lib/llm/sanitize.ts:270 ASSISTANT_TOOLS, src/agents/orchestrator.ts:108
  Acceptance criteria: Click Explain → streaming explanation includes citation `docName#chunk`; offline fallback shows deterministic `matchFallback`
  QA scenarios: happy LLM returns fit% badge; failure LLM error → fallback `matchFallback` still renders
  Commit: Y | feat(tracker): explain fit assist

- [x] 20. Fix AbortController cancellation on assistant streaming
  What to do / Must NOT do: In `src/app/(app)/assistant/page.tsx` wire `AbortController` to `runAssistantStream` fetch (`src/app/api/assistant/route.ts:36 SSE`) and abort on unmount/tab switch + on new submit; Must NOT leak in-flight SSE
  Parallelization: Wave 3 | Blocked by: — | Blocks: —
  References: src/app/(app)/assistant/page.tsx, src/app/api/assistant/route.ts:36-114, src/lib/llm/stream.ts:42 generateTextStream
  Acceptance criteria: Switching tabs during stream aborts prior fetch (Network panel shows cancelled); new prompt starts clean
  QA scenarios: happy stream completes; failure abort during compose → no orphan `tool_call` state
  Commit: Y | fix(assistant): abortable stream

- [x] 21. Fix AppContext hydration after import + offline retry path
  What to do / Must NOT do: In `src/context/AppContext.tsx` after `POST /api/data/import` re-fetch `GET /api/data` + `GET /api/vault`; in `jobs/page.tsx:382 retry` extend to ping `GET /api/vault` and llm `POST /api/llm/test` cheap probe before marking `offline=false`; Must NOT require reload
  Parallelization: Wave 3 | Blocked by: — | Blocks: —
  References: src/context/AppContext.tsx, src/app/(app)/jobs/page.tsx:382-396 retry, src/app/api/data/import/route.ts
  Acceptance criteria: Import backup → UI reflects new jobs without reload; offline→retry with sidecar up clears both health panels
  QA scenarios: happy import path; failure sidecar down → retry stays offline with hint `OFFLINE_HINT` L59
  Commit: Y | fix(app): hydration after import

- [x] 22. Sweep UI-backend missing endpoints + error toasts
  What to do / Must NOT do: Audit 55 routes (`src/app/api/**/route.ts`) vs UI call sites, add any missing `GET /api/data/stats` surface already at `db.ts:computeStats` + hide empty states; wire all catch blocks to `useToast error()` with derived message (not silent `/* offline */` at `vault/page.tsx:136`); Must NOT add raw `console.error` as user feedback
  Parallelization: Wave 3 | Blocked by: 16-18 | Blocks: 37
  References: src/app/api/**/route.ts (55), src/app/(app)/**/page.tsx, src/components/ui/Toaster.tsx
  Acceptance criteria: Grep shows zero `/* offline */` silent swallows left; `npx tsc --noEmit` clean
  QA scenarios: happy deploys health banner when fetch 500; failure 413 `25MB` upload → toast `up to 25 MB`
  Commit: Y | fix(ui): backend wiring sweep

- [x] 23. Make `regionalNorms` agentic (internet search + LLM reasoning, not lookup)
  What to do / Must NOT do: Replace `executeRegionalNormsTool` determinism at `tools/multiAgentTools.ts:150-160` with `callLLM JSON + sidecar /scrape` web search "resume norms for {region} 2025" + `getRegionalRules` as validator; `regionalNormsNode L117` now returns LLM-ruled template with citations; Keep `REGIONS 11` list at `regionalNorms.ts:29`
  Parallelization: Wave 4 | Blocked by: 4,15 | Blocks: 29
  References: src/lib/agents/tools/multiAgentTools.ts:150, src/lib/agents/regionalNorms.ts, src/agents/multiAgentAppGraph.ts:117
  Acceptance criteria: For `region=DE`, node log shows `search + LLM` not just `loading standards`; fallback to deterministic when no LLM
  QA scenarios: happy offline fallback still returns `rules.name`; failure search 404 → LLM still produces with disclaimer
  Commit: Y | feat(agents): regionalNorms agentic

- [x] 24. Make `piiSanitizer` agentic (LLM reasoning + regex guard, not regex only)
  What to do / Must NOT do: Evolve `executePiiSanitizerTool L162-174` — LLM proposes redactions on `sensitiveContent` (summary/phone/DOB etc L136-146), regex guard `SSN \d3-\d2-\d4 + DOB` stays as enforce layer before returning `hasRedactions`; `piiSanitizerNode L132` logs LLM reasoning; Must NOT log raw PII at `info` level
  Parallelization: Wave 4 | Blocked by: 4 | Blocks: 29
  References: src/lib/agents/tools/multiAgentTools.ts:162, src/agents/multiAgentAppGraph.ts:132-160, src/lib/llm/sanitize.ts cleaners
  Acceptance criteria: Crafted profile with SSN pattern still flagged `hasRedactions:true` even when LLM misses
  QA scenarios: happy LLM flags restricted item; failure no LLM → regex still flags SSN/DOB
  Commit: Y | feat(agents): piiSanitizer agentic

- [x] 25. Make `resumeCVTailor` agentic (LLM + live JD tool, not keyword regex)
  What to do / Must NOT do: Replace `executeResumeCVTailorTool L176-189` `extractJdTerms` stub with `callLLM JSON` prompt that consumes JD + `userSkills` + vault hits from 10 + `cultureKeywords` from companyIntel; keep `extractJdTerms` as fallback; `resumeCVTailorNode L162` now logs LLM-matched skills with sources; Must respect region template via `executeRegionalNormsTool`
  Parallelization: Wave 4 | Blocked by: 23 | Blocks: 26-29
  References: src/lib/agents/tools/multiAgentTools.ts:176, src/agents/multiAgentAppGraph.ts:162-182, src/lib/agents/regionalNorms.ts
  Acceptance criteria: With LLM live, `matchingSkills` differ from regex baseline on same JD (more precise); `npx tsc --noEmit` clean
  QA scenarios: happy missingSkills surfaced; failure no LLM → regex fallback still returns skill arrays
  Commit: Y | feat(agents): resumeCVTailor agentic

- [x] 26. Make `letterTailor` + `interviewPrep` agentic (search-backed)
  What to do / Must NOT do: Evolve `executeLetterTailorTool L191-201` and `executeInterviewPrepTool L203-228` — LLM drafts `salutation/closing` per region + interview topics grounded in `companyResearch.sources` and JD; web search "STAR behavioral questions for {title} {company}" via sidecar; Must keep `kind=cover_letter` contract at `LetterTailorSchema L37-43`
  Parallelization: Wave 4 | Blocked by: 25 | Blocks: 29
  References: src/lib/agents/tools/multiAgentTools.ts:191, :203, src/agents/multiAgentAppGraph.ts:184-228, src/lib/prompts/multiAgentPrompts.ts outreachEmailPrompt style
  Acceptance criteria: `interviewPrepTopics` length 5-8 with at least one company-specific topic when research exists
  QA scenarios: happy tailors per region; failure no research → jd-derived topics still 3+
  Commit: Y | feat(agents): letter and interviewPrep agentic

- [x] 27. Make `outreachEmail` agentic (real upstream search + memory of prior outreach)
  What to do / Must NOT do: Evolve `executeOutreachEmailTool L367-386` — `callLLM` with `outreachEmailPrompt` + prior outreach snippets from `relevantMemory(source: outreach)` in `sharedContext`; include vault-derived voice; Must keep type `linkedin_connect|recruiter_followup|thank_you` enum
  Parallelization: Wave 4 | Blocked by: 3,25 | Blocks: 29
  References: src/lib/agents/tools/multiAgentTools.ts:367, src/lib/prompts/multiAgentPrompts.ts, src/lib/agents/memory.ts:60
  Acceptance criteria: With prior outreach memory, subject line differs from fresh run; proof via memory insert before invoke
  QA scenarios: happy prior memory cited; failure no prior → fallback `suggestedSubject` still returns
  Commit: Y | feat(agents): outreachEmail agentic

- [x] 28. Make `salaryIntel` + `atsAudit` legit agentic (search + LLM, was deterministic table)
  What to do / Must NOT do: Keep `executeSalaryIntelTool L230-365` LLM `salaryIntelPrompt` path already LLM — add web search "salary {title} {company} {location} glassdoor" via sidecar before LLM; `executeAtsAuditTool L388-402` — add LLM scoring (keyword density + parser compat) with deterministic `extractJdTerms` fallback; Must swap if low>high already at `sanitize.ts` salaryIntel guard
  Parallelization: Wave 4 | Blocked by: 4 | Blocks: 29
  References: src/lib/agents/tools/multiAgentTools.ts:230, :388, src/lib/agents/regionalNorms.ts auditRegionalCompliance, src/lib/llm/sanitize.ts cleaners
  Acceptance criteria: ATS score differs internet-backed vs offline fallback on same resume/JD; log shows search before score
  QA scenarios: happy regional salary fallback still for TN/EUR (28-45k TND etc L255); failure search 500 → LLM still scores
  Commit: Y | feat(agents): salary and ATS agentic

- [x] 29. Harden 11-node fan-in/fan-out and HITL resume freshness end-to-end
  What to do / Must NOT do: Verify `multiAgentAppGraph.ts:384-427` fan-out START→4, fan-in resumeCVTailor, fan-out ×3, fan-in atsAudit (4 sources) stays under `DEFAULT_RETRY_POLICY` except `autoApplyExecution` (no retry) — add test `npx vitest run src/agents/__tests__/multiAgent.test.ts` asserting 11 nodes still resolve; keep `orchestratorGate L370` terminal; Must NOT break `runPartialPipeline` prefix semantics L565-673
  Parallelization: Wave 4 | Blocked by: 23-28 | Blocks: 30,31
  References: src/agents/multiAgentAppGraph.ts:384-427, :565-673, src/lib/agents/checkpointer.ts
  Acceptance criteria: `runPartialPipeline stopAfter=atsAudit` returns up to atsAudit with all prior nodes done; streaming still 11 `node_finish` events
  QA scenarios: happy fan-out concurrency still 4 parallel; failure one branch retries 3 times before surfacing `failed`
  Commit: Y | fix(agents): graph integrity after agentic

- [x] 30. Wire LLM diffusion into tracker/vault reuse (not isolated `/api/generate`)
  What to do / Must NOT do: Replace isolated `POST /api/generate` calls on tracker/vault with inline assists that call orchestrator's `callLLM` + `sharedContext v2` + vault hits (todo 10); keep `/api/generate` for global types but tracker path no longer duplicates budget logic; Must keep `isMasked` key restore path (`POST /api/data/[collection]` restoresProviderKeys)
  Parallelization: Wave 4 | Blocked by: 4,10 | Blocks: —
  References: src/app/api/generate/route.ts:58-211, src/app/(app)/tracker/page.tsx, src/lib/llm/context.ts:6, src/lib/masking.ts
  Acceptance criteria: Tracker ExplainFit no longer hits `matchFallback` when provider configured; `redactSettings` still masks keys
  QA scenarios: happy streaming citations; failure no provider → deterministic fallback still renders via `generate` helper
  Commit: Y | refactor(llm): diffusion wiring

- [x] 31. Build LaTeX agentic loop (`draft→compile→parse log→LLM patch→ATS audit→approve`)
  What to do / Must NOT do: Enhance `src/agents/resumeAgent.ts` + new `src/app/api/resume/agent-loop/route.ts` — LLM drafts `.tex` via `resumeAgentPrompts` → `POST /api/resume/compile` → parse `latexmk` log (capture not discard) → `callLLM` patches tex → loop max 3 → `POST /api/resume/ats` gate → SSE `event: latex_log|patch|ats_score` streaming; Must preserve standalone tracing `next.config.ts:11 outputFileTracingIncludes /api/resume/* → src/lib/pdf/templates/*.tex` and `serverExternalPackages pdf-parse`
  Parallelization: Wave 5 | Blocked by: 29 | Blocks: 32
  References: src/agents/resumeAgent.ts, src/lib/prompts/resumeAgentPrompts.ts, src/app/api/resume/compile/route.ts, docs/RESUME-ENGINE.md, next.config.ts:11
  Acceptance criteria: Crafted bad tex → loop shows `latex_log` error + `patch` event + retry succeeds; `docker compose up --build` still bakes texlive
  QA scenarios: happy bad tex healed in 1 patch; failure 3 patches still fail → surfaced as `compile_error` with log
  Commit: Y | feat(resume): latex agentic loop

- [x] 32. Add resume diff preview + Synctex-aware viewer
  What to do / Must NOT do: Extend `src/app/(app)/resume/page.tsx` + `src/components/resume/*` with diff `before↔after tex` (monospace, `cn()` tokens) and A4 structure preview that highlights changed block; wire `POST /api/resume/synctex/forward|reverse` already at `src/app/api/resume/synctex/*` to CTA "Jump in preview"; Must still label browser preview as "structure preview" per README
  Parallelization: Wave 5 | Blocked by: 31 | Blocks: —
  References: src/app/(app)/resume/page.tsx, src/app/api/resume/synctex/**, src/lib/pdf/templates/*.tex
  Acceptance criteria: After LLM patch, diff shows `+`/`-` lines and preview scrolls to patch line via Synctex
  QA scenarios: happy no diff when no patch; failure malformed synctex → preview still renders without jump
  Commit: Y | feat(resume-ui): diff and synctex

- [x] 33. Harden scrapling sidecar (health, concurrency, selector healing stub)
  What to do / Must NOT do: Extend `scrapling-agent/server.py` `GET /health` detail + `POST /agent/config` concurrency guard `max(1,min(...,16))` already L257 — expose per-board `enabledByDefault` toggle from `sources.json:1-205` + stub `POST /agent/heal-selectors` that logs selector drift (no auto-write to `sources.json` yet, just report); update `src/app/api/agent/config` proxy; Must keep `require_token` gate when `HUNTFLOW_AGENT_TOKEN` set
  Parallelization: Wave 5 | Blocked by: — | Blocks: 17
  References: scrapling-agent/server.py:31-42 AgentConfig, :215 require_token, :455 sources, src/app/api/agent/config/route.ts, scrapling-agent/sources.json
  Acceptance criteria: `POST /agent/config {"max_concurrency": 8}` persists; `GET /health` shows Fetcher/DynamicFetcher ok
  QA scenarios: happy concurrency 16 clamped; failure invalid token → 401
  Commit: Y | feat(agent): health and concurrency

- [x] 34. Add background enrichment queue on crawl results (company+salary+fit prefetch)
  What to do / Must NOT do: In `src/app/api/crawl/route.ts:14-238` after dedup `dedupKey` + `existingKeys`, enqueue fire-and-forget `matchFallback` + `executeCompanyIntelTool(silent)` for first 10 fresh jobs limited by `cloudinary_settings.concurrency 1-16`; write results back to `jobs` stub (`source` + `matchScore` only, not full apply) capped under 30; Must NOT block crawl response (enqueue, return `count` immediately)
  Parallelization: Wave 5 | Blocked by: 34? actually depends on 33 | Blocks: 18
  References: src/app/api/crawl/route.ts:197 matchFallback, src/lib/dedup.ts dedupKey, src/lib/agents/tools/multiAgentTools.ts:103
  Acceptance criteria: Crawl of 10 returns `count 10` within 150s timeout (`crawl/route.ts:144 fwd timeout 150s`) and within 5s after crawl, `jobsRepo` stubs have `matchScore` populated
  QA scenarios: happy offline agent → crawl still returns raw jobs with fallback scores; failure queue overflow → still returns crawl, queue logs error in `usage_log`
  Commit: Y | feat(crawl): enrichment queue

- [x] 35. Rewrite user stories around Discover→Rank→Analyze→Prepare→Apply→Track→Learn (Gherkin)
  What to do / Must NOT do: Rewrite `docs/PRODUCT.md` demo narrative + `docs/INTELLIGENCE-PRINCIPLES.md` loop `Discover→Learn` and `docs/ARCHITECTURE.md:10` multi-agent § to Gherkin `Given/When/Then` per route (`/jobs` source-select → crawl live → deck/matrix review → Save → tailor → ATS; `/vault` ingest→inspect→search; `/resume` draft→compile→synctex; `/agent` multi-agent with HITL), map each to `src/app/(app)/*/page.tsx`; Must keep single-user local-first framing per AGENTS.md
  Parallelization: Wave 6 | Blocked by: 11-13 | Blocks: 39
  References: docs/PRODUCT.md, docs/INTELLIGENCE-PRINCIPLES.md, docs/ARCHITECTURE.md, src/app/(app)/**/page.tsx
  Acceptance criteria: Docs show 8+ Gherkin scenarios, each references real page path; `AGENT-OPERATIONS.md` discovery vs apply still accurate
  QA scenarios: happy story "Crawler live" has Then per-board card visible; failure story lists explicit non-goal "no mobile PWA"
  Commit: Y | docs(stories): gherkin

- [x] 36. Security notes and guards (no infra change, docs + light code)
  What to do / Must NOT do: Add `docs/TRUST-BOUNDARIES.md` note: plaintext `settings.value` still + roadmap; in `src/app/api/data/import/route.ts:47` tighten `app=="huntflow"` to also check `counts` caps (already 100k) + log `agentRunHistory`; in `src/app/api/agent/screenshot/[...path]/route.ts:*` add path `isInside .agent_runs/` guard (no-follow open already scaffold requires, but verify runtime); embed consent UI at `vault/page.tsx:753` already says "Text sent only when you configure provider" — add per-doc toggle `embedModel local|openai` stored in `vault_docs.embed_model`; keep SSRF guard `scrape/route.ts:12-60` untouched; Must NOT add new secret store
  Parallelization: Wave 6 | Blocked by: 22 | Blocks: 37
  References: docs/TRUST-BOUNDARIES.md, src/app/api/data/import/route.ts:47, src/app/api/agent/screenshot/[...path]/route.ts, src/app/api/vault/route.ts, src/lib/masking.ts
  Acceptance criteria: Screenshot path `../../etc/passwd` → 400; per-doc embed toggle persists; `npm run lint` clean
  QA scenarios: happy screenshot inside dir → 200; failure traversal → 400
  Commit: Y | docs(security): notes and guards

- [x] 37. Sweep and prove UI-backend wiring + accessibility polish
  What to do / Must NOT do: Final sweep of `jobs/page.tsx` live grid, `vault` inspect, `resume` loop, `assistant` abort, `tracker` drawer, `agent` HITL review — fix remaining catch swallows (`/* offline */`) to `useToast`, add keyboard nav to `BoardLiveCard`; Must follow `src/components/ui/*` forwardRef+cn+lucide + `disable-model-invocation` skills `new-component`
  Parallelization: Wave 6 | Blocked by: 16-22 | Blocks: 38
  References: src/components/ui/*, .claude/skills/new-component/SKILL.md
  Acceptance criteria: No silent catch left via `grep -n "catch {" src/app -R`; tab order reaches every interactive
  QA scenarios: happy axe passes basic; failure offline still shows hint `cd scrapling-agent && …`
  Commit: Y | fix(a11y): wiring polish

- [x] 38. Green gate: green the trunk (`lint && typecheck && test && build`) and prove determinism
  What to do / Must NOT do: Run `npm run lint` (next/core-web-vitals+typescript), `npx tsc --noEmit`, `npm test` (forks pool 60s, temp DB per worker), `npm run build` (standalone, `outputFileTracingIncludes`); fix any regressions introduced by 31 prior todos; Must NOT mock BM25 ranking in deterministic tests
  Parallelization: Wave 6 | Blocked by: 1-37 | Blocks: F1
  References: package.json:13 lint, vitest.config.ts forks/timeout, vitest.setup.ts temp DB, next.config.ts:4 standalone, ci.yml gate order
  Acceptance criteria: All four commands exit 0; `npm test` shows >600 tests green including `vaultBm25` + `vaultEval`
  QA scenarios: happy clean trunk; failure build with no TeX → resume loop still fails open with log
  Commit: Y | chore(qa): green gate

- [x] 39. Update architecture docs with profile→vault→agent→memory harness diagram
  What to do / Must NOT do: Extend `docs/ARCHITECTURE.md` (mermaid flow `UI→API→DB→LangGraph→Vault→RAG→RRF` + new `Profile→Vault Hits→SharedContext→11-node→Memory Long` lane), `docs/RAG-AND-DOCUMENT-VAULT.md` (§15-35 ingest + retrieval + rerank), `docs/AGENT-OPERATIONS.md` (selector healing stub), `docs/RESUME-ENGINE.md` (LaTeX loop); Must keep docs synchronized with code at `src/lib/db.ts` schema
  Parallelization: Wave 6 | Blocked by: 35 | Blocks: 38
  References: docs/ARCHITECTURE.md, docs/RAG-AND-DOCUMENT-VAULT.md, docs/RESUME-ENGINE.md, docs/AGENT-OPERATIONS.md
  Acceptance criteria: Docs mermaid renders and path:lines cited are still correct after code diff
  QA scenarios: happy diagram matches actual fan-out `START→4 → resumeCVTailor →3 → atsAudit 4 → autoApply`;
  Commit: Y | docs(arch): harness diagram

- [x] 40. Add deterministic tests for memory ranking + vault hybrid (the trunk's proof)
  What to do / Must NOT do: Add `src/lib/__tests__/memoryRanking.test.ts` asserting `jobScore 40+overlap*4+importance*6` ordering and TTL filter, and extend `vaultBm25.test.ts` for hybrid RRF k60; Must NOT mock ranking — use seeded docs
  Parallelization: Wave 6 | Blocked by: 2,9 | Blocks: 38
  References: src/lib/agents/memory.ts:70, src/lib/__tests__/vaultBm25.test.ts, vitest.config.ts
  Acceptance criteria: Both suites pass headless and under `HUNTFLOW_DB_PATH` temp isolation
  QA scenarios: happy seeded ordering stable across runs; failure empty query returns fallback `globalDecisionScore` only when jobId absent
  Commit: Y | test(memory,vault): ranking determinism

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [x] F1. Plan compliance audit
- [x] F2. Code quality review
- [x] F3. Real manual QA
- [x] F4. Scope fidelity

## Commit strategy
- Conventional commits per todo; squashed wave commits in trunk: `feat(db): …` wave1, `feat(vault): …` wave2, `feat(jobs-ui): …` wave3, `feat(agents): …` wave4, `feat(resume): …` wave5, `docs+fix: …` wave6
- No force-push to default branch until F1-F4 all `APPROVE`; tag `harness-v1` after green gate

## Success criteria
- [ ] LIVE crawlers stream per-board `found/matched/error` + screenshots without polling dro; `npm run lint && npx tsc --noEmit && npm test && npm run build` green
- [ ] Vault inspector shows chunks + RRF breakdown; `searchVault` + hybrid rerank + eval `Recall@50 ≥0.8` on seeded fixture
- [ ] 7 formerly deterministic nodes now show LLM+search reasoning logs before falling back to regex; `runPartialPipeline` and `resumeMultiAgentApp` still fan-in correctly
- [ ] LaTeX loop heals a malformed tex in ≤3 patches with streamed `latex_log`/`ats_score` events; preview diff + Synctex jump work
- [ ] Short memory (job_id+runId TTL) and long memory (consolidator) both surface via `buildSharedContext 8k` to every agent; docs diagram matches code
- [ ] Hidden job cols surfaced, wiring sweep has no silent catches, security notes + screenshot traversal 400, docs Gherkin stories map to pages

