import { extractJdTerms, normalizeSkill } from "@/lib/prompts";
import { texToText } from "@/lib/pdf/sanitize";
export { texToText };
import { ResumeContent } from "@/types";

export function resumeContentToText(content: ResumeContent): string {
  const parts: string[] = [];
  if (content.header) {
    parts.push(
      [content.header.name, content.header.title, content.header.email, content.header.phone, content.header.location]
        .filter(Boolean)
        .join(" ")
    );
  }
  if (content.summary) {
    parts.push("Summary\n" + content.summary);
  }
  if (content.skills && content.skills.length > 0) {
    parts.push("Skills\n" + content.skills.join(", "));
  }
  if (content.experience && content.experience.length > 0) {
    parts.push(
      "Experience\n" +
        content.experience
          .map((e) => `${e.role} at ${e.company} (${e.duration || ""}):\n${(e.bullets || []).join("\n")}`)
          .join("\n\n")
    );
  }
  if (content.education && content.education.length > 0) {
    parts.push(
      "Education\n" +
        content.education.map((ed) => `${ed.degree} from ${ed.school} (${ed.year || ""})`).join("\n")
    );
  }
  if (content.projects && content.projects.length > 0) {
    parts.push(
      "Projects\n" +
        content.projects
          .map((p) => `${p.name} (${p.tech}):\n${(p.bullets || []).join("\n")}`)
          .join("\n")
    );
  }
  return parts.join("\n\n");
}

export interface AtsCheck {
  id: string;
  label: string;
  ok: boolean;
  hint: string;
  weight: number;
}

export interface AtsReport {
  score: number; // 0-100
  checks: AtsCheck[];
  keywords: { term: string; inResume: boolean }[];
  /** Total pages estimate based on word count (~500 words/page). */
  estimatedPages: number;
}

export const ACTION_VERBS = [
  "led", "built", "shipped", "designed", "developed", "launched", "scaled", "drove",
  "improved", "increased", "reduced", "automated", "migrated", "architected", "spearheaded",
  "implemented", "optimized", "delivered", "created", "owned", "mentored", "negotiated",
  "refactored", "redesigned", "secured", "streamlined", "cut", "boosted", "grew", "saved",
];

export const SECTION_HEADERS = ["summary", "experience", "education", "skills", "projects", "certifications", "languages", "objective", "work", "employment"];

/** The four headers ATS systems actually require. */
export const CORE_HEADERS = ["summary", "experience", "education", "skills"];

