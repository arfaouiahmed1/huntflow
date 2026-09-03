/**
 * Unified Candidate Dossier Compiler — Huntflow Agent Hardening
 *
 * Compiles a unified multi-page portfolio package:
 * - Page 1: Tailored 1-Page Resume
 * - Page 2: Matching Tailored Cover Letter
 * - Page 3+: Vault Technical Case Studies & Architecture Evidence
 */

import { ResumeContent } from "@/types";
import { renderTypstResume, escapeTypst } from "./typstRenderer";

export interface DossierCaseStudy {
  title: string;
  role: string;
  metrics: string[];
  architectureOverview: string;
  techStack: string[];
  vaultAnchor?: string;
}

export interface DossierInput {
  resumeContent: ResumeContent;
  coverLetter?: {
    salutation?: string;
    body: string;
    closing?: string;
    targetCompany: string;
    targetRole: string;
  };
  caseStudies?: DossierCaseStudy[];
  templateId?: string;
}

export function compileCandidateDossier(input: DossierInput): {
  typstMarkup: string;
  estimatedPages: number;
} {
  const parts: string[] = [];

  // Page 1: Resume
  const resumeMarkup = renderTypstResume(input.templateId || "classic-ats", input.resumeContent);
  parts.push(resumeMarkup);

  let pageCount = 1;

  // Page 2: Cover Letter (with Pagebreak)
  if (input.coverLetter && input.coverLetter.body.trim()) {
    pageCount += 1;
    const cl = input.coverLetter;
    const h = input.resumeContent.header;
    const senderName = escapeTypst(h.name || "Candidate");
    const senderContacts = [h.email, h.phone, h.location].filter(Boolean).map(escapeTypst).join("  •  ");

    parts.push(
      `#pagebreak()`,
      `// Page 2: Tailored Cover Letter`,
      `#align(center)[`,
      `  #text(size: 16pt, weight: "bold")[${senderName}] \\`,
      `  #v(2pt)#text(size: 8.5pt, fill: rgb("#6b7280"))[${senderContacts}]`,
      `]`,
      `#v(14pt)`,
      `#text(size: 9.5pt, weight: "bold", fill: rgb("#374151"))[Regarding: ${escapeTypst(cl.targetRole)} at ${escapeTypst(cl.targetCompany)}]`,
      `#v(6pt)`,
      `#text(size: 9.5pt)[${escapeTypst(cl.salutation || "Dear Hiring Team,")}]`,
      `#v(6pt)`,
      `#text(size: 9.5pt, leading: 0.75em)[${escapeTypst(cl.body)}]`,
      `#v(10pt)`,
      `#text(size: 9.5pt)[${escapeTypst(cl.closing || "Sincerely,")}] \\`,
      `#text(size: 9.5pt, weight: "bold")[${senderName}]`
    );
  }

  // Page 3+: Vault Case Studies
  if (input.caseStudies && input.caseStudies.length > 0) {
    pageCount += Math.ceil(input.caseStudies.length / 2);
    parts.push(
      `#pagebreak()`,
      `// Page 3+: Technical Case Studies & Vault Evidence`,
      `#align(center)[`,
      `  #text(size: 16pt, weight: "bold")[Technical Case Studies & System Architecture] \\`,
      `  #v(2pt)#text(size: 8.5pt, fill: rgb("#6b7280"))[Verified Project Proof & Production Impact]`,
      `]`,
      `#v(14pt)`
    );

    for (const study of input.caseStudies) {
      const title = escapeTypst(study.title);
      const role = escapeTypst(study.role);
      const tech = study.techStack.map(escapeTypst).join("  •  ");
      const anchor = study.vaultAnchor ? ` [Vault Anchor: ${escapeTypst(study.vaultAnchor)}]` : "";

      parts.push(
        `#block(width: 100%, stroke: 0.5pt + rgb("#e5e7eb"), inset: 12pt, radius: 4pt)[`,
        `  #grid(columns: (1fr, auto),`,
        `    [#text(weight: "bold", size: 11pt)[${title}] #if "${role}" != "" [--- #text(style: "italic")[${role}]]],`,
        `    [#text(size: 8pt, fill: rgb("#9ca3af"))[${anchor}]]`,
        `  )`,
        `  #v(2pt)`,
        `  #text(size: 8.5pt, fill: rgb("#4b5563"))[Tech Stack: ${tech}]`,
        `  #v(4pt)`,
        `  #text(size: 9pt)[${escapeTypst(study.architectureOverview)}]`
      );

      if (study.metrics.length > 0) {
        parts.push(`  #v(3pt)`, `  #text(size: 9pt, weight: "bold")[Key Outcomes & Production Metrics:]`);
        for (const m of study.metrics) {
          parts.push(`  - #text(size: 8.5pt)[${escapeTypst(m)}]`);
        }
      }

      parts.push(`]`, `#v(10pt)`);
    }
  }

  return {
    typstMarkup: parts.join("\n"),
    estimatedPages: pageCount,
  };
}
