import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "@/app/api/crawl/route";
import { GET as GET_DATA } from "@/app/api/data/route";
import { GET as GET_INBOX } from "@/app/api/discovery/inbox/route";
import { discoveryQueueRepo, jobsRepo, settingsRepo } from "@/lib/db";
import { NextRequest } from "next/server";

/**
 * Task 10 — crawl persistence/refresh/concurrency defaults + source_ids
 */

function post(body: unknown) {
  return new NextRequest("http://localhost/api/crawl", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const crawledJobs = [
  {
    id: "task10-c1",
    title: "Senior React Engineer",
    company: "Acme",
    location: "Remote",
    url: "https://acme.io/jobs/task10-1",
    jobDescription: "React, TypeScript, Node.js role.",
  },
  {
    id: "task10-c2",
    title: "Platform Engineer",
    company: "Globex",
    location: "Berlin",
    url: "https://globex.io/jobs/task10-2",
    jobDescription: "Kubernetes, Go, TypeScript.",
  },
];

describe("Task 10 — queued discoveries are queryable via GET /api/discovery/inbox (tracker stays clean)", () => {
  beforeEach(() => {
    jobsRepo.removeAll();
    discoveryQueueRepo.deleteAll();
    settingsRepo.wipe();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobs: crawledJobs }), { status: 200 })));
  });
  it("POST /api/crawl queues inbox items that GET /api/discovery/inbox returns (tracker stays clean)", async () => {
    const res = await POST(post({ category: "all", keyword: "developer", limit: 20 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.offline).toBe(false);
    expect(data.count).toBe(2);

    // Tracker (manual listings) stays clean — crawl only queues.
    expect(jobsRepo.list()).toHaveLength(0);
    expect(discoveryQueueRepo.counts().pending).toBe(2);

    // GET /api/data hydrates tracker jobs (refreshData source) — crawled ids stay out
    const getRes = await GET_DATA();
    expect(getRes.status).toBe(200);
    const payload = await getRes.json();
    expect(Array.isArray(payload.jobs)).toBe(true);
    const trackerIds = (payload.jobs as Array<{ id: string }>).map((j) => j.id);
    expect(trackerIds).not.toContain("task10-c1");
    expect(trackerIds).not.toContain("task10-c2");

    // Inbox route serves the queued candidates instead.
    const inboxRes = await GET_INBOX(new NextRequest("http://localhost/api/discovery/inbox?status=pending"));
    expect(inboxRes.status).toBe(200);
    const inbox = await inboxRes.json();
    const inboxIds = (inbox.jobs as Array<{ id: string }>).map((j) => j.id).sort();
    expect(inboxIds).toEqual(["task10-c1", "task10-c2"]);
  });

  it("refreshData rehydrates: second GET after manual upsert sees the manual job only", async () => {
    // first crawl queues 2 in the inbox; tracker stays empty
    await POST(post({ category: "all", keyword: "developer", limit: 20 }));
    expect(jobsRepo.list().length).toBe(0);
    expect(discoveryQueueRepo.counts().pending).toBe(2);

    // simulate manual add (user-tracked listing, separate from the inbox)
    jobsRepo.upsert({
      id: "task10-c3",
      title: "Manual Add",
      company: "InHouse",
      location: "Remote",
      status: "wishlist",
      jobDescription: "manual",
      autoApplyStatus: "idle",
      autoApplyLogs: [],
      createdDate: "2026-08-29",
    } as never);

    // refreshData = GET /api/data includes only the manual job
    const refreshed = await GET_DATA();
    const jobs = (await refreshed.json()).jobs as Array<{ id: string }>;
    expect(jobs.map((j) => j.id)).toEqual(["task10-c3"]);
  });
});

