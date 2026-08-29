import { NextRequest, NextResponse } from "next/server";
import { AGENT_BASE_URL, agentHeaders } from "@/lib/agentClient";
import { sseFrame, sseHeaders } from "@/lib/sse";
/** SSE proxy: runId required, heartbeat, offline→error (no fake cards), tolerant cursor. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function isBoardProgress(m: string): boolean {
  return /\[Worker #\d+\]|yielded|candidate card|Skipped|Parallel crawl completed/i.test(m);
}
function isStructuredBoardEvent(d: unknown): boolean {
  const t = (d as Record<string, unknown> | null)?.type;
  return t === "board" || t === "run";
}
export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId")?.trim() || "";
  if (!runId) return NextResponse.json({ error: "runId query required" }, { status: 400 });
  const raw = req.nextUrl.searchParams.get("since")?.trim() ?? "0";
  const n = Number.parseInt(raw, 10);
  const init = Number.isFinite(n) && n >= 0 ? n : 0;
  const enc = new TextEncoder();
  let cursor = init;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (e: string, d: unknown) => {
        try { controller.enqueue(enc.encode(sseFrame(e, d))); } catch { /* closed */ }
      };
      push("connected", { runId, since: cursor });
      const hb = setInterval(() => { try { controller.enqueue(enc.encode(": keepalive\n\n")); } catch {} }, 15_000);
      const onAbort = () => { clearInterval(hb); try { controller.close(); } catch {} };
      req.signal.addEventListener("abort", onAbort, { once: true });
      let polls = 0;
      try {
        while (!req.signal.aborted) {
          if (controller.desiredSize === null) break;
          if (polls++ > 110) break;
          try {
            const up = await fetch(`${AGENT_BASE_URL}/activity?since=${cursor}`, {
              headers: agentHeaders(), cache: "no-store", signal: AbortSignal.timeout(4_000),
            });
            if (!up.ok) {
              const m = `sidecar ${up.status} ${up.statusText}`.trim();
              push("error", { runId, message: `Agent offline — ${m}`, status: up.status });
              push("log", { id: cursor + 1, runId, ts: new Date().toLocaleTimeString("en-US", { hour12: false }), kind: "warning", message: `⚠ Agent offline — ${m}`, data: {} });
              await new Promise((r) => setTimeout(r, 900));
              continue;
            }
            let payload: { events?: Array<{ id: number; run_id: string; ts: string; kind: string; message: string; data?: unknown }>; runs?: Array<{ run_id: string; status: string }> };
            try { payload = (await up.json()) as typeof payload; } catch (e) {
              const m = e instanceof Error ? e.message : String(e);
              push("error", { runId, message: `malformed payload: ${m}` });
              push("log", { id: cursor + 1, runId, ts: new Date().toLocaleTimeString("en-US", { hour12: false }), kind: "warning", message: `⚠ malformed chunk: ${m}`, data: {} });
              await new Promise((r) => setTimeout(r, 800));
              continue;
            }
            const events = Array.isArray(payload.events) ? payload.events : [];
            for (const ev of events) {
              try {
                if (typeof ev?.id !== "number" || typeof ev?.run_id !== "string") continue;
                if (ev.run_id !== runId) continue;
                if (ev.id > cursor) cursor = ev.id;
                let d: unknown = (ev as Record<string, unknown>).data ?? null;
                if (typeof d === "string") { try { d = JSON.parse(d as string); } catch { d = { raw: d }; } }
                push("log", { id: ev.id, runId: ev.run_id, ts: ev.ts, kind: ev.kind, message: ev.message, data: d });
                if (isStructuredBoardEvent(d) || isBoardProgress(ev.message)) {
                  push("board_update", { id: ev.id, runId: ev.run_id, ts: ev.ts, kind: ev.kind, message: ev.message, data: d });
                }
              } catch { continue; }
            }
            if (Array.isArray(payload.runs)) {
              const t = payload.runs.find((r) => r.run_id === runId);
              if (t && t.status !== "running") {
                push("board_update", { id: cursor, runId, kind: t.status === "success" ? "success" : "info", message: `Run ${runId} ${t.status}`, ts: new Date().toLocaleTimeString("en-US", { hour12: false }), data: { type: "run", status: t.status } });
                await new Promise((r) => setTimeout(r, 300));
                break;
              }
            }
          } catch (err) {
            if (req.signal.aborted) break;
            const m = err instanceof Error ? err.message : String(err);
            push("error", { runId, message: `poll failed: ${m}` });
            push("log", { id: cursor + 1, runId, ts: new Date().toLocaleTimeString("en-US", { hour12: false }), kind: "warning", message: `⚠ stream poll failed: ${m}`, data: {} });
          }
          await new Promise((r) => setTimeout(r, 800));
        }
      } finally {
        clearInterval(hb);
        req.signal.removeEventListener("abort", onAbort);
        try { push("done", { runId, since: cursor }); } catch {}
        try { controller.close(); } catch {}
      }
    },
  });
  return new Response(stream, { headers: sseHeaders });
}