export function analyzeAts(texOrContent: string | ResumeContent, jobDescription?: string): AtsReport {
  const rawString = typeof texOrContent === "object" && texOrContent !== null
    ? resumeContentToText(texOrContent)
    : String(texOrContent || "");
  const text = texToText(rawString);
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const estimatedPages = Math.max(1, Math.round(wordCount / 500));

  const checks: AtsCheck[] = [];
  let weightedPass = 0;
  let weightedTotal = 0;

  const add = (check: Omit<AtsCheck, "weight">, weight: number) => {
    weightedTotal += weight;
    if (check.ok) weightedPass += weight;
    checks.push({ ...check, weight });
  };

  /* 1. Contact info present */
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text);
  add({
    id: "contact",
    label: "Contact details present",
    ok: hasEmail,
    hint: hasEmail ? "Email found." : "Add an email address — ATSes drop resumes without contact info.",
  }, 12);

  /* 2. Standard section headers */
  const missingCore = CORE_HEADERS.filter((h) => !lower.includes(h));
  const missingExtra = SECTION_HEADERS.filter((h) => !lower.includes(h));
  add({
    id: "sections",
    label: "Standard section headers",
    ok: missingCore.length === 0,
    hint: missingCore.length
      ? `Missing core headers: ${missingCore.join(", ")}. Add them — ATSes skip resumes without standard sections.`
      : "Core headers detected. " + (missingExtra.length ? `Optional: ${missingExtra.slice(0, 3).join(", ")}.` : ""),
  }, 12);

  /* 3. Length discipline */
  const tooLong = estimatedPages > 2;
  add({
    id: "length",
    label: `Length discipline (${wordCount} words, ~${estimatedPages} page${estimatedPages > 1 ? "s" : ""})`,
    ok: !tooLong,
    hint: tooLong
      ? "Resumes over 2 pages are filtered by most ATSes. Cut or tighten."
      : "Length looks right.",
  }, 12);

  /* 4. Action verbs in experience */
  const sentences = text.split(/(?<=[.!?])\s+| - /);
  const verbHits = sentences.filter((s) => ACTION_VERBS.some((v) => s.toLowerCase().split(/\s+/).includes(v)));
  const hasVerbs = verbHits.length >= 3;
  add({
    id: "action_verbs",
    label: `Action verbs (${verbHits.length} lead sentences)`,
    ok: hasVerbs,
    hint: hasVerbs
      ? "Good action-verb density."
      : "Start bullets with strong verbs (Led, Built, Shipped, Reduced…).",
  }, 10);

  /* 5. Quantified achievements */
  const metricHits = (text.match(/\d+%|\$\d+|\d+x|\d+ (users|customers|requests|seats|nodes|countries|projects)/gi) || []).length;
  const hasMetrics = metricHits >= 2;
  add({
    id: "metrics",
    label: `Quantified achievements (${metricHits} metric${metricHits === 1 ? "" : "s"})`,
    ok: hasMetrics,
    hint: hasMetrics
      ? "Numbers catch both ATS scoring and human eyes."
      : "Add 2+ measurable outcomes (% growth, $ revenue, users served).",
  }, 10);

  /* 6. No tables / images for content */
  const hasLayoutBreakers = /\\begin\{tabular\}|\\includegraphics|\\begin\{multicols\}|\\begin\{tikzpicture\}/.test(rawString);
  add({
    id: "layout",
    label: "ATS-safe layout",
    ok: !hasLayoutBreakers,
    hint: hasLayoutBreakers
      ? "Tables, images and multi-column layouts break ATS parsers. Keep it single-column text."
      : "Single-column text layout — parser-safe.",
  }, 14);

  /* 7. Section order sanity (experience before education for experienced hires) */
  const expIdx = lower.indexOf("experience");
  const eduIdx = lower.indexOf("education");
  add({
    id: "order",
    label: "Experience leads over education",
    ok: expIdx === -1 || eduIdx === -1 || expIdx < eduIdx,
    hint: expIdx > eduIdx && eduIdx >= 0
      ? "Put experience above education unless you are a recent graduate."
      : "Section order looks fine.",
  }, 8);

  /* 8. Filler words */
  const fillerHits = (text.match(/\b(responsible for|duties included|hard-working|team player|results-driven|self-motivated)\b/gi) || []).length;
  add({
    id: "filler",
    label: `No recruiter jargon (${fillerHits} filler phrase${fillerHits === 1 ? "" : "s"})`,
    ok: fillerHits === 0,
    hint: fillerHits
      ? `Avoid: ${["responsible for", "duties included", "hard-working", "team player"].join(", ")}. Show outcomes instead.`
      : "No filler phrases detected.",
  }, 8);

  /* 9. Job-description keyword coverage (optional) */
  let keywords: { term: string; inResume: boolean }[] = [];
  if (jobDescription && jobDescription.trim()) {
    const terms = extractJdTerms(jobDescription, words);
    const unique = new Map<string, boolean>();
    for (const t of terms) {
      const norm = normalizeSkill(t.term);
      if (unique.has(norm)) continue;
      unique.set(norm, lower.includes(norm));
    }
    keywords = Array.from(unique.entries()).map(([term, inResume]) => ({ term, inResume })).slice(0, 12);
    const covered = keywords.filter((k) => k.inResume).length;
    const coverage = keywords.length ? covered / keywords.length : 0;
    const goodCoverage = coverage >= 0.5;
    add({
      id: "keywords",
      label: `JD keyword coverage (${covered}/${keywords.length})`,
      ok: goodCoverage,
      hint: goodCoverage
        ? "Solid keyword coverage for the target role."
        : `Missing keywords: ${keywords.filter((k) => !k.inResume).slice(0, 5).map((k) => k.term).join(", ")}. Mirror them in summary and skills.`,
    }, 14);
  }

  /* 10. Consistency of tenses */
  add({
    id: "tense",
    label: "Tense consistency",
    ok: true,
    hint: "Past tense for completed roles, present for current. Keep each role internally consistent.",
  }, 0);

  const score = weightedTotal > 0 ? Math.round((weightedPass / weightedTotal) * 100) : 0;
  return { score, checks, keywords, estimatedPages };
}
