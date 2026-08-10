import { settingsRepo } from "@/lib/db";

/**
 * Global agent behavior settings — one knob panel that shapes how every
 * generative agent in the app writes (tone, ATS strictness, tailoring depth).
 * Persisted as JSON under the `agent_settings` settings key.
 */

export type AgentTone = "professional" | "friendly" | "confident";
export type AtsStrictness = "strict" | "balanced" | "creative";
export type AgentLength = "concise" | "detailed";
export type TailoringDepth = "light" | "medium" | "aggressive";

export interface AgentSectionToggles {
  summary: boolean;
  experience: boolean;
  education: boolean;
  skills: boolean;
  projects: boolean;
  certifications: boolean;
  languages: boolean;
}

export interface AgentBehaviorSettings {
  tone: AgentTone;
  atsStrictness: AtsStrictness;
  bulletLength: AgentLength;
  tailoring: TailoringDepth;
  sections: AgentSectionToggles;
  maxPages: 1 | 2;
  includeMetrics: boolean;
}

export const DEFAULT_AGENT_SETTINGS: AgentBehaviorSettings = {
  tone: "professional",
  atsStrictness: "strict",
  bulletLength: "detailed",
  tailoring: "medium",
  sections: {
    summary: true,
    experience: true,
    education: true,
    skills: true,
    projects: true,
    certifications: false,
    languages: false,
  },
  maxPages: 1,
  includeMetrics: true,
};

export const AGENT_SETTINGS_KEY = "agent_settings";

const TONES: readonly AgentTone[] = ["professional", "friendly", "confident"];
const STRICTNESS: readonly AtsStrictness[] = ["strict", "balanced", "creative"];
const LENGTHS: readonly AgentLength[] = ["concise", "detailed"];
const TAILORINGS: readonly TailoringDepth[] = ["light", "medium", "aggressive"];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Validate + clamp arbitrary input (LLM, localStorage, API) into a safe shape. */
export function cleanAgentSettings(v: unknown): AgentBehaviorSettings {
  if (!isObj(v)) return { ...DEFAULT_AGENT_SETTINGS };
  const rawSections = isObj(v.sections) ? v.sections : {};
  const maxPages = v.maxPages === 2 ? 2 : 1;
  return {
    tone: pickEnum(v.tone, TONES, DEFAULT_AGENT_SETTINGS.tone),
    atsStrictness: pickEnum(v.atsStrictness, STRICTNESS, DEFAULT_AGENT_SETTINGS.atsStrictness),
    bulletLength: pickEnum(v.bulletLength, LENGTHS, DEFAULT_AGENT_SETTINGS.bulletLength),
    tailoring: pickEnum(v.tailoring, TAILORINGS, DEFAULT_AGENT_SETTINGS.tailoring),
    sections: {
      summary: typeof rawSections.summary === "boolean" ? rawSections.summary : DEFAULT_AGENT_SETTINGS.sections.summary,
      experience: typeof rawSections.experience === "boolean" ? rawSections.experience : DEFAULT_AGENT_SETTINGS.sections.experience,
      education: typeof rawSections.education === "boolean" ? rawSections.education : DEFAULT_AGENT_SETTINGS.sections.education,
      skills: typeof rawSections.skills === "boolean" ? rawSections.skills : DEFAULT_AGENT_SETTINGS.sections.skills,
      projects: typeof rawSections.projects === "boolean" ? rawSections.projects : DEFAULT_AGENT_SETTINGS.sections.projects,
      certifications:
        typeof rawSections.certifications === "boolean" ? rawSections.certifications : DEFAULT_AGENT_SETTINGS.sections.certifications,
      languages: typeof rawSections.languages === "boolean" ? rawSections.languages : DEFAULT_AGENT_SETTINGS.sections.languages,
    },
    maxPages,
    includeMetrics: typeof v.includeMetrics === "boolean" ? v.includeMetrics : DEFAULT_AGENT_SETTINGS.includeMetrics,
  };
}

/** Read current settings (merged over defaults); never throws. */
export function getAgentSettings(): AgentBehaviorSettings {
  try {
    const raw = settingsRepo.get(AGENT_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_AGENT_SETTINGS };
    return cleanAgentSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AGENT_SETTINGS };
  }
}

/** Persist validated settings. */
export function setAgentSettings(v: unknown): AgentBehaviorSettings {
  const clean = cleanAgentSettings(v);
  settingsRepo.set(AGENT_SETTINGS_KEY, JSON.stringify(clean));
  return clean;
}

/* ------------------------------------------------------------------ *
 * Prompt fragments — consumed by documents, pitch and resume agents.
 * ------------------------------------------------------------------ */

export function tonePrompt(tone: AgentTone): string {
  switch (tone) {
    case "friendly":
      return "warm, approachable and human — still polished, never chatty";
    case "confident":
      return "confident and direct — lead with outcomes, no hedging";
    default:
      return "professional and confident — sharp, recruiter-grade, no fluff";
  }
}

export function atsPrompt(strictness: AtsStrictness): string {
  switch (strictness) {
    case "creative":
      return "ATS compliance is secondary — prioritize visual personality and storytelling.";
    case "balanced":
      return "Keep documents ATS-parseable (standard section headers, no tables/images for content) while allowing slightly more expressive phrasing.";
    default:
      return "Maximize ATS compliance: single column, standard headers (SUMMARY, EXPERIENCE, EDUCATION, SKILLS), no tables or images for content, plain text-friendly phrasing, keyword coverage of the job description, quantified achievements, and a hard length limit.";
  }
}

export function bulletPrompt(length: AgentLength): string {
  return length === "concise"
    ? "Write experience bullets as tight, one-line achievements (max 15 words each)."
    : "Write experience bullets as dense achievement statements (1-2 lines each), each leading with an action verb and closing with an impact.";
}

export function tailoringPrompt(depth: TailoringDepth): string {
  switch (depth) {
    case "light":
      return "Tailor lightly: keep the candidate's voice intact, mirror only the top 3 job keywords.";
    case "aggressive":
      return "Tailor aggressively: mirror the job description's exact terminology, reorder skills by relevance to the posting, and rewrite the summary around the role.";
    default:
      return "Tailor: mirror the job description's terminology for matching skills, reorder sections so the most relevant experience leads, and weave the top keywords into the summary.";
  }
}

export function sectionsPrompt(sections: AgentSectionToggles): string {
  const active = Object.entries(sections)
    .filter(([, on]) => on)
    .map(([name]) => name.toUpperCase());
  return active.length ? `Include only these sections (in this order): ${active.join(", ")}.` : "No sections selected — keep the document minimal.";
}

export function maxPagesPrompt(maxPages: 1 | 2): string {
  return maxPages === 1
    ? "The final document MUST fit on exactly one page."
    : "The final document may run up to two pages, but no more.";
}

export function metricsPrompt(includeMetrics: boolean): string {
  return includeMetrics
    ? "Quantify achievements wherever the profile supports it (% growth, time saved, scale, revenue)."
    : "Avoid inventing metrics — describe impact qualitatively unless the profile states numbers.";
}

/** Assemble the full agent-behavior guidance block used by generation prompts. */
export function agentBehaviorPrompt(settings: AgentBehaviorSettings): string {
  return [
    `WRITING STYLE: ${tonePrompt(settings.tone)}.`,
    atsPrompt(settings.atsStrictness),
    bulletPrompt(settings.bulletLength),
    tailoringPrompt(settings.tailoring),
    sectionsPrompt(settings.sections),
    maxPagesPrompt(settings.maxPages),
    metricsPrompt(settings.includeMetrics),
  ].join("\n");
}
