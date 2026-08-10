import { describe, it, expect } from "vitest";
import { maskSecret, isMasked, MASK_PREFIX } from "@/lib/masking";

describe("maskSecret", () => {
  it("returns empty for empty input", () => {
    expect(maskSecret()).toBe("");
    expect(maskSecret("")).toBe("");
  });

  it("returns just the prefix for short secrets", () => {
    expect(maskSecret("abc")).toBe(MASK_PREFIX);
    expect(maskSecret("abcdef")).toBe(MASK_PREFIX);
  });

  it("keeps only the last 4 characters", () => {
    expect(maskSecret("sk-abcdefghijkl")).toBe(`${MASK_PREFIX}ijkl`);
    expect(maskSecret("sk-1234567890")).toBe(`${MASK_PREFIX}7890`);
  });
});

describe("isMasked", () => {
  it("detects masked values", () => {
    expect(isMasked(`${MASK_PREFIX}abcd`)).toBe(true);
    expect(isMasked(MASK_PREFIX)).toBe(true);
  });

  it("rejects plaintext and empty values", () => {
    expect(isMasked("sk-1234")).toBe(false);
    expect(isMasked("")).toBe(false);
    expect(isMasked(undefined)).toBe(false);
    expect(isMasked(null)).toBe(false);
  });
});
