import { NextRequest } from "next/server";
import { routeError, readBody } from "@/lib/errors";
import { memoryRepo } from "@/lib/db";
import { remember } from "@/lib/agents/memory";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") ?? undefined;
    const jobId = url.searchParams.get("jobId") ?? undefined;
    const source = url.searchParams.get("source") ?? undefined;
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
    return Response.json({ memory: memoryRepo.list({ kind, jobId, source, limit }) });
  } catch (err) {
    return routeError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await readBody(req);
    const body = (raw ?? {}) as {
      kind?: string;
      content?: string;
      jobId?: string;
      source?: string;
      importance?: number;
    };
    if (!body.content?.trim()) {
      return Response.json({ error: "content is required." }, { status: 400 });
    }
    const kind = (["note", "insight", "fact", "decision", "outcome"].includes(body.kind ?? "")
      ? body.kind
      : "note") as "note" | "insight" | "fact" | "decision" | "outcome";
    const importance = Number(body.importance ?? 0);
    const entry = remember(kind, body.content.trim(), {
      jobId: body.jobId,
      source: body.source ?? "manual",
      importance: Number.isFinite(importance) ? Math.max(0, Math.min(5, importance)) : 0,
    });
    return Response.json({ ok: true, memory: entry });
  } catch (err) {
    return routeError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = Number(url.searchParams.get("id"));
    if (!id) return Response.json({ error: "id is required." }, { status: 400 });
    memoryRepo.delete(id);
    return Response.json({ ok: true });
  } catch (err) {
    return routeError(err);
  }
}
