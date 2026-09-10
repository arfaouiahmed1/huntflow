import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/pdf/synctex", () => ({
  forwardSync: vi.fn(async () => ({ page: 2, x: 72.5, y: 144.25, width: 30, height: 12 })),
  reverseSync: vi.fn(),
  SynctexError: class SynctexError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "SynctexError";
    }
  },
}));

import { POST } from "./route";
import { forwardSync, SynctexError } from "@/lib/pdf/synctex";

function postJson(body: unknown) {
  return new NextRequest("http://localhost/api/resume/synctex/forward", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/resume/synctex/forward", () => {
  it("returns real forward coordinates for a live token + line", async () => {
    const res = await POST(postJson({ token: "tok", line: 8, column: 0 }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.page).toBe(2);
    expect(data.x).toBe(72.5);
    expect(forwardSync).toHaveBeenCalledWith("tok", 8, 0);
  });

  it("rejects a missing token and a bad line", async () => {
    expect((await POST(postJson({ line: 3 }))).status).toBe(400);
    expect((await POST(postJson({ token: "tok", line: 0 }))).status).toBe(400);
    expect((await POST(postJson({ token: "tok", line: -2 }))).status).toBe(400);
  });

  it("maps SyncTeX failures to 422 SYNCTEX_FAILED, never a fake position", async () => {
    vi.mocked(forwardSync).mockRejectedValueOnce(new SynctexError("Build expired or not found — recompile first."));
    const res = await POST(postJson({ token: "stale", line: 1 }));
    expect(res.status).toBe(422);
    const data = (await res.json()) as { ok?: boolean; error?: { code?: string } };
    expect(data.ok).toBe(false);
    expect(data.error?.code).toBe("SYNCTEX_FAILED");
  });
});
