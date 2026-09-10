import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/llm/router", () => ({
  resolveChain: vi.fn(() => [{ id: "test-provider" }]),
  callLLMJSON: vi.fn(async (req: { agent?: string }) =>
    req.agent === "resume_route"
      ? { action: "act", tool: "read_selection", args: {}, wantsEdit: false }
      : { reply: "structured", actionSummary: "s", updatedResume: null }
  ),
}));

vi.mock("@/lib/llm/stream", () => ({
  generateTextStream: async function* () {
    yield "Hello ";
    yield "there";
  },
}));

import { POST } from "./route";
import { storeAttachment } from "@/lib/copilot/attachments";

function postJson(body: unknown, accept = "text/event-stream") {
  return new NextRequest("http://localhost/api/resume/copilot/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: accept },
    body: JSON.stringify(body),
  });
}

const BASE = {
  message: "Rewrite this selection",
  resume: { header: { name: "A", title: "T", email: "", phone: "", location: "", linkedin: "", github: "", portfolio: "" } },
  tex: "\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}",
  selection: { text: "Led the migration", sourceLine: 12 },
};

describe("POST /api/resume/copilot/stream", () => {
  it("streams config -> reasoning -> tool_call -> token -> done in order", async () => {
    const res = await POST(postJson(BASE));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    const events = [...text.matchAll(/^event: (\w+)$/gm)].map((m) => m[1]);
    expect(events[0]).toBe("config");
    expect(events).toContain("reasoning");
    expect(events).toContain("tool_call");
    expect(events).toContain("token");
    expect(events[events.length - 1]).toBe("done");
    expect(text).toContain("read_selection");
    expect(text).toContain("Hello ");
    const doneLine = text.split("\n").find((l) => l.includes(`"reply":"Hello there"`));
    expect(doneLine).toBeTruthy();
  });

  it("cites consumed PDF attachments in done without echoing bytes", async () => {
    const id = storeAttachment({ name: "ref.pdf", mime: "application/pdf", size: 42, kind: "pdf", text: "Staff engineer at Acme" });
    const res = await POST(postJson({ ...BASE, attachmentIds: [id] }));
    const text = await res.text();
    expect(text).toContain("ref.pdf");
    expect(text).not.toContain("Staff engineer at Acme");
  });

  it("discloses unanalyzable images instead of dropping them", async () => {
    const id = storeAttachment({ name: "shot.png", mime: "image/png", size: 42, kind: "image", base64: "AAA" });
    const res = await POST(postJson({ ...BASE, attachmentIds: [id] }));
    const text = await res.text();
    expect(text).toContain("vision-capable");
  });

  it("rejects a missing message without opening a stream", async () => {
    const res = await POST(postJson({ resume: {} }));
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(await res.text()).toContain("message is required");
  });
});
