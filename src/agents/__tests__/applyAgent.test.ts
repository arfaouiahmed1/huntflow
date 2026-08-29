import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runApplyAgent } from "@/agents/applyAgent";
import { callLLM, resolveChain } from "@/lib/llm/router";
import { testProfile, agentJob, providerWithKey } from "./fixtures";

vi.mock("@/lib/llm/router", () => ({
  callLLM: vi.fn(),
  resolveChain: vi.fn(),
}));

const mockCallLLM = vi.mocked(callLLM);
const mockResolveChain = vi.mocked(resolveChain);

beforeEach(() => {
  mockCallLLM.mockReset();
  mockResolveChain.mockReset();
  mockResolveChain.mockReturnValue([]);
  /* fail fast by default so no test ever hits the network */
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function baseInput(overrides: Partial<Parameters<typeof runApplyAgent>[0]> = {}) {
  return {
    job: { ...agentJob },
    profile: testProfile,
    documents: { tailoredResume: "RESUME", coverLetter: "LETTER" },
    submit: false,
    minMatch: 0,
    llmSettings: null,
    agentUrl: "http://fake-agent.test",
    sharedContext: "",
    ...overrides,
  };
}

describe("runApplyAgent — return contract", () => {
  it("always returns { status, logs, fields, matchScore, decision }", async () => {
    const res = await runApplyAgent(baseInput());
    expect(res).toHaveProperty("status");
    expect(res).toHaveProperty("logs");
    expect(res).toHaveProperty("fields");
    expect(res).toHaveProperty("matchScore");
    expect(res).toHaveProperty("decision");
    expect(["applied", "manual_required", "failed", "skipped"]).toContain(res.status);
    expect(Array.isArray(res.logs)).toBe(true);
    expect(Array.isArray(res.fields)).toBe(true);
    expect(typeof res.decision.proceed).toBe("boolean");
  });

  it("every log entry has { timestamp, message, type }", async () => {
    const res = await runApplyAgent(baseInput());
    for (const log of res.logs) {
      expect(typeof log.timestamp).toBe("string");
      expect(typeof log.message).toBe("string");
      expect(["info", "warning", "success", "error"]).toContain(log.type);
    }
  });
});

describe("runApplyAgent — match score is evidence, not a gate", () => {
  it("continues preparation when a low score is below a legacy minMatch value", async () => {
    const res = await runApplyAgent(
      baseInput({ minMatch: 100, job: { ...agentJob, matchScore: 40 } })
    );
    expect(res.status).not.toBe("skipped");
    expect(res.decision.proceed).toBe(true);
    expect(res.decision.reason).toContain("Score 40%");
    expect(res.logs.some((l) => l.message.includes("Skill analysis"))).toBe(true);
    expect(res.logs.some((l) => l.message.toLowerCase().includes("threshold"))).toBe(false);
  });

  it("computes the match score locally when none is provided", async () => {
    const res = await runApplyAgent(baseInput({ minMatch: 100 }));
    expect(res.matchScore).not.toBeNull();
    expect(typeof res.matchScore).toBe("number");
    expect(res.matchScore).toBeGreaterThanOrEqual(0);
    expect(res.matchScore).toBeLessThanOrEqual(100);
    expect(res.logs.some((l) => l.message.includes("Local fit engine"))).toBe(true);
  });

  it("keeps a high score visible without using it as a decision threshold", async () => {
    const res = await runApplyAgent(baseInput({ minMatch: 0, job: { ...agentJob, matchScore: 88 } }));
    expect(res.status).not.toBe("skipped");
    expect(res.decision.proceed).toBe(true);
    expect(res.decision.reason).toContain("Score 88%");
  });
});

describe("runApplyAgent — profile fit gate (dealbreakers)", () => {
  it("skips when the profile fit is 'skip' even though the score meets the threshold", async () => {
    const sponsorProfile = {
      ...testProfile,
      workPermitStatus: "sponsorship_required" as const,
    };
    const jobWithVisaRequirement = {
      ...agentJob,
      matchScore: 92,
      jobDescription:
        "Must be authorized to work in the US. React, TypeScript and Node.js required. Sponsorship is not available.",
    };
    const res = await runApplyAgent(baseInput({ minMatch: 0, job: jobWithVisaRequirement, profile: sponsorProfile }));
    expect(res.status).toBe("skipped");
    expect(res.decision.proceed).toBe(false);
    expect(res.decision.reason).toContain('Fit is "skip"');
    expect(res.logs.some((l) => l.message.includes("Fit gate"))).toBe(true);
  });
});

describe("runApplyAgent — pitch (prepare node)", () => {
  it("falls back to the profile summary when no provider key exists", async () => {
    mockResolveChain.mockReturnValue([]);
    const res = await runApplyAgent(baseInput());
    expect(mockCallLLM).not.toHaveBeenCalled();
    /* preparation succeeded; the unavailable browser is still reported truthfully */
    expect(res.status).toBe("failed");
    expect(res.logs.some((l) => l.message.includes("No fields were filled"))).toBe(true);
  });

  it("uses the LLM pitch when a provider key exists", async () => {
    mockResolveChain.mockReturnValue([providerWithKey()]);
    mockCallLLM.mockResolvedValue({ text: "Three-sentence tailored pitch.", providerId: "openrouter", model: "x", attempts: 0 });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "applied", fields: ["email", "phone"], logs: [] }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await runApplyAgent(baseInput({ submit: true }));
    expect(res.status).toBe("applied");
    expect(res.logs.some((l) => l.message.includes("AI crafted a tailored pitch"))).toBe(true);

    /* the pitch must be injected into the outgoing application payload */
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toContain("/apply");
    const payload = JSON.parse(init.body);
    expect(payload.profile.documents.pitch).toBe("Three-sentence tailored pitch.");
    expect(payload.documents.tailoredResume).toBe("RESUME");
  });

  it("falls back to the summary when the LLM call fails", async () => {
    mockResolveChain.mockReturnValue([providerWithKey()]);
    mockCallLLM.mockRejectedValue(new Error("provider down"));
    const res = await runApplyAgent(baseInput());
    expect(res.status).toBe("failed");
    expect(res.logs.some((l) => l.message.includes("LLM pitch failed"))).toBe(true);
  });
});

describe("runApplyAgent — execution (execute node)", () => {
  it("requires a URL and reports a failed browser run without one", async () => {
    const res = await runApplyAgent(baseInput({ job: { ...agentJob, url: undefined } }));
    expect(res.status).toBe("failed");
    expect(res.logs.some((l) => l.message.includes("No application URL"))).toBe(true);
  });

  it("reports failed in prefill mode when the agent is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const res = await runApplyAgent(baseInput({ submit: false }));
    expect(res.status).toBe("failed");
    expect(res.fields).toEqual([]);
    expect(res.logs.some((l) => l.message.includes("unreachable"))).toBe(true);
    expect(res.logs.some((l) => l.message.includes("No fields were filled"))).toBe(true);
  });

  it("does not simulate success when submit=true and the agent is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const res = await runApplyAgent(baseInput({ submit: true }));
    expect(res.status).toBe("failed");
    expect(res.logs.some((l) => l.type === "error" && l.message.includes("Submission was not attempted"))).toBe(true);
  });

  it("uses the scrapling agent's verdict when it responds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "manual_required",
          fields: ["full_name", "linkedin"],
          logs: [{ timestamp: "10:00:00", message: "found captcha", type: "info" }],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await runApplyAgent(baseInput({ submit: true }));
    expect(res.status).toBe("manual_required");
    expect(res.fields).toEqual(["full_name", "linkedin"]);
    expect(res.logs.some((l) => l.message.includes("found captcha"))).toBe(true);
    expect(res.logs.some((l) => l.message.includes("Scrapling agent executed"))).toBe(true);
  });

  it("fails safely when the agent answers with HTTP 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    const res = await runApplyAgent(baseInput({ submit: true }));
    expect(res.status).toBe("failed");
    expect(res.logs.some((l) => l.message.includes("unreachable"))).toBe(true);
  });
});
