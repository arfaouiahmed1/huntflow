import { readFileSync } from "fs";
import { join } from "path";
import { ResumeContent, ResumeDocKind } from "@/types";
import { escapeLatex, contactLine } from "./sanitize";

/**
 * ATS-grade LaTeX template registry.
 *
 * Templates are real .tex files with {{PLACEHOLDER}} tokens, substituted
 * deterministically by `renderTemplate`. All user/agent content is escaped
 * (escapeLatex) before substitution, so rendering can never break compilation.
 *
 * Attribution: adaptations of sb2nov/resume (MIT), Jake's Resume (MIT),
 * RenderCV classic (MIT), drevo letter classes (LPPL-1.3c).
 */

export interface ResumeTemplateMeta {
  id: string;
  name: string;
  description: string;
  /** 100 = maximally ATS-safe (single column, standard headers, no tables). */
  atsScore: number;
  kinds: ResumeDocKind[];
  fileName: string;
}

export const RESUME_TEMPLATES: ResumeTemplateMeta[] = [
  {
    id: "classic-ats",
    name: "Classic ATS",
    description: "The workhorse single-column layout. Highest ATS compatibility, Helvetica, minimal decoration.",
    atsScore: 100,
    kinds: ["resume", "cv"],
    fileName: "classic-ats.tex",
  },
  {
    id: "modern-professional",
    name: "Modern Professional",
    description: "Clean two-tone headers with a blue accent. Still single-column and fully parseable.",
    atsScore: 95,
    kinds: ["resume", "cv"],
    fileName: "modern-professional.tex",
  },
  {
    id: "executive",
    name: "Executive Serif",
    description: "Times-based classic look for senior/C-suite profiles. Small-caps section headers.",
    atsScore: 90,
    kinds: ["resume", "cv"],
    fileName: "executive.tex",
  },
  {
    id: "tabular-german",
    name: "German Tabellarischer",
    description: "DACH standard format with date/location line and structured sections.",
    atsScore: 95,
    kinds: ["cv"],
    fileName: "tabular-german.tex",
  },
  {
    id: "modern-french",
    name: "French Professional CV",
    description: "Formal French layout with target title accent and clear skills matrix.",
    atsScore: 90,
    kinds: ["cv"],
    fileName: "modern-french.tex",
  },
  {
    id: "nordic-clean",
    name: "Nordic Clean",
    description: "Scandinavian minimalist layout with high whitespace and elegant slate headers.",
    atsScore: 95,
    kinds: ["resume", "cv"],
    fileName: "nordic-clean.tex",
  },
  {
    id: "creative-sidebar",
    name: "Creative Two-Column",
    description: "Modern layout for tech, design, and product management roles.",
    atsScore: 85,
    kinds: ["resume", "cv"],
    fileName: "creative-sidebar.tex",
  },
  {
    id: "academic-cv",
    name: "Academic & Research CV",
    description: "Comprehensive multi-page format for research, publications, and grants.",
    atsScore: 90,
    kinds: ["cv"],
    fileName: "academic-cv.tex",
  },
  {
    id: "letter-cover",
    name: "Cover Letter",
    description: "Block-format cover letter with recipient block, salutation and closing.",
    atsScore: 100,
    kinds: ["cover_letter"],
    fileName: "letter-cover.tex",
  },
  {
    id: "letter-motivation",
    name: "Motivation Letter",
    description: "Narrative motivation letter focused on why you want the company and role.",
    atsScore: 100,
    kinds: ["motivation_letter"],
    fileName: "letter-motivation.tex",
  },
  {
    id: "letter-anschreiben-de",
    name: "German Anschreiben",
    description: "Formal German Anschreiben adhering to DIN 5008 correspondence rules.",
    atsScore: 100,
    kinds: ["motivation_letter"],
    fileName: "letter-anschreiben-de.tex",
  },
  {
    id: "letter-motivation-fr",
    name: "French Lettre de Motivation",
    description: "Formal French motivation letter with polite salutations and etiquette.",
    atsScore: 100,
    kinds: ["motivation_letter"],
    fileName: "letter-motivation-fr.tex",
  },
];

export function templateMeta(id: string): ResumeTemplateMeta | undefined {
  return RESUME_TEMPLATES.find((t) => t.id === id);
}

export function templatesForKind(kind: ResumeDocKind): ResumeTemplateMeta[] {
  return RESUME_TEMPLATES.filter((t) => t.kinds.includes(kind));
}

const sourceCache = new Map<string, string>();

