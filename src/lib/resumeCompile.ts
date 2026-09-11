// Pure compile-state decisions for the AI Studio dual-engine preview
// (`src/app/(app)/studio/page.tsx`). Kept DOM-free so vitest (node env)
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

/**
 * Every piece of LaTeX/PDF artifact state that entering a Typst compile
 * must null BEFORE the request. Typst preview is an HTML approximation —
 * never a PDF — so a prior LaTeX `pdfUrl`/`compileToken`/`compiledTex`
 * left in state would keep the old PDF visible behind the Typst preview
 * (PR #22). Latency and error clear in the same tick so neither a stale
 * badge nor a stale error survives the engine switch.
 */
export interface TypstEnterClear {
  pdfUrl: null;
  compileToken: null;
  compiledTex: null;
  compileLatencyMs: null;
  pdfError: null;
}
export const TYPST_ENTER_CLEAR: TypstEnterClear = {
  pdfUrl: null,
  compileToken: null,
  compiledTex: null,
  compileLatencyMs: null,
  pdfError: null,
};

/** Honest canvas state after one Typst attempt (HTML approximation, no PDF). */
export interface TypstPreviewOutcome {
  /** Valid markup to preview, or null when the attempt failed. */
  markup: string | null;
  /** `ready` only on valid markup; every failure maps to `error`. */
  pdfState: "ready" | "error";
  /** Actionable message on failure; null on success. */
  pdfError: string | null;
  /** Badge value: server duration (or client fallback) on success, else null. */
  latencyMs: number | null;
}

const TYPST_RETRY_HINT = "Retry, or switch to LaTeX for the authoritative PDF.";

/**
 * Maps a parsed /api/resume/compile-typst body to honest canvas state.
 * Non-ok contracts, missing/empty `typstMarkup`, and null/unparseable
 * bodies all yield `pdfState: "error"` with an actionable `pdfError` —
 * never `ready` — so a failed Typst run cannot masquerade as a preview.
 */
export function resolveTypstOutcome(
  data: TypstCompileResponse | null | undefined,
  fallbackMs: number
): TypstPreviewOutcome {
  if (!data) {
    return {
      markup: null,
      pdfState: "error",
      pdfError: `Typst preview returned an empty response. ${TYPST_RETRY_HINT}`,
      latencyMs: null,
    };
  }
  if (!(data.ok ?? data.success)) {
    return {
      markup: null,
      pdfState: "error",
      pdfError: `Typst preview failed — the markup service reported an error. ${TYPST_RETRY_HINT}`,
      latencyMs: null,
    };
  }
  if (typeof data.typstMarkup !== "string" || !data.typstMarkup) {
    return {
      markup: null,
      pdfState: "error",
      pdfError: `Typst preview returned no markup. ${TYPST_RETRY_HINT}`,
      latencyMs: null,
    };
  }
  return {
    markup: data.typstMarkup,
    pdfState: "ready",
    pdfError: null,
    latencyMs: resolveTypstLatency(data, fallbackMs),
  };
}

/**
 * Maps a thrown Typst request (fetch failure, JSON parse failure, or HTTP
 * non-ok surfaced by the caller) to the same honest error shape: latency
 * cleared, `pdfState: "error"`, actionable `pdfError`. Never `ready`.
 */
export function resolveTypstRequestFailure(reason?: unknown): TypstPreviewOutcome {
  const detail =
    typeof reason === "string" && reason
      ? `: ${reason}`
      : reason instanceof Error && reason.message
        ? `: ${reason.message}`
        : "";
  return {
    markup: null,
    pdfState: "error",
    pdfError: `Typst preview request failed${detail}. Check your connection and ${TYPST_RETRY_HINT.charAt(0).toLowerCase()}${TYPST_RETRY_HINT.slice(1)}`,
    latencyMs: null,
  };
}
