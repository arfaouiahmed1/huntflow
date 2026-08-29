# Product brief

## Positioning

HUNTFLOW is a private AI career workspace for technical candidates who want more than a spreadsheet but do not want an opaque bot applying on their behalf.

Its core promise is **evidence before automation**: assemble a grounded candidate profile, retrieve relevant proof from a document vault, compare it with a role, draft application material, and let the user decide what leaves the machine.

## Intended user

The current product is designed for one technically confident user running it on a trusted computer. It is especially useful for people managing several role variants, projects, languages, or evidence sources.

It is not currently a hosted recruitment platform, an applicant-tracking system for teams, or a safe unattended auto-application service.

## Product pillars

1. **One career workspace** — jobs, profile facts, documents, generated material, and workflow state live in one navigable product.
2. **Grounded assistance** — the vault retrieves source passages so generated claims can be checked against candidate evidence.
3. **Professional outputs** — application documents are compiled from LaTeX templates instead of captured from a web page.
4. **Visible automation** — agent stages and action tiers make the difference between analysis, drafting, and external action explicit.
5. **Local-first ownership** — the default operational boundary is the user's computer, with provider egress disclosed rather than hidden.

## Product loop

HUNTFLOW organizes single-user, local-first work around a deliberate, inspectable loop kept entirely on the user's machine (SQLite at `HUNTFLOW_DATA_DIR/huntflow.db`, Docker volume `huntflow-data`, no hosted multi-tenant surface):

```text
Discover → Rank → Analyze → Prepare → Apply → Track → Learn
    ↑                                                      │
    └────────────── outcome data improves ranking ──────────┘
```

`Discover` collects evidence, `Rank` orders it, `Analyze` explains fit against that evidence, `Prepare` tailors truthful documents, `Apply` stays supervised, `Track` records outcomes, and `Learn` feeds outcomes back into ranking and strategy — never inventing state.

## Demonstration flow — Gherkin per route

> All scenarios assume a single user on a trusted computer, local SQLite, and `127.0.0.1:3000` only. Use synthetic or redacted content in screenshots and recordings. Do not expose API keys, personal contact details, private job records, or OAuth information.

### Scenario 1 — Discover: select sources and run a live crawl on /jobs

```gherkin
Feature: Discover opportunities on /jobs
  Scenario: Select sources then watch live crawl telemetry
    Given I am on "/jobs" and the Scrapling sidecar is reachable at 127.0.0.1:8001
    And I see the "Sources in this view" grid filtered by category
    When I toggle one or two boards and press "Start crawl"
    Then I see BoardLiveGrid cards transition running → success or failed per source
    And I see Last run outcome with boardsCrawled, found count, concurrency, and per-source found/matched badges
    And AgentLiveConsole shows crawl live telemetry without remounting the deck
```

### Scenario 2 — Rank: review evidence-dense deck and matrix on /jobs

```gherkin
Feature: Rank crawled roles before they enter the tracker
  Scenario: Deck and matrix ranking with visible signals
    Given I am on "/jobs" with a completed crawl that produced visibleJobs
    When I switch between Deck and Grid (matrix) views
    Then each card shows fitCategory, employer verdict, salary intel, and matchScore
    And I can filter by savedKeys and skipKeys so already-tracked or skipped roles are hidden
    And I see BoardLiveGrid concurrency gauge and matched% without losing prior decisions
```

### Scenario 3 — Rank → Save into the pipeline

```gherkin
Feature: Promote a ranked role into the single-user tracker
  Scenario: Save a discovered role to /tracker
    Given I am on "/jobs" inspecting a card in the deck
    When I press "Save" on that card
    Then a JobApplication is created in local SQLite with status "wishlist" via POST /api/data/jobs
    And the Command Deck at "/" increments its wishlist count
    And navigating to "/tracker" shows the role in the Wishlist column
```

### Scenario 4 — Analyze: explain fit with vault citations on /tracker and /jobs/[id]

```gherkin
Feature: Analyze fit with explainable, cited reasoning
  Scenario: Inline Explain fit streams citations on /tracker and job detail
    Given I am on "/tracker" with at least one tracked job and vault evidence
    And the vault at "/vault" contains uploaded evidence documents
    When I press "Explain fit" on a board card or table row
    Then the tracker calls POST /api/tracker/explain and streams a Fit/Score/source/budgetNote citation into the explain-stream
    And I see vault cites as docName#chunkIndex [model] chips with matchedTerms
    And navigating to "/jobs/[id]" shows the same employer verdict, salary intel disclosed vs estimated, skillsGap, and autoApplyLogs in JobDetailView
```

### Scenario 5 — Prepare (evidence): ingest, inspect, and search on /vault

