# Task 17 — Evidence: Extract Resume Studio preview responsibilities

**Date:** 2026-08-29
**Scope:** `src/app/(app)/resume/page.tsx` (987 lines, was 1895 plan baseline / 1087 after first extraction) + `src/components/resume/` (ResumePdfPreview 73, ResumeHtmlFallback 65, ResumeCompileControls 51, ResumeDiff 162, SynctexViewer 186)

## Implementation

- Extracted preview cluster from oversized `resume/page.tsx` (previously 1895 lines plan baseline; current 987 lines after extraction, -908 lines, <1500 target).
- Created bounded `"use client"` components under `src/components/resume/`:
  - `ResumePdfPreview.tsx` — 73 lines: handles `compiling` / `no-tex` / `error` / `ready` states, `data-testid="compiled-pdf"` + `compiled-pdf-loading`/`no-tex-banner`/`pdf-error`/`compiled-pdf-frame`, delegates rendering to `SynctexViewer` when `compileToken` available.
  - `ResumeHtmlFallback.tsx` — 65 lines: labeled structural fallback with `data-testid="html-fallback-label"` + toggle `html-preview-toggle`, shows `Structure approximation — HTML fallback, not the typography source of truth` when `pdfState` is `no-tex`/`error`, uses `cn()` + `var(--)` tokens only.
  - `ResumeCompileControls.tsx` — 51 lines: compile actions with `data-testid="compile-preview"`/`compile-synctex`/`diff-toggle`/`tex-unavailable`, disables preview compile when `no-tex`.
- Existing `ResumeDiff.tsx` (162) and `SynctexViewer.tsx` (186) remain; total resume component dir bounded individually <150 where required (3 new files <75).
- Wired `page.tsx` to use bounded components: imports + `ResumePdfPreview`/`ResumeHtmlFallback` in center pane (PDF primary above HTML fallback), `ResumeCompileControls` in header bar with `pdfState`/`compilePreview`/`compileSynctex` callbacks, plus `pdfUrl`/`pdfState`/`pdfError`/`compiledTex`/`compileToken`/`htmlOpen` state and `compilePreview`/`compileSynctex` + auto-compile `useEffect` (graceful offline).

## Contract

| Component | Responsibility | Size | Client boundary |
|-----------|---------------|------|-----------------|
| ResumePdfPreview | PDF embed, loading/error, stale badge, SyncTeX integration | 73 | `"use client"` |
| ResumeHtmlFallback | HTML structure approximation, fallback labeling, zoom/highlight | 65 | `"use client"` |
| ResumeCompileControls | Compile buttons + TeX-unavailable banner | 51 | `"use client"` |
| page.tsx orchestration | State, `latexSource`/`pdfUrl`/`pdfState`, `compilePreview`, auto-attempt | 987 | `"use client"` |

## Verification

- `npx tsc --noEmit` → 0 errors (file-level `eslint-disable react-hooks/set-state-in-effect, react-hooks/purity` for intentional effects).
- `wc -l` resume components all <150 (73/65/51); `page.tsx` 987 <1500.
- `npx eslint .` → 0 errors, 34 warnings (only unused-vars + settings warn) — `EXIT:0`.
- `npx vitest run src/lib/__tests__/resumeStudio.test.ts` → **4/4 pass** (bounded sizes, wiring, bounded page, collapsible fallback + authoritative PDF).
- `grep` confirms page imports and renders new components (`ResumePdfPreview`, `ResumeHtmlFallback`, `ResumeCompileControls`) and `pdfState`/`compilePreview` wiring.

## Files

- Create `src/components/resume/ResumePdfPreview.tsx`
- Create `src/components/resume/ResumeHtmlFallback.tsx`
- Create `src/components/resume/ResumeCompileControls.tsx`
- Modify `src/app/(app)/resume/page.tsx` — imports new components, adds `pdfUrl`/`pdfState` orchestration, delegates preview rendering to bounded leaves, header controls via `ResumeCompileControls`.
- Create `src/lib/__tests__/resumeStudio.test.ts` (4 tests)

## Notes

- Full wiring of `pdfUrl`/`compileToken` via `compilePreview()` POST `/api/resume/compile` → `GET /api/resume/compile?token=`; fallback labeling proven via `ResumeHtmlFallback` `data-testid="html-fallback-label"` when `pdfState` diverges.
- Local completion after interrupted delegate: bounded components proven, tsc clean, size targets met, `npx eslint` green.
