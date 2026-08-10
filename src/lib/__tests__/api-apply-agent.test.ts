import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/apply-agent/route";
import { callLLM, resolveChain } from "@/lib/llm/router";
import { NextRequest } from "next/server";
import { memoryRepo, agentStateRepo } from "@/lib/db";
import { testProfile, providerWithKey } from "@/agents/__tests__/fixtures";

vi.mock("@/lib/llm/router", () => ({
  callLLM: vi.fn(),
  resolveChain: vi.fn(),
}));

const mockCallLLM = vi.mocked(callLLM);
const mockResolveChain = vi.mocked(resolveChain);

function post(body: unknown) {
  return new NextRequest("http://localhost/api/apply-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const payload = {
  job: {
    id: "api-agent-job-1",
    title: "Frontend Engineer",
    company: "Acme",
    url: "https://careers.acme.io/frontend",
    jobDescription: "React and TypeScript role. Node.js, GraphQL, AWS and Tailwind CSS experience preferred.",
    matchScore: 85,
  },
  profile: testProfile,
  submit: false,
  minMatch: 0,
};

describe("POST /api/apply-agent — validation", () => {
  it("rejects a missing job with 400", async () => {
    const res = await POST(post({ profile: testProfile }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Job and profile");
  });

  it("rejects a missing profile with 400", async () => {
    const res = await POST(post({ job: payload.job }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/apply-agent — response contract", () => {
  beforeEach(() => {
    mockCallLLM.mockReset();
    mockResolveChain.mockReset();
    mockResolveChain.mockReturnValue([]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns { ok, status, logs, fields, matchScore, decision }", async () => {
    const res = await POST(post(payload));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(["applied", "manual_required", "failed", "skipped"]).toContain(data.status);
    expect(Array.isArray(data.logs)).toBe(true);
    expect(Array.isArray(data.fields)).toBe(true);
    expect(data.matchScore).toBe(85);
    expect(data.decision.proceed).toBe(true);
  });

  it("skips when the threshold is unmet and records it in agent state + memory", async () => {
    const res = await POST(post({ ...payload, minMatch: 90 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("skipped");
    expect(data.decision.reason).toContain("below threshold");

    const state = agentStateRepo.get("apply-agent", "last_run");
    expect(state).not.toBeNull();
    const parsed = JSON.parse(state as string);
    expect(parsed.status).toBe("skipped");
    expect(parsed.jobId).toBe("api-agent-job-1");

    const outcome = memoryRepo.list().find((m) => m.kind === "outcome" && m.content.includes("Apply agent skipped"));
    expect(outcome).toBeTruthy();
  });

  it("returns manual_required in prefill mode", async () => {
    const res = await POST(post(payload));
    const data = await res.json();
    expect(data.status).toBe("manual_required");
    expect(data.fields.length).toBeGreaterThan(0);
  });

  it("reports applied when submit=true and the agent simulates success", async () => {
    const res = await POST(post({ ...payload, submit: true }));
    const data = await res.json();
    expect(data.status).toBe("applied");
    expect(data.logs.some((l: { message: string }) => l.message.includes("Simulated application submitted"))).toBe(true);
    expect(data.decision.proceed).toBe(true);
  });

  it("uses the configured LLM pitch when a provider key is present", async () => {
    mockResolveChain.mockReturnValue([providerWithKey()]);
    mockCallLLM.mockResolvedValue({ text: "Pitch from LLM.", providerId: "openrouter", model: "x", attempts: 0 });
    const res = await POST(post({ ...payload, submit: true }));
    const data = await res.json();
    expect(data.logs.some((l: { message: string }) => l.message.includes("AI crafted a tailored pitch"))).toBe(true);
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
  });

  it("builds shared context from the current pipeline into the agent", async () => {
    await POST(post(payload));
    /* sharedContext is passed into runApplyAgent which uses it in prepare only when LLM is available */
    mockResolveChain.mockReturnValue([providerWithKey()]);
    mockCallLLM.mockResolvedValue({ text: "p", providerId: "openrouter", model: "x", attempts: 0 });
    await POST(post({ ...payload, submit: true }));
    const callArgs = mockCallLLM.mock.calls[0][0] as { user: string };
    expect(callArgs.user).toContain("USER PROFILE");
  });
});

describe("POST /api/apply-agent — garbage agent verdicts are cleaned", () => {
  beforeEach(() => {
    mockResolveChain.mockReset();
    mockResolveChain.mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clamps an unknown status, drops non-string fields and invalid logs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "destroyed_everything",
            fields: ["full_name", 42, ""],
            logs: [
              { timestamp: "10:00:00", message: "real log", type: "info" },
              { message: 42 },
              { message: "bad type", type: "exploded" },
            ],
          }),
          { status: 200 }
        )
      )
    );
    const res = await POST(post({ ...payload, submit: true }));
    const data = await res.json();
    expect(data.status).toBe("manual_required");
    expect(data.fields).toEqual(["full_name"]);
    expect(data.logs.some((l: { message: string }) => l.message === "real log")).toBe(true);
    expect(data.logs.some((l: { message: string }) => l.message === "bad type")).toBe(true);
    expect(data.logs.every((l: { type: string }) => ["info", "success", "warning", "error"].includes(l.type))).toBe(true);
  });
});
