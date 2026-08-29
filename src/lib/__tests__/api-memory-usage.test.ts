import { describe, it, expect } from "vitest";
import { GET as GET_MEMORY, POST as POST_MEMORY, DELETE as DELETE_MEMORY } from "@/app/api/memory/route";
import { GET as GET_USAGE } from "@/app/api/usage/route";
import { GET as GET_VAULT } from "@/app/api/vault/route";
import { GET as GET_SEARCH_VAULT, POST as SEARCH_VAULT } from "@/app/api/vault/search/route";
import { NextRequest } from "next/server";

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/memory — MemoryFeed contract", () => {
  it("returns { memory: [] } when empty", async () => {
    const res = await GET_MEMORY(new NextRequest("http://localhost/api/memory"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.memory)).toBe(true);
  });

  it("filters by kind, jobId and clamps the limit", async () => {
    await POST_MEMORY(post("http://localhost/api/memory", { kind: "note", content: "filterable note", jobId: "j-x", source: "test" }));
    const res = await GET_MEMORY(
      new NextRequest("http://localhost/api/memory?kind=note&jobId=j-x&limit=1000")
    );
    const data = await res.json();
    expect(data.memory.length).toBeGreaterThanOrEqual(1);
    expect(data.memory.every((m: { jobId?: string }) => m.jobId === "j-x")).toBe(true);
    expect(data.memory.length).toBeLessThanOrEqual(200);
  });
});

describe("POST /api/memory — remember contract", () => {
  it("requires content", async () => {
    const res = await POST_MEMORY(post("http://localhost/api/memory", { kind: "note" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("content");
  });

  it("stores an entry with clamped importance", async () => {
    const res = await POST_MEMORY(
      post("http://localhost/api/memory", { kind: "bogus-kind", content: "remember me", importance: 99 })
    );
    expect(res.status).toBe(200);
    const { ok, memory } = await res.json();
    expect(ok).toBe(true);
    expect(memory.kind).toBe("note"); /* invalid kinds fall back */
    expect(memory.importance).toBe(5);
    expect(memory.content).toBe("remember me");
  });

  it("deletes an entry by id", async () => {
    const created = await (await POST_MEMORY(post("http://localhost/api/memory", { content: "to delete" }))).json();
    const del = await DELETE_MEMORY(
      new NextRequest(`http://localhost/api/memory?id=${created.memory.id}`)
    );
    expect(del.status).toBe(200);
    expect((await del.json()).ok).toBe(true);
    const list = await (await GET_MEMORY(new NextRequest("http://localhost/api/memory"))).json();
    expect(list.memory.some((m: { id: number }) => m.id === created.memory.id)).toBe(false);
  });

  it("requires an id to delete", async () => {
    const res = await DELETE_MEMORY(new NextRequest("http://localhost/api/memory"));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/usage — UsagePanel contract", () => {
  it("returns totals, byProvider and recent entries", async () => {
    const res = await GET_USAGE();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totals).toHaveProperty("calls");
    expect(data.totals).toHaveProperty("tokens");
    expect(data.totals).toHaveProperty("errors");
    expect(data.totals).toHaveProperty("avgLatencyMs");
    expect(typeof data.totalCost).toBe("number");
    expect(data.byProvider).toBeTruthy();
    expect(Array.isArray(data.recent)).toBe(true);
  });
});

describe("vault routes", () => {
  it("GET /api/vault returns docs + stats", async () => {
    const res = await GET_VAULT();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.docs)).toBe(true);
    expect(data.stats).toHaveProperty("docs");
    expect(data.stats).toHaveProperty("chunks");
  });

  it("GET /api/vault/search requires a query", async () => {
    const res = await GET_SEARCH_VAULT(new NextRequest("http://localhost/api/vault/search?q="));
    expect(res.status).toBe(400);
  });

  it("GET /api/vault/search returns hits with query and k params", async () => {
    const res = await GET_SEARCH_VAULT(new NextRequest("http://localhost/api/vault/search?q=typescript&k=5"));
    expect(res.status).toBe(200);
    const { hits } = await res.json();
    expect(Array.isArray(hits)).toBe(true);
  });

  it("POST /api/vault/search requires a query", async () => {
    const res = await SEARCH_VAULT(post("http://localhost/api/vault/search", { query: "  " }));
    expect(res.status).toBe(400);
  });

  it("POST /api/vault/search returns hits with score and text", async () => {
    const res = await SEARCH_VAULT(post("http://localhost/api/vault/search", { query: "typescript", k: 10 }));
    expect(res.status).toBe(200);
    const { hits } = await res.json();
    expect(Array.isArray(hits)).toBe(true);
    for (const h of hits) {
      expect(typeof h.score).toBe("number");
      expect(typeof h.text).toBe("string");
    }
  });
});
