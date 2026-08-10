import { describe, it, expect } from "vitest";
import { estimateCost } from "@/lib/llm/costs";

describe("estimateCost", () => {
  it("is zero for local providers", () => {
    expect(estimateCost("ollama", 1000, 500)).toBe(0);
    expect(estimateCost("custom", 1000, 500)).toBe(0);
    expect(estimateCost(undefined, 1000, 500)).toBeGreaterThan(0);
  });

  it("computes openrouter cost from per-million rates", () => {
    const cost = estimateCost("openrouter", 1_000_000, 500_000);
    expect(cost).toBeCloseTo(0.25 + 0.5, 6);
  });

  it("falls back to default pricing for unknown providers", () => {
    const cost = estimateCost("not-a-provider", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(1.25, 6);
  });

  it("scales linearly with tokens", () => {
    const half = estimateCost("openai", 500_000, 250_000);
    const full = estimateCost("openai", 1_000_000, 500_000);
    expect(half * 2).toBeCloseTo(full, 6);
  });
});
