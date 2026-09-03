import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST as crawlPost } from "@/app/api/crawl/route";
import { POST as discoverPost } from "@/app/api/crawl/sources/discover/route";
import { jobsRepo } from "@/lib/db";
import { NextRequest } from "next/server";

describe("Unified Crawler API & ATS Discovery Engine", () => {
  beforeEach(() => {
    // Clear mock jobs
    const jobs = jobsRepo.list();
    for (const j of jobs) {
      if (j.id.startsWith("ats_") || j.id.startsWith("gh_")) jobsRepo.remove(j.id);
    }
  });

  it("handles ATS direct crawl request and persists structured jobs via unified /api/crawl", async () => {
    const sampleJobs = [
      {
        id: "gh_stripe_101",
        title: "Staff Infrastructure Engineer",
        company: "Stripe",
        location: "Remote, US",
        salary: "$190,000 - $240,000",
        url: "https://boards.greenhouse.io/stripe/jobs/101",
        jobDescription: "Build scalable global payment infrastructure with Go and Kubernetes.",
        source: "Greenhouse (Stripe)",
        atsType: "greenhouse",
      },
      {
        id: "gh_stripe_102",
        title: "Product Engineer, Connect",
        company: "Stripe",
        location: "San Francisco, CA",
        salary: "$170,000 - $210,000",
        url: "https://boards.greenhouse.io/stripe/jobs/102",
        jobDescription: "Build frontend React experiences for Stripe Connect.",
        source: "Greenhouse (Stripe)",
        atsType: "greenhouse",
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        count: sampleJobs.length,
        jobs: sampleJobs,
        run_id: "run_test_123",
        boards_crawled: 1,
      }),
    });
    global.fetch = mockFetch;

    const req = new NextRequest("http://localhost:3000/api/crawl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: "ats",
        targetBoards: [{ provider: "greenhouse", token: "stripe", companyName: "Stripe" }],
        limit: 10,
      }),
    });

    const res = await crawlPost(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBe(2);
    expect(data.runId).toBeDefined();

    // Verify jobs saved in SQLite
    const stripeJob = jobsRepo.get("gh_stripe_101");
    expect(stripeJob).toBeDefined();
    expect(stripeJob?.company).toBe("Stripe");
    expect(stripeJob?.title).toContain("Staff");
  });

  it("handles ATS board discovery query correctly via /api/crawl/sources/discover", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        provider: "greenhouse",
        boardToken: "anthropic",
        activeJobsCount: 42,
        sampleJobs: [
          { title: "Research Engineer", company: "Anthropic", location: "San Francisco, CA" },
        ],
      }),
    });
    global.fetch = mockFetch;

    const req = new NextRequest("http://localhost:3000/api/crawl/sources/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Anthropic" }),
    });

    const res = await discoverPost(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.provider).toBe("greenhouse");
    expect(data.boardToken).toBe("anthropic");
    expect(data.activeJobsCount).toBe(42);
  });
});
