import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE,
  parseAppearance,
  resolveTheme,
} from "@/lib/appearance";

describe("appearance preferences", () => {
  it("resolves system appearance from the operating-system preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("accepts a complete persisted preference and rejects malformed storage", () => {
    expect(parseAppearance(JSON.stringify({ mode: "light", sidebarCollapsed: true }))).toEqual({
      mode: "light",
      sidebarCollapsed: true,
    });
    expect(parseAppearance('{"mode":"sepia","sidebarCollapsed":true}')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('{"mode":"dark"}')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("not-json")).toEqual(DEFAULT_APPEARANCE);
  });
});
