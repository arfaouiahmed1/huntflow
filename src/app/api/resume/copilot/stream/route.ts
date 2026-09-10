import { NextRequest } from "next/server";
import { readBody } from "@/lib/errors";
import { sseFrame, sseHeaders } from "@/lib/sse";
import { runCopilotStream } from "@/lib/copilot/streamCopilot";
import type { ResumeContent } from "@/types";

/**
 * Streaming Resume Copilot (SSE).
 *
 * The legacy POST /api/resume/copilot JSON contract is preserved for
 * old clients — this endpoint is the progressive enhancement: explicit
 * opt-in by URL, same as POST /api/assistant?stream=1. Event schema:
 * config | reasoning | tool_call | token | patch | latex_log |
 * ats_score | done | error.
 *
 * Reasoning frames are concise server-produced operational summaries,
 * never raw chain-of-thought.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE = 8000;
const MAX_TEX = 200_000;

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  let body: Record<string, unknown>;
  try {
    body = (await readBody(req)) as Record<string, unknown>;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid body";
    return new Response(sseFrame("error", { message: msg }), { status: 400, headers: sseHeaders });
  }

  const message = typeof body.message === "string" ? body.message.slice(0, MAX_MESSAGE).trim() : "";
  if (!message) {
    return new Response(sseFrame("error", { message: "message is required." }), { status: 400, headers: sseHeaders });
  }
  const resume = (body.resume ?? {}) as ResumeContent;
  const tex = typeof body.tex === "string" ? body.tex.slice(0, MAX_TEX) : "";
  const templateId = typeof body.templateId === "string" && body.templateId ? body.templateId : "classic-ats";
  const history = Array.isArray(body.history)
    ? (body.history as { role?: unknown; content?: unknown }[])
        .filter((m) => typeof m?.content === "string")
        .slice(-6)
        .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 2000) }))
    : [];
  const targetJob = (body.targetJob ?? null) as CopilotTargetJob;
  const selection = (body.selection ?? null) as CopilotSelection;
  const jobId = typeof body.jobId === "string" ? body.jobId : null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sseFrame(event, data)));
        } catch {
          /* client disconnected mid-stream — stop writing */
        }
      };

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          /* client closed */
        }
      }, 15_000);

      const abortFromClient = () => {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", abortFromClient, { once: true });

      try {
        push("config", { stream: true, templateId });
        const result = await runCopilotStream(
          { message, resume, tex, templateId, history, targetJob, selection, jobId },
          (ev) => {
            switch (ev.kind) {
              case "reasoning":
                push("reasoning", { note: ev.note });
                break;
              case "tool_call":
                push("tool_call", { tool: ev.tool, detail: ev.detail, status: ev.status });
                break;
              case "token":
                push("token", { delta: ev.delta });
                break;
              case "patch":
                push("patch", {
                  attempt: ev.attempt,
                  patchPreview: ev.patchPreview,
                  texLength: ev.texLength,
                  message: ev.message,
                });
                break;
              case "latex_log":
                push("latex_log", { attempt: ev.attempt, logTail: ev.logTail, parsedErrors: ev.parsedErrors });
                break;
              case "ats_score":
                push("ats_score", {
                  score: ev.ats.score,
                  checks: ev.ats.checks,
                  keywords: ev.ats.keywords,
                  estimatedPages: ev.ats.estimatedPages,
                });
                break;
            }
          }
        );
        push("done", {
          reply: result.reply,
          actionSummary: result.actionSummary ?? null,
          updatedResume: result.updatedResume ?? null,
          tex: result.tex ?? null,
          cites: result.cites,
          usedTools: result.usedTools,
          llm: result.llm,
        });
      } catch (err: unknown) {
        push("error", { message: err instanceof Error ? err.message : "Unexpected streaming error." });
      } finally {
        clearInterval(heartbeat);
        req.signal.removeEventListener("abort", abortFromClient);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, { headers: sseHeaders });
}

interface CopilotTargetJob {
  title?: string;
  company?: string;
  description?: string;
}

interface CopilotSelection {
  text: string;
  sourceLine?: number;
  pdfPage?: number;
}
