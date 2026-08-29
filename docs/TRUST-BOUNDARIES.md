# Privacy and trust boundaries

## Security posture

HUNTFLOW is currently a trusted-machine, single-user application. Local-first describes where the primary records live; it does not mean no data can leave the computer.

The current controls are appropriate for local development and demonstrations. They are not a substitute for authentication, tenant isolation, secret management, and workload sandboxing in a public service.

## Data-flow inventory

| Data | Stored locally | May leave the machine when used |
| --- | --- | --- |
| Profile and job records | Yes, SQLite | Relevant content may be sent to a selected LLM |
| Uploaded vault documents | Yes, files and indexed chunks | Text may be sent for remote embeddings or grounded generation |
| Generated resumes and letters | Yes during the workflow | Only through a user-selected integration or manual upload |
| Provider keys and settings | Yes | Keys are presented to the configured provider endpoint |
| Gmail data | Cached/processed as required by the integration | Exchanged with Google when Gmail is connected |
| Agent screenshots | Local by default | Sent to Cloudinary only when it is configured |

## Secrets

API keys and integration settings are currently stored locally without encryption at rest. Protect the operating-system account and data directory, do not place secrets in screenshots, and never commit `.env` or database files.

> **Plaintext note:** Every provider key and integration setting lives as plaintext `TEXT` in the `settings.value` column (e.g. `llm_providers`, `mail_settings`, `cloudinary_settings`, `gmail_oauth`). `src/lib/masking.ts:maskSecret` / `redactSettings` and `src/lib/db.ts:settingsRepo` only mask on read for UI/export — they do not encrypt at rest. Treat `HUNTFLOW_DATA_DIR/huntflow.db` as a plaintext secret store and restrict OS and file permissions accordingly.

Before public deployment, move secrets to an encrypted credential store, implement rotation and revocation, and ensure secrets never enter client bundles or logs.

**Roadmap (no secret store added in this change):**
- Phase 1 — OS keychain / `sqlcipher` extension for `settings` at rest (chosen adapter wrapped behind `settingsRepo`), with migration that re-encrypts existing plaintext rows.
- Phase 2 — Per-workspace passphrase + rotation CLI and audit log for `settings` writes.
- Phase 3 — Hosted mode: external vault (e.g. HashiCorp Vault / cloud KMS) and verified OAuth, completing the checklist below.

## Document processing

Uploaded documents are untrusted input. Extraction code should enforce file-size and type limits, keep parsing libraries patched, and avoid executing embedded content. LaTeX generation must continue to escape candidate and job content so user-controlled text cannot become executable TeX.

For a hosted product, run document extraction and LaTeX compilation in resource-limited, isolated workers.

## AI providers

When a remote LLM or embedding provider is selected, prompts, document excerpts, and job/profile context required by that request may be sent to the provider. The user is responsible for selecting providers whose retention, region, and privacy terms match the material being processed.

The deterministic local embedding fallback avoids that particular egress but provides weaker semantic retrieval.

## Action levels

The product should preserve three visible categories:

1. **Analysis** — read and compare local information.
2. **Drafting** — create a proposed artifact or response for review.
3. **External action** — send, submit, publish, or modify a third-party system.

External action requires an explicit, informed user decision. An offline simulation, prepared draft, or failed provider request must never be labelled as a successful application or submission.

## OAuth and Gmail

A secure Gmail integration must verify Google identity tokens cryptographically, validate issuer, audience, expiry, and nonce/state, request minimal scopes, and support revocation. Decoding an unverified token payload is not sufficient authentication.

## Hosted-mode checklist

- Authentication and per-route authorization.
- Tenant-isolated database, files, vectors, and background jobs.
- Encrypted secrets with audit and revocation.
- Verified OAuth and narrow scopes.
- CSRF protection, rate limiting, and request-size controls.
- Sandboxed document and LaTeX workers.
- Log redaction and privacy-aware observability.
- Data export, retention, deletion, backup, and restore procedures.
- Clear user consent for every external data flow and action.
