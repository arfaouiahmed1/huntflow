import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAssistant } from "@/agents/orchestrator";
import { generateJSON, generateText } from "@/lib/llm/client";
import { jobsRepo, memoryRepo } from "@/lib/db";
import { testProfile, makeJob } from "./fixtures";

vi.mock("@/lib/llm/client", () => ({
  generateJSON: vi.fn(),
  generateText: vi.fn(),
}));

const mockGenerateJSON = vi.mocked(generateJSON);
const mockGenerateText = vi.mocked(generateText);

const profile = testProfile;

function answer(message: string) {
  return { action: "answer", message };
}

function tool(tool: string, args: Record<string, string> = {}, message?: string) {
  return { action: "tool", tool, args, message };
}

describe("runAssistant — return contract", () => {
  beforeEach(() => {
    mockGenerateJSON.mockReset();
    mockGenerateText.mockReset();
  });

  it("always returns { reply, steps, usedTools, llm }", async () => {
    mockGenerateJSON.mockResolvedValue(answer("Hi!"));
    const res = await runAssistant({ message: "hello", profile });
    expect(res).toHaveProperty("reply");
    expect(res).toHaveProperty("steps");
    expect(res).toHaveProperty("usedTools");
    expect(res).toHaveProperty("llm");
    expect(Array.isArray(res.steps)).toBe(true);
    expect(Array.isArray(res.usedTools)).toBe(true);
    expect(typeof res.llm).toBe("boolean");
    expect(res.reply.length).toBeGreaterThan(0);
  });

  it("answers directly when the model says no tool is needed", async () => {
    mockGenerateJSON.mockResolvedValue(answer("You're at 5 tracked applications."));
    const res = await runAssistant({ message: "how many apps do I have", profile });
    expect(res.reply).toBe("You're at 5 tracked applications.");
    expect(res.usedTools).toEqual([]);
    expect(res.llm).toBe(true);
  });

  it("passes the message, profile context and history into the model", async () => {
    mockGenerateJSON.mockResolvedValue(answer("ok"));
    await runAssistant({
      message: "find me react jobs",
      history: [{ role: "user", content: "earlier question" }],
      profile,
    });
    const [settings, system, user] = mockGenerateJSON.mock.calls[0] as unknown as [
      unknown,
      string,
      string
    ];
    expect(settings).toBeUndefined();
    expect(system).toContain("pipeline_summary");
    expect(system).toContain("USER PROFILE");
    expect(user).toContain("find me react jobs");
    expect(user).toContain("earlier question");
  });
});

