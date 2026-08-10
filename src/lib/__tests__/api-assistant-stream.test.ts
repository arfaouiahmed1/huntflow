import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/assistant/route";
import { generateJSON } from "@/lib/llm/client";
import { NextRequest } from "next/server";

vi.mock("@/lib/llm/client", () => ({
  generateJSON: vi.fn(),
  generateText: vi.fn(),
}));

const mockGenerateJSON = vi.mocked(generateJSON);

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

function post(message: string, accept: string) {
  return new NextRequest("http://localhost/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: accept },
    body: JSON.stringify({ message, profile: fullProfile }),
  });
}

/** Split a raw SSE body into `[event, parsedData]` pairs, ignoring the config frame. */
function parseSse(body: string): { event: string; data: unknown }[] {
  const frames: { event: string; data: unknown }[] = [];
  for (const block of body.split(/\n\n+/)) {
    const evMatch = block.match(/^event:\s*(\S+)\s*$/m);
    const dataMatch = block.match(/^data:\s*(.+)$/m);
    if (!evMatch || !dataMatch) continue;
    frames.push({ event: evMatch[1], data: JSON.parse(dataMatch[1]) });
  }
  return frames;
}

describe("POST /api/assistant — streaming", () => {
  beforeEach(() => {
    mockGenerateJSON.mockReset();
  });

  it("returns an SSE stream when the client accepts text/event-stream", async () => {
    mockGenerateJSON.mockResolvedValue({ action: "answer", message: "You have 4 open roles." });
    const res = await POST(post("how many open roles", "text/event-stream"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-cache");
  });

  it("emits config, reasoning and a done payload for a direct answer", async () => {
    mockGenerateJSON.mockResolvedValue({ action: "answer", message: "You have 4 open roles." });
    const res = await POST(post("how many open roles", "text/event-stream"));
    const body = await res.text();
    const frames = parseSse(body);

    const names = frames.map((f) => f.event);
    expect(names[0]).toBe("config");
    expect(names).toContain("reasoning");
    expect(names[names.length - 1]).toBe("done");

    const done = frames.find((f) => f.event === "done")!.data as Record<string, unknown>;
    expect(done.reply).toBe("You have 4 open roles.");
    expect(done.usedTools).toEqual([]);
    expect(done.llm).toBe(true);
  });

  it("emits tool_call + reasoning while a tool-using turn streams", async () => {
    mockGenerateJSON
      .mockResolvedValueOnce({ action: "tool", tool: "remember", args: { content: "likes remotes" }, note: "store" })
      .mockResolvedValueOnce({ action: "answer", message: "Stored." });
    const res = await POST(post("remember I like remote roles", "text/event-stream"));
    const body = await res.text();
    const frames = parseSse(body);

    const toolFrame = frames.find((f) => f.event === "tool_call")?.data as Record<string, unknown>;
    expect(toolFrame.tool).toBe("remember");

    const done = frames.find((f) => f.event === "done")!.data as Record<string, unknown>;
    expect((done.usedTools as string[])).toEqual(["remember"]);
    expect(done.reply).toContain("Stored");
  });

  it("falls back to a single JSON response when the client does not stream", async () => {
    mockGenerateJSON.mockResolvedValue({ action: "answer", message: "no stream" });
    const res = await POST(post("hi", "*/*"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).not.toContain("text/event-stream");
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.reply).toBe("no stream");
  });
});