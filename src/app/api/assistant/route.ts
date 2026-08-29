import { NextRequest } from "next/server";
import { routeError, readBody } from "@/lib/errors";
import { runAssistant, runAssistantStream, AssistantStreamEvent, ChatMessage } from "@/agents/orchestrator";
import { settingsRepo } from "@/lib/db";
import { UserProfile } from "@/types";
import { sseFrame, sseHeaders } from "@/lib/sse";
import { initialProfile } from "@/lib/initialData";

/**
 * Decide whether this request wants a live SSE stream. The negotiation is
 * explicit so any client that hasn't opted in (curls, tests, old fetches)
 * silently gets the classic single-JSON response — streaming is purely a
 * progressive enhancement.
 */
function wantsStream(req: NextRequest): boolean {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/event-stream")) return true;
  return new URL(req.url).searchParams.get("stream") === "1";
}

function loadProfile(body: { profile?: unknown }): UserProfile | null {
  if (body.profile && typeof body.profile === "object" && typeof (body.profile as UserProfile).name === "string") {
    return body.profile as UserProfile;
  }
  const rawProfile = settingsRepo.get("profile");
  if (rawProfile) {
    try {
      return JSON.parse(rawProfile) as UserProfile;
    } catch {
      /* parse error, fallback */
    }
  }
  return initialProfile;
}

export async function POST(req: NextRequest) {
  try {
    const raw = await readBody(req);
    const body = (raw ?? {}) as { message?: string; history?: ChatMessage[]; profile?: UserProfile };
    const message = body.message?.trim();
    if (!message) {
      return Response.json({ error: "message is required." }, { status: 400 });
    }
    const profile = loadProfile(body);
    if (!profile) {
      return Response.json({ error: "Profile not found in database." }, { status: 400 });
    }

    const input = { message, history: body.history ?? [], profile };

    // Non-streaming consumers keep the exact prior JSON shape — unchanged.
    if (!wantsStream(req)) {
      const result = await runAssistant(input);
      return Response.json({ ok: true, ...result });
    }

    // Live SSE: emit a config frame, then reasoning/tool/token/done as the
    // orchestrator works, ending with the same { reply, steps, usedTools, llm }
    // contract the JSON path returns.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const push = (event: string, data: unknown) => {
          try {
            controller.enqueue(encoder.encode(sseFrame(event, data)));
          } catch {
            /* client disconnected mid-stream — stop writing */
          }
        };

        const emit = (event: AssistantStreamEvent) => {
          switch (event.kind) {
            case "reasoning":
              push("reasoning", { note: event.note });
              break;
            case "tool_call":
              push("tool_call", { tool: event.label, detail: event.detail });
              break;
            case "token":
              push("token", { delta: event.delta });
              break;
          }
        };

        try {
          push("config", { stream: true });
          const result = await runAssistantStream(input, emit);
          push("done", {
            reply: result.reply,
            steps: result.steps,
            usedTools: result.usedTools,
            llm: result.llm,
          });
        } catch (err) {
          // Mid-stream failure: surface it as an `error` frame (same shape the
          // non-streaming route uses) so the client can fall back or show it.
          const message =
            err instanceof Error ? err.message : "Unexpected streaming error.";
          push("error", { message });
        } finally {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      },
    });

    return new Response(stream, { headers: sseHeaders });
  } catch (err) {
    return routeError(err);
  }
}
