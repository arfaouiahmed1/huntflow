# HuntFlow Intelligence Principles

HuntFlow is a data-driven CareerOS that discovers opportunities, ranks them, helps execute applications, and learns from outcomes.

Its governing rule is:

> LLMs explain, generate, and reason. Deterministic systems measure. Ranking models prioritize. Outcome data tells us whether the system works.

## Product loop — Discover→Rank→Analyze→Prepare→Apply→Track→Learn (Gherkin)

Single-user, local-first framing: all state lives in local SQLite (`HUNTFLOW_DATA_DIR/huntflow.db`, WAL + FK), no hosted multi-tenant surface, provider egress only when the user configures and invokes an external model or the Scrapling sidecar on `127.0.0.1:8001`.

```text
Discover → Rank → Analyze → Prepare → Apply → Track → Learn
    ↑                                                      │
    └────────────── outcome data improves ranking ──────────┘
```

The feedback arrow is a product requirement, not decorative analytics. Recommendations should eventually be tested against response, interview, and offer outcomes. Each stage maps to a real page path and is specified below as Gherkin so demo, implementation, and review share the same contract.

```gherkin
Feature: Product loop Discover→Rank→Analyze→Prepare→Apply→Track→Learn

  Scenario: Discover — choose sources and run a live, inspectable crawl on /jobs
    Given I am on "/jobs" and the Scrapling sidecar health probe has succeeded
    When I select one or two boards from "Sources in this view" and press "Start crawl"
    Then BoardLiveGrid streams per-source board_update events via GET /api/crawl/stream?runId=
    And Last run outcome shows boardsCrawled, found, concurrency, and per-source found/matched or error
    And AgentLiveConsole retains telemetry for proof without remounting the deck

  Scenario: Rank — order crawled candidates before committing to the tracker on /jobs
    Given I am on "/jobs" with visibleJobs after a crawl
    When I compare Deck versus Grid (matrix) presentations and batch operations
    Then each role surfaces matchScore, fitCategory, employerReview.verdict, salaryIntel, and skillsGap
    And already-tracked dedupKey roles and skipped decisions are hidden from visibleJobs
    And I can Save one role or batch-save multiple into /tracker via POST /api/data/jobs

  Scenario: Analyze — explain fit against evidence with citations on /tracker and /jobs/[id]
    Given I am on "/tracker" with tracked roles and on "/vault" with evidence documents
    When I press "Explain fit" on a board card at "/tracker" or open "/jobs/[id]"
    Then POST /api/tracker/explain fuses deterministic scoring (Level 1-2) with LLM explanation (Level 3)
    And the response streams Fit/Score/source/budgetNote plus vault cites as docName#chunkIndex [model]
    And JobDetailView at "/jobs/[id]" renders the same fitCategory, verdict, salary disclosed vs estimated, jobBrief, and skillsGap for verification

  Scenario: Prepare — assemble grounded evidence on /vault
    Given I am on "/vault" on the Evidence Vault tab
    When I upload a PDF, DOCX, TXT, or Markdown up to 25 MB via POST /api/vault
    Then the doc is chunked at 700 tokens with 90 overlap, embedded via the doc's embedModel or local hash, and stored as vault_docs + vault_chunks
    And inspecting via GET /api/vault/chunks?docId= shows chunk idx/tokens/content slice without raw vectors
    When I search "LangGraph production evidence"
    Then I see hybrid BM25 + vector RRF results with fused/lexical/vector ranks and matchedTerms, and a Cite button copying docName#chunkIndex [model/strategy]

  Scenario: Prepare — tailor truthful documents on /resume
    Given I am on "/resume" with Applicant Profile synced from "/vault"
    And a target role selected from "/tracker" or "/jobs"
    When I choose kind resume or cv and a template from RESUME_TEMPLATES (e.g., Classic LaTeX ATS or tabular-german)
    Then the A4 structure preview updates with the template's fontFamily while noting the PDF is the typography source of truth
    And the AI Resume Copilot tailors content grounded in vault evidence and flags invented metrics for confirmation
    And ATS readiness score at "/resume" reflects parser-friendly structure without guaranteeing outcomes

  Scenario: Prepare — compile and verify correspondence on /resume
    Given I am on "/resume" with a tailored draft and chosen template
    When I press "Compile for SyncTeX"
    Then POST /api/resume/compile returns a token and SyncTeX forward and reverse map TeX lines to preview coordinates
    And ResumeDiff shows changed sections against the pinned baseline
    And Export PDF opens /api/resume/compile?token=&save=1 as the verified artifact

  Scenario: Apply — supervise every external action on /agent with HITL
    Given I am on "/agent" with queued roles that have URLs and a matchScore at or above the match gate
    When I run in "Review mode" (submit false) and the graph traverses analyze → decide → prepare → execute → verify
    Then autoApplyExecution interrupts at the HITL gate and returns manual_required, recording filled fields, clicks, and screenshot proof
    And AgentLiveConsole shows live apply activity and proof while the Command Deck at "/" increments needsReview
    And switching to "Confirm & submit" requires explicit checkbox confirmation and only marks applied when confirmation evidence is detected; a failed run becomes failed or manual_required, never applied

  Scenario: Track — maintain auditable outcome history on /tracker and /
    Given I am on "/tracker" with roles across wishlist, applied, interviewing, offer, and rejected columns
    When I drag between columns, update status, priority, deadlines, notes, or follow-ups
    Then each change persists via POST /api/data/jobs and surfaces in JobDetailView autoApplyLogs and StatsPanel funnel rates at "/" and "/tracker"
    And Insights answers "What is the job search teaching me?" with application-to-response and response-to-interview rates by score band, source performance, and calibration
    And the Command Deck at "/" shows Live operations, Needs attention, Best matches, and Recent roles from the same SQLite source

  Scenario: Learn — feed outcomes back into ranking and strategy via /assistant, /vault, and /tracker
    Given I am on "/assistant" after outcomes have been recorded on "/tracker"
    When I ask "What is the job search teaching me?" or run Vault assist at "/vault"
    Then the orchestrator at "/assistant" (LangGraph route → executeTool → compose, MAX_ITERATIONS 3) fuses pipeline_summary, search_jobs, search_vault, and memory
    And recommendations are checked against observed interview and offer rates by score band
    And learnings are stored as memoryRepo insights and reused as priorOutreach and vault evidence in the next Discover→Rank cycle
```

