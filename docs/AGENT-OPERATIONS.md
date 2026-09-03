# Agent and Crawler Operations

## Operating Model

HUNTFLOW separates job discovery from application automation. A crawl only collects and ranks candidates for review; it never submits an application without explicit human confirmation.

```text
select channel / facets → run discovery → inspect telemetry & health → review candidates
                                                                     ↓
                                                    prepare profile & tailored materials
                                                                     ↓
                                                   run agent → inspect proof → decide
```

## Discovery & Crawler Controls

The Discovery workspace provides:
- **Search terms**: Free-text keywords (e.g. `Distributed Systems, Rust, Go`).
- **Channel bar**: Plain-language choices: `All public feeds`, `Company career systems` (ATS), `Remote & global boards` (Aggregators), and `Interview-friendly` (Non-whiteboard companies).
- **Faceted filters**: Multi-select region, work mode, seniority, tech tags, visa evidence, and salary minimums.
- **Source health drawer**: Searchable overview of all registered sources grouped by health status (`healthy`, `degraded`, `unconfigured`, `manual_only`, `disabled`).
- **Configured concurrency**: `HUNTFLOW_CRAWL_CONCURRENCY` (1-16, default: 1).

## Rate Limiting & Circuit Breaking

The crawler sidecar protects remote services and local resources:
- **Per-Host Token Bucket**: Throttles request rates per domain based on `perDomainRps` in the source registry.
- **Circuit Breaker**: When a remote host fails 3 consecutive times, requests to that host are paused for 90 seconds.
- **Two-Strike Job Closure**: A job omitted from one sync remains active; it is marked closed only after two consecutive successful syncs of that source omit the external ID.

## Persistence & Provenance

- All candidate sources and runs are stored in SQLite: `crawler_sources`, `crawler_source_state`, `crawler_runs`, `crawler_jobs_staging`, and `job_source_edges`.
- Every canonical job retains full provenance: first seen date, last seen date, source badges, and ranking breakdown.

## Global Jurisdictions & Legal Compliance (24 Regions)

The `regionalNorms` agent enforces jurisdictional requirements and anti-discrimination standards:
- **North America (`US`, `CA`)**: Strict omission of candidate photos, age/DOB, marital status, nationality, and Social Security / Social Insurance Numbers (`[REDACTED-SSN]`, `[REDACTED-SIN]`).
- **Europe (`UK`, `DE`, `FR`, `NL`, `CH`, `ES`)**: Compliance with GDPR and regional norms (German *Tabellarischer Lebenslauf*, French CEFR language declarations, Swiss work permit status).
- **MENA (`TN`, `EG`, `AE`, `SA`, `GCC`)**: Bilingual Arabic/French/English formatting, GCC Iqama status lines, and 0% personal income tax modeling for the Gulf states.
- **APAC (`AU`, `SG`, `JP`, `IN`)**: Australian APS format with referees, Singapore TAFEP non-discrimination rules, Japanese *Rirekisho* standards with photo, Indian comprehensive CVs with academic marks.
- **LATAM (`BR`, `MX`)**: Brazilian ABNT norms, Mexican CURP/RFC data protection.
- **Africa (`NG`, `KE`, `ZA`)**: Nigerian NYSC discharge status, Kenyan professional associations, South African B-BBEE / EE compliance.

## Empirical Evaluation & Plotly Analytics Dashboard

The agent system is benchmarked across 50 real-world scenarios from Kaggle and Hugging Face:

```bash
# 1. Run real-tool empirical evaluation (isolated SQLite, 0 circular mocks)
node scripts/eval-agents-benchmark.mjs

# 2. Generate interactive Plotly.js visual dashboard
node scripts/generate-plotly-visualizations.mjs

# 3. Parse LangSmith traces (offline-first, optional upload if LANGSMITH_API_KEY set)
uv run python scripts/analyze-langsmith-traces.py
```

The dashboard (`output/agent-evaluation-dashboard.html`) provides:
- **6-Axis Capability Radar**: Agent Actual vs Target Quality vs Naive Baseline.
- **Quality Score Box & Jitter Plot**: Output quality distribution across all 50 cases.
- **Skill Matching Fidelity Bar Chart**: Expected vs Agent-Identified skill matches and gaps.
- **Interactive Reasoning Inspector**: Verbatim chain-of-thought analysis explaining every agent decision.
