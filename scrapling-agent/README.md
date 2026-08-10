# HUNTFLOW Agent

Scrapling-powered scraping & auto-apply agent. Managed with [uv](https://docs.astral.sh/uv/).

## Setup

```bash
cd scrapling-agent
uv sync                  # install dependencies
uv run scrapling install # download browsers for Dynamic/Stealthy fetchers (once)
```

## Run

```bash
uv run uvicorn server:app --port 8001
```

## Endpoints

- `POST /scrape` — `{"url": "https://..."}` → extracts job title, company, location, salary, description (adaptive, anti-bot aware)
- `POST /apply` — `{"url", "profile", "documents", "submit": false}` → inspects the application form, fills it with the candidate's data, optionally submits. Returns a log stream and detected fields.

The Next.js app falls back to its built-in extractor if this agent is offline.
