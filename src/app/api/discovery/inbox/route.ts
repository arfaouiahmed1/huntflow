import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { discoveryQueueRepo } from "@/lib/db";
import type { DiscoveryQueueStatus } from "@/lib/crawler/contracts";
import type { JobApplication } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const InboxQuerySchema = z.object({
  status: z.enum(["new", "seen", "pending", "all"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

function toJobApplication(payloadJson: string): JobApplication | null {
  try {
    const payload = JSON.parse(payloadJson) as JobApplication;
    if (!payload || typeof payload !== "object" || typeof payload.title !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const parsed = InboxQuerySchema.safeParse({
    status: req.nextUrl.searchParams.get("status") ?? undefined,
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
    offset: req.nextUrl.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid query parameters", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const mode = parsed.data.status ?? "pending";
    const statuses: DiscoveryQueueStatus[] =
      mode === "all"
        ? ["new", "seen", "saved", "dismissed"]
        : mode === "new"
          ? ["new"]
          : mode === "seen"
            ? ["seen"]
            : ["new", "seen"];
    const items = discoveryQueueRepo.list({
      statuses,
      limit: parsed.data.limit ?? 50,
      offset: parsed.data.offset ?? 0,
    });
    const jobs: JobApplication[] = [];
    for (const item of items) {
      const job = toJobApplication(item.payloadJson);
      if (job) jobs.push(job);
    }
    return NextResponse.json(
      {
        success: true,
        jobs,
        count: jobs.length,
        counts: discoveryQueueRepo.counts(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
