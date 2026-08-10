# HUNTFLOW

HUNTFLOW is a local-first job-hunt copilot: track applications, contacts,
interviews and reminders in one dashboard, generate tailored documents,
match analyses, STAR flashcards and interview prep with your own LLM
providers, and hand off scraping and auto-apply to a Scrapling browser
agent. Everything is stored in a single SQLite file on your machine
(`data/huntflow.db`); no accounts, no cloud, no vendor lock-in.

## Features

- **Pipeline tracker** - jobs board with statuses (wishlist -> applied ->
  interviewing -> offer/rejected), match scores, salary, notes, follow-up
  due dates and per-job logs.
- **AI generation** - tailored resume/cover letter, match analysis with
  skills gaps, STAR flashcards, interview questions, job briefs, salary
  intel, and global insights (recommendations, skill roadmap, pipeline
  report). Every generation is budget-clamped and cost-tracked.
- **Multi-provider LLM chain** - order providers (OpenRouter, OpenAI,
  Gemini, Anthropic, Groq, DeepSeek, Ollama, custom OpenAI-compatible) in
  the Settings UI; automatic retries, fallback, and a circuit breaker keep
  calls working when one provider fails. Local providers cost 0.
- **Command assistant** - a chat agent (LangGraph) that can summarize
  your pipeline, search jobs, search the vault, and remember facts -
  with or without an LLM key.
- **Auto-apply agent** - a LangGraph agent (analyze -> decide -> prepare ->
  execute -> verify) that scores the job against your profile, writes a
  pitch, and drives the Scrapling agent to prefill or submit application
  forms.
- **Document vault** - upload resumes, cover letters and references
  (PDF/DOCX/text); they are chunked, embedded and searchable semantically
  (OpenAI/Ollama embeddings, or a built-in local hash embed).
- **Contacts, mail and LinkedIn** - contact book, IMAP/SMTP inbox sync and
  send, and LinkedIn session/profile/job import through the Scrapling agent.
- **Usage ledger** - every LLM call is logged (provider, tokens, latency,
  estimated cost) and visible in the UI.
- **Offline resilient** - DB-backed with localStorage mirrors; the app
  still works with no provider configured via heuristic fallbacks.

## Quickstart

```bash
npm install
npm run dev
```

Open http://localhost:3000. The app seeds itself on first load and creates
`data/huntflow.db`.

Production:

```bash
npm run build
npm run start
```

## Configuration

- **LLM providers**: Settings -> AI Engine. Build an ordered provider
  chain (add API keys, pick models, enable/disable). Keys are stored
  masked in the DB and never sent back to the browser unmasked.
- **Environment variables** (alternative to the Settings UI): provider
  keys and models are auto-detected, e.g. `OPENROUTER_API_KEY`,
  `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`,
  `GROQ_API_KEY`, `DEEPSEEK_API_KEY` (plus `<PROVIDER>_MODEL`).
- **Mail**: Settings -> Mail for IMAP/SMTP credentials (imapflow +
  nodemailer).
- **Scrapling agent**: scraping, auto-apply and LinkedIn go through the
  local agent. See `scrapling-agent/README.md`:

```bash
cd scrapling-agent
uv sync                 # install dependencies
uv run scrapling install  # download browsers (once)
uv run uvicorn server:app --port 8001
```

  Port 8001 is the default; override with `SCRAPLING_AGENT_URL`. If the
  agent is offline, scraping falls back to a built-in extractor and
  auto-apply falls back to a guided simulation.

## Scripts

| Script          | Description                                        |
| --------------- | -------------------------------------------------- |
| `npm run dev`   | Start the Next.js dev server (port 3000)           |
| `npm run build` | Production build                                   |
| `npm run start` | Serve the production build                         |
| `npm run lint`  | Run ESLint                                         |

## Documentation

- `docs/ARCHITECTURE.md` - system context, data model, LLM router, agent
  graphs, vault/RAG pipeline, client-API flow, security and limitations.
