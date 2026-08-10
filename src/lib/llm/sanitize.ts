import {
  SkillsGapAnalysis,
  TailoredDocuments,
  STARCard,
  InterviewQuestion,
  JobBrief,
  SalaryIntel,
  RecommendationItem,
  SkillRoadmapItem,
  PipelineReport,
  AutoApplyLog,
  ResumeContent,
} from "@/types";

/**
 * Rule-based cleaners for everything an LLM or a remote agent hands back.
 *
 * Models are great at prose and sloppy at schemas: they return "ninety", 500,
 * arrays full of numbers, missing required fields, swapped ranges and
 * hallucinated enum values. Every artifact the app persists or renders goes
 * through a cleaner here. Cleaners NEVER throw — they degrade to safe values,
 * or return null when the payload is fundamentally unusable so the caller can
 * fall back to the deterministic generator.
 */

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function cleanText(v: unknown, maxLen = 4000, fallback = ""): string {
  if (typeof v !== "string") return fallback;
  const t = v.trim();
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

export function cleanOptionalText(v: unknown, maxLen = 4000): string | null {
  const t = cleanText(v, maxLen, "");
  return t || null;
}

export function cleanNumber(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return fallback;
    return Math.round(Math.min(max, Math.max(min, v)));
  }
  const s = String(v ?? "").trim();
  if (!s) return fallback;
  const n = Number(s);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)));
}

export function cleanStringArray(v: unknown, maxItems = 25, maxLen = 500): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (out.length >= maxItems) break;
    const s = cleanText(item, maxLen, "");
    if (s) out.push(s);
  }
  return out;
}

export function cleanEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/* ------------------------------ artifacts ------------------------------ */

export function cleanSkillsGap(v: unknown): SkillsGapAnalysis | null {
  if (!isObj(v)) return null;
  const out: SkillsGapAnalysis = {
    matchScore: cleanNumber(v.matchScore, 0, 100, 0),
    matchingSkills: cleanStringArray(v.matchingSkills),
    missingSkills: cleanStringArray(v.missingSkills),
    strengths: cleanStringArray(v.strengths),
    recommendations: cleanStringArray(v.recommendations),
    keyTermFrequency: Array.isArray(v.keyTermFrequency)
      ? v.keyTermFrequency.slice(0, 30).flatMap((t) => {
          if (!isObj(t)) return [];
          const term = cleanText(t.term, 100, "");
          if (!term) return [];
          return [{ term, count: cleanNumber(t.count, 0, 10_000, 0), inResume: Boolean(t.inResume) }];
        })
      : [],
  };
  /* matchScore 0 never occurs legitimately (fallback clamps to 38–97) —
     treat a zero score with no other signal as an unparsable payload. */
  if (out.matchScore === 0 && !out.matchingSkills.length && !out.strengths.length && !out.recommendations.length) {
    return null;
  }
  return out;
}

const DOC_KEYS = ["tailoredResume", "coverLetter", "motivationLetter", "followUpEmail", "customNotes"] as const;

export function cleanDocuments(v: unknown): TailoredDocuments | null {
  if (!isObj(v)) return null;
  const out: TailoredDocuments = {};
  let any = false;
  for (const key of DOC_KEYS) {
    const s = cleanText(v[key], 20_000, "");
    if (s) {
      out[key] = s;
      any = true;
    }
  }
  return any ? out : null;
}

export function cleanSTARCards(v: unknown): STARCard[] | null {
  if (!Array.isArray(v)) return null;
  const cards: STARCard[] = [];
  for (const raw of v) {
    if (!isObj(raw) || cards.length >= 12) continue;
    const situation = cleanText(raw.situation, 1000, "");
    const task = cleanText(raw.task, 1000, "");
    const action = cleanText(raw.action, 1000, "");
    const result = cleanText(raw.result, 1000, "");
    const question = cleanText(raw.question, 500, "");
    if (!situation && !task && !action && !result && !question) continue;
    cards.push({
      id: cleanText(raw.id, 100, "") || `card-${cards.length + 1}`,
      question: question || "—",
      situation,
      task,
      action,
      result,
      difficulty: raw.difficulty !== undefined ? cleanEnum(raw.difficulty, ["easy", "medium", "hard"] as const, "medium") : undefined,
      status: raw.status !== undefined ? cleanEnum(raw.status, ["unstudied", "learning", "mastered"] as const, "unstudied") : undefined,
    });
  }
  return cards.length ? cards : null;
}

export function cleanInterviewQuestions(v: unknown): InterviewQuestion[] | null {
  if (!Array.isArray(v)) return null;
  const questions: InterviewQuestion[] = [];
  for (const raw of v) {
    if (!isObj(raw) || questions.length >= 20) continue;
    const question = cleanText(raw.question, 500, "");
    if (!question) continue;
    questions.push({
      id: cleanText(raw.id, 100, "") || `q-${questions.length + 1}`,
      question,
      category: cleanEnum(raw.category, ["technical", "behavioral", "culture"] as const, "behavioral"),
      difficulty: cleanEnum(raw.difficulty, ["easy", "medium", "hard"] as const, "medium"),
      hint: cleanText(raw.hint, 800, ""),
      idealAnswer: cleanText(raw.idealAnswer, 2000, ""),
    });
  }
  return questions.length ? questions : null;
}

