# Security Policy

## Supported Versions

HUNTFLOW is an open-source, local-first career workspace. Security updates are delivered via the `master` / `main` branch.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Local-Only Security Posture

HUNTFLOW is designed as a **single-user, local-first software application**. It is not a multi-tenant SaaS.

1. **Loopback Binding by Default**: Network listeners bind to `127.0.0.1:3000` (Next.js) and `127.0.0.1:8001` (Python sidecar). Never expose these ports directly to the public internet without an authenticated reverse proxy.
2. **Local Storage**: All application data, SQLite databases, and resume artifacts reside locally in the `data/` directory or container volume.
3. **Secret Redaction**: When creating backup archives or exporting database snapshots, connector secrets and API keys are automatically masked via `redactSettings()`.
4. **Third-Party Integrations**: External API calls (e.g. LLM providers, Greenhouse, Lever, Ashby, Arbeitnow, Gmail OAuth) occur only when explicitly configured or requested by the user.

## Reporting a Vulnerability

If you discover a security vulnerability in HUNTFLOW, please report it responsibly:

- **Preferred Channel**: Please use [GitHub Private Vulnerability Reporting](https://github.com/arfaouiahmed1/huntflow/security/advisories/new).
- Please provide a detailed description of the vulnerability, steps to reproduce, and any relevant proof-of-concept code.
- Do **not** open a public GitHub issue for undisclosed security vulnerabilities.

We will review and acknowledge your report within 48 hours and work on an appropriate fix.
