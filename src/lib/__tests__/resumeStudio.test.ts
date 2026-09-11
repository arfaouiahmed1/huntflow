import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function read(p: string) {
  return fs.readFileSync(path.join(process.cwd(), p), "utf8");
}

describe("Overleaf Resume Studio — TexEditor + PdfViewer primary", () => {
  it("creates clean Overleaf components with design tokens", () => {
    const files = [
      "src/components/resume/TexEditor.tsx",
      "src/components/resume/PdfViewer.tsx",
      "src/hooks/useAutoCompile.ts",
    ];
    for (const f of files) {
      const src = read(f);
      expect(src.length).toBeGreaterThan(0);
      expect(src).toContain("use client");
    }
  });

  it("wires TexEditor + PdfViewer in resume/page.tsx without HTML fallback", () => {
    const src = read("src/app/(app)/resume/page.tsx");
    expect(src).toContain("TexEditor");
    expect(src).toContain("PdfViewer");
    expect(src).not.toContain("ResumeHtmlFallback");
    expect(src).not.toContain("ResumeCompileControls");
    expect(src).not.toContain("ResumePdfPreview");
    expect(src).toContain("useAutoCompile");
  });

  it("exports AUTO_COMPILE_DEBOUNCE_MS with generation guard in useAutoCompile", () => {
    const src = read("src/hooks/useAutoCompile.ts");
    expect(src).toContain("AUTO_COMPILE_DEBOUNCE_MS");
    expect(src).toContain("1200");
    expect(src).toContain("AbortController");
  });

  it("PdfViewer contains stable testids", () => {
    const pdf = read("src/components/resume/PdfViewer.tsx");
    expect(pdf).toContain('data-testid="compiled-pdf"');
    expect(pdf).toContain('data-testid="compiled-pdf-frame"');
  });

  it("keeps resume/page.tsx bounded <1500 lines and imports are clean", () => {
    const src = read("src/app/(app)/resume/page.tsx");
    const lines = src.split("\n").length;
    expect(lines).toBeLessThan(1500);
    expect(lines).toBeGreaterThan(400);
    expect(src).toContain('"use client"');
  });
});
