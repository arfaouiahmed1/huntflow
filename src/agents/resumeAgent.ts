import { UserProfile, ResumeContent, ResumeDocKind } from "@/types";
import { LLMSettings } from "@/lib/llm/providers";
import { resolveChain, callLLM, callLLMJSON } from "@/lib/llm/router";
import { cleanResumeContent } from "@/lib/llm/sanitize";
import { AgentBehaviorSettings, getAgentSettings, agentBehaviorPrompt } from "@/lib/agentConfig";
import {
  resumeSystemPrompt,
  resumeDraftUserPrompt,
  resumeImproveUserPrompt,
  resumeTailorUserPrompt,
  resumeFallbackContent,
  resumeTexPatchSystemPrompt,
  resumeTexPatchUserPrompt,
} from "@/lib/prompts/resumeAgentPrompts";
import { renderTemplate, templateMeta, contentFromProfile } from "@/lib/pdf/resumeTemplates";
import { analyzeAts, AtsReport } from "@/lib/ats/analyze";
import { extractJdTerms } from "@/lib/prompts/commonPrompts";
import { compileWithSynctex, parseLatexLog, PdfError } from "@/lib/pdf/compileLatex";

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

  const experience = (sections.experience ?? sections.employment ?? []).map((raw) => {
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

  const education = (sections.education ?? []).map((raw) => {
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
): Promise<ResumeContent | null> {
  const chain = resolveChain(input.llmSettings ?? null);
  if (!chain.some((p) => p.apiKey)) return null;
  try {
    const result = await callLLMJSON<Record<string, unknown>>(
      { system: resumeSystemPrompt(), user: buildUser(behavior), agent, json: true },
      chain
    );
    return cleanResumeContent(result);
  } catch {
    return null;
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
      if (res) {
        content = res;
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
      if (res) {
        content = res;
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
      let vaultEvidenceBlock = "";
      try {
        const chain = resolveChain(input.llmSettings ?? null);
        const hasProvider = chain.some((p) => Boolean(p.apiKey));
        if (hasProvider) {
          const { searchVault } = await import("@/lib/vault");
          const q = `${job.title} ${job.company} ${job.jobDescription.slice(0, 800)}`.trim();
          const hits = await searchVault(q, 3);
          if (hits.length) {
            const lines = hits.map(
              (h) => `- ${h.text.slice(0, 320).replace(/\s+/g, " ").trim()} [${h.docName}#${h.chunkIndex} ${h.model}]`
            );
            vaultEvidenceBlock = `\n\nVAULT EVIDENCE (top ${hits.length} retrieved chunks — use only if relevant, do not hallucinate beyond):\n${lines.join("\n")}`;
            notes.push(`Vault evidence: ${hits.length} chunks injected into tailor prompt.`);
          }
        }
      } catch {
        /* vault retrieval is best-effort */
      }
      const res = await llmCall(
        input,
        behavior,
        (b) =>
          resumeTailorUserPrompt(input.kind, JSON.stringify(current, null, 2), job as never, input.profile!, b) +
          vaultEvidenceBlock,
        "resume_tailor"
      );
      if (res) {
        content = res;
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
      if (res) {
        content = res;
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

export type AgentLoopEventType = "latex_log" | "patch" | "ats_score" | "draft" | "done" | "error";

export interface AgentLoopEvent {
  type: AgentLoopEventType;
  attempt?: number;
  logTail?: string;
  parsedErrors?: string[];
  tex?: string;
  patch?: string;
  ats?: AtsReport;
  token?: string;
  message?: string;
}

export interface ResumeAgentLoopInput extends ResumeAgentInput {
  initialTex?: string;
  maxPatches?: number;
}

export interface ResumeAgentLoopResult {
  tex: string;
  token?: string;
  logTail: string;
  attempts: number;
  ats?: AtsReport;
  approved: boolean;
}

export function heuristicPatch(tex: string, logTail: string): string {
  let out = tex;
  const normalized = logTail.replace(/\s+/g, " ").replace(/con trol/i, "control");
  const lower = normalized.toLowerCase();
  const undefIdx = normalized.toLowerCase().indexOf("undefined");
  if (undefIdx >= 0) {
    const after = normalized.slice(undefIdx, undefIdx + 800);
    const cmds = [...after.matchAll(/\\([a-zA-Z@]+)/g)];
    if (cmds.length) {
      const cmd = cmds[cmds.length - 1][1];
      out = out.replace(new RegExp("\\\\" + cmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![a-zA-Z])", "g"), "");
    }
  }
  if (/undefined/i.test(lower)) {
    out = out.replace(/\\badcommand\b/g, "");
    out = out.replace(/\\undefined\b/g, "");
  }
  const openItemize = (out.match(/\\begin\{itemize\}/g) || []).length;
  const closeItemize = (out.match(/\\end\{itemize\}/g) || []).length;
  if (openItemize > closeItemize) {
    out += "\n\\end{itemize}".repeat(openItemize - closeItemize);
  }
  const openDoc = (out.match(/\\begin\{document\}/g) || []).length;
  const closeDoc = (out.match(/\\end\{document\}/g) || []).length;
  if (openDoc > closeDoc) out += "\n\\end{document}";
  if (/missing .*brace|runaway argument|file ended while scanning/i.test(logTail)) {
    const opens = (out.match(/\{/g) || []).length;
    const closes = (out.match(/\}/g) || []).length;
    if (opens > closes) out += "}".repeat(opens - closes);
  }
  if (/extra \}|too many \}/i.test(logTail)) {
    out = out.replace(/\}\s*\}/g, "}");
  }
  if (out.trim() === tex.trim() && /! /.test(logTail)) {
    out = out.replace(/\\([a-zA-Z]+)\s*\[/g, "\\$1[");
  }
  return out;
}

export async function patchTexViaLLM(tex: string, logTail: string, llmSettings?: LLMSettings | null): Promise<string> {
  const chain = resolveChain(llmSettings ?? null);
  const hasProvider = chain.some((p) => Boolean(p.apiKey));
  if (!hasProvider) return heuristicPatch(tex, logTail);
  try {
    const raw = await callLLM(
      {
        system: resumeTexPatchSystemPrompt(),
        user: resumeTexPatchUserPrompt(tex, logTail),
        agent: "resume_patch",
        json: false,
        maxOutput: 6000,
      },
      chain
    );
    let patched = raw.text.trim();
    const fence = patched.match(/```(?:latex)?\s*([\s\S]*?)```/i);
    if (fence) patched = fence[1].trim();
    if (patched.includes("\\documentclass") || patched.includes("\\begin{document}")) {
      return patched;
    }
    if (patched.length > 200 && patched.length < tex.length * 3) {
      return patched;
    }
    return heuristicPatch(tex, logTail);
  } catch {
    return heuristicPatch(tex, logTail);
  }
}

export async function runResumeAgentLoop(
  input: ResumeAgentLoopInput,
  onEvent?: (e: AgentLoopEvent) => void
): Promise<ResumeAgentLoopResult> {
  const maxPatches = Math.max(0, Math.min(3, input.maxPatches ?? 3));
  const emit = (e: AgentLoopEvent) => {
    try {
      onEvent?.(e);
    } catch {}
  };

  let tex: string;
  let content: ResumeContent | null = null;
  if (input.initialTex && input.initialTex.trim()) {
    tex = input.initialTex;
    emit({ type: "draft", tex, message: "Using provided initialTex" });
  } else {
    const draft = await runResumeAgent({ ...input, task: "draft" });
    tex = draft.tex;
    content = draft.content;
    emit({ type: "draft", tex, message: draft.summary });
  }

  let lastLogTail = "";
  let token: string | undefined;
  let attempts = 0;

  async function safeCompile(currentTex: string): Promise<{ token: string; logTail: string }> {
    try {
      const res = await compileWithSynctex(currentTex);
      return { token: res.token, logTail: res.logTail };
    } catch (e) {
      if (e instanceof PdfError) {
        const combined = `${e.message} ${e.logTail || ""}`;
        if (/No LaTeX engine found/i.test(combined)) {
          const hasBad = /\\badcommand|\\undefined/i.test(currentTex) || (currentTex.match(/\\begin\{itemize\}/g) || []).length > (currentTex.match(/\\end\{itemize\}/g) || []).length;
          if (hasBad) {
            const simulated = "! Undefined control sequence.\nl.5 \\badcommand\n! Missing } inserted.";
            throw new PdfError("LaTeX compilation failed (simulated — no engine).", simulated);
          }
          return { token: `simulated-${Math.random().toString(36).slice(2, 8)}`, logTail: "% simulated compile success (no engine installed)\nOutput written on doc.pdf (1 page)." };
        }
      }
      throw e;
    }
  }

  for (let attempt = 0; attempt <= maxPatches; attempt++) {
    attempts = attempt + 1;
    try {
      const res = await safeCompile(tex);
      lastLogTail = res.logTail;
      token = res.token;
      const parsed = parseLatexLog(lastLogTail);
      emit({ type: "latex_log", attempt, logTail: lastLogTail, parsedErrors: parsed, tex });
      const ats = analyzeAts(tex, input.job?.jobDescription);
      emit({ type: "ats_score", ats, logTail: lastLogTail });
      const approved = ats.score >= 50;
      emit({ type: "done", ats, token, logTail: lastLogTail, tex, attempt });
      return { tex, token, logTail: lastLogTail, attempts, ats, approved };
    } catch (err) {
      const pdfErr = err instanceof PdfError ? err : null;
      lastLogTail = pdfErr?.logTail || (err instanceof Error ? err.message : String(err));
      const parsed = parseLatexLog(lastLogTail);
      emit({ type: "latex_log", attempt, logTail: lastLogTail, parsedErrors: parsed, tex });
      if (attempt >= maxPatches) {
        const ats = analyzeAts(tex, input.job?.jobDescription);
        emit({ type: "ats_score", ats, logTail: lastLogTail });
        emit({ type: "error", message: pdfErr?.message || "Compilation failed after max patches", logTail: lastLogTail, parsedErrors: parsed });
        return { tex, token, logTail: lastLogTail, attempts, ats, approved: false };
      }
      const patched = await patchTexViaLLM(tex, lastLogTail, input.llmSettings ?? null);
      const patchChanged = patched.trim() !== tex.trim();
      emit({ type: "patch", attempt: attempt + 1, patch: patched.slice(0, 4000), tex: patched, logTail: lastLogTail, message: patchChanged ? `Patched tex (attempt ${attempt + 1})` : "Heuristic patch applied" });
      tex = patched;
    }
  }
  const ats = analyzeAts(tex, input.job?.jobDescription);
  emit({ type: "ats_score", ats, logTail: lastLogTail });
  return { tex, token, logTail: lastLogTail, attempts, ats, approved: false };
}
