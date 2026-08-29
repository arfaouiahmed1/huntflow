import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/agent/sources/route";

const upstreamPayload = {
  sources: [
    {
      id: "remotive",
      name: "Remotive",
      category: "general",
      type: "static",
      url: "https://remotive.com/remote-software-dev-jobs",
      sourceType: "remote_board",
      markets: ["global"],
      experience: "all",
      workMode: "remote",
      enabledByDefault: true,
      note: "Light static fetch by default.",
    },
    {
      id: "hacker_news_who_is_hiring",
      name: "HN Who is Hiring",
      category: "posts",
      type: "posts",
      url: "https://news.ycombinator.com/item?id=49156683",
      sourceType: "community",
      markets: ["global"],
      experience: "all",
      workMode: "all",
      enabledByDefault: false,
      note: "",
    },
  ],
  count: 2,
};

describe("GET /api/agent/sources — sidecar passthrough", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves sourceType and markets from the sidecar unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(upstreamPayload), { status: 200 })),
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.online).toBe(true);
    expect(data.count).toBe(2);
    expect(data.sources).toEqual(upstreamPayload.sources);
    for (const source of data.sources) {
      expect(source).toHaveProperty("sourceType");
      expect(source).toHaveProperty("markets");
      expect(Array.isArray(source.markets)).toBe(true);
      expect(source.markets.length).toBeGreaterThan(0);
    }
  });

  it("keeps the offline shape when the sidecar is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("connect ECONNREFUSED 127.0.0.1:8001");
      }),
    );

    const res = await GET();
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.online).toBe(false);
    expect(data.sources).toEqual([]);
  });
});
