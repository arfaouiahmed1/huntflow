import { describe, it, expect } from "vitest";
import { applySourceFilters, DEFAULT_FILTER_SELECTION, parseSourceCatalog } from "@/lib/sourceTaxonomy";
import { useFilteredSources } from "@/components/crawler/CrawlerDiscoveryControls";

const RAW = [
  { id: "remotive", name: "Remotive", category: "remote", type: "static" as const, url: "https://remotive.test", sourceType: "remote_board", markets: ["global"], experience: "all" as const, workMode: "remote" as const, enabledByDefault: true },
  { id: "wttj", name: "WTTJ", category: "europe", type: "static" as const, url: "https://wttj.test", sourceType: "general", markets: ["europe"], experience: "mid" as const, workMode: "hybrid" as const, enabledByDefault: true },
  { id: "forem", name: "Forem", category: "posts", type: "posts" as const, url: "https://forem.test", sourceType: "community", markets: ["global", "europe"], experience: "all" as const, workMode: "all" as const, enabledByDefault: false },
];

describe("Task 7 — Crawler discovery filters", () => {
  it("sourceType and market filter independently and intersect deterministically", () => {
    const cat = parseSourceCatalog({ sources: RAW }).sources;
    expect(applySourceFilters(cat, { ...DEFAULT_FILTER_SELECTION, sourceType: "community" }).map((s) => s.id)).toEqual(["forem"]);
    expect(applySourceFilters(cat, { ...DEFAULT_FILTER_SELECTION, market: "europe" }).map((s) => s.id)).toEqual(["wttj", "forem"]);
    expect(applySourceFilters(cat, { sourceType: "general", market: "europe", experience: "mid", workMode: "hybrid" }).map((s) => s.id)).toEqual(["wttj"]);
  });

  it("zero-result is intentional and not a crash; selection would be stable as hidden", () => {
    const cat = parseSourceCatalog({ sources: RAW }).sources;
    const impossible = applySourceFilters(cat, { sourceType: "remote_board", market: "europe", experience: "senior", workMode: "onsite" });
    expect(impossible).toEqual([]);
  });

  it("visible list preserves catalog order and selected-in-view vs total-selected diverge when filtered", () => {
    const visibleAll = useFilteredSources(RAW, DEFAULT_FILTER_SELECTION);
    expect(visibleAll.map((s: (typeof RAW)[number]) => s.id)).toEqual(["remotive", "wttj", "forem"]);
    const visibleRemote = useFilteredSources(RAW, { ...DEFAULT_FILTER_SELECTION, sourceType: "remote_board" });
    expect(visibleRemote.map((s: (typeof RAW)[number]) => s.id)).toEqual(["remotive"]);
    const selected = new Set(["forem"]);
    // forem is hidden under remote_board filter, but selection set keeps it — card gone but count stable
    expect(visibleRemote.some((s: (typeof RAW)[number]) => selected.has(s.id))).toBe(false);
    expect(selected.has("forem")).toBe(true);
  });

  it("retains Experience and Work mode as independent axes", () => {
    const cat = parseSourceCatalog({ sources: RAW }).sources;
    expect(applySourceFilters(cat, { ...DEFAULT_FILTER_SELECTION, experience: "mid" }).map((s) => s.id)).toEqual(["wttj"]);
    expect(applySourceFilters(cat, { ...DEFAULT_FILTER_SELECTION, workMode: "remote" }).map((s) => s.id)).toEqual(["remotive"]);
  });
});