const BRIEF_KEYS = ["techStack", "topRequirements", "redFlags", "questionsToAsk", "cultureSignals"] as const;

export function cleanJobBrief(v: unknown): JobBrief | null {
  if (!isObj(v)) return null;
  const summary = cleanText(v.summary, 1000, "");
  const out: JobBrief = { summary, techStack: [], topRequirements: [], redFlags: [], questionsToAsk: [], cultureSignals: [] };
  let any = Boolean(summary);
  for (const key of BRIEF_KEYS) {
    const arr = cleanStringArray(v[key], 20, 300);
    if (arr.length) {
      out[key] = arr;
      any = true;
    }
  }
  return any ? out : null;
}

export function cleanSalaryIntel(v: unknown): SalaryIntel | null {
  if (!isObj(v)) return null;
  let low = cleanNumber(v.estimateLow, 0, 1_000_000, 0);
  let high = cleanNumber(v.estimateHigh, 0, 1_000_000, 0);
  if (low <= 0 && high <= 0) return null;
  if (low > high) [low, high] = [high, low]; /* swap inverted ranges */
  return {
    estimateLow: low,
    estimateHigh: high,
    basis: cleanEnum(v.basis, ["posting", "market", "hybrid"] as const, "market"),
    disclosedRange: cleanOptionalText(v.disclosedRange, 200),
    factors: cleanStringArray(v.factors),
    negotiationTips: cleanStringArray(v.negotiationTips),
  };
}

export function cleanRecommendations(v: unknown): RecommendationItem[] | null {
  if (!Array.isArray(v)) return null;
  const items: RecommendationItem[] = [];
  for (const raw of v) {
    if (!isObj(raw) || items.length >= 12) continue;
    const title = cleanText(raw.title, 200, "");
    if (!title) continue;
    items.push({
      title,
      companyArchetype: cleanText(raw.companyArchetype, 200, ""),
      why: cleanText(raw.why, 600, ""),
      matchProbability: cleanNumber(raw.matchProbability, 0, 100, 50),
    });
  }
  return items.length ? items : null;
}

export function cleanRoadmap(v: unknown): SkillRoadmapItem[] | null {
  if (!Array.isArray(v)) return null;
  const items: SkillRoadmapItem[] = [];
  for (const raw of v) {
    if (!isObj(raw) || items.length >= 15) continue;
    const skill = cleanText(raw.skill, 200, "");
    if (!skill) continue;
    items.push({
      skill,
      priority: cleanEnum(raw.priority, ["high", "medium", "low"] as const, "medium"),
      why: cleanText(raw.why, 600, ""),
      resources: cleanStringArray(raw.resources, 10, 300),
    });
  }
  return items.length ? items : null;
}

export function cleanPipelineReport(v: unknown): PipelineReport | null {
  if (!isObj(v)) return null;
  const headline = cleanText(v.headline, 500, "");
  const highlights = cleanStringArray(v.highlights, 15, 500);
  const risks = cleanStringArray(v.risks, 15, 500);
  const actions = cleanStringArray(v.actions, 15, 500);
  if (!headline && !highlights.length && !risks.length && !actions.length) return null;
  return { headline, highlights, risks, actions };
}

export const AUTO_APPLY_LOG_TYPES = ["info", "success", "warning", "error"] as const;

export function cleanAutoApplyLogs(v: unknown): AutoApplyLog[] {
  if (!Array.isArray(v)) return [];
  const logs: AutoApplyLog[] = [];
  for (const raw of v) {
    if (!isObj(raw) || logs.length >= 200) continue;
    const message = cleanText(raw.message, 2000, "");
    if (!message) continue;
    logs.push({
      timestamp: cleanText(raw.timestamp, 40, ""),
      message,
      type: cleanEnum(raw.type, AUTO_APPLY_LOG_TYPES, "info"),
    });
  }
  return logs;
}

export const APPLY_AGENT_STATUSES = ["applied", "manual_required", "failed", "skipped"] as const;

export const ASSISTANT_TOOLS = ["pipeline_summary", "search_jobs", "search_vault", "remember", "access_email"] as const;

/* ------------------------------ resume builder ------------------------------ */

function cleanBullets(v: unknown, maxItems = 10): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const b of v) {
    if (out.length >= maxItems) break;
    const s = cleanText(b, 600, "");
    if (s) out.push(s);
  }
  return out;
}

function cleanExperience(v: unknown): NonNullable<ResumeContent["experience"]> {
  if (!Array.isArray(v)) return [];
  const out: NonNullable<ResumeContent["experience"]> = [];
  for (const raw of v) {
    if (!isObj(raw) || out.length >= 12) continue;
    const role = cleanText(raw.role, 200, "");
    const company = cleanText(raw.company, 200, "");
    if (!role && !company) continue;
    out.push({
      role,
      company,
      duration: cleanText(raw.duration, 120, ""),
      bullets: cleanBullets(raw.bullets ?? raw.bulletPoints),
    });
  }
  return out;
}

