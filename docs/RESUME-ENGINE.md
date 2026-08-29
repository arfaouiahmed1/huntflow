# Resume and LaTeX engine

## Rendering model

Resume Studio has two distinct renderers:

1. The **browser structure preview** provides quick feedback while editing.
2. The **LaTeX compiler** produces the downloadable PDF from the selected `.tex` template.

The preview is not a pixel-perfect PDF emulator. It mirrors hierarchy, density, and font category, while LaTeX remains the source of truth for line breaking, pagination, spacing, and final glyph rendering.

## Typography

The default Classic LaTeX ATS template uses **Latin Modern Roman**. Latin Modern is a modernized, expanded implementation of the Computer Modern design most people associate with LaTeX.

Templates that intentionally use a sans-serif voice load **Latin Modern Sans**. Template metadata shown in the UI must match the actual preamble so the chosen visual language is explicit.

The web preview uses STIX Two Text as a self-hosted document serif. It is a browser-safe structural approximation with a scholarly texture; it is not falsely presented as the compiled LaTeX font.

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

## Verification checklist

For every material template change:

1. Render a representative, non-sensitive sample.
2. Compile it through the production API path.
3. Confirm the PDF page count and metadata.
4. Render every page to images and visually inspect clipping, overflow, font fallback, and spacing.
5. Extract text from the PDF and confirm core headings and content remain machine-readable.
6. Test unusually long role titles, URLs, skill lists, and multilingual glyphs relevant to the template.

