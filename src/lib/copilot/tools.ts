/**
 * Resume Copilot constrained tool layer (server-only).
 *
 * Five whitelisted tools with JSON schemas, deterministic behavior, and a
 * strict output contract — every result carries status / summary /
 * next_actions / artifacts so the UI can render tool activity honestly:
 *
 * - search_vault: hybrid vault retrieval (works offline, no LLM needed)
 * - read_selection: capture + bound quoted source/PDF content
 * - patch_tex: anchored source replacements (preamble changes refused)
 * - compile_check: real pdflatex compile of the current/proposed TeX
 * - retarget: deterministic JD-overlap skill re-ranking (facts untouched)
 *
 * Nothing here streams tokens or reveals chain-of-thought: summaries are
 * one-line operational statements produced by the tool itself.
 */

import { compileWithSynctex, parseLatexLog, PdfError } from "@/lib/pdf/compileLatex";
import { extractJdTerms } from "@/lib/prompts/commonPrompts";
import { jobsRepo } from "@/lib/db";
import { searchVault } from "@/lib/vault";
import type { ResumeContent } from "@/types";

export type ToolStatus = "ok" | "partial" | "error";

export interface ToolResult {
  status: ToolStatus;
  /** One-line operational summary (user-visible, never CoT). */
  summary: string;
  next_actions: string[];
  artifacts?: Record<string, unknown>;
}

export interface CopilotToolContext {
  resume: ResumeContent;
  /** Current LaTeX source. */
  tex: string;
  templateId: string;
  selection?: { text: string; sourceLine?: number; pdfPage?: number } | null;
  targetJob?: { title?: string; company?: string; description?: string } | null;
}

export type ToolName = "search_vault" | "read_selection" | "patch_tex" | "compile_check" | "retarget";

export const TOOL_NAMES: ToolName[] = ["search_vault", "read_selection", "patch_tex", "compile_check", "retarget"];

const MAX_TEX = 200_000;
const MAX_SELECTION = 4000;
const MAX_EDITS = 8;
const MAX_EDIT_CHARS = 4000;

/** Preamble/shell-escape constructs a patch must never introduce or touch. */
const FORBIDDEN_TEX = [
  "\\newcommand",
  "\\renewcommand",
  "\\def",
  "\\input",
  "\\include",
  "\\write",
  "\\immediate",
  "\\catcode",
  "\\openout",
  "\\closeout",
  "\\newwrite",
  "\\usepackage",
  "\\documentclass",
  "write18",
  "^^",
];

function forbiddenHit(s: string): string | null {
  const lower = s.toLowerCase();
  for (const f of FORBIDDEN_TEX) {
    if (lower.includes(f.toLowerCase())) return f;
  }
  return null;
}

function err(summary: string, next_actions: string[] = []): ToolResult {
  return { status: "error", summary, next_actions };
}

export async function searchVaultTool(
  ctx: CopilotToolContext,
  args: { query?: unknown; k?: unknown }
): Promise<ToolResult> {
  void ctx;
  const query = typeof args.query === "string" ? args.query.trim().slice(0, 500) : "";
  if (!query) return err("search_vault needs a query.", ["Ask about vault evidence with keywords."]);
  const k = typeof args.k === "number" && Number.isFinite(args.k) ? Math.max(1, Math.min(8, Math.floor(args.k))) : 5;
  let hits: { docName: string; chunkIndex: number; text: string; model: string }[] = [];
  try {
    const found = await searchVault(query, k);
    hits = found.map((h) => ({
      docName: h.docName,
      chunkIndex: h.chunkIndex,
      text: h.text.slice(0, 600),
      model: h.model,
    }));
  } catch (e: unknown) {
    return err(`Vault search failed: ${e instanceof Error ? e.message : String(e)}.`, ["Retry with simpler keywords."]);
  }
  if (hits.length === 0) {
    return {
      status: "ok",
      summary: `No vault passages matched "${query.slice(0, 80)}".`,
      next_actions: ["Attach evidence to the vault, or ask without vault grounding."],
      artifacts: { hits: [] },
    };
  }
  const names = [...new Set(hits.map((h) => h.docName))].slice(0, 3).join(", ");
  return {
    status: "ok",
    summary: `Found ${hits.length} vault passage${hits.length === 1 ? "" : "s"} (${names}).`,
    next_actions: ["Cite matched passages in the reply.", "Flag any invented metric for confirmation."],
    artifacts: { hits },
  };
}

