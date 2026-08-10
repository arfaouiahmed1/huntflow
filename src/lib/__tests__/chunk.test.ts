import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/vault/chunk";

describe("chunkText", () => {
  it("returns [] for empty or whitespace-only input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\t  ")).toEqual([]);
  });

  it("returns one chunk for short text", () => {
    const chunks = chunkText("Hello world, this is a short document.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Hello world, this is a short document.");
    expect(chunks[0].tokens).toBeGreaterThan(0);
  });

  it("splits long text into overlapping chunks that always advance", () => {
    const words = Array.from({ length: 5000 }, (_, i) => `w${i}`).join(" ");
    const chunks = chunkText(words);
    expect(chunks.length).toBeGreaterThan(1);

    let prevIdx = -1;
    for (const c of chunks) {
      expect(c.tokens).toBeLessThanOrEqual(750);
      const idx = words.indexOf(c.text);
      expect(idx).toBeGreaterThan(prevIdx);
      prevIdx = idx;
    }
    expect(prevIdx).toBeGreaterThan(words.length / 2);
  });

  it("never produces zero-size chunks (advance bug guard)", () => {
    const words = Array.from({ length: 2000 }, () => "shortword").join(" ");
    const chunks = chunkText(words);
    for (const c of chunks) {
      expect(c.text.length).toBeGreaterThan(0);
      expect(c.tokens).toBeGreaterThan(0);
    }
  });

  it("handles a single word larger than the chunk budget without hanging", () => {
    const giant = "x".repeat(5000);
    const chunks = chunkText(`prefix ${giant} suffix`);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].text).toContain("prefix");
    const total = chunks.map((c) => c.text).join(" ");
    expect(total).toContain(giant);
    expect(total).toContain("suffix");
  });

  it("produces contiguous coverage (join of chunks equals original text modulo overlap)", () => {
    const text = Array.from({ length: 300 }, (_, i) => `term${i}`).join(" ");
    const chunks = chunkText(text);
    const joined = chunks.map((c) => c.text).join(" ");
    const words = text.split(" ");
    for (const w of words) {
      expect(joined).toContain(w);
    }
  });
});
