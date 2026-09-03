# Task 5 — Source Taxonomy Parser/Filter Engine — QA Receipts

Date: 2026-08-23 · Original implementation receipt: Task 5 implementation agent (`x-preview-f-free` / ox-alpha) · Review closure: `taxonomy-engine` (`openai/gpt-5.6-sol`). Model names identify the runs that produced each phase; they do not claim a model-availability constraint.

## Baseline confirmation (failing-first precondition)

- `Test-Path src/lib/sourceTaxonomy.ts` → `False`; `Test-Path src/lib/__tests__/sourceTaxonomy.test.ts` → `False` (matches Task 1 baseline: both targets absent).
- Worktree dirty before start (`git status --porcelain` shows pre-existing modified/untracked paths from other tasks/waves). No reset/stash/checkout performed. No commits made.

## RED (test written first)

Command: `npx vitest run src/lib/__tests__/sourceTaxonomy.test.ts`
Result: **1 suite failed — `Error: Cannot find package '@/lib/sourceTaxonomy'`** → fails for the right reason (module absent). Full log: `red-run.log`.

## GREEN

Command: `npx vitest run src/lib/__tests__/sourceTaxonomy.test.ts`
Result: **Test Files 1 passed (1), Tests 25 passed (25)**, deterministic (node env, no timers/network/DB). Full log: `green-run.log`.

## Typecheck

Command: `npx tsc --noEmit`
Result: **exit 0, zero compiler output**. `typecheck.log` records the command, capture point, exit code, and focused corroboration; it is intentionally non-empty so the receipt cannot be mistaken for a missing capture.

## Lint

Command: `npx eslint src/lib/sourceTaxonomy.ts src/lib/__tests__/sourceTaxonomy.test.ts`
Result: exit 0, no findings.

## Manual data-surface QA (no new dependency)

Tooling: existing Node runtime (v24) native TypeScript type-stripping running the real `src/lib/sourceTaxonomy.ts` module directly from an inline ESM driver; no helper file or dependency was added.
Command: `node --experimental-strip-types --input-type=module -e <inline Task 5 QA driver>`
Result: exit 0. Artifact `manual-qa.json` proves:

- Happy path: parse 4-source fixture → filter `remote_board + europe + entry + remote` → result IDs exactly `["qa-beta"]`, preserving catalog order.
- Failure path: unknown market `"atlantis"` → `ok:false`, **0 trusted objects**, one typed failure carrying `index: 0`, `boardId: "qa-bad-market"`, `path: "markets.0"`, and the Zod message.
- Fallback options: 4/6/4/4 options across axes, every option is a `{value,label}` pair only — no fabricated source cards or IDs.

## Size & scope

- `src/lib/sourceTaxonomy.ts`: **192 pure LOC** (≤250 ceiling ✓).
- Test file covers: each dimension independently, combined filters, multi-market boards, stable ordering (reference-stable frozen option lists), intentional zero matches, malformed API input (unknown source type / unknown market / empty markets / invalid payload shapes / mixed payload), fallback options, readonly freezing + compile-time exhaustive label records.

## Cleanup

- No helper script or fixtures added inside the repo; no processes left running; no background tasks.

## Constraints honored

No JSX/UI changes; no hardcoded board IDs (module contains only taxonomy literals from the approved contract); no React-state coupling (pure module, zero React imports); no `any`; no assertion escape hatches (`as` used only as `as const` on a two-key label map); no new dependency (zod already present); no automatic selection mutation (pure functions, frozen outputs); Task 4 files untouched (`src/types/index.ts`, `route.ts`, `validation.ts` read-only).
