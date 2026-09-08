import { describe, it, expect } from "vitest";
import { computeDiff, getChangedSections } from "./ResumeDiff";

describe("ResumeDiff source contracts", () => {
  it("marks added, removed, and context lines with line numbers", () => {
    const diff = computeDiff("alpha\nbeta\ngamma", "alpha\nBETA\ngamma\ndelta");
    const kinds = diff.map((d) => d.type);
    expect(kinds).toContain("add");
    expect(kinds).toContain("remove");
    expect(kinds).toContain("context");
    const added = diff.filter((d) => d.type === "add");
    expect(added.map((d) => d.text)).toEqual(["BETA", "delta"]);
    expect(added[0]?.afterLine).toBe(2);
  });

  it("reports identical sources with context only", () => {
    const diff = computeDiff("same\nlines", "same\nlines");
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.every((d) => d.type === "context")).toBe(true);
  });
  it("maps changed lines to resume section keys for the changed chip", () => {
    const diff = computeDiff(
      "\\section{Summary}\nDev\nSkills: Java",
      "\\section{Summary}\nDev\nSkills: Java, Go"
    );
    const sections = getChangedSections(diff);
    expect(sections).toContain("skills");
    expect(sections).not.toContain("education");
  });

  it("returns no sections when nothing changed", () => {
    expect(getChangedSections(computeDiff("a", "a"))).toEqual([]);
  });
});
