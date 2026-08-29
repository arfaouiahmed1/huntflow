import { NextRequest } from "next/server";
import { routeError, readBody } from "@/lib/errors";
import { consolidateMemory } from "@/lib/agents/consolidator";

/**
 * POST /api/memory/consolidate
 * Manual trigger for nightly long-memory consolidator (no cron infra).
 * Body: { jobId?: string, limit?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await readBody(req).catch(() => null);
    const body = (raw ?? {}) as { jobId?: string; limit?: number };
    const jobId = typeof body.jobId === "string" && body.jobId.trim() ? body.jobId.trim() : undefined;
    const limitRaw = Number(body.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : undefined;

    const result = await consolidateMemory({ jobId, limit });

    return Response.json({ ok: true, ...result });
  } catch (err) {
    return routeError(err);
  }
}

export async function GET() {
  return Response.json(
    { ok: false, error: "Use POST to trigger consolidation. Optional body: { jobId, limit }." },
    { status: 405 }
  );
}