```gherkin
Feature: Prepare evidence ground truth in the Evidence Vault
  Scenario: Ingest, inspect chunks, and run hybrid search on /vault
    Given I am on "/vault" on the Evidence Vault tab
    When I drag a PDF, DOCX, TXT, or Markdown onto the drop zone up to 25 MB and wait for POST /api/vault
    Then the document appears with embedModel and chunkCount
    And pressing "Inspect" opens the chunk inspector drawer via GET /api/vault/chunks?docId= with idx/tokens/model/content slices and no raw vectors
    When I search "Where did I use LangGraph in production?"
    Then I see ranked hits with fused score, lexical rank/score, vector rank/score, RRF explanation, and a Copy Cite button producing "docName#chunkIndex [model/hybrid]"
```

### Scenario 6 — Prepare (documents): draft and select ATS template on /resume

```gherkin
Feature: Prepare ATS-conscious documents on /resume
  Scenario: Draft from profile and choose LaTeX template
    Given I am on "/resume" with a profile synced from "/vault" Applicant Profile
    When I choose the document kind resume or cv and select a template from RESUME_TEMPLATES filtered by kind
    Then the A4 structure preview updates and labels Latin Modern Roman or Sans per fontFamily
    And selecting the Classic LaTeX ATS template surfaces its ats-conscious structure without claiming guaranteed outcomes
    And switching the target job via the job selector retails the content for that role
```

### Scenario 7 — Prepare → Compile and verify with SyncTeX on /resume

```gherkin
Feature: Compile LaTeX and verify correspondence on /resume
  Scenario: Compile for SyncTeX and inspect the diff
    Given I am on "/resume" with a tailored draft and a chosen template
    When I press "Compile for SyncTeX"
    Then the app POSTs to /api/resume/compile and stores a compile token
    And SynctexViewer enables forward search to the preview and reverse from click to TeX line
    And ResumeDiff shows changed sections between the pinned baseline and current LaTeX
    And "Export PDF" opens /api/resume/compile?token=&save=1 as the typography source of truth, not the HTML preview
```

### Scenario 8 — Apply: supervise the browser agent with HITL on /agent

```gherkin
Feature: Apply under human control on /agent
  Scenario: Review mode fills the form and pauses before submit
    Given I am on "/agent" with a tracked job that has a URL and the Scrapling agent health is online on port 8001
    When I leave Dispatch Mode in "Review mode" and press "Run Agent" with submit false
    Then the LangGraph apply graph runs analyze → decide → prepare → execute → verify
    And autoApplyExecution hits the HITL interrupt gate and returns manual_required when submit is false
    And AgentLiveConsole shows field events, click evidence, screenshot proof via agentScreenshotUrl, and run history
    And checking the "Confirm & submit" checkbox is required before any irreversible submit click, which only returns applied when confirmation evidence is detected
```

### Scenario 9 — Track → Learn: record outcomes and feed learning on /tracker, /, /assistant

```gherkin
Feature: Track outcomes and learn for the next ranking pass
  Scenario: Move through the pipeline and close the loop on the Command Deck
    Given I am on "/tracker" with roles in wishlist, applied, interviewing, offer, and rejected
    When I drag a card between columns or update matchScore, priority, deadlines, and follow-ups
    Then the status change posts through POST /api/data/jobs and JobDetailView reflects autoApplyLogs and proof
    And navigating to "/" shows Your workflow Discover → Review → Prepare → Supervise plus Best matches, Recent roles, and StatsPanel funnel rates
    When I open "/assistant" and ask "Where does my pipeline stand right now?"
    Then the orchestrator routes to pipeline_summary, search_jobs, search_vault, and memory with vault-grounded citations
    And outcome data (response, interview, offer, rejection) becomes available to improve ranking and follow-up strategy for the next Discover run
```

## Suggested LinkedIn copy

> I built HUNTFLOW, a local-first AI career workspace that combines controlled multi-source job discovery, evidence-backed RAG, supervised browser agents, and LaTeX application documents. The interesting engineering challenge was not adding another chat box—it was making retrieval and automation inspectable: scraper runs expose per-source outcomes, agent runs record fields, clicks and screenshots, hybrid search exposes its ranking signals, and consequential external actions stay behind explicit user control. The app runs as a Dockerized Next.js workspace with persistent local SQLite storage.

Before publishing, attach a short screen recording and the generated sample PDF. Describe it as an active portfolio project, not a production SaaS or guaranteed application system.

## Commercial language guardrails

Prefer:

- “ATS-conscious structure” over “ATS guaranteed.”
- “local-first” over “everything stays local.”
- “hybrid retrieval” over “enterprise-grade RAG.”
- “supervised workflows” over “fully autonomous applications.”
- “more than 600 automated tests” over an unqualified quality guarantee.

## Near-term product work

- Add a small labelled retrieval evaluation set and report recall/ranking metrics.
- Add encrypted local secret storage and hardened OAuth token verification.
- Create a guided first-run experience with sample data.
- Add document export, re-indexing, and retention controls.
- Define authentication and tenant isolation before considering a hosted mode.
