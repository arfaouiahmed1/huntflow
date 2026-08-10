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

## Agent visibility (live screenshots)

Every browser screenshot the agent takes is written locally under `.agent_runs/`
and served at `GET /screenshots/*`. To also stream them to Cloudinary so the web
console renders them live through a CDN, set these in the sidecar env:

```bash
CLOUDINARY_CLOUD_NAME=dktc34wxa
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Keep the secret out of version control (`.env*` is gitignored). When all three
are set, `shot()` uploads each PNG with a signed request and includes the
`cloudinary` URL in the activity event; the UI shows it as a "live" thumbnail.
Leave them unset to keep local-only screenshots.
