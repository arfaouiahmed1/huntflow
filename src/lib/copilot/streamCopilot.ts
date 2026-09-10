/**
 * Streaming Resume Copilot driver (server-only).
 *
 * Same shape as the assistant's runAssistantStream: drives a bounded
 * route → tool → compose loop and reports each working step through
 * `onEvent` as it happens. The SSE route maps these to frames.
 *
 * Bounds: at most 2 tool rounds, 1 streamed composition, 1 structured
 * edit call. Without an LLM provider the deterministic tools
 * (search_vault, read_selection, compile_check, retarget) still run and
 * the reply is composed from their outputs — honestly labeled llm:false.
 *
 * Reasoning events are concise server-produced operational summaries,
 * never raw chain-of-thought (the model's private `note` is accepted
 * but never emitted).
 */
import { callLLMJSON, resolveChain } from "@/lib/llm/router";
import { generateText } from "@/lib/llm/client";
import { generateTextStream } from "@/lib/llm/stream";
import { cleanResumeContent } from "@/lib/llm/sanitize";
import { renderTemplate } from "@/lib/pdf/resumeTemplates";
import { analyzeAts } from "@/lib/ats/analyze";
import type { AtsReport } from "@/lib/ats/analyze";
import { takeAttachments } from "./attachments";
import type { StoredAttachment } from "./attachments";
import { firstVisionEntry } from "@/lib/llm/vision";
import type { VisionImage } from "@/lib/llm/vision";
import { COMPOSE_SYSTEM_PROMPT, COPILOT_SYSTEM_PROMPT, DECISION_SYSTEM_PROMPT } from "./prompts";
import { runCopilotTool, TOOL_NAMES } from "./tools";
import type { CopilotToolContext, ToolName, ToolStatus } from "./tools";
import type { ResumeContent } from "@/types";

export type CopilotStreamEvent =
  | { kind: "reasoning"; note: string }
  | { kind: "tool_call"; tool: string; detail: string; status: ToolStatus }
  | { kind: "token"; delta: string }
  | { kind: "patch"; attempt: number; patchPreview: string; texLength: number; message: string }
  | { kind: "latex_log"; attempt: number; logTail: string; parsedErrors: string[] }
  | { kind: "ats_score"; ats: AtsReport };

export interface CopilotStreamInput {
  message: string;
  resume: ResumeContent;
  tex: string;
  templateId: string;
  history: { role: string; content: string }[];
  targetJob?: { title?: string; company?: string; description?: string } | null;
  selection?: { text: string; sourceLine?: number; pdfPage?: number } | null;
  jobId?: string | null;
  /** Ephemeral upload ids from POST copilot/attachments (consumed once). */
  attachmentIds?: string[] | null;
}

export interface CopilotCite {
  docName: string;
  chunkIndex: number;
}

export interface CopilotStreamResult {
  reply: string;
  actionSummary?: string;
  updatedResume?: ResumeContent | null;
  tex?: string | null;
  cites: CopilotCite[];
  usedTools: string[];
  llm: boolean;
}

interface Decision {
  action: "answer" | "act";
  tool: ToolName | null;
  args: Record<string, unknown>;
  wantsEdit: boolean;
}

const MAX_TOOL_ROUNDS = 2;

function heuristicDecision(input: CopilotStreamInput): Decision {
  const msg = input.message.toLowerCase();
  const hasSelection = !!input.selection?.text?.trim();
  if (/compil|build|verif|will this (work|break)|syntax|error/.test(msg)) {
    return { action: "act", tool: "compile_check", args: {}, wantsEdit: false };
  }
  if (hasSelection && /rewrit|improv|fix|edit|optimi|shorten|quantif|polish|tighten/.test(msg)) {
    return { action: "act", tool: "read_selection", args: {}, wantsEdit: true };
  }
  if (/vault|document|certificate|evidence|transcript|metric/.test(msg)) {
    return { action: "act", tool: "search_vault", args: { query: input.message.slice(0, 500) }, wantsEdit: false };
  }
  if (/tailor|for this (job|role)|job description/.test(msg) && (input.jobId || input.targetJob)) {
    return { action: "act", tool: "retarget", args: input.jobId ? { jobId: input.jobId } : {}, wantsEdit: true };
  }
  return {
    action: "answer",
    tool: null,
    args: {},
    wantsEdit: /rewrit|improv|\badd\b|tailor|fix|edit|optimi|shorten|quantif|polish|rebuild/.test(msg),
  };
}

function cleanDecision(v: unknown): Decision | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  const action = d.action === "act" ? "act" : "answer";
  const tool = typeof d.tool === "string" && (TOOL_NAMES as string[]).includes(d.tool) ? (d.tool as ToolName) : null;
  const args = d.args && typeof d.args === "object" && !Array.isArray(d.args) ? (d.args as Record<string, unknown>) : {};
  return { action: tool ? action : "answer", tool, args, wantsEdit: d.wantsEdit === true };
}

function historyBlock(history: CopilotStreamInput["history"]): string {
  return history
    .slice(-6)
    .map((m) => `${m.role}: ${m.content.slice(0, 400)}`)
    .join("\n");
}