describe("Task 10 — concurrency defaults to 1 when cloudinarySettings.concurrency is undefined/0", () => {
  let capturedConcurrency: number | null = null;

  beforeEach(() => {
    jobsRepo.removeAll();
    settingsRepo.wipe();
    capturedConcurrency = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (typeof _url === "string" && _url.includes("/crawl")) {
          const body = init?.body ? JSON.parse(String(init.body)) : {};
          capturedConcurrency = body.concurrency;
          return new Response(JSON.stringify({ jobs: crawledJobs, concurrency: body.concurrency }), { status: 200 });
        }
        // for enrichment internal fetch? not needed
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("undefined concurrency -> defaults to 1 (no stored setting)", async () => {
    settingsRepo.wipe(); // no cloudinary_settings row
    capturedConcurrency = null;
    const res = await POST(post({ category: "all", keyword: "developer", limit: 10 })); // no body.concurrency
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.concurrency).toBe(1);
    expect(capturedConcurrency).toBe(1);
  });

  it("concurrency = 0 in cloudinary_settings -> defaults to 1", async () => {
    settingsRepo.set("cloudinary_settings", JSON.stringify({ concurrency: 0 }));
    capturedConcurrency = null;
    const res = await POST(post({ category: "all", keyword: "developer", limit: 10 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.concurrency).toBe(1);
    expect(capturedConcurrency).toBe(1);
  });

  it("concurrency = undefined in cloudinary_settings -> defaults to 1", async () => {
    settingsRepo.set("cloudinary_settings", JSON.stringify({ cloudName: "test", concurrency: undefined }));
    capturedConcurrency = null;
    const res = await POST(post({ category: "all", keyword: "developer", limit: 10 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.concurrency).toBe(1);
    expect(capturedConcurrency).toBe(1);
  });

  it("explicit body concurrency overrides stored fallback", async () => {
    settingsRepo.set("cloudinary_settings", JSON.stringify({ concurrency: 0 }));
    capturedConcurrency = null;
    const res = await POST(post({ category: "all", keyword: "developer", limit: 10, concurrency: 5 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.concurrency).toBe(5);
    expect(capturedConcurrency).toBe(5);
  });

  it("16 is max clamp for concurrency", async () => {
    const res = await POST(post({ category: "all", keyword: "developer", limit: 10, concurrency: 99 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.concurrency).toBe(16); // response may echo min(max) after data.concurrency check; captured should be 16
    expect(capturedConcurrency).toBe(16);
  });
});

describe("Task 10 — source_ids filtering works", () => {
  let capturedSourceIds: unknown = null;

  beforeEach(() => {
    jobsRepo.removeAll();
    settingsRepo.wipe();
    capturedSourceIds = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (typeof url === "string" && String(url).includes("/crawl")) {
          capturedSourceIds = body.source_ids;
          return new Response(JSON.stringify({ jobs: crawledJobs, concurrency: body.concurrency }), { status: 200 });
        }
        // enrichment or other fetch — don't overwrite capturedSourceIds
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("forwards sourceIds -> source_ids to sidecar", async () => {
    const ids = ["weworkremotely", "remoteok"];
    const res = await POST(post({ category: "all", keyword: "dev", limit: 10, sourceIds: ids }));
    expect(res.status).toBe(200);
    expect(capturedSourceIds).toEqual(ids);
    // sidecar received source_ids correctly
  });

  it("filters invalid sourceIds and truncates to 50", async () => {
    const many = [...Array(60)].map((_, i) => `src-${i}`);
    // inject invalid entries
    const mixed = [...many, "", null as unknown as string, 123 as unknown as string];
    const res = await POST(post({ category: "all", keyword: "dev", limit: 10, sourceIds: mixed as unknown as string[] }));
    expect(res.status).toBe(200);
    expect(Array.isArray(capturedSourceIds)).toBe(true);
    expect((capturedSourceIds as string[]).length).toBe(50);
    expect((capturedSourceIds as string[]).every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect((capturedSourceIds as string[])).not.toContain("");
  });

  it("omits source_ids when no array provided (undefined -> sidecar gets undefined)", async () => {
    const res = await POST(post({ category: "all", keyword: "dev", limit: 10 })); // no sourceIds
    expect(res.status).toBe(200);
    expect(capturedSourceIds).toBeUndefined();
  });

  it("empty sourceIds array -> forwards empty array", async () => {
    const res = await POST(post({ category: "all", keyword: "dev", limit: 10, sourceIds: [] }));
    expect(res.status).toBe(200);
    expect(capturedSourceIds).toEqual([]);
  });
});
