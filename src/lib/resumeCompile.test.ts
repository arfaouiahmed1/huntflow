import { describe, it, expect } from "vitest";
import { resolveCompileEngine, resolveTypstLatency, resolveLatexLatency } from "./resumeCompile";

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