/** Read a template's raw .tex source (server-side only; cached in memory). */
export function loadTemplateSource(id: string): string {
  const meta = templateMeta(id);
  if (!meta) throw new Error(`Unknown resume template: ${id}`);
  const cached = sourceCache.get(id);
  if (cached !== undefined) return cached;
  const src = readFileSync(join(process.cwd(), "src/lib/pdf/templates", meta.fileName), "utf8");
  sourceCache.set(id, src);
  return src;
}

/* ------------------------------------------------------------------ *
 * Fragment builders (all content escaped)
 * ------------------------------------------------------------------ */

function bullets(items: string[]): string {
  const lines = items.map((b) => b.trim()).filter(Boolean);
  if (!lines.length) return "";
  return "\\begin{itemize}\n" + lines.map((b) => `  \\item ${escapeLatex(b)}`).join("\n") + "\n\\end{itemize}";
}

function contactFrag(c: ResumeContent["header"]): string {
  return contactLine([
    c.email,
    c.phone,
    c.location,
    c.linkedin,
    c.github,
    c.portfolio,
  ]);
}

function summaryFrag(summary: string | undefined): string {
  const s = (summary || "").trim();
  if (!s) return "";
  return `\\resumesection{Summary}\n${escapeLatex(s)}`;
}

function experienceFrag(items: ResumeContent["experience"]): string {
  if (!items?.length) return "";
  const blocks = items
    .filter((e) => (e.role || e.company) && e.bullets?.length)
    .map(
      (e) =>
        `\\resumeentry{${escapeLatex(e.role || "Role")}}{${escapeLatex(e.company || "")}}{${escapeLatex(e.duration || "")}}{${bullets(e.bullets)}}`
    );
  return blocks.length ? `\\resumesection{Experience}\n${blocks.join("\n")}` : "";
}

function projectsFrag(items: ResumeContent["projects"]): string {
  if (!items?.length) return "";
  const blocks = items
    .filter((p) => p.name)
    .map(
      (p) =>
        `\\resumeentry{${escapeLatex(p.name)}${p.tech ? ` — ${escapeLatex(p.tech)}` : ""}}{${escapeLatex(p.link || "")}}{}{${bullets(p.bullets)}}`
    );
  return blocks.length ? `\\resumesection{Projects}\n${blocks.join("\n")}` : "";
}

function educationFrag(items: ResumeContent["education"]): string {
  if (!items?.length) return "";
  const blocks = items
    .filter((e) => e.degree || e.school)
    .map((e) => `\\resumeentry{${escapeLatex(e.degree || "Degree")}}{${escapeLatex(e.school || "")}}{${escapeLatex(e.year || "")}}{}`);
  return blocks.length ? `\\resumesection{Education}\n${blocks.join("\n")}` : "";
}

function skillsFrag(skills: string[] | undefined): string {
  const clean = (skills ?? []).map((s) => s.trim()).filter(Boolean);
  if (!clean.length) return "";
  return `\\resumesection{Skills}\n${escapeLatex(clean.join(", "))}`;
}

function certificationsFrag(items: ResumeContent["certifications"]): string {
  if (!items?.length) return "";
  const blocks = items
    .filter((c) => c.name)
    .map((c) => `\\resumeentry{${escapeLatex(c.name)}}{${escapeLatex(c.issuer || "")}}{${escapeLatex(c.year || "")}}{}`);
  return blocks.length ? `\\resumesection{Certifications}\n${blocks.join("\n")}` : "";
}

function languagesFrag(items: ResumeContent["languages"]): string {
  if (!items?.length) return "";
  const line = items.map((l) => `${l.name}${l.level ? ` (${l.level})` : ""}`).join(", ");
  return `\\resumesection{Languages}\n${escapeLatex(line)}`;
}

function paragraphsFrag(paragraphs: string[] | undefined): string {
  const paras = (paragraphs ?? []).map((p) => p.trim()).filter(Boolean);
  if (!paras.length) return "";
  return paras.map((p) => `\\coverparagraph{${escapeLatex(p)}}`).join("\n");
}

function recipientFrag(recipient: string | undefined): string {
  const r = (recipient || "Hiring Manager").trim();
  return escapeLatex(r).replace(/\\n/g, " ");
}

