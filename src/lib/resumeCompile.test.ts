import { describe, it, expect } from "vitest";
import { resolveCompileEngine, resolveTypstLatency, resolveLatexLatency, TYPST_ENTER_CLEAR, resolveTypstOutcome, resolveTypstRequestFailure } from "./resumeCompile";

describe("resolveCompileEngine", () => {
  it("prefers the explicitly requested engine over current state", () => {
    // Regression: onClick did setEngine("latex") then compiled with the
    // still-"typst" state, running the wrong pipeline on first switch.
    expect(resolveCompileEngine("latex", "typst")).toBe("latex");
    expect(resolveCompileEngine("typst", "latex")).toBe("typst");
  });

  it("falls back to current state for engine-agnostic compiles", () => {
    expect(resolveCompileEngine(undefined, "typst")).toBe("typst");
    expect(resolveCompileEngine(undefined, "latex")).toBe("latex");
  });
});

describe("resolveTypstLatency", () => {
  it("keeps the server duration on success", () => {
    expect(resolveTypstLatency({ ok: true, durationMs: 42 }, 99)).toBe(42);
    expect(resolveTypstLatency({ success: true, durationMs: 7 }, 99)).toBe(7);
  });

  it("falls back to client-measured time when the server omits duration", () => {
    expect(resolveTypstLatency({ ok: true }, 99)).toBe(99);
  });

  it("resets to null on non-ok contracts so the badge cannot go stale", () => {
    expect(resolveTypstLatency({ ok: false, durationMs: 42 }, 99)).toBeNull();
    expect(resolveTypstLatency({ success: false }, 99)).toBeNull();
    expect(resolveTypstLatency({}, 99)).toBeNull();
  });

  it("resets to null on missing/unparseable responses and thrown fetches", () => {
    expect(resolveTypstLatency(null, 99)).toBeNull();
    expect(resolveTypstLatency(undefined, 99)).toBeNull();
  });
});

describe("resolveLatexLatency", () => {
  it("reports elapsed time on success and null on failure", () => {
    expect(resolveLatexLatency(true, 123)).toBe(123);
    expect(resolveLatexLatency(false, 123)).toBeNull();
  });
});

describe("TYPST_ENTER_CLEAR", () => {
  it("nulls every LaTeX/PDF artifact so no prior PDF survives a Typst switch", () => {
    expect(TYPST_ENTER_CLEAR.pdfUrl).toBeNull();
    expect(TYPST_ENTER_CLEAR.compileToken).toBeNull();
    expect(TYPST_ENTER_CLEAR.compiledTex).toBeNull();
    expect(TYPST_ENTER_CLEAR.compileLatencyMs).toBeNull();
    expect(TYPST_ENTER_CLEAR.pdfError).toBeNull();
  });
});

describe("resolveTypstOutcome", () => {
  it("maps valid markup to ready with markup and honest latency", () => {
    const ok = resolveTypstOutcome({ ok: true, typstMarkup: "#set page()\nHi", durationMs: 42 }, 99);
    expect(ok.pdfState).toBe("ready");
    expect(ok.markup).toBe("#set page()\nHi");
    expect(ok.pdfError).toBeNull();
    expect(ok.latencyMs).toBe(42);
    const fallback = resolveTypstOutcome({ success: true, typstMarkup: "markup" }, 99);
    expect(fallback.pdfState).toBe("ready");
    expect(fallback.latencyMs).toBe(99);
  });

  it("maps non-ok contracts to error with an actionable message, never ready", () => {
    for (const body of [{ ok: false }, { success: false }, {}]) {
      const outcome = resolveTypstOutcome(body, 99);
      expect(outcome.pdfState).toBe("error");
      expect(outcome.markup).toBeNull();
      expect(outcome.latencyMs).toBeNull();
      expect(typeof outcome.pdfError).toBe("string");
      expect(outcome.pdfError as string).toMatch(/latex/i);
    }
  });

  it("maps ok-but-markupless bodies to error instead of an empty preview", () => {
    for (const body of [{ ok: true }, { ok: true, typstMarkup: "" }, { success: true }]) {
      const outcome = resolveTypstOutcome(body, 99);
      expect(outcome.pdfState).toBe("error");
      expect(outcome.markup).toBeNull();
      expect(outcome.latencyMs).toBeNull();
      expect(typeof outcome.pdfError).toBe("string");
    }
  });

  it("maps missing/unparseable bodies to error", () => {
    for (const body of [null, undefined]) {
      const outcome = resolveTypstOutcome(body, 99);
      expect(outcome.pdfState).toBe("error");
      expect(outcome.markup).toBeNull();
      expect(outcome.latencyMs).toBeNull();
      expect(typeof outcome.pdfError).toBe("string");
    }
  });
});

describe("resolveTypstRequestFailure", () => {
  it("maps fetch/HTTP failures to error with latency cleared and guidance", () => {
    const outcome = resolveTypstRequestFailure("HTTP 500");
    expect(outcome.pdfState).toBe("error");
    expect(outcome.markup).toBeNull();
    expect(outcome.latencyMs).toBeNull();
    expect(outcome.pdfError).toContain("HTTP 500");
    expect(outcome.pdfError as string).toMatch(/latex/i);
    const bare = resolveTypstRequestFailure();
    expect(bare.pdfState).toBe("error");
    expect(typeof bare.pdfError).toBe("string");
  });
});