describe("runAssistant — tool flows", () => {
  beforeEach(() => {
    mockGenerateJSON.mockReset();
    mockGenerateText.mockReset();
  });

  it("runs pipeline_summary and reports the tools it used", async () => {
    mockGenerateJSON
      .mockResolvedValueOnce(tool("pipeline_summary", {}, "state snapshot"))
      .mockResolvedValueOnce(answer("You have 3 open roles."));
    const res = await runAssistant({ message: "what's my pipeline", profile });
    expect(res.usedTools).toEqual(["pipeline_summary"]);
    expect(res.steps.some((s) => s.kind === "tool" && s.label === "pipeline_summary")).toBe(true);
    expect(res.reply).toBe("You have 3 open roles.");
    expect(res.llm).toBe(true);
    /* the shared context is passed to the model as part of the system prompt */
    expect(mockGenerateJSON.mock.calls[0][1]).toContain("PIPELINE STATUS");
  });

  it("search_jobs returns matching tracked jobs", async () => {
    jobsRepo.upsert(makeJob("oj1", { title: "Frontend Engineer", company: "Acme" }));
    mockGenerateJSON
      .mockResolvedValueOnce(tool("search_jobs", { query: "acme" }))
      .mockResolvedValueOnce(answer("Found it."));
    const res = await runAssistant({ message: "find acme jobs", profile });
    expect(res.usedTools).toEqual(["search_jobs"]);
    expect(res.reply).toBe("Found it.");
  });

  it("search_vault reports no passages when the vault is empty", async () => {
    mockGenerateJSON
      .mockResolvedValueOnce(tool("search_vault", { query: "resume" }))
      .mockResolvedValueOnce(answer("Your vault is empty."));
    const res = await runAssistant({ message: "look in my documents", profile });
    expect(res.usedTools).toEqual(["search_vault"]);
    expect(res.reply).toBe("Your vault is empty.");
  });

  it("remember stores a persistent memory entry", async () => {
    mockGenerateJSON
      .mockResolvedValueOnce(tool("remember", { content: "I prefer remote roles under 30h" }))
      .mockResolvedValueOnce(answer("Got it, stored."));
    const res = await runAssistant({ message: "remember this for me", profile });
    expect(res.usedTools).toEqual(["remember"]);
    expect(res.reply).toBe("Got it, stored.");
    const stored = memoryRepo.list().find((m) => m.content.includes("I prefer remote roles"));
    expect(stored).toBeTruthy();
    expect(stored?.source).toBe("assistant");
  });

  it("rejects unknown tools instead of executing them", async () => {
    mockGenerateJSON.mockResolvedValue(tool("fly_to_mars"));
    const res = await runAssistant({ message: "do the impossible", profile });
    expect(res.usedTools).toEqual([]);
    expect(res.reply).toContain("I'm not sure how to do that yet.");
  });

  it("reuses the previous result when the same tool is requested twice", async () => {
    mockGenerateJSON
      .mockResolvedValueOnce(tool("pipeline_summary"))
      .mockResolvedValueOnce(tool("pipeline_summary", {}, "As I already said: 3 jobs"));
    const res = await runAssistant({ message: "pipeline again", profile });
    expect(res.usedTools).toEqual(["pipeline_summary"]);
    expect(res.reply).toContain("As I already said");
  });

  it("hits the iteration budget after MAX_ITERATIONS tool hops", async () => {
    const tools = ["pipeline_summary", "search_jobs", "pipeline_summary"];
    let i = 0;
    mockGenerateJSON.mockImplementation(() => Promise.resolve(tool(tools[i++ % tools.length])));
    const res = await runAssistant({ message: "loop me", profile });
    expect(res.usedTools).toHaveLength(3);
    expect(res.reply).toContain("Ran 3 tool(s)");
  });

  it("records an insight memory when tools were used", async () => {
    mockGenerateJSON
      .mockResolvedValueOnce(tool("pipeline_summary"))
      .mockResolvedValueOnce(answer("3 open roles."));
    await runAssistant({ message: "pipeline status", profile });
    const insight = memoryRepo.list().find((m) => m.kind === "insight" && m.content.includes("pipeline status"));
    expect(insight).toBeTruthy();
  });
});

describe("runAssistant — heuristic fallback (no LLM provider)", () => {
  beforeEach(() => {
    mockGenerateJSON.mockReset();
    mockGenerateText.mockReset();
    mockGenerateJSON.mockRejectedValue(new Error("CHAIN_EXHAUSTED"));
  });

  it("routes pipeline questions through the heuristic path", async () => {
    const res = await runAssistant({ message: "how many applications do I have?", profile });
    expect(res.usedTools).toEqual(["pipeline_summary"]);
    expect(res.reply).toContain("PIPELINE SNAPSHOT");
    expect(res.llm).toBe(false);
  });

  it("routes job queries through the heuristic search_jobs path", async () => {
    jobsRepo.upsert(makeJob("hj1", { title: "Backend Engineer", company: "Globex" }));
    const res = await runAssistant({ message: "find backend jobs", profile });
    expect(res.usedTools).toEqual(["search_jobs"]);
    expect(res.reply.toLowerCase()).toContain("backend engineer");
  });

  it("routes document queries through search_vault", async () => {
    const res = await runAssistant({ message: "search my resume documents", profile });
    expect(res.usedTools).toEqual(["search_vault"]);
  });

  it("answers with the tool result without calling the model again", async () => {
    const res = await runAssistant({ message: "show me my reminders and pipeline", profile });
    expect(res.llm).toBe(false);
    expect(res.reply).toBeTruthy();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("explains that a provider is needed when nothing matches", async () => {
    const res = await runAssistant({ message: "what is the meaning of life", profile });
    expect(res.usedTools).toEqual([]);
    expect(res.reply).toContain("No AI provider is configured");
  });
});
