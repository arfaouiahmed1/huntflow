import { describe, expect, it } from "vitest";
import { scoreLiveCrawlerCanary, selectLiveCanarySource } from "@/lib/agents/liveCanary";

const sources = [
  { id: "stealth", type: "stealth", enabledByDefault: true, name: "Stealth" },
  { id: "static", type: "static", enabledByDefault: true, name: "Static" },
  { id: "disabled", type: "static", enabledByDefault: false, name: "Disabled" },
] as const;

describe("live crawler canary helpers", () => {
  it("selects an explicitly requested source or the first enabled static source", () => {
    expect(selectLiveCanarySource(sources, "stealth")?.id).toBe("stealth");
    expect(selectLiveCanarySource(sources)?.id).toBe("static");
    expect(selectLiveCanarySource(sources, "missing")).toBeUndefined();
  });

  it("falls back to an enabled non-static source when no static default is healthy", () => {
    expect(
      selectLiveCanarySource([
        { id: "posts", type: "posts", enabledByDefault: true, name: "Posts" },
      ])?.id,
    ).toBe("posts");
  });

  it("reports metrics and rejects malformed returned cards", () => {
    const result = scoreLiveCrawlerCanary({
      sourceId: "static",
      latencyMs: 275,
      response: {
        jobs: [
          {
            title: "Frontend Engineer",
            company: "Acme",
            url: "https://example.com/jobs/1",
            jobDescription: "React and TypeScript role",
          },
          { title: "Missing URL", company: "Acme", url: "", jobDescription: "" },
        ],
        source_results: [{ id: "static", status: "success", found: 2, matched: 2 }],
      },
    });

    expect(result.metrics).toEqual({
      sourceId: "static",
      latencyMs: 275,
      sourceStatus: "success",
      cardsReturned: 2,
      validCards: 1,
    });
    expect(result.passed).toBe(false);
    expect(result.failures).toContain("1 returned card(s) were missing title, URL, or description.");
  });

  it("rejects a card whose URL is nonempty but not an HTTP(S) address", () => {
    const result = scoreLiveCrawlerCanary({
      sourceId: "static",
      latencyMs: 10,
      response: {
        jobs: [{ title: "Role", company: "Acme", url: "not-a-url", jobDescription: "Description" }],
        source_results: [{ id: "static", status: "success", found: 1, matched: 1 }],
      },
    });

    expect(result.passed).toBe(false);
    expect(result.metrics.validCards).toBe(0);
  });
});
