import { describe, expect, it, vi } from "vitest";
import { researchCompany } from "@/lib/agents/companyResearch";
import { executeCompanyIntelTool } from "@/lib/agents/tools/multiAgentTools";

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function successfulResearchFetch(): typeof fetch {
  return vi.fn(async (input: URL | RequestInfo) => {
    const url = String(input);
    if (url.includes("wbsearchentities")) {
      return jsonResponse({
        search: [{ id: "Q21708200", label: "OpenAI", description: "American artificial intelligence research organization" }],
      });
    }
    if (url.includes("Special:EntityData/Q21708200.json")) {
      return jsonResponse({
        entities: {
          Q21708200: {
            claims: {
              P856: [{ mainsnak: { datavalue: { value: "https://openai.com/" } } }],
              P571: [{ mainsnak: { datavalue: { value: { time: "+2015-12-11T00:00:00Z" } } } }],
              P159: [{ mainsnak: { datavalue: { value: { id: "Q62" } } } }],
              P452: [{ mainsnak: { datavalue: { value: { id: "Q11660" } } } }],
              P31: [{ mainsnak: { datavalue: { value: { id: "Q163740" } } } }],
            },
            sitelinks: { enwiki: { title: "OpenAI" } },
          },
        },
      });
    }
    if (url.includes("wbgetentities")) {
      return jsonResponse({
        entities: {
          Q62: { labels: { en: { value: "San Francisco" } } },
          Q11660: { labels: { en: { value: "artificial intelligence" } } },
          Q163740: { labels: { en: { value: "nonprofit organization" } } },
        },
      });
    }
    if (new URL(url).hostname === "en.wikipedia.org") {
      return jsonResponse({ query: { pages: { "1": { extract: "OpenAI is an artificial intelligence organization." } } } });
    }
    if (new URL(url).hostname === "gdeltproject.org") {
      return jsonResponse({
        articles: [
          {
            url: "https://example.com/openai-news",
            title: "OpenAI launches a new research program",
            domain: "example.com",
            seendate: "20260820T101500Z",
          },
        ],
      });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("source-backed company research", () => {
  it("returns structured facts and news with resolvable provenance", async () => {
    const research = await researchCompany(
      { company: "OpenAI", jobUrl: "https://openai.com/careers/example" },
      { fetchImpl: successfulResearchFetch(), now: () => new Date("2026-08-21T12:00:00Z") },
    );

    expect(research.status).toBe("verified");
    expect(research.entityId).toBe("Q21708200");
    expect(research.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Founded", value: "2015", sourceIds: ["wikidata:Q21708200"] }),
      expect.objectContaining({ label: "Headquarters", value: "San Francisco" }),
    ]));
    expect(research.news[0]).toEqual(expect.objectContaining({ sourceId: "news:1", publisher: "example.com" }));
    expect(research.sources.map((source) => source.id)).toEqual(expect.arrayContaining([
      "wikidata:Q21708200",
      "wikipedia:Q21708200",
      "news:1",
      "job-posting",
    ]));
  });

  it("labels posting-derived technologies and culture as posting signals", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = successfulResearchFetch();
    try {
      const result = await executeCompanyIntelTool({
        company: "OpenAI",
        jobDescription: "We use Python and PostgreSQL in a remote, collaborative engineering team.",
        jobUrl: "https://openai.com/careers/example",
      });
      expect(result.research.facts).toEqual(expect.arrayContaining([
        expect.objectContaining({ label: "Technologies named in posting", confidence: "posting_signal" }),
        expect.objectContaining({ label: "Culture language in posting", confidence: "posting_signal" }),
      ]));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns an unavailable state instead of fabricating identity facts", async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      if (String(input).includes("wbsearchentities")) return jsonResponse({ search: [] });
      if (new URL(String(input)).hostname === "gdeltproject.org") return jsonResponse({ articles: [] });
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;
    const research = await researchCompany({ company: "Unfindable Example Company" }, { fetchImpl });
    expect(research.status).toBe("unavailable");
    expect(research.summary).toBeUndefined();
    expect(research.facts).toEqual([]);
  });
});
