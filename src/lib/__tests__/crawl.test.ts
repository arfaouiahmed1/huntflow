import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST, dedupKey } from "@/app/api/crawl/route";
import { jobsRepo, settingsRepo } from "@/lib/db";
import { NextRequest } from "next/server";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/crawl", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeTracked(id: string, overrides: Record<string, unknown> = {}) {
  jobsRepo.upsert({
    id,
    title: "Tracked Role",
    company: "TrackCo",
    location: "Remote",
    status: "wishlist",
    jobDescription: "desc",
    autoApplyStatus: "idle",
    autoApplyLogs: [],
    createdDate: "2026-08-01",
    ...overrides,
  } as never);
}

const crawledJobs = [
  {
    id: "c1",
    title: "Senior React Engineer",
    company: "Acme",
    location: "Remote",
    url: "https://acme.io/jobs/1",
    jobDescription: "React, TypeScript, Node.js, GraphQL and AWS role for a senior full-stack engineer.",
  },
  {
    id: "c2",
    title: "Frontend Engineer",
    company: "Globex",
    location: "Remote",
    url: "https://globex.io/jobs/2",
    jobDescription: "React and TypeScript experience required. Tailwind CSS and Docker are a plus.",
  },
];

describe("POST /api/crawl — offline sidecar", () => {
  beforeEach(() => {
    jobsRepo.removeAll();
    settingsRepo.wipe();
    makeTracked("seed-1");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports offline with zero jobs and writes nothing to the DB", async () => {
    const res = await POST(post({ category: "all", keyword: "developer", limit: 10 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ success: true, count: 0, jobs: [], offline: true });

    const jobs = jobsRepo.list();
    expect(jobs.length).toBe(1); // only the pre-seeded row survived
    expect(jobs[0].id).toBe("seed-1");
  });
});

describe("POST /api/crawl — online sidecar", () => {
  beforeEach(() => {
    jobsRepo.removeAll();
    settingsRepo.wipe();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobs: crawledJobs }), { status: 200 }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scores every crawled job without persisting it", async () => {
    const res = await POST(post({ category: "all", keyword: "developer", limit: 20 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.offline).toBe(false);
    expect(data.count).toBe(2);
    expect(data.jobs).toHaveLength(2);

    for (const job of data.jobs) {
      expect(typeof job.matchScore).toBe("number");
      expect(job.matchScore).toBeGreaterThanOrEqual(0);
      expect(job.matchScore).toBeLessThanOrEqual(100);
      expect(["direct_fit", "tailored_fit"]).toContain(job.fitCategory);
      expect(Array.isArray(job.skillsGap?.matchingSkills)).toBe(true);
      expect(job.status).toBe("wishlist");
      expect(job.jobDescription).toBeTruthy();
    }

    // Pure discovery: nothing landed in the tracker.
    expect(jobsRepo.list().length).toBe(0);
  });

  it("sorts by match score descending", async () => {
    const res = await POST(post({ category: "all", keyword: "developer", limit: 20 }));
    const data = await res.json();
    const scores = data.jobs.map((j: { matchScore: number }) => j.matchScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("drops jobs already tracked in the DB", async () => {
    makeTracked("seed-dup", {
      title: "Senior React Engineer",
      company: "Acme",
      url: "https://acme.io/jobs/1",
    });
    const res = await POST(post({ category: "all", keyword: "developer", limit: 20 }));
    const data = await res.json();
    expect(data.count).toBe(1);
    expect(data.jobs[0].url).toBe("https://globex.io/jobs/2");
  });

  it("drops jobs already decided on in crawl_decisions", async () => {
    settingsRepo.set(
      "crawl_decisions",
      JSON.stringify({ "https://acme.io/jobs/1": "skipped" })
    );
    const res = await POST(post({ category: "all", keyword: "developer", limit: 20 }));
    const data = await res.json();
    expect(data.count).toBe(1);
    expect(data.jobs[0].url).toBe("https://globex.io/jobs/2");
  });

  it("dedups within a single batch", async () => {
    const batch = [
      ...crawledJobs,
      { ...crawledJobs[0], id: "c1-dup" }, // same url, different id
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobs: batch }), { status: 200 }))
    );
    const res = await POST(post({ category: "all", keyword: "developer", limit: 20 }));
    const data = await res.json();
    expect(data.count).toBe(2);
  });
});

describe("dedupKey", () => {
  it("prefers a normalized url", () => {
    expect(dedupKey({ url: "HTTPS://Acme.io/Jobs/1  " })).toBe("https://acme.io/jobs/1");
    expect(dedupKey({ url: "https://acme.io/jobs/1", title: "A", company: "B" })).toBe(
      dedupKey({ url: "https://acme.io/jobs/1", title: "Z", company: "Y" })
    );
  });

  it("falls back to normalized title + company when no url", () => {
    expect(dedupKey({ title: "Senior React Engineer", company: "Acme" })).toBe(
      dedupKey({ title: " senior react engineer ", company: "ACME" })
    );
    expect(dedupKey({ title: "Senior React Engineer", company: "Acme" })).not.toBe(
      dedupKey({ title: "Senior React Engineer", company: "Globex" })
    );
  });

  it("treats a missing url differently from a missing title", () => {
    expect(dedupKey({ title: "Role", company: "Co" })).not.toBe(dedupKey({ url: "" }));
  });
});
