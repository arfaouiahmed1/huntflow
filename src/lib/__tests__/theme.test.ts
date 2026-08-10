import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { palette, rawPalette, tint } from "@/lib/theme";

describe("theme palette", () => {
  it("exposes every raw color as a kebab-case CSS variable reference", () => {
    for (const key of Object.keys(rawPalette)) {
      const kebab = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      expect(palette[key as keyof typeof rawPalette]).toBe(`var(--${kebab})`);
    }
  });

  it("tint produces a color-mix alpha", () => {
    expect(tint("var(--chartreuse)", 0.25)).toBe("color-mix(in srgb, var(--chartreuse) 25%, transparent)");
    expect(tint("var(--sky)", 0.5)).toContain("50%");
    expect(tint("var(--sky)", 1)).toContain("100%");
    expect(tint("var(--sky)", 1.5)).toContain("100%");
    expect(tint("var(--sky)", -0.2)).toContain("0%");
  });

  it("matches the CSS definitions (no drift)", () => {
    const css = fs.readFileSync("src/app/globals.css", "utf-8");
    for (const [key, value] of Object.entries(rawPalette)) {
      const kebab = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      expect(css).toContain(`--${kebab}: ${value}`);
    }
  });
});
