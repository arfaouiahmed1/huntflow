import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function read(p: string) {
  return fs.readFileSync(path.join(process.cwd(), p), "utf8");
}

describe("AI Studio — TexEditor + PdfViewer primary", () => {
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

  it("wires TexEditor + PdfViewer in studio/page.tsx without HTML fallback", () => {
    const src = read("src/app/(app)/studio/page.tsx");
    expect(src).toContain("TexEditor");
    expect(src).toContain("PdfViewer");
    expect(src).not.toContain("ResumeHtmlFallback");
    expect(src).not.toContain("ResumeCompileControls");
    expect(src).not.toContain("ResumePdfPreview");
    expect(src).toContain("useAutoCompile");
  });

  it("supports all four document kinds with registry-driven templates", () => {
    const src = read("src/app/(app)/studio/page.tsx");
    expect(src).toContain("cover_letter");
    expect(src).toContain("motivation_letter");
    expect(src).toContain("templatesForKind");
    expect(src).toContain("DOC_TYPE_META");
    expect(src).not.toContain("ALL_TEMPLATES");
  });

  it("drives the gallery from the template registry including two-column layouts", () => {
    const src = read("src/app/(app)/studio/page.tsx");
    expect(src).toContain("STUDIO_TEMPLATES");
    expect(src).toContain("developer-dashboard");
    const preview = read("src/components/resume/TemplateVisualPreview.tsx");
    expect(preview).toContain("dashboard");
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

  it("keeps studio/page.tsx bounded <1500 lines and imports are clean", () => {
    const src = read("src/app/(app)/studio/page.tsx");
    const lines = src.split("\n").length;
    expect(lines).toBeLessThan(1500);
    expect(lines).toBeGreaterThan(400);
    expect(src).toContain('"use client"');
  });

  it("redirects the legacy /resume route to /studio", () => {
    const config = read("next.config.ts");
    expect(config).toContain('source: "/resume"');
    expect(config).toContain('destination: "/studio"');
    const sidebar = read("src/components/Sidebar.tsx");
    expect(sidebar).toContain('href: "/studio"');
    expect(sidebar).toContain("AI Studio");
  });
});
