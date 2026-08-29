import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "@/app/api/agent/partial-pipeline/route";
import { NextRequest } from "next/server";
import { jobsRepo } from "@/lib/db";
import { testProfile } from "@/agents/__tests__/fixtures";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/agent/partial-pipeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/agent/partial-pipeline", () => {
  beforeEach(() => {
    jobsRepo.upsert({
      id: "pp-job-1",
      title: "Full Stack Engineer",
      company: "Acme",
      location: "Remote",
      status: "applied",
      jobDescription: "Looking for TypeScript, React, and Node.js skills.",
      autoApplyStatus: "idle",
      autoApplyLogs: [],
      createdDate: "2026-08-01",
    });
  });

  it("executes partial pipeline when 'step' alias parameter is provided", async () => {
    const res = await POST(
      post({
        jobId: "pp-job-1",
        profile: testProfile,
        targetRegion: "US",
        step: "companyIntel",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("threadId");
    expect(Array.isArray(body.data.logs)).toBe(true);
  });

  it("executes partial pipeline when 'stopAfter' parameter is provided", async () => {
    const res = await POST(
      post({
        jobId: "pp-job-1",
        profile: testProfile,
        targetRegion: "US",
        stopAfter: "companyIntel",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("threadId");
    expect(Array.isArray(body.data.logs)).toBe(true);
  });

  it("rejects missing fields with 400", async () => {
    const res = await POST(post({ jobId: "pp-job-1", profile: testProfile }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when job does not exist", async () => {
    const res = await POST(
      post({
        jobId: "non-existent-job-xyz",
        profile: testProfile,
        step: "companyIntel",
      })
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when invalid stopAfter node is provided", async () => {
    const res = await POST(
      post({
        jobId: "pp-job-1",
        profile: testProfile,
        step: "bogusNodeName",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Invalid stopAfter node");
  });
});
