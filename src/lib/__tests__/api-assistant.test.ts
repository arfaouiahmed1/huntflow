import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/assistant/route";
import { generateJSON } from "@/lib/llm/client";
import { NextRequest } from "next/server";

vi.mock("@/lib/llm/client", () => ({
  generateJSON: vi.fn(),
  generateText: vi.fn(),
}));

const mockGenerateJSON = vi.mocked(generateJSON);

function post(message: string, profile: unknown = { name: "Test User" }) {
  return new NextRequest("http://localhost/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, profile }),
  });
}

const fullProfile = {
  name: "Test User",
  email: "t@t.io",
  phone: "1",
  location: "Berlin",
  summary: "Engineer",
  targetTitle: "Engineer",
  skills: ["React"],
  experience: [],
  education: [],
};

describe("POST /api/assistant — validation", () => {
  it("rejects an empty message with 400", async () => {
    const res = await POST(post("   "));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("message");
  });

  it("rejects a missing profile with 400", async () => {
    const req = new NextRequest("http://localhost/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/assistant — response contract", () => {
  beforeEach(() => {
    mockGenerateJSON.mockReset();
  });

  it("returns { ok, reply, steps, usedTools, llm } for a direct answer", async () => {
    mockGenerateJSON.mockResolvedValue({ action: "answer", message: "You have 4 open roles." });
    const res = await POST(post("how many open roles", fullProfile));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.reply).toBe("You have 4 open roles.");
    expect(Array.isArray(data.steps)).toBe(true);
    expect(data.usedTools).toEqual([]);
    expect(data.llm).toBe(true);
  });

  it("works end-to-end through the heuristic fallback with no provider", async () => {
    mockGenerateJSON.mockRejectedValue(new Error("CHAIN_EXHAUSTED"));
    const res = await POST(post("what is my pipeline status?", fullProfile));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.reply).toContain("PIPELINE SNAPSHOT");
    expect(data.usedTools).toEqual(["pipeline_summary"]);
    expect(data.llm).toBe(false);
  });

  it("returns tool steps for tool-using turns", async () => {
    mockGenerateJSON
      .mockResolvedValueOnce({ action: "tool", tool: "remember", args: { content: "likes remotes" }, note: "store" })
      .mockResolvedValueOnce({ action: "answer", message: "Stored." });
    const res = await POST(post("remember I like remote roles", fullProfile));
    const data = await res.json();
    expect(data.usedTools).toEqual(["remember"]);
    expect(data.steps[0]).toHaveProperty("kind", "tool");
    expect(data.steps[0]).toHaveProperty("label", "remember");
    expect(data.steps[0]).toHaveProperty("detail");
  });

  it("never leaks internal prompts in the reply", async () => {
    mockGenerateJSON.mockResolvedValue({ action: "answer", message: "Sure thing." });
    const res = await POST(post("hi", fullProfile));
    const data = await res.json();
    expect(data.reply).not.toContain("TOOLS_PROMPT");
    expect(data.reply).not.toContain("SHARED CONTEXT");
  });
});
