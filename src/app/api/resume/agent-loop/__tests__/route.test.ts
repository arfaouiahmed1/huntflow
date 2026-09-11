import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import { runResumeAgentLoop } from "@/agents/resumeAgent";

vi.mock("@/agents/resumeAgent", () => ({
  runResumeAgentLoop: vi.fn(),
}));

const mockRunResumeAgentLoop = vi.mocked(runResumeAgentLoop);

function makeRequest(method: "GET" | "POST", body?: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/resume/agent-loop", {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  mockRunResumeAgentLoop.mockReset();
});

describe("API /api/resume/agent-loop", () => {
  it("GET returns helpful instruction SSE frame", async () => {
    const res = await GET();
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text).toContain("Use POST with {profile, templateId} or {initialTex}");
  });

  it("POST without profile or initialTex returns 400 SSE frame", async () => {
    const req = makeRequest("POST", { kind: "resume" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("profile or initialTex is required");
  });

  it("POST with oversized initialTex returns 413 SSE frame", async () => {
    const hugeTex = "a".repeat(200_001);
    const req = makeRequest("POST", { initialTex: hugeTex });
    const res = await POST(req);
    expect(res.status).toBe(413);
    const text = await res.text();
    expect(text).toContain("Document too large");
  });

  it("POST with valid initialTex streams SSE events and completes with done frame", async () => {
    mockRunResumeAgentLoop.mockImplementation(async (input, onEvent) => {
      onEvent?.({
        type: "latex_log",
        attempt: 0,
        logTail: "Output written on doc.pdf",
        parsedErrors: [],
      });
      onEvent?.({
        type: "ats_score",
        ats: { score: 95, checks: [], keywords: [], estimatedPages: 1 },
      });
      return {
        tex: input.initialTex || "",
        token: "loop-token-789",
        logTail: "Output written on doc.pdf",
        attempts: 1,
        approved: true,
      };
    });

    const req = makeRequest("POST", {
      initialTex: "\\documentclass{article}\\begin{document}Hello\\end{document}",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const text = await res.text();
    expect(text).toContain("event: connected");
    expect(text).toContain("event: latex_log");
    expect(text).toContain("event: ats_score");
    expect(text).toContain("event: done");
    expect(text).toContain("loop-token-789");
  });
});
