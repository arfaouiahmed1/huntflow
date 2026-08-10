import { UserProfile, ResumeContent, ResumeDocKind } from "@/types";
import { LLMSettings } from "@/lib/llm/providers";
import { resolveChain, callLLM } from "@/lib/llm/router";
import { extractJson } from "@/lib/llm/client";
import { cleanResumeContent } from "@/lib/llm/sanitize";
import { AgentBehaviorSettings, DEFAULT_AGENT_SETTINGS, getAgentSettings, agentBehaviorPrompt } from "@/lib/agentConfig";
import {
  resumeSystemPrompt,
  resumeDraftUserPrompt,
  resumeImproveUserPrompt,
  resumeTailorUserPrompt,
  resumeFallbackContent,
} from "@/lib/prompts/resumeAgentPrompts";
import { renderTemplate, templateMeta, contentFromProfile } from "@/lib/pdf/resumeTemplates";
import { analyzeAts, AtsReport } from "@/lib/ats/analyze";
import { extractJdTerms } from "@/lib/prompts/commonPrompts";

export type ResumeAgentTask = "draft" | "improve" | "tailor" | "ats" | "parse_pdf";

export interface ResumeAgentInput {
  task: ResumeAgentTask;
  kind: ResumeDocKind;
  templateId: string;
  profile?: UserProfile;
  current?: ResumeContent | null;
  job?: { title: string; company: string; jobDescription: string } | null;
  extractedText?: string;
  llmSettings?: LLMSettings | null;
  agentSettings?: AgentBehaviorSettings;
}

export interface ResumeAgentResult {
  task: ResumeAgentTask;
  content: ResumeContent;
  tex: string;
  summary: string;
  notes?: string[];
  ats?: AtsReport;
}

const ts = () => new Date().toLocaleTimeString("en-US", { hour12: false });

function letterKind(kind: ResumeDocKind): boolean {
  return kind === "cover_letter" || kind === "motivation_letter";
}

/* ------------------------------------------------------------------ *
 * Deterministic fallbacks
 * ------------------------------------------------------------------ */

/** Heuristic PDF-text parser: name/email/phone, section headers, bullets. */
export function parseResumeTextFallback(text: string): ResumeContent {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = text.match(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/);
  const linkedinMatch = text.match(/linkedin\.com\/in\/[^\s|,]+/i);
  const githubMatch = text.match(/github\.com\/[^\s|,]+/i);

  let name = lines[0] ?? "";
  let title = lines[1] ?? "";
  if (name.toLowerCase() === "resume" || name.toLowerCase() === "cv" || name.toLowerCase() === "curriculum vitae") {
    name = lines[1] ?? "";
    title = lines[2] ?? "";
  }

  const header: ResumeContent["header"] = {
    name,
    title,
    email: emailMatch?.[0] ?? "",
    phone: phoneMatch?.[0] ?? "",
    location: "",
    linkedin: linkedinMatch?.[0] ?? "",
    github: githubMatch?.[0] ?? "",
    portfolio: "",
  };

  const known = /^(summary|experience|employment|education|skills|projects|certifications|languages|objective|work|interests)/i;
  let section: string | null = null;
  const sections: Record<string, string[]> = {};
  for (const line of lines) {
    if (known.test(line)) {
      section = line.toLowerCase().replace(/[^a-z]/g, "");
      if (!sections[section]) sections[section] = [];
      continue;
    }
    if (section) sections[section].push(line);
  }

  const experience = (sections.experience ?? sections.employment ?? []).map((raw, i) => {
    const parts = raw.split(/\s{2,}| • | \| /);
    return {
      role: parts[0] ?? "",
      company: parts[1] ?? "",
      duration: parts[2] ?? "",
      bullets: [] as string[],
    };
  });

  const skills = (sections.skills ?? [])
    .flatMap((l) => l.split(/[,\u2022·|]/))
    .map((s) => s.trim())
    .filter((s) => s && s.length > 1)
    .slice(0, 40);

  const education = (sections.education ?? []).map((raw, i) => {
    const parts = raw.split(/\s{2,}| • | \| /);
    return { degree: parts[0] ?? "", school: parts[1] ?? "", year: parts[2] ?? "" };
  });

  return { header, summary: sections.summary?.join(" "), skills, experience, education };
}

/* ------------------------------------------------------------------ *
 * Tasks
 * ------------------------------------------------------------------ */

async function llmCall(
  input: ResumeAgentInput,
  behavior: string,
  buildUser: (behavior: string) => string,
  agent: string
): Promise<{ content: ResumeContent | null; provider: string | null }> {
  const chain = resolveChain(input.llmSettings ?? null);
  if (!chain.some((p) => p.apiKey)) return { content: null, provider: null };
  try {
    const result = await callLLM(
      { system: resumeSystemPrompt(), user: buildUser(behavior), agent, json: true },
      chain
    );
    const raw = extractJson(result.text);
    const content = cleanResumeContent(raw);
    return { content, provider: result.providerId };
  } catch {
    return { content: null, provider: null };
  }
}