function vaultBlock(hits: { docName: string; chunkIndex: number; text: string }[]): string {
  if (hits.length === 0) return "none";
  return hits.map((h) => `[Source: ${h.docName}#${h.chunkIndex}] ${h.text}`).join("\n---\n");
}

export async function runCopilotStream(
  input: CopilotStreamInput,
  onEvent: (event: CopilotStreamEvent) => void
): Promise<CopilotStreamResult> {
  const emit = (e: CopilotStreamEvent) => {
    try {
      onEvent(e);
    } catch {
      /* slow consumer must not stall the loop */
    }
  };

  const toolCtx: CopilotToolContext = {
    resume: input.resume,
    tex: input.tex,
    templateId: input.templateId,
    selection: input.selection,
    targetJob: input.targetJob,
  };

  const usedTools: string[] = [];
  const toolSummaries: string[] = [];
  const cites: CopilotCite[] = [];
  // Ephemeral uploads, consumed once: PDF text joins the context (cited),
  // images ride the vision path (never described locally).
  const attachments: StoredAttachment[] =
    input.attachmentIds && input.attachmentIds.length > 0 ? takeAttachments(input.attachmentIds.slice(0, 3)) : [];
  const attachedPdfs = attachments.filter((a) => a.kind === "pdf" && a.text);
  const attachedImages: VisionImage[] = attachments
    .filter((a) => a.kind === "image" && a.base64)
    .map((a) => ({ mime: a.mime as VisionImage["mime"], base64: a.base64 as string }));
  for (const pdf of attachedPdfs) {
    cites.push({ docName: pdf.name, chunkIndex: 0 });
    toolSummaries.push(`- attachment [pdf]: ${pdf.name} (${pdf.text?.length ?? 0} chars${pdf.truncated ? ", truncated" : ""})`);
  }
  if (attachedImages.length > 0) {
    toolSummaries.push(`- attachment [image]: ${attachedImages.length} image${attachedImages.length === 1 ? "" : "s"} for vision analysis`);
  }
  let vaultHits: { docName: string; chunkIndex: number; text: string }[] = [];
  let patchedTex: string | null = null;
  let retargetedResume: ResumeContent | null = null;
  let retargetSummary: string | null = null;
  let llm = false;

  // 1. Route: one LLM decision, heuristic fallback offline.
  let decision: Decision = heuristicDecision(input);
  try {
    const chain = resolveChain();
    if (chain.length > 0) {
      const raw = await callLLMJSON<Record<string, unknown>>(
        {
          system: DECISION_SYSTEM_PROMPT,
          user: `REQUEST: ${input.message.slice(0, 2000)}\nHAS_SELECTION: ${input.selection ? "yes" : "no"}\nHAS_TARGET_JOB: ${input.targetJob ? "yes" : "no"}`,
          agent: "resume_route",
        },
        chain
      );
      const cleaned = cleanDecision(raw);
      if (cleaned) {
        decision = cleaned;
        llm = true;
      }
    }
  } catch {
    decision = heuristicDecision(input);
  }

  // 2. Bounded tool rounds (server-curated reasoning notes only).
  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    if (decision.action !== "act" || !decision.tool) break;
    const tool = decision.tool;
    emit({ kind: "reasoning", note: round === 0 ? `Routing to ${tool}.` : `Following up with ${tool}.` });
    let result;
    try {
      result = await runCopilotTool(tool, toolCtx, decision.args);
    } catch (e: unknown) {
      result = {
        status: "error" as const,
        summary: `${tool} crashed: ${e instanceof Error ? e.message : String(e)}.`,
        next_actions: ["Retry the request."],
      };
    }
    usedTools.push(tool);
    toolSummaries.push(`- ${tool} [${result.status}]: ${result.summary}`);
    emit({ kind: "tool_call", tool, detail: result.summary, status: result.status });

    const artifacts = result.artifacts ?? {};
    if (tool === "search_vault" && Array.isArray(artifacts.hits)) {
      vaultHits = artifacts.hits as typeof vaultHits;
      for (const h of vaultHits) cites.push({ docName: h.docName, chunkIndex: h.chunkIndex });
    }
    if (tool === "patch_tex" && typeof artifacts.patchedTex === "string") {
      patchedTex = artifacts.patchedTex;
      toolCtx.tex = patchedTex;
      emit({
        kind: "patch",
        attempt: round + 1,
        patchPreview: patchedTex.slice(0, 4000),
        texLength: patchedTex.length,
        message: result.summary,
      });
    }
    if (tool === "compile_check") {
      const logTail = typeof artifacts.logTail === "string" ? artifacts.logTail : "";
      const parsedErrors = Array.isArray(artifacts.parsedErrors) ? (artifacts.parsedErrors as string[]) : [];
      emit({ kind: "latex_log", attempt: round, logTail: logTail.slice(-6000), parsedErrors });
      try {
        emit({ kind: "ats_score", ats: analyzeAts(toolCtx.tex, input.targetJob?.description) });
      } catch {
        /* ATS is advisory — never fails the turn */
      }
    }
    if (tool === "retarget" && artifacts.updatedResume) {
      retargetedResume = artifacts.updatedResume as ResumeContent;
      retargetSummary = result.summary;
    }
    // One tool per turn is the common case; a failed tool gets one retry
    // with its error in context, then we compose regardless.
    if (result.status !== "error") break;
    decision = { action: "answer", tool: null, args: {}, wantsEdit: decision.wantsEdit };
  }

  // 3. Compose the advisory reply as genuine streamed tokens.
  const attachedPdfBlock =
    attachedPdfs.length > 0
      ? attachedPdfs.map((a) => `[Source: ${a.name}] ${(a.text ?? "").slice(0, 12000)}`).join("\n---\n")
      : "none";
  const userContext = [
    `CURRENT RESUME:\n${JSON.stringify(input.resume).slice(0, 8000)}`,
    `VAULT EVIDENCE:\n${vaultBlock(vaultHits)}`,
    `ATTACHED PDFS:\n${attachedPdfBlock}`,
    input.selection?.text ? `ACTIVE SELECTION:\n${input.selection.text.slice(0, 2000)}` : "ACTIVE SELECTION: none",
    toolSummaries.length > 0 ? `TOOL OUTPUTS:\n${toolSummaries.join("\n")}` : "TOOL OUTPUTS: none",
    input.targetJob?.title ? `TARGET JOB: ${input.targetJob.title} @ ${input.targetJob.company ?? ""}` : "TARGET JOB: none",
    `HISTORY:\n${historyBlock(input.history) || "—"}`,
    `USER REQUEST:\n${input.message.slice(0, 3000)}`,
  ].join("\n\n");

  const visionNote = (() => {
    if (attachedImages.length === 0) return null;
    const entry = firstVisionEntry(resolveChain());
    return entry ? `${entry.label} (${entry.model})` : null;
  })();
  // Images present but unanalyzable: disclosed, never silently dropped.
  const visionBlocked =
    attachedImages.length > 0 && !visionNote
      ? "I can't analyze attached images with the providers currently enabled — none is vision-capable. " +
        "Enable an OpenAI (gpt-4o), Gemini, or Claude vision model in Settings → AI Engine, or attach the content as PDF/text."
      : null;

  let reply = "";
  try {
    emit({ kind: "reasoning", note: visionNote ? `Composing answer with images (${visionNote}).` : "Composing answer." });
    let full = "";
    const images = attachedImages.length > 0 && !visionBlocked ? attachedImages : [];
    for await (const delta of generateTextStream(undefined, COMPOSE_SYSTEM_PROMPT, userContext, images)) {
      if (!delta) continue;
      full += delta;
      emit({ kind: "token", delta });
    }
    if (full.trim()) {
      reply = visionBlocked ? `${visionBlocked}\n\n${full.trim()}` : full.trim();
      llm = true;
    }
  } catch {
    /* fall through to the non-streaming attempt below (text-only turns) */
  }
  if (!reply && attachedImages.length === 0) {
    try {
      const res = await generateText(undefined, COMPOSE_SYSTEM_PROMPT, userContext);
      if (res.text.trim()) {
        reply = res.text.trim();
        emit({ kind: "token", delta: reply });
        llm = true;
      }
    } catch {
      /* deterministic fallback below */
    }
  }
  if (!reply) {
    // With images, a failed vision stream must not degrade into a text-only
    // answer that pretends the images were seen.
    const parts = [
      visionBlocked ??
        (attachedImages.length > 0
          ? "Image analysis failed for this turn — the images were not analyzed. Retry, or attach the content as PDF/text."
          : "No language provider is configured, so this is a deterministic summary of what ran locally."),
      ...toolSummaries,
      "Add an API key in Settings → AI Engine for full rewrites.",
    ];
    reply = parts.join("\n\n");
  }

  // 4. Structured edit (only when requested): one bounded JSON call.
  let updatedResume: ResumeContent | null = retargetedResume;
  let tex: string | null = patchedTex;
  let actionSummary: string | undefined = retargetSummary ?? undefined;
  if (decision.wantsEdit && !patchedTex) {
    try {
      const chain = resolveChain();
      if (chain.length > 0) {
        emit({ kind: "reasoning", note: "Applying document edits." });
        const parsed = await callLLMJSON<{ reply?: string; actionSummary?: string; updatedResume?: ResumeContent }>(
          {
            system: COPILOT_SYSTEM_PROMPT,
            user: `${userContext}\n\nReturn the JSON payload with reply, actionSummary, and updatedResume.`,
            agent: "resume",
          },
          chain
        );
        const cleaned = parsed?.updatedResume ? cleanResumeContent(parsed.updatedResume) : null;
        if (cleaned) {
          updatedResume = cleaned;
          try {
            tex = renderTemplate(input.templateId, cleaned);
          } catch {
            tex = null;
          }
          actionSummary = parsed?.actionSummary || "Updated resume content.";
          llm = true;
        }
      }
    } catch {
      /* reply already streamed — edits are best-effort */
    }
  }
  if (patchedTex && !actionSummary) actionSummary = "Applied anchored source edits.";

  return { reply, actionSummary, updatedResume, tex, cites, usedTools, llm };
}
