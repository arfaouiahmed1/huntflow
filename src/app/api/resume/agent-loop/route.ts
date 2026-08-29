import { NextRequest } from "next/server";
import { readBody } from "@/lib/errors";
import { sseHeaders, sseFrame } from "@/lib/sse";
import { runResumeAgentLoop } from "@/agents/resumeAgent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TEX = 200_000;

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  let body: Record<string, unknown>;
  try {
    body = (await readBody(req)) as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid body";
    return new Response(sseFrame("error", { message: msg }), { status: 400, headers: sseHeaders });
  }

  const kind = typeof body.kind === "string" ? body.kind : "resume";
  const templateId = typeof body.templateId === "string" && body.templateId.trim() ? body.templateId.trim() : "classic-ats";
  const profile = body.profile as unknown;
  const job = body.job as { title: string; company: string; jobDescription: string } | null | undefined;
  const llmSettings = (body.llmSettings as unknown) ?? null;
  const agentSettings = body.agentSettings as unknown;
  const initialTex = typeof body.initialTex === "string" ? body.initialTex : typeof body.tex === "string" ? body.tex : undefined;
  const maxPatchesRaw = typeof body.maxPatches === "number" ? body.maxPatches : 3;

  if (initialTex && initialTex.length > MAX_TEX) {
    return new Response(sseFrame("error", { message: "Document too large to compile." }), { status: 413, headers: sseHeaders });
  }

  if (!profile && !initialTex) {
    return new Response(sseFrame("error", { message: "profile or initialTex is required." }), { status: 400, headers: sseHeaders });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sseFrame(event, data)));
        } catch {
          /* client closed */
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
        push("connected", { kind, templateId });

        await runResumeAgentLoop(
          {
            task: "draft",
            kind: kind as never,
            templateId,
            profile: profile as never,
            job: (job as never) ?? null,
            llmSettings: llmSettings as never,
            agentSettings: agentSettings as never,
            initialTex: initialTex?.slice(0, MAX_TEX),
            maxPatches: Math.max(0, Math.min(3, maxPatchesRaw)),
          },
          (ev) => {
            if (ev.type === "latex_log") {
              push("latex_log", {
                attempt: ev.attempt,
                logTail: (ev.logTail || "").slice(0, 6000),
                parsedErrors: ev.parsedErrors ?? [],
              });
            } else if (ev.type === "patch") {
              push("patch", {
                attempt: ev.attempt,
                patchPreview: (ev.patch || "").slice(0, 4000),
                texLength: ev.tex?.length ?? 0,
                message: ev.message,
              });
            } else if (ev.type === "ats_score") {
              push("ats_score", {
                score: ev.ats?.score ?? 0,
                checks: ev.ats?.checks ?? [],
                keywords: ev.ats?.keywords ?? [],
                estimatedPages: ev.ats?.estimatedPages ?? 1,
              });
            } else if (ev.type === "draft") {
              push("draft", { texLength: ev.tex?.length ?? 0, message: ev.message });
            }
          }
        ).then((result) => {
          push("done", {
            approved: result.approved,
            attempts: result.attempts,
            token: result.token ?? null,
            logTail: (result.logTail || "").slice(0, 6000),
            texLength: result.tex.length,
            atsScore: result.ats?.score ?? 0,
          });
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        push("error", { message });
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

export async function GET() {
  return new Response(sseFrame("error", { message: "Use POST with {profile, templateId} or {initialTex} to start the agentic loop. SSE events: latex_log|patch|ats_score" }), {
    status: 405,
    headers: sseHeaders,
  });
}
