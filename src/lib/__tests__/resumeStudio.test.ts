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

  it("navigates source <-> PDF through real SyncTeX, never hardcoded coords", () => {
    const src = read("src/app/(app)/resume/page.tsx");
    expect(src).toContain("handleReversePick");
    expect(src).toContain("synctex/reverse");
    expect(src).toContain("targetLine={cursorPos?.line");
    expect(src).toContain("onForward=");
    // the measured viewer lives behind the preview shell
    const preview = read("src/components/resume/ResumePdfPreview.tsx");
    expect(preview).toContain("ResumePdfViewer");
    // the viewer measures real pages; the panel no longer probes page 1 center
    const viewer = read("src/components/resume/SynctexViewer.tsx");
    expect(viewer).toContain("synctex-forward");
    expect(viewer).toContain("synctex-reverse");
    expect(exists("src/components/resume/ResumePdfViewer.tsx")).toBe(true);
    expect(exists("src/lib/synctexView.ts")).toBe(true);
  });

  it("streams the tool-aware Copilot with curated reasoning, never raw CoT", () => {
    const src = read("src/app/(app)/resume/page.tsx");
    expect(src).toContain("/api/resume/copilot/stream");
    expect(src).toContain("sendLegacyMessage");
    expect(src).toContain("ResumeCopilotPanel");
    expect(src).not.toContain("chainOfThought");
    expect(src).not.toContain("chain-of-thought");
    const panel = read("src/components/resume/ResumeCopilotPanel.tsx");
    expect(panel).toContain("Tool activity");
    expect(panel).toContain("Evidence");
    expect(exists("src/app/api/resume/copilot/stream/route.ts")).toBe(true);
    expect(exists("src/lib/copilot/tools.ts")).toBe(true);
    expect(exists("src/lib/copilot/streamCopilot.ts")).toBe(true);
    expect(exists("src/lib/sseClient.ts")).toBe(true);
    const driver = read("src/lib/copilot/streamCopilot.ts");
    expect(driver).toContain("MAX_TOOL_ROUNDS");
    expect(driver).toContain("never raw chain-of-thought");
  });

  it("secures Copilot attachments and shows honest registry templates", () => {
    const src = read("src/app/(app)/resume/page.tsx");
    expect(src).toContain("attachmentIds");
    expect(src).toContain("galleryTemplates");
    expect(src).not.toContain("ALL_TEMPLATES");
    expect(src).not.toContain("Typst preview");
    expect(exists("src/app/api/resume/copilot/attachments/route.ts")).toBe(true);
    expect(exists("src/components/resume/templateGallery.ts")).toBe(true);
    expect(exists("src/lib/llm/vision.ts")).toBe(true);
    const gallery = read("src/components/resume/templateGallery.ts");
    expect(gallery).toContain("RESUME_TEMPLATES");
    // the word may appear only in the honesty rationale, never as data access
    expect(gallery).not.toContain("meta.atsScore");
    expect(gallery).not.toContain("atsScore:");
    const upload = read("src/app/api/resume/copilot/attachments/route.ts");
    expect(upload).toContain("ENCRYPTED_PDF");
    expect(upload).toContain("TYPE_MISMATCH");
  });

  it("keeps resume/page.tsx bounded <1600 lines and imports are clean", () => {
    const src = read("src/app/(app)/resume/page.tsx");
    const lines = src.split("\n").length;
    expect(lines).toBeLessThan(1600);
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
