import type { ResumeDocKind, UserProfile } from "@/types";
import { escapeLatex, contactLine, texToText } from "./sanitize";
import { loadTemplateSource, renderTemplate, contentFromProfile, templateMeta } from "./resumeTemplates";
export interface ExtractedSections {
  name: string;
  title: string;
  contact: string;
  summary: string;
  experience: string;
  projects: string;
  education: string;
  skills: string;
  certifications: string;
  languages: string;
  extraSections: { title: string; body: string }[];
}

/**
 * Parses user's raw LaTeX resume into modular section blocks.
 * Preserves the exact inner LaTeX code (bullets, rewrites, metrics) within each section.
 */
export function extractTexSections(tex: string, fallbackProfile?: UserProfile): ExtractedSections {
  const result: ExtractedSections = {
    name: fallbackProfile?.name || "Your Name",
    title: fallbackProfile?.targetTitle || "",
    contact: "",
    summary: "",
    experience: "",
    projects: "",
    education: "",
    skills: "",
    certifications: "",
    languages: "",
    extraSections: [],
  };

  if (!tex || !tex.trim()) return result;

  // Extract Name from header
  const nameMatch =
    tex.match(/\{\\LARGE\\bfseries\\color\{ink\}\s*([^\}\n]+)\}/i) ||
    tex.match(/\\textbf\{\\LARGE\s*([^\}\n]+)\}/i) ||
    tex.match(/\\textbf\{\\Huge\s*([^\}\n]+)\}/i) ||
    tex.match(/\{\\Huge\\bfseries\s*([^\}\n]+)\}/i);
  if (nameMatch && nameMatch[1].trim()) {
    result.name = nameMatch[1].trim();
  }

  // Extract Title from header
  const titleMatch =
    tex.match(/\{\\large\\color\{accent\}\s*([^\}\n]+)\}/i) ||
    tex.match(/\{\\large\\itshape\\color\{accent\}\s*([^\}\n]+)\}/i) ||
    tex.match(/\{\\large\s*([^\}\n]+)\}\\par/i);
  if (titleMatch && titleMatch[1].trim()) {
    result.title = titleMatch[1].trim();
  }

  // Extract Contact line
  const contactMatch =
    tex.match(/\{\\small\\color\{ink\}\s*([^\}\n]+(?:\\par)?)\}/i) ||
    tex.match(/\{\\small\s*([^\}\n]+)\}\s*\\vspace/i);
  if (contactMatch && contactMatch[1].trim()) {
    result.contact = contactMatch[1].trim();
  } else if (fallbackProfile) {
    result.contact = contactLine([
      fallbackProfile.email,
      fallbackProfile.phone,
      fallbackProfile.location,
      fallbackProfile.linkedin,
      fallbackProfile.github,
    ]);
  }

  // Parse all \resumesection{...} or \section{...} blocks
  const sectionRegex = /\\(?:resume)?section\*?\{([^}]+)\}([\s\S]*?)(?=(?:\\(?:resume)?section\*?\{)|\\end\{document\}|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = sectionRegex.exec(tex)) !== null) {
    const rawTitle = match[1].trim();
    const titleKey = rawTitle.toLowerCase();
    const fullBlock = match[0].trim(); // Includes \resumesection{...} and its body

    if (/summary|objective|profile|about/i.test(titleKey)) {
      result.summary = fullBlock;
    } else if (/experience|employment|work|history/i.test(titleKey)) {
      result.experience = fullBlock;
    } else if (/projects|technical projects|key projects/i.test(titleKey)) {
      result.projects = fullBlock;
    } else if (/education|academic/i.test(titleKey)) {
      result.education = fullBlock;
    } else if (/skills|technical skills|competencies/i.test(titleKey)) {
      result.skills = fullBlock;
    } else if (/certifications|licenses/i.test(titleKey)) {
      result.certifications = fullBlock;
    } else if (/languages/i.test(titleKey)) {
      result.languages = fullBlock;
    } else {
      result.extraSections.push({ title: rawTitle, body: fullBlock });
    }
  }

  return result;
}

/**
 * Re-assembles a target template with the extracted section blocks.
 * If a section was not in the previous document, it is left empty (or filled from profile).
 */
