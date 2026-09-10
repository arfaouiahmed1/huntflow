# Resume and LaTeX engine

## Rendering model

Resume Studio is PDF-only. There is exactly one preview:

1. The **LaTeX source editor** (Monaco: line numbers, find, LaTeX
   highlighting, command snippets, Ctrl+S) holds the editable `.tex`.
2. The **LaTeX compiler** produces the downloadable PDF from that source.
3. The **PDF viewer** (pdf.js, same-origin worker) renders the compiled
   artifact with zoom and SyncTeX navigation.

There is no HTML fallback and no markup-as-PDF: without a compiled PDF
the Studio shows explicit `no-tex` / `error` / `compiling` states, never
a stale artifact or a fabricated document. Typst markup survives only as
an internal markup API (`POST /api/resume/compile-typst`) with no Studio
surface and no PDF claims.

## Typography

The default Classic LaTeX ATS template uses **Latin Modern Roman**. Latin Modern is a modernized, expanded implementation of the Computer Modern design most people associate with LaTeX.

Templates that intentionally use a sans-serif voice load **Latin Modern Sans**. Template metadata shown in the UI must match the actual preamble so the chosen visual language is explicit.

The Studio gallery shows real registry metadata (description, audiences, LaTeX font) with icons and token swatches. It shows no numeric scores and no thumbnails — only previews rendered from real compiled PDFs would be honest, so the gallery ships none rather than mockups.

## Template principles

- Keep text selectable and searchable.
- Use conventional section names and reading order.
- Avoid relying on icons to communicate essential information.
- Keep contact details in normal text.
- Use tables, columns, and decorative elements sparingly.
- Prevent generated content from injecting arbitrary LaTeX commands.
- Let the user inspect the compiled artifact before submission.

## ATS language

No template can guarantee parsing across every applicant-tracking system. A responsible claim is that a template is **ATS-conscious** or **ATS-oriented** because it favors a predictable hierarchy and machine-readable text.

Scores displayed in the product are design heuristics, not measurements from every ATS vendor.

## Compilation path

The server renders candidate content into a repository-owned template and compiles it with the installed LaTeX toolchain. The Docker image installs the LaTeX base, recommended, extra, and font packages required by the current templates.

Compilation is intentionally a server operation. A public hosted deployment would need stronger resource limits, job isolation, and input hardening before accepting arbitrary user content.

## Agentic compile loop (draft → compile → log → patch → ATS gate)

Resume compilation is wrapped in a bounded self-healing loop
(`runResumeAgentLoop`, `src/agents/resumeAgent.ts:398-478`) so a broken
`.tex` draft converges on a compiling document instead of failing once:

```text
draft (LLM or provided initialTex)
   ↓
compile via compileWithSynctex ── ok ──→ ATS score → done (approved = score ≥ 50)
   ↓ fails
emit latex_log (log tail + parsed errors)
   ↓
patch: LLM rewrite (agent resume_patch) or heuristic fallback
   ↓
retry — max 3 patches, then error with full log tail
```

- **Diagnostics are never discarded.** `compileWithSynctex`
  (`src/lib/pdf/compileLatex.ts:119`) captures the last ~80 lines / 6000
  chars of `doc.log` as a `logTail` on success *and* failure, and checks the
  normalized log for fatal patterns even when `pdflatex` exits 0 under
  `-interaction=nonstopmode`. `parseLatexLog` (`compileLatex.ts:174`) turns
  the tail into structured error lines for streaming.
- **Two patch strategies.** `patchTexViaLLM`
  (`src/agents/resumeAgent.ts:368`) sends the broken TeX plus the log tail
  to the configured provider (system prompt: fix syntax/escaping/balance,
  output only corrected TeX). Without a provider — or if the LLM fails —
  `heuristicPatch` (`resumeAgent.ts:329`) applies deterministic repairs:
  dropping the command flagged by an `Undefined control sequence` line and
  rebalancing `itemize`/`document` environments.
