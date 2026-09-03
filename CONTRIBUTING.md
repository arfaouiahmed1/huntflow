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

## Pull Request Guidelines

1. Create a descriptive feature branch from `master` or `main`.
2. Follow existing code conventions (`cn()` for Tailwind styles, explicit TypeScript types, no `any`).
3. Add or update tests for any modified or new functionality.
4. Ensure no real `.env` or credential files are committed.
5. Submit your PR using the repository Pull Request Template.
