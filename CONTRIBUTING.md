# Contributing to HUNTFLOW

Thank you for your interest in contributing to HUNTFLOW! We welcome contributions, bug fixes, connector updates, and documentation improvements.

## Development Setup

### Prerequisites

- **Node.js**: `>=22.0.0 <23.0.0`
- **npm**: `v10+`
- **Python**: `>=3.10`
- **uv**: `v0.4+` (Python package and environment manager)

### Installation

```bash
# 1. Clone repository
git clone https://github.com/arfaouiahmed1/huntflow.git
cd huntflow

# 2. Install Node dependencies
npm ci

# 3. Setup Python sidecar environment
cd scrapling-agent
uv sync --group dev
cd ..

# 4. Copy environment template
cp .env.example .env

# 5. Run system diagnostics
npm run doctor
```

### Running Locally

```bash
# Start both Next.js and Python sidecar concurrently
npm run dev

# Or run separately
npm run dev:scrapling # in one terminal
npx next dev          # in another terminal
```

## Quality Gates & Verification

Before submitting a Pull Request, ensure all quality checks pass:

```bash
# 1. Lint & TypeScript typecheck
npm run check

# 2. Run full crawler test suite
npm run test:crawler

# 3. Run Python sidecar tests and linter
npm run test:sidecar
cd scrapling-agent && uv run ruff check . && cd ..

# 4. Validate source registry v2 schema
npm run sources:validate

# 5. Verify environment example parity
npm run check:env

# 6. Run complete Vitest suite
npm test
```

## Pull Request Workflow

All changes land through a pull request into main:

1. Update from the protected branch: git switch main && git pull --ff-only origin main.
2. Create a focused branch: git switch -c feat/<short-description> (use fix/* or docs/* only when that better describes the change).
3. Make one coherent change set, add regression coverage, and run the applicable local checks.
4. Push the branch and open a PR targeting main with the template's summary and exact verification evidence.
5. Resolve review feedback and keep the PR green. Required status checks named CI / Gate and Publish Container Images to GHCR must pass before merge.
6. Merge only through GitHub after approval. Main requires linear history; do not force-push protected branches.

Useful GitHub CLI commands:

    git push --set-upstream origin feat/<short-description>
    gh pr create --base main --head feat/<short-description>
    gh pr checks <number> --watch
    gh pr merge <number> --rebase --delete-branch

Do not bypass required reviews or status checks. If a check is intentionally unavailable, fix the workflow or document the blocking failure in the PR rather than merging around it.