export async function readSelectionTool(
  ctx: CopilotToolContext,
  args: { text?: unknown; sourceLine?: unknown; pdfPage?: unknown }
): Promise<ToolResult> {
  const raw = typeof args.text === "string" && args.text.trim() ? args.text : (ctx.selection?.text ?? "");
  const text = raw.slice(0, MAX_SELECTION);
  if (!text.trim()) {
    return err("read_selection needs selected text (or an active editor/PDF selection).", [
      "Select source lines or PDF text first.",
    ]);
  }
  const sourceLine =
    typeof args.sourceLine === "number" && Number.isFinite(args.sourceLine)
      ? Math.floor(args.sourceLine)
      : (ctx.selection?.sourceLine ?? null);
  const where = sourceLine ? `source line ${sourceLine}` : ctx.selection?.pdfPage ? `PDF page ${ctx.selection.pdfPage}` : "quoted text";
  return {
    status: "ok",
    summary: `Selection captured (${text.length} chars, ${where}).`,
    next_actions: ["Apply the requested rewrite to this selection.", "Keep surrounding content untouched."],
    artifacts: { text, chars: text.length, words: text.split(/\s+/).filter(Boolean).length, sourceLine },
  };
}

export interface PatchEdit {
  anchor?: unknown;
  replacement?: unknown;
}

export async function patchTexTool(
  ctx: CopilotToolContext,
  args: { edits?: unknown }
): Promise<ToolResult> {
  const edits = (Array.isArray(args.edits) ? args.edits : []) as PatchEdit[];
  if (edits.length === 0) return err("patch_tex needs at least one {anchor, replacement} edit.", ["Provide exact source anchors."]);
  if (edits.length > MAX_EDITS) return err(`patch_tex accepts at most ${MAX_EDITS} edits per call.`, ["Split into smaller batches."]);
  if (!ctx.tex) return err("No LaTeX source to patch.", ["Wait for the source to render, then retry."]);

  let tex = ctx.tex;
  const skipped: { index: number; reason: string }[] = [];
  let applied = 0;
  edits.forEach((e, i) => {
    const anchor = typeof e.anchor === "string" ? e.anchor : "";
    const replacement = typeof e.replacement === "string" ? e.replacement : "";
    if (!anchor || replacement.length > MAX_EDIT_CHARS) {
      skipped.push({ index: i, reason: !anchor ? "empty anchor" : "replacement too long" });
      return;
    }
    const hit = forbiddenHit(anchor) ?? forbiddenHit(replacement);
    if (hit) {
      skipped.push({ index: i, reason: `refused preamble/shell construct (${hit})` });
      return;
    }
    const occurrences = tex.split(anchor).length - 1;
    if (occurrences === 0) {
      skipped.push({ index: i, reason: "anchor not found in current source" });
      return;
    }
    if (occurrences > 1) {
      skipped.push({ index: i, reason: `anchor matches ${occurrences}x — not unique` });
      return;
    }
    tex = tex.replace(anchor, () => replacement);
    applied += 1;
  });

  if (applied === 0) {
    return {
      status: "error",
      summary: `No edits applied (${skipped.length} skipped).`,
      next_actions: ["Re-read the source and use exact, unique anchors.", "Run compile_check after a successful patch."],
      artifacts: { patchedTex: null, applied, skipped },
    };
  }
  return {
    status: skipped.length > 0 ? "partial" : "ok",
    summary: `Applied ${applied}/${edits.length} anchored edit${edits.length === 1 ? "" : "s"}${skipped.length > 0 ? ` (${skipped.length} skipped)` : ""}.`,
    next_actions: ["Run compile_check on the patched source.", "Review the diff before saving."],
    artifacts: { patchedTex: tex, applied, skipped },
  };
}