## Intelligence authority

| Level | Authority | Appropriate uses |
| --- | --- | --- |
| 1 | Deterministic logic | dates, state transitions, hard constraints, statistics, validation |
| 2 | Retrieval and ranking | BM25, embeddings, RRF, reranking, normalization, similarity |
| 3 | LLM reasoning | grounded summaries, explanations, document drafts, interview questions |
| 4 | Agents | multi-step research, browser workflows, tool orchestration |

Use the lowest level that solves the problem. An agent must not replace a state machine, calculator, database constraint, or retrieval function.

## Non-negotiable truth rules

- Never invent application state.
- `filled`, `submitted`, and `submission_verified` are distinct outcomes.
- A failed browser run becomes `failed` or `manual_required`, never `applied`.
- Hard constraints stay outside averaged fit scores.
- An unknown legal, location, language, clearance, or work-authorization condition remains `unknown` until confirmed.
- Generated claims must trace to profile evidence.
- Company facts require a source URL and capture date.
- Posted compensation and generated market estimates remain visibly separate.
- Generated explanations may describe a score but must not silently become the scoring model.

## Job discovery and ranking

Candidate generation combines structured filters, full-text retrieval, and vector retrieval. SignalRank should then fuse and rerank candidates before HuntFlow applies personal constraints.

The default UI shows a recommendation, supporting evidence, and blockers. Low-level ranking diagnostics belong in an advanced panel.

Evaluation targets:

- Recall@50
- nDCG@10
- MRR
- Precision@5
- p50 and p95 retrieval latency
- observed interview rate by score band
- calibration between predicted and observed outcomes

## Explainable fit

Fit is a structured comparison between extracted job requirements and candidate evidence. It should evolve toward explicit subscores for technical skills, experience, domain, seniority, education, location, and preferences.

Missing evidence is not always a missing skill. The system should distinguish:

- no evidence found;
- evidence exists but is weak, old, or shallow;
- strong evidence exists across multiple projects or roles;
- a hard requirement fails;
- a requirement is unknown.

The LLM explains those results. It does not manufacture the numeric score.

## Job workspace

Each job workspace follows the real candidate journey:

1. Analyze: grounded overview, explainable fit, constraints, and sourced company intelligence.
2. Prepare: versioned application documents and evidence-backed STAR stories.
3. Apply: eligibility gate, field plan, document choice, supervised browser actions, and verification.
4. Interview: job-specific practice connected to real profile evidence.

Transactional fields such as status, priority, deadlines, notes, and follow-ups remain visible but separate from generated intelligence.

## Application and outcome data

Application status should become an event history rather than a single overwritten value. Useful events include discovery, save, document generation, submission attempt, acknowledgement, follow-up, screening, interview stage, offer, rejection, ghosting, withdrawal, and verification evidence.

That history enables trustworthy funnel rates, source performance, application-timing analysis, document-strategy experiments, and ranking calibration.

## Product analytics

The Command Deck answers “What should I do today?” Insights answers “What is the job search teaching me?”

High-value measurements include:

- application-to-response and response-to-interview rates;
- source and role-family performance;
- time-to-apply and time-to-response;
- follow-up effectiveness;
- referral impact;
- resume-version performance;
- skill-gap frequency across target jobs;
- match-score calibration against real outcomes.

Counts without rates, denominators, or decision context are secondary.

## Current implementation boundary

HuntFlow already has local-first career data, hybrid vault retrieval, deterministic fallback scoring, generated job briefs and documents, crawler telemetry, supervised browser automation, and verified submission states.

The next architecture milestones are event-sourced application history, formal SignalRank evaluation, evidence-depth scoring, document version tracking, cited company research, and outcome-calibrated recommendations.
