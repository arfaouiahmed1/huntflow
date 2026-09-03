# HUNTFLOW Scrapling Sidecar & Connector SDK

High-throughput, anti-bot resilient scraping and ATS connector service managed with [uv](https://docs.astral.sh/uv/).

## Setup

```bash
cd scrapling-agent
uv sync --group dev       # install runtime & dev dependencies
uv run scrapling install  # install browser binaries for stealth fetchers (once)
```

## Running the Sidecar

```bash
uv run uvicorn server:app --port 8001
```

## Testing & Quality

```bash
# Run all connector adapter and contract tests
uv run pytest

# Run Ruff linter
uv run ruff check .
```

## Connector Architecture

The sidecar exposes a modular Connector SDK under `connectors/`:
- **ATS Adapters (`connectors/ats.py`)**: Greenhouse, Lever, Ashby, SmartRecruiters, Personio XML, Recruitee, Workable.
- **Aggregator Adapters (`connectors/aggregators.py`)**: Arbeitnow, Jobicy, Remotive, Himalayas, ReliefWeb, The Muse, Adzuna, Jooble, Findwork, USAJobs.
- **Regional & HTML Adapters (`connectors/html.py`)**: Static HTML, Stealthy browser fetcher, and Hacker News Who Is Hiring posts parser.
- **Directory Discovery (`connectors/directory.py`)**: CareerPanels and JobBoardSearch.
- **Rate Limiting (`rate_limiter.py`)**: Per-host token buckets with exponential backoff and circuit breaking.
- **Adblocking Engine (`adblock.py`)**: Suffix-tree domain matcher and URL regex filter based on EasyList, EasyPrivacy, Peter Lowe's List, and cosmetic CSS rule injection (`filterlists/compiled_rules.json`).
- **Filterlist Synchronizer (`sync_filterlists.py`)**: Downloads and compiles community adblock rules with fallback to baked offline rules.
- **Browser Stealth Engine (`stealth.py`)**: Overrides `navigator.webdriver`, mocks WebGL vendor/renderer strings, and injects canvas/audio noise to pass Cloudflare/Datadome anti-bot checks.
- **Cookie & Consent Manager (`cookies.py`)**: Offline-first `CookieJarManager` pre-seeding GDPR/CCPA consent cookies (`OptanonAlertBoxClosed`, `CookieConsent`) to prevent blocking modals.
## Key Endpoints

- `GET /sources` — Returns safe, user-facing crawler catalog metadata (no leaked selectors or secrets).
- `GET /health` — Reports fetcher health, active source counts, and uptime.
- `POST /crawl` — Parallel crawler execution with rate limiting and circuit breaking.
- `POST /ats/crawl` — Direct high-throughput ATS API ingestion.
- `POST /ats/discover` — Detects ATS provider and board token from career URLs or company names.
- `POST /scrape` — Anti-bot aware single-page job extractor.
- `POST /apply` — Supervised form detection and auto-apply preparation.
