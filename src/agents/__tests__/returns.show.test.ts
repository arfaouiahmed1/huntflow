import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runApplyAgent } from "@/agents/applyAgent";
import { runAssistant } from "@/agents/orchestrator";
import { callLLM, resolveChain } from "@/lib/llm/router";
import { generateJSON, generateText } from "@/lib/llm/client";
import { testProfile, agentJob, providerWithKey } from "./fixtures";

/* Run:  npx vitest run src/agents/__tests__/returns.show.test.ts --reporter=verbose
   Prints exactly what each agent returns for a set of representative turns. */

vi.mock("@/lib/llm/router", () => ({
  callLLM: vi.fn(),
  resolveChain: vi.fn(),
}));

vi.mock("@/lib/llm/client", () => ({
  generateJSON: vi.fn(),
  generateText: vi.fn(),
}));

const mockJSON = vi.mocked(generateJSON);
const mockText = vi.mocked(generateText);

beforeEach(() => {
  mockJSON.mockReset();
  mockText.mockReset();
  vi.mocked(resolveChain).mockReset();
  vi.mocked(callLLM).mockReset();
  vi.mocked(resolveChain).mockReturnValue([]);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("live agent returns", () => {
  it("ASSISTANT — direct answer (no tools)", async () => {
    mockJSON.mockResolvedValue({ action: "answer", message: "You have 4 open roles across 2 companies." });
    const out = await runAssistant({ message: "how many open roles do I have?", profile: testProfile });
    console.log("ASSISTANT (direct answer):\n" + JSON.stringify(out, null, 2) + "\n");
    expect(out.llm).toBe(true);
    expect(out.usedTools).toEqual([]);
  });

  it("ASSISTANT — tool turn (pipeline_summary then answer)", async () => {
    mockJSON
      .mockResolvedValueOnce({ action: "tool", tool: "pipeline_summary", args: {}, note: "state snapshot" })
      .mockResolvedValueOnce({ action: "answer", message: "3 open roles, 1 interview coming up." });
    const out = await runAssistant({ message: "what's my pipeline?", profile: testProfile });
    console.log("ASSISTANT (tool turn):\n" + JSON.stringify(out, null, 2) + "\n");
    expect(out.usedTools).toEqual(["pipeline_summary"]);
  });

  it("ASSISTANT — heuristic fallback (no provider configured)", async () => {
    mockJSON.mockRejectedValue(new Error("CHAIN_EXHAUSTED"));
    const out = await runAssistant({ message: "how many applications do I have?", profile: testProfile });
    console.log("ASSISTANT (no-provider heuristic):\n" + JSON.stringify(out, null, 2) + "\n");
    expect(out.usedTools).toEqual(["pipeline_summary"]);
    expect(out.llm).toBe(false);
  });

  it("ASSISTANT — remembers a fact via the remember tool", async () => {
    mockJSON
      .mockResolvedValueOnce({ action: "tool", tool: "remember", args: { content: "I prefer remote roles" }, note: "store" })
      .mockResolvedValueOnce({ action: "answer", message: "Noted." });
    const out = await runAssistant({ message: "remember I prefer remote roles", profile: testProfile });
    console.log("ASSISTANT (remember turn):\n" + JSON.stringify(out, null, 2) + "\n");
    expect(out.usedTools).toEqual(["remember"]);
  });

  it("APPLY AGENT — prepares a low-score role without a match gate", async () => {
    const out = await runApplyAgent({
      job: { ...agentJob, matchScore: 40 },
      profile: testProfile,
      submit: false,
      minMatch: 70,
      llmSettings: null,
      agentUrl: "http://fake-agent.test",
    });
    console.log("APPLY AGENT (low-score preparation):\n" + JSON.stringify(out, null, 2) + "\n");
    expect(out.status).toBe("failed");
    expect(out.decision.proceed).toBe(true);
  });

  it("APPLY AGENT — fails safely when submit mode cannot reach the browser", async () => {
    vi.mocked(resolveChain).mockReturnValue([providerWithKey()]);
    vi.mocked(callLLM).mockResolvedValue({ text: "Three-sentence pitch tailored to the role.", providerId: "openrouter", model: "google/gemini-2.5-flash", attempts: 0 });
    const out = await runApplyAgent({
      job: { ...agentJob, matchScore: 88 },
      profile: testProfile,
      documents: { tailoredResume: "RESUME…", coverLetter: "LETTER…" },
      submit: true,
      minMatch: 0,
      llmSettings: null,
      agentUrl: "http://fake-agent.test",
    });
    console.log("APPLY AGENT (offline submit):\n" + JSON.stringify(out, null, 2) + "\n");
    expect(out.status).toBe("failed");
  });

  it("APPLY AGENT — fails safely when prefill cannot reach the browser", async () => {
    const out = await runApplyAgent({
      job: { ...agentJob, matchScore: 88 },
      profile: testProfile,
      submit: false,
      minMatch: 0,
      llmSettings: null,
      agentUrl: "http://fake-agent.test",
    });
    console.log("APPLY AGENT (offline prefill):\n" + JSON.stringify(out, null, 2) + "\n");
    expect(out.status).toBe("failed");
  });
});
