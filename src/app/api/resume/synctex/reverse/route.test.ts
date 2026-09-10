import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/pdf/synctex", () => ({
  forwardSync: vi.fn(),
  reverseSync: vi.fn(async () => ({ line: 42, column: 3 })),
  SynctexError: class SynctexError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "SynctexError";
    }
  },
}));

import { POST } from "./route";
import { reverseSync, SynctexError } from "@/lib/pdf/synctex";

function postJson(body: unknown) {
  return new NextRequest("http://localhost/api/resume/synctex/reverse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/resume/synctex/reverse", () => {
  it("returns the real source line for measured PDF coordinates", async () => {
    const res = await POST(postJson({ token: "tok", page: 1, x: 210.5, y: 99.25 }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.line).toBe(42);
    expect(reverseSync).toHaveBeenCalledWith("tok", 1, 210.5, 99.25);
  });

  it("rejects missing tokens and non-numeric coordinates", async () => {
    expect((await POST(postJson({ page: 1, x: 1, y: 1 }))).status).toBe(400);
    expect((await POST(postJson({ token: "tok", page: 1, x: "far", y: 1 }))).status).toBe(400);
    expect((await POST(postJson({ token: "tok", page: "first", x: 1, y: 1 }))).status).toBe(400);
  });

  it("maps SyncTeX failures to 422 SYNCTEX_FAILED, never a fake line", async () => {
    vi.mocked(reverseSync).mockRejectedValueOnce(new SynctexError("No .synctex.gz produced — recompile with SyncTeX enabled."));
    const res = await POST(postJson({ token: "stale", page: 1, x: 1, y: 1 }));
    expect(res.status).toBe(422);
    const data = (await res.json()) as { ok?: boolean; error?: { code?: string } };
    expect(data.ok).toBe(false);
    expect(data.error?.code).toBe("SYNCTEX_FAILED");
  });
});
