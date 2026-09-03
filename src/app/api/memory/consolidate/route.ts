import { NextRequest } from "next/server";
import { routeError, readBody } from "@/lib/errors";
import { consolidateMemory } from "@/lib/agents/consolidator";
import { pruneExpired } from "@/lib/agents/memory";

/**
 * POST /api/memory/consolidate
 * Manual trigger for nightly long-memory consolidator (no cron infra).
 * Body: { jobId?: string, limit?: number }
 *
 * Idempotency: the consolidator is fingerprint-guarded via `agent_state`
 * (`consolidator:fp:<jobId>`) and `rememberLong` normalized dedup, so
 * repeated POSTs with the same episodic set produce `consolidated: 0` and
 * do not create duplicate long memories. TTL pruning runs before grouping
 * (see `consolidator.ts`) and is also ensured here; no new tables are added.
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await readBody(req).catch(() => null);
    const body = (raw ?? {}) as { jobId?: string; limit?: number };
    const jobId = typeof body.jobId === "string" && body.jobId.trim() ? body.jobId.trim() : undefined;
    const limitRaw = Number(body.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : undefined;

    // Ensure TTL pruning still works even if consolidator is called rarely — expired
    // short-term rows (expires_at <= now) are purged without adding tables.
    try {
      pruneExpired();
    } catch {
      // pruning is best-effort; consolidation remains correct via TTL filter
    }

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