function currentDate(): string {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

function isLetter(content: ResumeContent): boolean {
  return Array.isArray(content.paragraphs) && content.paragraphs.some((p) => p.trim());
}

/** Render structured content into full LaTeX using the given template. */
export function renderTemplate(templateId: string, content: ResumeContent): string {
  const src = loadTemplateSource(templateId);

  const name = escapeLatex(content.header.name || "Your Name");
  const title = escapeLatex(content.header.title || "");
  const contact = contactFrag(content.header);

  if (isLetter(content)) {
    const date = currentDate();
    return src
      .replaceAll("{{NAME}}", name)
      .replaceAll("{{SENDERCONTACT}}", contact)
      .replaceAll("{{DATE}}", date)
      .replaceAll("{{RECIPIENT}}", recipientFrag(content.recipient))
      .replaceAll("{{SALUTATION}}", "Dear Hiring Manager,")
      .replaceAll("{{PARAGRAPHS}}", paragraphsFrag(content.paragraphs))
      .replaceAll("{{CLOSING}}", "Sincerely,");
  }

  return src
    .replaceAll("{{NAME}}", name)
    .replaceAll("{{TITLE}}", title)
    .replaceAll("{{CONTACT}}", contact)
    .replaceAll("{{SUMMARY}}", summaryFrag(content.summary))
    .replaceAll("{{EXPERIENCE}}", experienceFrag(content.experience))
    .replaceAll("{{PROJECTS}}", projectsFrag(content.projects))
    .replaceAll("{{EDUCATION}}", educationFrag(content.education))
    .replaceAll("{{SKILLS}}", skillsFrag(content.skills))
    .replaceAll("{{CERTIFICATIONS}}", certificationsFrag(content.certifications))
    .replaceAll("{{LANGUAGES}}", languagesFrag(content.languages));
}

/**
 * Drop \newcommand/\renewcommand definitions (name, optional args, body).
 */
function stripDefinitions(tex: string): string {
  const skipBraced = (start: number): number => {
    let depth = 0;
    let j = start;
    for (; j < tex.length; j++) {
      if (tex[j] === "{") depth++;
      else if (tex[j] === "}") {
        depth--;
        if (depth === 0) return j + 1;
      }
    }
    return j;
  };
  const skipOne = (i: number, keyword: string): number => {
    i += keyword.length;
    if (tex[i] === "*") i++;
    if (tex[i] === "{") i = skipBraced(i);
    if (tex[i] === "[") i = tex.indexOf("]", i) + 1;
    if (tex[i] === "{") i = skipBraced(i);
    return i;
  };
  let out = "";
  let i = 0;
  while (i < tex.length) {
    if (tex.startsWith("\\newcommand", i)) {
      i = skipOne(i, "\\newcommand");
      out += " ";
    } else if (tex.startsWith("\\renewcommand", i)) {
      i = skipOne(i, "\\renewcommand");
      out += " ";
    } else {
      out += tex[i];
      i++;
    }
  }
  return out;
}

/**
 * Approximate plain-text view of the LaTeX source — used by the ATS analyzer
 * and the LLM parse fallback. Strips commands/environments, keeps words.
 */
export function texToText(tex: string): string {
  return stripDefinitions(tex)
    .replace(/\\item\s*/g, "- ")
    .replace(/\\[&%$#_{}~^]/g, (m) => ({ "\\&": "&", "\\%": "%", "\\$": "$", "\\#": "#", "\\_": "_", "\\{": "{", "\\}": "}", "\\~": "~", "\\^": "^" })[m] ?? " ")
    .replace(/^[ \t]*%[^\n]*/gm, " ")
    .replace(/\\begin\{[a-zA-Z*]+\}|\\end\{[a-zA-Z*]+\}/g, " ")
    .replace(/\\textbullet\{\}/g, " · ")
    .replace(/\\\[[^\]]*\]/g, " ")
    .replace(/\\\\/g, " ")
    .replace(/\\(?:hspace|vspace|hrule|rule|vfill)(?:\{[^}]*\})?/g, " ")
    .replace(/\\[a-zA-Z]+\*?(?=[\s{}\\\[\]])/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build a ResumeContent skeleton from the user profile (imports reuse this). */
export function contentFromProfile(
  profile: { name: string; email: string; phone: string; location: string; summary: string; targetTitle: string; skills: string[]; experience: { role: string; company: string; duration: string; bulletPoints: string[] }[]; education: { degree: string; school: string; year: string }[]; linkedin?: string; github?: string; portfolio?: string },
  kind: ResumeDocKind
): ResumeContent {
  const header = {
    name: profile.name,
    title: profile.targetTitle,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    linkedin: profile.linkedin ?? "",
    github: profile.github ?? "",
    portfolio: profile.portfolio ?? "",
  };
  if (kind === "cover_letter" || kind === "motivation_letter") {
    return { header, paragraphs: ["Write your opening paragraph here.", "Explain your relevant experience and why you fit the role.", "Close with enthusiasm and a call to action."] };
  }
  return {
    header,
    summary: profile.summary,
    skills: profile.skills,
    experience: profile.experience.map((e) => ({ role: e.role, company: e.company, duration: e.duration, bullets: e.bulletPoints })),
    education: profile.education.map((e) => ({ degree: e.degree, school: e.school, year: e.year })),
  };
}