- **CI-safe simulation.** When no LaTeX engine is installed, `safeCompile`
  (`resumeAgent.ts:425-443`) substitutes a simulated result: a planted
  `\badcommand` still fails with a synthetic log (so the healing path stays
  testable), while clean TeX compiles "successfully" without producing a PDF.
- **Bounded retries.** The loop runs at most `maxPatches + 1` compile
  attempts, clamped to 0-3 (`resumeAgent.ts:402`). Exhausting the budget
  emits `error` with the full log tail rather than looping forever.
- **ATS gate, honestly labeled.** Each successful compile runs
  `analyzeAts(tex, jobDescription)`; the loop reports
  `approved = score >= 50` (`resumeAgent.ts:455`). This remains the design
  heuristic described above — not a parsing guarantee from any ATS vendor.
- **Streaming transport.** `POST /api/resume/agent-loop`
  (`src/app/api/resume/agent-loop/route.ts`) streams the loop as
  server-sent events — `latex_log`, `patch`, `ats_score`, `draft`, `done`,
  `error` — with keepalives and client-abort wiring. Input is capped at
  200k characters of TeX (HTTP 413 beyond) and `maxPatches` is clamped
  server-side.

## Source ownership & persistence

- Hand edits, Copilot output, draft loads, and confirmed template switches
  are explicit: background re-renders never clobber edited source.
- Debounced auto-compile (900ms) runs on `ready`/`error` states; explicit
  Save persists to a single `studio-main` row in `resume_docs` (server
  SQLite is truth — never localStorage), with autosave after the first
  explicit save and a `409 STALE_REV` guard against stale overwrites.
- Additive columns `last_compile_token`, `last_compile_at`, `editor_rev`
  migrate idempotently; old installs backfill defaults in place.

## SyncTeX navigation

- Forward: the live editor cursor line → `POST /api/resume/synctex/forward`
  → measured PDF point → scrolled, flashing marker.
- Reverse: arming reverse (`Jump to source`) makes the next PDF click map
  through measured page geometry → `POST /api/resume/synctex/reverse` →
  source line revealed in the editor. No hardcoded coordinates anywhere;
  without a live compile token SyncTeX stays disabled with a reason.

## Copilot streaming & tools

- `POST /api/resume/copilot/stream` (Next.js SSE, `nodejs` + `force-dynamic`,
  keepalive + abort wiring) emits `config | reasoning | tool_call | token |
  patch | latex_log | ats_score | done | error`. The legacy JSON route is
  preserved as the fallback. Reasoning frames are server-curated
  operational summaries — raw chain-of-thought never leaves the server.
- Whitelisted tools with `status / summary / next_actions / artifacts`:
  `search_vault`, `read_selection`, `patch_tex` (exact unique anchors;
  preamble/shell constructs refused), `compile_check` (real compile +
  ATS), `retarget` (deterministic JD-overlap re-rank, facts untouched).
  At most 2 tool rounds, 1 streamed composition, 1 structured edit call.

## Attachments & viewer worker

- `POST /api/resume/copilot/attachments` accepts PDF/PNG/JPEG/WebP only
  (MIME + extension + magic bytes, encrypted-PDF probe): max 3 files,
  10 MB each, 25 MB total. PDFs are extracted server-side (bounded,
  cited); images travel base64 to the first vision-capable chain entry
  (registry `vision` capability + model match) and are never described
  locally. Bytes live in an ephemeral consume-once cache (10-min TTL) —
  descriptors only reach the client.
- The pdf.js worker loads same-origin from `public/pdf/` (postinstall
  copies the version-pinned bundle; gitignored). The Monaco editor
  runtime loads from its CDN on first use and reports an honest offline
  failure instead of a fake editor.

## Verification checklist

For every material template change:

1. Render a representative, non-sensitive sample.
2. Compile it through the production API path.
3. Confirm the PDF page count and metadata.
4. Render every page to images and visually inspect clipping, overflow, font fallback, and spacing.
5. Extract text from the PDF and confirm core headings and content remain machine-readable.
6. Test unusually long role titles, URLs, skill lists, and multilingual glyphs relevant to the template.

