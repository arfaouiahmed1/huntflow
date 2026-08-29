import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "@/app/api/crawl/route";
import { GET as GET_DATA } from "@/app/api/data/route";
import { GET as GET_JOBS_COLLECTION } from "@/app/api/data/[collection]/route";
import { jobsRepo, settingsRepo } from "@/lib/db";
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

describe("Task 10 — persisted jobs are queryable via GET /api/data (jobs)", () => {
  beforeEach(() => {
    jobsRepo.removeAll();
    settingsRepo.wipe();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobs: crawledJobs }), { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("POST /api/crawl persists wishlist stubs that GET /api/data returns", async () => {
    const res = await POST(post({ category: "all", keyword: "developer", limit: 20 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.offline).toBe(false);
    expect(data.count).toBe(2);

    // Direct DB check
    const listed = jobsRepo.list();
    expect(listed.map((j) => j.id).sort()).toEqual(["task10-c1", "task10-c2"]);

    // GET /api/data hydrates the same jobs (refreshData source)
    const getRes = await GET_DATA();
    expect(getRes.status).toBe(200);
    const payload = await getRes.json();
    expect(Array.isArray(payload.jobs)).toBe(true);
    const ids = (payload.jobs as Array<{ id: string }>).map((j) => j.id);
    expect(ids).toEqual(expect.arrayContaining(["task10-c1", "task10-c2"]));
    // also via collection route GET /api/data/jobs
    const colRes = await GET_JOBS_COLLECTION(new NextRequest("http://localhost/api/data/jobs"), { params: Promise.resolve({ collection: "jobs" }) });
    expect(colRes.status).toBe(200);
    const colData = await colRes.json();
    const colIds = (colData.jobs as Array<{ id: string }>).map((j) => j.id);
    expect(colIds).toEqual(expect.arrayContaining(["task10-c1", "task10-c2"]));
  });

  it("refreshData rehydrates: second GET after external upsert sees new job", async () => {
    // first crawl persists 2
    await POST(post({ category: "all", keyword: "developer", limit: 20 }));
    expect(jobsRepo.list().length).toBe(2);

    // simulate external persistence (another crawl or manual add)
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

    // refreshData = GET /api/data should now include 3
    const refreshed = await GET_DATA();
    const jobs = (await refreshed.json()).jobs as Array<{ id: string }>;
    expect(jobs.map((j) => j.id)).toEqual(expect.arrayContaining(["task10-c1", "task10-c2", "task10-c3"]));
    expect(jobs.length).toBe(3);
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
