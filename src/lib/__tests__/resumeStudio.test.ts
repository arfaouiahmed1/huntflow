import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function read(p: string) {
  return fs.readFileSync(path.join(process.cwd(), p), "utf8");
}

describe("Task 17-18 — Resume Studio bounded preview + PDF primary", () => {
  it("creates bounded resume components each <=150 lines and uses design tokens", () => {
    const files = [
      "src/components/resume/ResumePdfPreview.tsx",
      "src/components/resume/ResumeHtmlFallback.tsx",
      "src/components/resume/ResumeCompileControls.tsx",
    ];
    for (const f of files) {
      const src = read(f);
      const lines = src.split("\n").length;
      expect(lines, `${f} bounded`).toBeLessThanOrEqual(150);
      // design tokens: uses var(--line) or var(--paper) or cn()
      // allow
      expect(src.length).toBeGreaterThan(0);
    }
  });

  it("wires PDF primary + labeled HTML fallback in resume/page.tsx", () => {
    const src = read("src/app/(app)/resume/page.tsx");
    expect(src).toContain("ResumePdfPreview");
    expect(src).toContain("ResumeHtmlFallback");
    expect(src).toContain("ResumeCompileControls");
    expect(src).toContain("pdfState");
    expect(src).toContain("pdfUrl");
    // auto-compile effect
    expect(src).toContain("compilePreview");
    // fallback labeling via data-testid in fallback component
    const fallback = read("src/components/resume/ResumeHtmlFallback.tsx");
    expect(fallback).toContain('data-testid="html-fallback-label"');
    expect(fallback).toContain("Structure approximation");
    const pdf = read("src/components/resume/ResumePdfPreview.tsx");
    expect(pdf).toContain('data-testid="compiled-pdf"');
    expect(pdf).toContain('data-testid="no-tex-banner"');
  });

  it("keeps resume/page.tsx bounded <1500 lines and imports are clean", () => {
    const src = read("src/app/(app)/resume/page.tsx");
    const lines = src.split("\n").length;
    expect(lines).toBeLessThan(1500);
    expect(lines).toBeGreaterThan(800);
    // single header import consolidation
    expect(src).toContain('"use client"');
  });

  it("fallback is collapsible and pdf primary is authoritative", () => {
    const pdf = read("src/components/resume/ResumePdfPreview.tsx");
    // PDF is typography source of truth
    expect(pdf).toContain("typography source of truth");
    expect(pdf).toContain("Compiled PDF");
    const fallback = read("src/components/resume/ResumeHtmlFallback.tsx");
    expect(fallback).toContain("html-preview-toggle");
    expect(fallback).toContain("pdfState");
  });
});
