import { describe, it, expect } from "vitest";
import {
  extractTexSections,
  assembleTemplateWithSections,
} from "@/lib/pdf/templateSwitcher";
import {
  parseTexSettings,
  applyTexSettings,
} from "@/lib/pdf/texSettingsSync";

const SAMPLE_TEX = `\\documentclass[10pt]{article}
\\usepackage{geometry}
\\geometry{letterpaper, margin=0.55in, top=0.5in, bottom=0.5in}
\\usepackage{xcolor}
\\definecolor{accent}{HTML}{1F3A5F}
\\definecolor{ink}{HTML}{1F2937}
\\pagestyle{empty}

\\newcommand{\\resumesection}[1]{{\\color{accent} #1}}
\\newcommand{\\resumeentry}[4]{#1 #2 #3 #4}

\\begin{document}

{\\LARGE\\bfseries\\color{ink} Sarah Connor}\\par
{\\large\\color{accent} Principal Security Engineer}\\par
\\vspace{0.12em}
{\\small\\color{ink} sarah@skynet-defense.com \\quad|\\quad +1 (555) 019-2834 \\quad|\\quad Los Angeles, CA \\quad|\\quad github.com/sarah-defense}
\\vspace{0.35em}

\\resumesection{Summary}
Battle-tested security architect with 10+ years defending critical infrastructure.

\\resumesection{Experience}
\\resumeentry{Lead Cyber Defense}{Cyberdyne Systems}{2020 -- Present}{\\begin{itemize}\\item Defended neural net clusters.\\end{itemize}}

\\resumesection{Skills}
Threat Modeling, Cryptography, Rust, Go, Linux Kernel

\\end{document}`;

describe("templateSwitcher", () => {
  it("extracts header and sections cleanly from raw LaTeX", () => {
    const sections = extractTexSections(SAMPLE_TEX);
    expect(sections.name).toBe("Sarah Connor");
    expect(sections.title).toBe("Principal Security Engineer");
    expect(sections.contact).toContain("sarah@skynet-defense.com");
    expect(sections.summary).toContain("Battle-tested security architect");
    expect(sections.experience).toContain("Lead Cyber Defense");
    expect(sections.skills).toContain("Threat Modeling");
  });

  it("assembles target template with extracted sections", () => {
    const sections = extractTexSections(SAMPLE_TEX);
    const mockTargetTemplate = `\\documentclass{article}
\\begin{document}
NAME: {{NAME}}
TITLE: {{TITLE}}
CONTACT: {{CONTACT}}
{{SUMMARY}}
{{EXPERIENCE}}
{{SKILLS}}
\\end{document}`;

    const assembled = assembleTemplateWithSections(mockTargetTemplate, sections);
    expect(assembled).toContain("NAME: Sarah Connor");
    expect(assembled).toContain("TITLE: Principal Security Engineer");
    expect(assembled).toContain("Battle-tested security architect");
    expect(assembled).toContain("Lead Cyber Defense");
  });
});

describe("texSettingsSync", () => {
  it("parses settings from LaTeX buffer and extracts real GitHub handle", () => {
    const parsed = parseTexSettings(SAMPLE_TEX);
    expect(parsed.name).toBe("Sarah Connor");
    expect(parsed.title).toBe("Principal Security Engineer");
    expect(parsed.email).toBe("sarah@skynet-defense.com");
    expect(parsed.github).toBe("github.com/sarah-defense");
    expect(parsed.accentColor).toBe("1F3A5F");
    expect(parsed.margin).toBe("0.55in");
    expect(parsed.showPhoto).toBe(false);
    expect(parsed.useIcons).toBe(false);
  });

  it("patches accent color and margins into LaTeX buffer", () => {
    const patched = applyTexSettings(SAMPLE_TEX, {
      accentColor: "059669",
      margin: "0.42in",
    });
    expect(patched).toContain("\\definecolor{accent}{HTML}{059669}");
    expect(patched).toContain("margin=0.42in");
  });

  it("patches photo and icons into LaTeX buffer using local photo.png and photo source comment", () => {
    const patched = applyTexSettings(SAMPLE_TEX, {
      showPhoto: true,
      photoUrl: "https://example.com/avatar.jpg",
      useIcons: true,
    });
    expect(patched).toContain("\\usepackage{graphicx}");
    expect(patched).toContain("\\usepackage{fontawesome5}");
    expect(patched).toContain("% HUNTFLOW_PHOTO_SOURCE: https://example.com/avatar.jpg");
    expect(patched).toContain("\\includegraphics[width=2.4cm,height=2.4cm,keepaspectratio]{photo.png}");
    expect(patched).toContain("\\faEnvelope\\ sarah@skynet-defense.com");

    const reParsed = parseTexSettings(patched);
    expect(reParsed.showPhoto).toBe(true);
    expect(reParsed.photoUrl).toBe("https://example.com/avatar.jpg");
    expect(reParsed.useIcons).toBe(true);
  });
});
