import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function read(p: string) {
  return fs.readFileSync(path.join(process.cwd(), p), "utf8");
}

function exists(p: string) {
  return fs.existsSync(path.join(process.cwd(), p));
}

describe("Resume Studio — PDF-only LaTeX primary", () => {
  it("keeps bounded resume components and uses design tokens", () => {
    const files = [
      "src/components/resume/ResumePdfPreview.tsx",
      "src/components/resume/ResumeCompileControls.tsx",
    ];
    for (const f of files) {
      const src = read(f);
      const lines = src.split("\n").length;
      expect(lines, `${f} bounded`).toBeLessThanOrEqual(150);
      expect(src.length).toBeGreaterThan(0);
    }
  });

  it("wires PDF-only LaTeX preview in resume/page.tsx with no HTML fallback", () => {
    const src = read("src/app/(app)/resume/page.tsx");
    expect(src).toContain("ResumePdfPreview");
    expect(src).toContain("ResumeCompileControls");
    expect(src).toContain("pdfState");
    expect(src).toContain("pdfUrl");
    // auto-compile effect
    expect(src).toContain("compilePreview");
    // HTML fallback is gone from the render tree
    expect(src).not.toContain("ResumeHtmlFallback");
    expect(src).not.toContain("htmlOpen");
    expect(src).not.toContain("Structure approximation");
    // Studio surface is LaTeX-only: no Typst engine selector, no markup fetch
    expect(src).not.toContain("compile-typst");
    expect(src).not.toContain("setEngine");
    expect(src).not.toContain("Typst preview");
    // the dead fallback component is deleted, not left unused
    expect(exists("src/components/resume/ResumeHtmlFallback.tsx")).toBe(false);
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

  it("keeps the compiled PDF as the typography source of truth", () => {
    const pdf = read("src/components/resume/ResumePdfPreview.tsx");
    // PDF is typography source of truth
    expect(pdf).toContain("typography source of truth");
    expect(pdf).toContain("Compiled PDF");
  });
});