export async function compileCheckTool(
  ctx: CopilotToolContext,
  args: { tex?: unknown }
): Promise<ToolResult> {
  const tex = typeof args.tex === "string" && args.tex ? args.tex : ctx.tex;
  if (!tex.trim()) return err("compile_check needs LaTeX source.", ["Wait for the source to render, then retry."]);
  if (tex.length > MAX_TEX) return err("Source exceeds the 200k compile budget.", ["Trim the document and retry."]);
  try {
    const { token, logTail } = await compileWithSynctex(tex.slice(0, MAX_TEX));
    return {
      status: "ok",
      summary: "Patched source compiles clean.",
      next_actions: ["SyncTeX-navigate to verify layout.", "Save the source when satisfied."],
      artifacts: { token, logTail: logTail.slice(-6000), parsedErrors: parseLatexLog(logTail) },
    };
  } catch (e: unknown) {
    const tail = e instanceof PdfError ? e.logTail : e instanceof Error ? e.message : String(e);
    return {
      status: "error",
      summary: "Patched source does not compile.",
      next_actions: ["Inspect the log errors by line.", "Patch the flagged lines and re-run compile_check."],
      artifacts: { token: null, logTail: String(tail ?? "").slice(-6000), parsedErrors: parseLatexLog(String(tail ?? "")) },
    };
  }
}

export async function retargetTool(
  ctx: CopilotToolContext,
  args: { jobId?: unknown }
): Promise<ToolResult> {
  const inlineId =
    ctx.targetJob && typeof (ctx.targetJob as { id?: unknown }).id === "string"
      ? String((ctx.targetJob as { id?: string }).id)
      : "";
  const jobId = typeof args.jobId === "string" && args.jobId ? args.jobId : inlineId;
  if (!jobId && !ctx.targetJob?.description) {
    return err("retarget needs a tracked jobId or target-job context.", ["Select a target job in the Studio header."]);
  }
  const tracked = jobId ? jobsRepo.list().find((j) => j.id === jobId) ?? null : null;
  const title = tracked?.title ?? ctx.targetJob?.title ?? "role";
  const company = tracked?.company ?? ctx.targetJob?.company ?? "company";
  const description = tracked?.jobDescription ?? ctx.targetJob?.description ?? "";
  if (!description.trim()) return err(`No job description for ${company} — ${title}.`, ["Open the job and sync its description."]);

  // Deterministic JD-overlap re-rank (mirrors the agent tailorFallback):
  // skills mentioned in the JD float up; facts are never invented.
  const skills = ctx.resume.skills ?? [];
  const jd = description.toLowerCase();
  const scored = skills
    .map((s) => ({ s, score: jd.includes(s.toLowerCase()) ? 1 : 0 }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
  const terms = extractJdTerms(description, skills);
  const matched = terms.filter((t) => t.inResume).map((t) => t.term);
  const missing = terms.filter((t) => !t.inResume).map((t) => t.term);
  const merged = [...scored, ...matched.filter((t) => !scored.some((s) => s.toLowerCase() === t.toLowerCase()))].slice(0, 40);
  return {
    status: "ok",
    summary: `Re-ranked ${merged.length} skills for ${company} — ${title} (${matched.length} matched, ${missing.length} missing).`,
    next_actions:
      missing.length > 0
        ? [`Mirror missing keywords honestly: ${missing.slice(0, 4).join(", ")}.`, "Run compile_check after edits."]
        : ["Run compile_check after edits."],
    artifacts: { updatedResume: { ...ctx.resume, skills: merged }, matched, missing, job: { title, company } },
  };
}

export async function runCopilotTool(
  name: string,
  ctx: CopilotToolContext,
  args: Record<string, unknown>
): Promise<ToolResult> {
  switch (name as ToolName) {
    case "search_vault":
      return searchVaultTool(ctx, args);
    case "read_selection":
      return readSelectionTool(ctx, args);
    case "patch_tex":
      return patchTexTool(ctx, args);
    case "compile_check":
      return compileCheckTool(ctx, args);
    case "retarget":
      return retargetTool(ctx, args);
    default:
      return err(`Unknown tool "${name}".`, [`Use one of: ${TOOL_NAMES.join(", ")}.`]);
  }
}
