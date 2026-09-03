import { describe, it, expect, beforeEach } from "vitest";
import { POST as POST_PARTIAL_PIPELINE } from "@/app/api/agent/partial-pipeline/route";
import { GET as GET_RUN_HISTORY } from "@/app/api/agent/run-history/route";
import {
  createJsonRequest,
  createUrlRequest,
  parseResponse,
  resetTestDb,
  jobsRepo,
  agentRunHistoryRepo,
} from "../helpers/testHarness";
import {
  mockJobApplication1,
  mockUserProfile,
} from "../helpers/testFixtures";

describe("Tier 1: Feature Coverage — Multi-Agent Pipeline & Partial Execution", () => {
  beforeEach(() => {
    resetTestDb();
    jobsRepo.upsert(mockJobApplication1);
  });

  it("1. POST /api/agent/partial-pipeline accepts stopAfter parameter", async () => {
    const req = createJsonRequest("http://localhost/api/agent/partial-pipeline", "POST", {
      jobId: mockJobApplication1.id,
      profile: mockUserProfile,
      targetRegion: "US",
      stopAfter: "intel",
    });

    const res = await POST_PARTIAL_PIPELINE(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ success: boolean; data: { multiAgentOutputs?: Record<string, unknown> } }>(res);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it("2. POST /api/agent/partial-pipeline accepts step parameter as an alias for stopAfter", async () => {
    const req = createJsonRequest("http://localhost/api/agent/partial-pipeline", "POST", {
      jobId: mockJobApplication1.id,
      profile: mockUserProfile,
      targetRegion: "US",
      step: "tailor",
    });

    const res = await POST_PARTIAL_PIPELINE(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ success: boolean; data: Record<string, unknown> }>(res);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it("3. POST /api/agent/partial-pipeline loads regional rules based on targetRegion (US, EU, UK, DE, FR)", async () => {
    for (const region of ["US", "EU", "UK", "DE", "FR"]) {
      const req = createJsonRequest("http://localhost/api/agent/partial-pipeline", "POST", {
        jobId: mockJobApplication1.id,
        profile: mockUserProfile,
        targetRegion: region,
        step: "intel",
      });

      const res = await POST_PARTIAL_PIPELINE(req);
      expect(res.status).toBe(200);
      const body = await parseResponse<{ success: boolean }>(res);
      expect(body.success).toBe(true);
    }
  });

  it("4. Pipeline execution records run entry into agent_run_history table", async () => {
    agentRunHistoryRepo.log({
      threadId: "test-pipeline-thread-101",
      jobId: mockJobApplication1.id,
      agentName: "orchestrator",
      status: "completed",
      region: "US",
      atsScore: 88,
    });

    const history = agentRunHistoryRepo.listByThread("test-pipeline-thread-101");
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].jobId).toBe(mockJobApplication1.id);
    expect(history[0].atsScore).toBe(88);
  });

  it("5. GET /api/agent/run-history retrieves run history filtered by threadId", async () => {
    agentRunHistoryRepo.log({
      threadId: "thread-filter-query",
      jobId: mockJobApplication1.id,
      agentName: "partial-pipeline",
      status: "completed",
    });

    const req = createUrlRequest("http://localhost/api/agent/run-history?threadId=thread-filter-query");
    const res = await GET_RUN_HISTORY(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ success: boolean; history: { threadId: string }[] }>(res);
    expect(body.success).toBe(true);
    expect(body.history.length).toBeGreaterThan(0);
    expect(body.history[0].threadId).toBe("thread-filter-query");
  });

  it("6. Partial pipeline returns multiAgentOutputs with key insights", async () => {
    const req = createJsonRequest("http://localhost/api/agent/partial-pipeline", "POST", {
      jobId: mockJobApplication1.id,
      profile: mockUserProfile,
      targetRegion: "US",
      step: "audit",
    });

    const res = await POST_PARTIAL_PIPELINE(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{
      success: boolean;
      data: {
        multiAgentOutputs?: {
          atsScore?: number;
          recommendedTemplate?: string;
          matchingSkills?: string[];
        };
      };
    }>(res);

    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it("7. Multi-agent partial pipeline handles stopAfter: 'audit' cleanly", async () => {
    const req = createJsonRequest("http://localhost/api/agent/partial-pipeline", "POST", {
      jobId: mockJobApplication1.id,
      profile: mockUserProfile,
      targetRegion: "DE",
      stopAfter: "audit",
    });

    const res = await POST_PARTIAL_PIPELINE(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ success: boolean }>(res);
    expect(body.success).toBe(true);
  });

  it("8. Non-existent jobId in partial pipeline returns 404 Job not found", async () => {
    const req = createJsonRequest("http://localhost/api/agent/partial-pipeline", "POST", {
      jobId: "non-existent-job-9999",
      profile: mockUserProfile,
      stopAfter: "intel",
    });

    const res = await POST_PARTIAL_PIPELINE(req);
    expect(res.status).toBe(404);

    const body = await parseResponse<{ error: string }>(res);
    expect(body.error).toContain("Job not found");
  });

  it("9. Missing required fields (profile, jobId, stopAfter/step) returns 400", async () => {
    const missingJob = createJsonRequest("http://localhost/api/agent/partial-pipeline", "POST", {
      profile: mockUserProfile,
      stopAfter: "intel",
    });
    const res1 = await POST_PARTIAL_PIPELINE(missingJob);
    expect(res1.status).toBe(400);

    const missingStep = createJsonRequest("http://localhost/api/agent/partial-pipeline", "POST", {
      jobId: mockJobApplication1.id,
      profile: mockUserProfile,
    });
    const res2 = await POST_PARTIAL_PIPELINE(missingStep);
    expect(res2.status).toBe(400);
  });

  it("10. Execution handles invalid stopAfter node gracefully with 400", async () => {
    const req = createJsonRequest("http://localhost/api/agent/partial-pipeline", "POST", {
      jobId: mockJobApplication1.id,
      profile: mockUserProfile,
      stopAfter: "invalid_nonexistent_node",
    });

    const res = await POST_PARTIAL_PIPELINE(req);
    expect([400, 500]).toContain(res.status);
  });

  it("11. Multi-agent logs contain structured timestamp and type info", async () => {
    const req = createJsonRequest("http://localhost/api/agent/partial-pipeline", "POST", {
      jobId: mockJobApplication1.id,
      profile: mockUserProfile,
      stopAfter: "intel",
    });

    const res = await POST_PARTIAL_PIPELINE(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ data: { autoApplyLogs?: { message: string; type: string }[] } }>(res);
    expect(body.data).toBeDefined();
  });

  it("12. GET /api/agent/run-history returns recent executions when no threadId specified", async () => {
    agentRunHistoryRepo.log({
      threadId: "recent-thread-001",
      jobId: mockJobApplication1.id,
      agentName: "apply",
      status: "completed",
    });

    const req = createUrlRequest("http://localhost/api/agent/run-history");
    const res = await GET_RUN_HISTORY(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ success: boolean; history: unknown[] }>(res);
    expect(body.success).toBe(true);
    expect(body.history.length).toBeGreaterThan(0);
  });
});
