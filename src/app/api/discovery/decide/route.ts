import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { discoveryQueueRepo, jobsRepo, jobSourceEdgesRepo } from "@/lib/db";
import { dedupKey } from "@/lib/dedup";
import type { JobApplication } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DecideBodySchema = z.object({
  canonicalKey: z.string().min(1).max(500).optional(),
  key: z.string().min(1).max(500).optional(),
  outcome: z.enum(["saved", "dismissed"]),
  reason: z.string().max(120).optional(),
});

function resolveKey(body: { canonicalKey?: string; key?: string }): string | null {
  const raw = (body.canonicalKey ?? body.key ?? "").trim();
  return raw ? raw : null;
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = DecideBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const canonicalKey = resolveKey(parsed.data);
  if (!canonicalKey) {
    return NextResponse.json(
      { success: false, error: "canonicalKey is required" },
      { status: 400 }
    );
  }

  try {
    const item = discoveryQueueRepo.get(canonicalKey);
    if (!item) {
      return NextResponse.json(
        { success: false, error: "Inbox item not found", canonicalKey },
        { status: 404 }
      );
    }

    if (parsed.data.outcome === "dismissed") {
      const reason = (parsed.data.reason ?? "generic").trim() || "generic";
      const decided = discoveryQueueRepo.decide(canonicalKey, "dismissed", { reason });
      return NextResponse.json({
        success: true,
        outcome: "dismissed",
        canonicalKey,
        status: decided?.status ?? "dismissed",
        counts: discoveryQueueRepo.counts(),
      });
    }

    // outcome === "saved": idempotent promotion into the tracker.
    if (item.status === "saved" && item.savedJobId) {
      const existing = jobsRepo.get(item.savedJobId);
      if (existing) {
        return NextResponse.json({
          success: true,
          outcome: "saved",
          canonicalKey,
          status: "saved",
          job: existing,
          counts: discoveryQueueRepo.counts(),
        });
      }
    }

    let payload: JobApplication;
    try {
      payload = JSON.parse(item.payloadJson) as JobApplication;
    } catch {
      return NextResponse.json(
        { success: false, error: "Stored payload is corrupt", canonicalKey },
        { status: 500 }
      );
    }
    if (!payload || typeof payload.title !== "string") {
      return NextResponse.json(
        { success: false, error: "Stored payload is corrupt", canonicalKey },
        { status: 500 }
      );
    }

    const tracked = jobsRepo.get(payload.id);
    const job: JobApplication =
      tracked ??
      (() => {
        const promoted: JobApplication = {
          ...payload,
          status: "wishlist",
          origin: "crawler",
          notes: payload.notes ?? (item.sourceId ? `Crawled from ${item.sourceId}` : "Discovered by crawler"),
          autoApplyStatus: payload.autoApplyStatus ?? "idle",
          autoApplyLogs: payload.autoApplyLogs ?? [],
        };
        // Never collide with an unrelated tracker row sharing the payload id.
        const collision = jobsRepo.get(promoted.id);
        if (collision && collision.canonicalKey !== promoted.canonicalKey && dedupKey(collision) !== dedupKey(promoted)) {
          promoted.id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        }
        jobsRepo.upsert(promoted);
        return jobsRepo.get(promoted.id) ?? promoted;
      })();

    try {
      jobSourceEdgesRepo.upsertEdge({
        jobId: job.id,
        sourceId: item.sourceId,
        externalId: item.externalId,
        sourceUrl: job.url || "",
      });
    } catch (err) {
      console.warn("[discovery-decide-edge]", canonicalKey, err);
    }

    const decided = discoveryQueueRepo.decide(canonicalKey, "saved", { savedJobId: job.id });
    return NextResponse.json({
      success: true,
      outcome: "saved",
      canonicalKey,
      status: decided?.status ?? "saved",
      job,
      counts: discoveryQueueRepo.counts(),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
