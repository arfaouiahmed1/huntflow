import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

function jsonRequest(body: unknown) {
  return new NextRequest("http://localhost/api/resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const TEX = "\\documentclass{article}\n\\begin{document}Hello\\end{document}";

describe("POST /api/resume studio persistence", () => {
  it("saves a studio doc with tex + editorRev and lists it", async () => {
    const res = await POST(jsonRequest({ id: "studio-main", name: "Studio", tex: TEX, editorRev: 0 }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok?: boolean; doc?: { id?: string; editorRev?: number } };
    expect(data.ok).toBe(true);
    expect(data.doc?.id).toBe("studio-main");

    const list = (await (await GET()).json()) as { docs?: { id?: string }[] };
    expect((list.docs ?? []).some((d) => d.id === "studio-main")).toBe(true);
  });

  it("rejects a stale editorRev with 409 instead of clobbering", async () => {
    const fresh = await POST(jsonRequest({ id: "studio-rev", name: "Rev", tex: TEX, editorRev: 3 }));
    expect(fresh.status).toBe(200);
    const stale = await POST(jsonRequest({ id: "studio-rev", name: "Rev", tex: "stale", editorRev: 1 }));
    expect(stale.status).toBe(409);
    const body = (await stale.json()) as { ok?: boolean; error?: { code?: string } };
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("STALE_REV");
  });

  it("persists compile metadata alongside the source", async () => {
    const res = await POST(
      jsonRequest({
        id: "studio-meta",
        name: "Meta",
        tex: TEX,
        editorRev: 0,
        lastCompileToken: "tok-abc",
        lastCompileAt: "2026-09-10T00:00:00Z",
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok?: boolean;
      doc?: { lastCompileToken?: string; lastCompileAt?: string };
    };
    expect(data.doc?.lastCompileToken).toBe("tok-abc");
    expect(data.doc?.lastCompileAt).toBe("2026-09-10T00:00:00Z");
  });

  it("requires tex or content", async () => {
    const res = await POST(jsonRequest({ id: "studio-empty", name: "Empty" }));
    expect(res.status).toBe(400);
  });
});
