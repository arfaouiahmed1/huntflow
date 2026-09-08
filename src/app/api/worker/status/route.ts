import { NextResponse } from "next/server";
import {
  crawlerRunsRepo,
  discoveryQueueRepo,
  savedSearchesRepo,
} from "@/lib/db";
import {
  WORKER_DEFAULT_CADENCE_MINUTES,
  WORKER_DEFAULT_CONCURRENCY,
  WORKER_DEFAULT_POLL_SECONDS,
  clampWorkerConcurrency,
  selectDueSearches,
} from "@/lib/crawler/workerPolicy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Worker observability: queue depth, due saved searches, recent runs.
 * The opt-in crawler worker (`npm run worker:crawler`) polls this endpoint
 * and triggers `POST /api/crawl` for due searches — all persistence stays
 * behind web-side routes (single-writer discipline for SQLite).
 */
export async function GET() {
  try {
    const nowMs = Date.now();
    const searches = savedSearchesRepo.list();
    const due = selectDueSearches(
      searches.map((s) => ({ id: s.id, enabled: s.enabled, nextRunAt: s.nextRunAt, lastRunAt: s.lastRunAt })),
      nowMs,
      searches.length
    );
    const dueDetail = due.map((d) => {
      const full = searches.find((s) => s.id === d.id);
      return {
        id: d.id,
        name: full?.name ?? d.id,
        channel: full?.channel ?? "all",
        queryJson: full?.queryJson ?? "{}",
        cadenceMinutes: full?.cadenceMinutes ?? WORKER_DEFAULT_CADENCE_MINUTES,
        lastRunAt: d.lastRunAt ?? null,
        nextRunAt: d.nextRunAt ?? null,
      };
    });
    return NextResponse.json(
      {
        success: true,
        now: new Date(nowMs).toISOString(),
        queue: discoveryQueueRepo.counts(),
        dueSearches: dueDetail,
        dueCount: dueDetail.length,
        savedSearchCount: searches.length,
        worker: {
          cadenceMinutesDefault: WORKER_DEFAULT_CADENCE_MINUTES,
          concurrencyDefault: WORKER_DEFAULT_CONCURRENCY,
          pollSecondsDefault: WORKER_DEFAULT_POLL_SECONDS,
          concurrency: clampWorkerConcurrency(process.env.HUNTFLOW_WORKER_CONCURRENCY ?? 1),
        },
        recentRuns: crawlerRunsRepo.listRecent(5),
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
