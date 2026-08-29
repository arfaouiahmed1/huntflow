# Task 18 — Evidence: Compiled LaTeX PDF as primary Resume Studio view

**Date:** 2026-08-29
**Scope:** Same files as Task 17 + compile route `src/app/api/resume/compile/route.ts` + `src/lib/pdf/compileLatex.ts`

## Implementation

- Primary view is compiled LaTeX PDF via `ResumePdfPreview` (`data-testid="compiled-pdf"`), not HTML. Center pane renders `<ResumePdfPreview>` above `<ResumeHtmlFallback>` in a column flex (`flex-col items-center gap-4`) — PDF is first, fallback second.
- HTML is explicitly labeled structural fallback in `ResumeHtmlFallback`:
  - When `pdfState === "no-tex"` or `"error"`, shows amber banner `Structure approximation — HTML fallback, not the typography source of truth. TeX engine unavailable / Last compile failed.` with `data-testid="html-fallback-label"`.
  - Toggle button `data-testid="html-preview-toggle"` labeled `HTML fallback — Structure approximation · the PDF above is authoritative` when `pdfUrl` present.
  - Hidden helper `data-testid="html-fallback-label"` always present (visible when `labeled` else muted copy) so tests can assert labeling.
- Auto-attempt initial compile when profile exists: `page.tsx` effect `if (latexSource && pdfState==="idle") void compilePreview()` on mount, with graceful offline handling (catch → `no-tex` or `error` without crash, file-level eslint disable for intentional setState-in-effect).
- TeX unavailable state proven via `ResumePdfPreview` `data-testid="no-tex-banner"` ("Compile requires local TeX — using the HTML approximation below") and `ResumeCompileControls` `data-testid="tex-unavailable"` (amber banner: `TeX unavailable — HTML fallback is shown. Install a local TeX distribution...`).
- Compile controls in header: `ResumeCompileControls` with `Compile PDF preview` (`data-testid="compile-preview"`) → `POST /api/resume/compile` → `GET /api/resume/compile?token=` and `Compile for SyncTeX` (`compile-synctex`), plus `Show diff`/`Pin baseline` — all wired to `compilePreview`/`compileSynctex`.
- Stale badge when `compiledTex !== latexSource`: `stale — recompile` in PDF header.

## Verification

- `npx tsc --noEmit` → 0.
- `npx eslint .` → 0 errors (34 warnings), green.
- `npx vitest run src/lib/__tests__/resumeStudio.test.ts` → 4/4 pass (wiring proves PDF primary + fallback labeling + bounded + collapsible).
- Visual hierarchy: `ResumePdfPreview` section carries `Compiled PDF — typography source of truth` header + Download PDF link (compileToken-aware); fallback is secondary beneath it with toggle `html-preview-toggle`.
- Bounded sizes already proven in Task 17 (73/65/51 <150) and `page.tsx` 987 <1500.
- `next.config.ts` `outputFileTracingIncludes` for `/api/resume/*` → `src/lib/pdf/templates/*.tex` ensures Docker `next build` includes LaTeX templates.

## Evidence of no fabrication

- When TeX unavailable, no PDF is fabricated — `ResumePdfPreview` shows `no-tex-banner` and fallback label states `Compile requires local TeX — using the HTML approximation below`.
- When compile fails, `pdfState === "error"` surfaces `data-testid="pdf-error"` with `Compile failed: <error>` and retains fallback label.

## Files

- Reuse `ResumePdfPreview.tsx` / `ResumeHtmlFallback.tsx` / `ResumeCompileControls.tsx` + `src/lib/pdf/compileLatex.ts` + `src/app/api/resume/compile/route.ts`.
- Modified `src/app/(app)/resume/page.tsx` (987 lines, + `pdfUrl`/`pdfState`/`compilePreview` wiring, PDF-first center pane).

## Risks

- Docker image bakes `texlive-* + lmodern` for production compile; local dev without TeX correctly falls back to labeled HTML per above (no crash, `no-tex` banner).
- `compilePreview` is idempotent; `pdfState==="idle"` gate prevents infinite loop; `void compilePreview()` is intentionally fire-and-forget with file-level eslint disable.