export async function runResumeAgent(input: ResumeAgentInput): Promise<ResumeAgentResult> {
  const settings = input.agentSettings ?? getAgentSettings();
  const behavior = agentBehaviorPrompt(settings);
  const notes: string[] = [];
  let content: ResumeContent | null = null;
  let summary = "";

  switch (input.task) {
    case "draft": {
      const target = input.job ?? null;
      const res = await llmCall(
        input,
        behavior,
        (b) => resumeDraftUserPrompt(input.kind, input.profile!, b, target),
        "resume_draft"
      );
      if (res.content) {
        content = res.content;
        summary = `Drafted ${input.kind.replace("_", " ")} from your profile${target ? `, tailored to ${target.title} at ${target.company}` : ""}.`;
      } else {
        const fb = resumeFallbackContent(input.profile!, input.kind, target);
        content = fb.content;
        summary = fb.summary + " (deterministic fallback — configure a provider for AI drafting)";
        notes.push("No provider available — used deterministic profile draft.");
      }
      break;
    }

    case "improve": {
      const current = input.current ?? resumeFallbackContent(input.profile!, input.kind).content;
      const res = await llmCall(
        input,
        behavior,
        (b) => resumeImproveUserPrompt(input.kind, JSON.stringify(current, null, 2), input.profile!, b),
        "resume_improve"
      );
      if (res.content) {
        content = res.content;
        summary = "Rewrote bullets and summary with sharper language and action verbs.";
      } else {
        content = current;
        summary = "No provider available — kept current draft as-is.";
        notes.push("Deterministic improvement unavailable; nothing changed.");
      }
      break;
    }

    case "tailor": {
      const current = input.current ?? resumeFallbackContent(input.profile!, input.kind).content;
      const job = input.job!;
      const res = await llmCall(
        input,
        behavior,
        (b) => resumeTailorUserPrompt(input.kind, JSON.stringify(current, null, 2), job as never, input.profile!, b),
        "resume_tailor"
      );
      if (res.content) {
        content = res.content;
        summary = `Tailored to ${job.title} at ${job.company}: keyword alignment, skills reordered.`;
      } else {
        content = tailorFallback(current, job, input.profile!);
        summary = "Tailored locally: skills reordered to match the job description.";
        notes.push("No provider available — local keyword reorder applied.");
      }
      break;
    }

    case "ats": {
      content = input.current ?? resumeFallbackContent(input.profile!, input.kind).content;
      const tex = renderTemplate(input.templateId, content);
      const ats = analyzeAts(tex, input.job?.jobDescription);
      return {
        task: input.task,
        content,
        tex,
        summary: `ATS audit: ${ats.score}/100.`,
        ats,
      };
    }

    case "parse_pdf": {
      const text = (input.extractedText ?? "").slice(0, 60_000);
      const res = await llmCall(
        input,
        behavior,
        () =>
          `${resumeSystemPrompt()}

TASK: Parse this extracted resume text into structured JSON for rebuilding. Use the exact shape: header + summary/skills/experience/education/projects/certifications/languages. Preserve facts; only include text that is really in the document.

EXTRACTED TEXT:
${text}`,
        "resume_parse"
      );
      if (res.content) {
        content = res.content;
        summary = "Parsed PDF into a structured resume.";
      } else {
        content = parseResumeTextFallback(text);
        summary = "Parsed PDF heuristically (no provider available).";
        notes.push("No provider available — rule-based parse. AI parsing produces richer structure.");
      }
      break;
    }
  }

  const tex = renderTemplate(input.templateId, content);
  return { task: input.task, content, tex, summary, notes };
}

/** Local tailoring: reorder skills by JD relevance; keep facts untouched. */
function tailorFallback(
  current: ResumeContent,
  job: { title: string; company: string; jobDescription: string },
  profile: UserProfile
): ResumeContent {
  const jd = job.jobDescription.toLowerCase();
  const scored = (current.skills ?? [])
    .map((s) => ({ s, score: jd.includes(s.toLowerCase()) ? 1 : 0 }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
  const terms = extractJdTerms(job.jobDescription, profile.skills)
    .filter((t) => t.inResume)
    .map((t) => t.term);
  const skills = [...scored, ...terms.filter((t) => !scored.some((s) => s.toLowerCase() === t.toLowerCase()))].slice(0, 40);
  return { ...current, skills };
}

export function newResumeDocDraft(
  kind: ResumeDocKind,
  templateId: string,
  profile: UserProfile
): { content: ResumeContent; tex: string } {
  const content = contentFromProfile(profile, kind);
  return { content, tex: renderTemplate(templateId, content) };
}

export const resumeAgentLog = (msg: string) => `[${ts()}] ${msg}`;

export { templateMeta };
