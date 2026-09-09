// Pure compile-state decisions for the Resume Studio dual-engine preview
// (`src/app/(app)/resume/page.tsx`). Kept DOM-free so vitest (node env)
// can pin the PR #22 regression contracts: deterministic engine selection
// and a latency badge that can never show a previous run's value.

/** Typesetting engines: Typst markup preview vs authoritative LaTeX PDF. */
export type ResumeEngine = "latex" | "typst";

/**
 * The engine a compile must run with. Click handlers call
 * `setEngine(next)` (async state) and must pass `next` explicitly —
 * reading `engine` state in the same tick still yields the previous
 * engine, which ran the wrong pipeline on first switch (PR #22).
 */
export function resolveCompileEngine(
  requested: ResumeEngine | undefined,
  current: ResumeEngine
): ResumeEngine {
  return requested ?? current;
}

export interface TypstCompileResponse {
  ok?: boolean;
  success?: boolean;
  typstMarkup?: string;
  durationMs?: number;
}

/**
 * Latency badge value after a Typst attempt. Any non-ok contract (or an
 * unparseable/empty response) yields `null` so the badge hides instead of
 * showing a stale previous-run duration next to the fresh preview.
 */
export function resolveTypstLatency(
  data: TypstCompileResponse | null | undefined,
  fallbackMs: number
): number | null {
  if (!data) return null;
  if (!(data.ok ?? data.success)) return null;
  return typeof data.durationMs === "number" ? data.durationMs : fallbackMs;
}

/**
 * Latency badge value after a LaTeX attempt. Failures yield `null` for the
 * same stale-badge reason — the header already reports "Compile failed".
 */
export function resolveLatexLatency(ok: boolean, elapsedMs: number): number | null {
  return ok ? elapsedMs : null;
}
