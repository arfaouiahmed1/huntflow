# Environment & Configuration Guide

HUNTFLOW uses a canonical `.env.example` file located at the repository root.

## Setup

```bash
# Copy template to active environment file
cp .env.example .env

# Verify environment configuration integrity
npm run check:env
npm run doctor
```

## Variable Reference

### Core Storage & Database
- `HUNTFLOW_DATA_DIR`: Directory where SQLite files and evidence chunks are stored (default: `data`).
- `HUNTFLOW_DB_PATH`: Specific path override for the SQLite database (default: `data/huntflow.db`).

### Python Sidecar & Crawler
- `SCRAPLING_AGENT_URL`: URL where the Python FastAPI sidecar runs (default: `http://127.0.0.1:8001`).
- `HUNTFLOW_AGENT_TOKEN`: Shared secret token for sidecar endpoints. Sent as `X-Huntflow-Token`.
- `HUNTFLOW_CRAWL_CONCURRENCY`: Concurrency limit for background crawl tasks (1-16, default: 1).

### Optional Crawler API Keys
- `THEMUSE_API_KEY`: API key for The Muse developer API.
- `ADZUNA_APP_ID` & `ADZUNA_APP_KEY`: Application ID and key for Adzuna jobs API.
- `JOOBLE_API_KEY`: Developer key for Jooble search API.
- `FINDWORK_API_KEY`: Authorization token for Findwork.dev API.
- `USAJOBS_AUTH_KEY` & `USAJOBS_USER_AGENT`: Authorization key and contact email for USAJobs API.

### LLM Providers
- `HUNTFLOW_PROVIDER`: Default active LLM provider (`openrouter` | `gemini` | `anthropic` | `openai` | `groq` | `deepseek` | `ollama`).
- `OPENROUTER_API_KEY` & `OPENROUTER_MODEL`: OpenRouter gateway.
- `GEMINI_API_KEY` & `GEMINI_MODEL`: Google Gemini API.
- `ANTHROPIC_API_KEY` & `ANTHROPIC_MODEL`: Anthropic Claude API.
- `OPENAI_API_KEY` & `OPENAI_MODEL`: OpenAI API.
- `GROQ_API_KEY` & `GROQ_MODEL`: Groq fast inference API.
- `DEEPSEEK_API_KEY` & `DEEPSEEK_MODEL`: DeepSeek API.
- `OLLAMA_BASE_URL` & `OLLAMA_MODEL`: Local Ollama instance (default: `http://127.0.0.1:11434`).

### Gmail OAuth & Notifications
- `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`: OAuth credentials for Gmail integration.
- `GOOGLE_REDIRECT_URI`: OAuth callback URI (default: `http://localhost:3000/api/auth/gmail/callback`).

### Image Storage & Tracing
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: Cloudinary CDN for screenshots. If left unset, screenshots are stored locally in `.agent_runs/`.
- `LANGCHAIN_TRACING_V2`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`: LangSmith tracing.
- `OTEL_EXPORTER_OTLP_ENDPOINT`: OpenTelemetry collector endpoint.
