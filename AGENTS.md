<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# HUNTFLOW — Agent Guide

Single-user, local-first Next.js 16 career workspace. SQLite + optional Python sidecar. Not multi-tenant.

## Stack

- **Runtime:** Node 22, Next.js 16.3 (`output: standalone`), React 19, TypeScript strict (`@/*` → `src/*`)
- **DB:** `node:sqlite` `DatabaseSync` — file at `HUNTFLOW_DATA_DIR/huntflow.db` (default `data/huntflow.db`), WAL + FK + `busy_timeout 5000`. Schema + migrations in `src/lib/db.ts:46`.
- **Styling:** Tailwind 4 (`@tailwindcss/postcss`), no `tailwind.config.ts`. Tokens in `src/lib/theme.ts` / `src/app/globals.css` — use `cn()` from `@/lib/utils`, not hardcoded hex.
- **Python sidecar:** `scrapling-agent/server.py` (FastAPI + Scrapling + Playwright). Managed by `uv`.

## Commands

```bash
npm ci
npm run dev          # predev kills :3000/:8001, then concurrently runs next dev + scrapling uvicorn :8001
npm run dev:scrapling  # sidecar only: cd scrapling-agent && uv run uvicorn server:app --port 8001
npm run lint         # eslint (next/core-web-vitals + next/typescript)
npx tsc --noEmit     # typecheck — no npm script alias
npm test             # vitest run (forks pool, 60s timeout)
npm run build        # next build (standalone)
```

Single test: `npx vitest run src/lib/__tests__/vaultBm25.test.ts` or `npx vitest run -t "test name"`

CI order (`.github/workflows/ci.yml`): `secret-scan` (no `.env` tracked) → `lint` → `typecheck` → `test` → `build` (needs quality). Node 22.

Docker: `cp .env.docker.example .env && docker compose up --build` (web `127.0.0.1:3000`, data in `huntflow-data` volume). Sidecar opt-in: `docker compose --profile agent up --build` (`127.0.0.1:8001`). Bindings are loopback-only — don't expose publicly.

Sidecar setup (once): `cd scrapling-agent && uv sync && uv run scrapling install`

## Project Map

```
src/app/(app)/        Route-group pages (jobs, vault, resume, agent, tracker, outreach, etc.)
src/app/api/          ~55 route handlers — highest risk for Next.js 16 drift; verify against bundled docs
src/app/layout.tsx    Root layout, next/font (Manrope, STIX_Two_Text, JetBrains_Mono), AppProvider + Toaster
src/lib/db.ts         All SQLite schema, repos (jobsRepo, contactsRepo, vaultRepo, resumeRepo…), seed, backup
src/lib/agents/       LangGraph workflows, checkpointer, memory, tools
src/lib/vault/        RAG pipeline: extract → chunk → BM25 + embeddings → RRF
src/lib/pdf/templates/*.tex  LaTeX resume templates (traced via next.config outputFileTracingIncludes)
src/components/ui/    Design-system primitives (Button, Modal, Select…) — forwardRef + cn() + lucide-react
scrapling-agent/      Python sidecar — sources.json drives crawl boards; .agent_runs/ for screenshots
```

`next.config.ts` quirks: `output: "standalone"`, `allowedDevOrigins: ["127.0.0.1"]`, `serverExternalPackages: ["pdf-parse"]`, `outputFileTracingIncludes` for `/api/resume/*` → LaTeX templates.

Path alias `@/*` → `src/*` (see `tsconfig.json`). `eslint.config.mjs` ignores `scrapling-agent/`, `.claude/`, `scripts/`, `data/`.

## Testing

- Config: `vitest.config.ts` — `environment: node`, `include: ["src/**/*.test.ts","tests/**/*.test.ts"]`, `pool: forks`, `testTimeout/hookTimeout: 60000`.
- `vitest.setup.ts` gives each worker an **isolated temp SQLite file** via `HUNTFLOW_DB_PATH` — never touches real `data/huntflow.db`. Don't add a global DB file in tests.
- >600 tests across unit/API/persistence/workflow. Deterministic BM25/RAG tests — don't mock the ranking.
- `closeDb()` in `src/lib/db.ts` exists for test isolation.

## Env & Secrets

Copy `.env.docker.example` → `.env`. Required only if used: `HUNTFLOW_AGENT_TOKEN`, LLM keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.), optional `CLOUDINARY_*` for agent screenshots. Never commit `.env` — CI `secret-scan` fails the build if any `.env` is tracked. Local DB path override: `HUNTFLOW_DATA_DIR` / `HUNTFLOW_DB_PATH`.

## Conventions & Gotchas

- **Next.js 16 breaking changes** — always `ls node_modules/next/dist/docs/` and read the relevant `01-app/` guide before touching `src/app/`, `next.config.ts`, or server code (`cookies()`/`headers()` are async now, etc.). Pages-router patterns (`getServerSideProps`) don't apply.
- **`scripts/predev.mjs`** force-kills anything on 3000/8001 before `next dev` — `npm run dev` is destructive to those ports on purpose.
- **Design system** (`src/components/ui/`): `"use client"` when using hooks, `cn()` for classes, semantic tokens (`bg-white/[0.03]`, `text-paper`, `chartreuse`/`coral`/`amber`, `border-line`), `forwardRef`, `lucide-react` icons, `className` merged last. See `.claude/skills/new-component/SKILL.md` + `next-version-compat/SKILL.md` (both `disable-model-invocation: true`).
- **DB migrations** are idempotent `addColumn` checks in `migrate()` — add new columns there, not in raw `CREATE TABLE` alone, for existing installs.
- **Backup/restore** in `src/lib/db.ts:exportAllData`/`importAllData` — single transaction across `ALL_TABLES_IN_DELETION_ORDER`.
- **LaTeX** needs a local TeX Live install for `npm run dev` PDF compiles; Docker image bakes `texlive-*` + `lmodern`.
- **Scrapling agent** auth: when `HUNTFLOW_AGENT_TOKEN` is set, every sidecar endpoint requires `X-Huntflow-Token` header (enforced in `server.py:require_token`).
- **No `opencode.json`** in repo — instruction file is this `AGENTS.md` plus the auto-generated block above.