function cleanEducation(v: unknown): NonNullable<ResumeContent["education"]> {
  if (!Array.isArray(v)) return [];
  const out: NonNullable<ResumeContent["education"]> = [];
  for (const raw of v) {
    if (!isObj(raw) || out.length >= 12) continue;
    const degree = cleanText(raw.degree, 200, "");
    const school = cleanText(raw.school, 200, "");
    if (!degree && !school) continue;
    out.push({ degree, school, year: cleanText(raw.year, 60, "") });
  }
  return out;
}

function cleanProjects(v: unknown): NonNullable<ResumeContent["projects"]> {
  if (!Array.isArray(v)) return [];
  const out: NonNullable<ResumeContent["projects"]> = [];
  for (const raw of v) {
    if (!isObj(raw) || out.length >= 12) continue;
    const name = cleanText(raw.name, 200, "");
    if (!name) continue;
    out.push({
      name,
      tech: cleanText(raw.tech, 300, ""),
      link: cleanOptionalText(raw.link, 300) ?? undefined,
      bullets: cleanBullets(raw.bullets),
    });
  }
  return out;
}

function cleanCerts(v: unknown): NonNullable<ResumeContent["certifications"]> {
  if (!Array.isArray(v)) return [];
  const out: NonNullable<ResumeContent["certifications"]> = [];
  for (const raw of v) {
    if (!isObj(raw) || out.length >= 12) continue;
    const name = cleanText(raw.name, 200, "");
    if (!name) continue;
    out.push({ name, issuer: cleanText(raw.issuer, 200, ""), year: cleanText(raw.year, 60, "") });
  }
  return out;
}

function cleanLanguages(v: unknown): NonNullable<ResumeContent["languages"]> {
  if (!Array.isArray(v)) return [];
  const out: NonNullable<ResumeContent["languages"]> = [];
  for (const raw of v) {
    if (!isObj(raw) || out.length >= 8) continue;
    const name = cleanText(raw.name, 100, "");
    if (!name) continue;
    out.push({ name, level: cleanText(raw.level, 100, "") });
  }
  return out;
}

/**
 * Clean LLM-produced resume content. Returns null when the payload is
 * fundamentally unusable so callers can fall back to the deterministic path.
 */
export function cleanResumeContent(v: unknown): ResumeContent | null {
  if (!isObj(v)) return null;
  const headerRaw = isObj(v.header) ? v.header : {};
  const name = cleanText(headerRaw.name, 200, "");
  if (!name && !isObj(v.header)) return null;
  const header: ResumeContent["header"] = {
    name: name || "Your Name",
    title: cleanText(headerRaw.title, 200, ""),
    email: cleanText(headerRaw.email, 200, ""),
    phone: cleanText(headerRaw.phone, 120, ""),
    location: cleanText(headerRaw.location, 200, ""),
    linkedin: cleanText(headerRaw.linkedin, 300, ""),
    github: cleanText(headerRaw.github, 300, ""),
    portfolio: cleanText(headerRaw.portfolio, 300, ""),
  };
  const summary = cleanText(v.summary, 2000, "");
  const skills = cleanStringArray(v.skills, 40, 120);
  const experience = cleanExperience(v.experience);
  const education = cleanEducation(v.education);
  const projects = cleanProjects(v.projects);
  const certifications = cleanCerts(v.certifications);
  const languages = cleanLanguages(v.languages);
  const paragraphs = cleanStringArray(v.paragraphs, 12, 3000);
  const recipient = cleanOptionalText(v.recipient, 500) ?? undefined;

  if (
    !summary &&
    !skills.length &&
    !experience.length &&
    !education.length &&
    !projects.length &&
    !certifications.length &&
    !languages.length &&
    !paragraphs.length
  ) {
    return null;
  }
  return { header, summary: summary || undefined, skills, experience, education, projects, certifications, languages, paragraphs, recipient };
}

export interface CleanAssistantDecision {
  action: "tool" | "answer";
  tool?: string;
  args?: Record<string, string>;
  note?: string;
  message?: string;
}

export function cleanAssistantDecision(v: unknown): CleanAssistantDecision | null {
  if (!isObj(v)) return null;
  const action = v.action;
  if (action !== "tool" && action !== "answer") return null;
  const out: CleanAssistantDecision = {
    action,
    message: cleanOptionalText(v.message, 1000) ?? undefined,
  };
  if (action === "tool") {
    const toolName = cleanText(v.tool, 100, "");
    if (!toolName || !(ASSISTANT_TOOLS as readonly string[]).includes(toolName)) return null;
    out.tool = toolName;
    out.note = cleanOptionalText(v.note, 300) ?? undefined;
    if (isObj(v.args)) {
      const args: Record<string, string> = {};
      for (const [k, val] of Object.entries(v.args)) {
        if (Object.keys(args).length >= 4) break;
        const s = typeof val === "string" ? val.trim() : val == null ? "" : String(val);
        if (s && s.length <= 500) args[k] = s;
      }
      out.args = args;
    }
  }
  return out;
}
