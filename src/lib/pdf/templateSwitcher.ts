import { UserProfile } from "@/types";
import { escapeLatex, contactLine } from "./sanitize";

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
  let out = templateSource
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
    out = out.replace(/\\end\{document\}/i, extras + "\n\\end{document}");
  }

  return out;
}