export function assembleTemplateWithSections(
  templateSource: string,
  sections: ExtractedSections
): string {
  const out = templateSource
    .replaceAll("{{NAME}}", escapeLatex(sections.name))
    .replaceAll("{{TITLE}}", escapeLatex(sections.title))
    .replaceAll("{{CONTACT}}", sections.contact)
    .replaceAll("{{SUMMARY}}", sections.summary)
    .replaceAll("{{EXPERIENCE}}", sections.experience)
    .replaceAll("{{PROJECTS}}", sections.projects)
    .replaceAll("{{EDUCATION}}", sections.education)
    .replaceAll("{{SKILLS}}", sections.skills)
    .replaceAll("{{CERTIFICATIONS}}", sections.certifications)
    .replaceAll("{{LANGUAGES}}", sections.languages);

  // Append any extra/custom sections before \end{document}
  if (sections.extraSections.length > 0) {
    const extras = "\n\n" + sections.extraSections.map((s) => s.body).join("\n\n") + "\n";
    return out.replace(/\\end\{document\}/i, extras + "\n\\end{document}");
  }

  return out;
}

/** Extract `\coverparagraph{...}` bodies with balanced-brace scanning. */
export function extractLetterParagraphs(tex: string): string[] {
  const out: string[] = [];
  const re = /\\coverparagraph\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tex)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < tex.length && depth > 0) {
      if (tex[i] === "{") depth++;
      else if (tex[i] === "}") depth--;
      i++;
    }
    out.push(tex.slice(m.index + m[0].length, i - 1));
  }
  return out;
}

/** Plain-text letter paragraphs derived from the current buffer. Reuses
 *  existing letter paragraphs when present; otherwise folds the resume
 *  sections into letter body copy so switching generates content. */
export function deriveLetterParagraphs(currentTex: string, sections: ExtractedSections, max = 5): string[] {
  const fromLetter = extractLetterParagraphs(currentTex)
    .map((p) => texToText(p).trim())
    .filter((p) => p.length > 0);
  if (fromLetter.length > 0) return fromLetter.slice(0, max);
  const blocks = [sections.summary, sections.experience, sections.projects, sections.skills].filter(Boolean);
  const paras = blocks
    .map((b) =>
      texToText(
        b
          .split("\n")
          .filter((line) => !/\\(?:resume)?section\*?\{/.test(line))
          .join("\n")
      ).trim()
    )
    .filter((p) => p.length > 0)
    .map((p) => (p.length > 1200 ? p.slice(0, 1200).trimEnd() + "…" : p));
  return paras.slice(0, max);
}

export interface LetterJobContext {
  company?: string;
  title?: string;
}

function profileLite(profile: UserProfile | undefined, sections: ExtractedSections) {
  const p = (profile ?? {}) as Partial<UserProfile>;
  return {
    name: texToText(sections.name).trim() || p.name || "Your Name",
    email: p.email || "",
    phone: p.phone || "",
    location: p.location || "",
    summary: p.summary || "",
    targetTitle: texToText(sections.title).trim() || p.targetTitle || "",
    skills: p.skills ?? [],
    experience: (p.experience ?? []).map((e) => ({ role: e.role, company: e.company, duration: e.duration, bulletPoints: e.bulletPoints ?? [] })),
    education: (p.education ?? []).map((e) => ({ degree: e.degree, school: e.school, year: e.year })),
    linkedin: p.linkedin ?? "",
    github: p.github ?? "",
    portfolio: p.portfolio ?? "",
  };
}

/**
 * Rebuild the current buffer for any target template id — resume, CV, cover
 * letter, or motivation letter — preserving the user's content. Throws for
 * unknown template ids.
 */
export function assembleForTarget(
  targetTemplateId: string,
  currentTex: string,
  profile?: UserProfile,
  job?: LetterJobContext
): string {
  const meta = templateMeta(targetTemplateId);
  if (!meta) throw new Error(`Unknown template: ${targetTemplateId}`);
  const templateSource = loadTemplateSource(targetTemplateId);
  const letterKind = (["cover_letter", "motivation_letter"] as ResumeDocKind[]).find((k) => meta.kinds.includes(k)) ?? null;
  if (!letterKind) {
    if (/\\coverparagraph/i.test(currentTex || "")) {
      const paras = extractLetterParagraphs(currentTex || "");
      const fromLetter = extractTexSections(currentTex, profile);
      const sections = extractTexSections("", profile);
      sections.name = fromLetter.name;
      sections.title = fromLetter.title;
      sections.contact = fromLetter.contact || sections.contact;
      sections.summary = `\\resumesection{Summary}\n${paras.join("\n\n")}`;
      return assembleTemplateWithSections(templateSource, sections);
    }
    return assembleTemplateWithSections(templateSource, extractTexSections(currentTex || "", profile));
  }
  const sections = extractTexSections(currentTex || "", profile);
  const paras = deriveLetterParagraphs(currentTex || "", sections);
  const content = contentFromProfile(profileLite(profile, sections), letterKind);
  if (paras.length > 0) content.paragraphs = paras;
  if (job?.company) content.recipient = job.company;
  return renderTemplate(targetTemplateId, content);
}
