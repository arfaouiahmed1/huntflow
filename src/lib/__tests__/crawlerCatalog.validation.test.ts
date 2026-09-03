import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseSourceCatalog } from "@/lib/sourceTaxonomy";
import { CRAWLER_CHANNELS, CRAWLER_REGIONS, SOURCE_AUTH_MODES, SOURCE_CRAWL_POLICIES } from "@/lib/crawler/contracts";

// ---------------------------------------------------------------------------
// Helpers — bounded, deterministic, no network
// ---------------------------------------------------------------------------

/** Read and parse scrapling-agent/sources.json from repo root. */
function loadRawCatalog(): Record<string, unknown> {
  const candidates = [
    path.resolve(process.cwd(), "scrapling-agent/sources.json"),
    path.resolve(__dirname, "../../../scrapling-agent/sources.json"),
    path.resolve("C:/Users/ahmed/Desktop/Personal Projects/Job Finder/scrapling-agent/sources.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
    }
  }
  throw new Error("scrapling-agent/sources.json not found from any candidate path");
}

describe("crawler catalog v2 validation (parseSourceCatalog on sources.json)", () => {
  const raw = loadRawCatalog();
  const parsed = parseSourceCatalog(raw);

  it("yields parsed sources with zero typed failures", () => {
    expect(parsed.failures).toEqual([]);
    expect(parsed.ok).toBe(true);
    expect(parsed.sources.length).toBeGreaterThanOrEqual(20);
  });

  it("every source has a unique id and non-empty name", () => {
    const ids = parsed.sources.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    for (const source of parsed.sources) {
      expect(source.id.trim().length).toBeGreaterThan(0);
      expect(source.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("every source has valid channel and regions adhering to crawler contracts", () => {
    for (const source of parsed.sources) {
      if (source.channel) {
        expect(CRAWLER_CHANNELS).toContain(source.channel);
      }
      expect(source.regions && source.regions.length > 0).toBe(true);
      for (const region of source.regions || []) {
        expect(CRAWLER_REGIONS).toContain(region);
      }
    }
  });

  it("every source carries valid attribution and termsUrl", () => {
    for (const source of parsed.sources) {
      if (source.attribution) {
        expect(source.attribution.name.trim().length).toBeGreaterThan(0);
        expect(source.attribution.url.trim().length).toBeGreaterThan(0);
      }
      if (source.termsUrl) {
        expect(source.termsUrl.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("no enabled automatic source requires credentials or unpermitted policy", () => {
    const rawSources = (raw.sources as Array<Record<string, unknown>>) || [];
    for (const s of rawSources) {
      if (s.crawlPolicy === "automatic" && s.enabledByDefault) {
        expect(["none", "optional_key"]).toContain(s.authMode);
      }
    }
  });

  it("covers all designated regions: global, americas, europe, mena, africa, apac", () => {
    const coveredRegions = new Set<string>();
    for (const source of parsed.sources) {
      for (const r of source.regions || []) {
        coveredRegions.add(r);
      }
    }
    for (const requiredRegion of CRAWLER_REGIONS) {
      expect(coveredRegions.has(requiredRegion)).toBe(true);
    }
  });

  it("covers major channels: ats, aggregator, regional, community, directory", () => {
    const coveredChannels = new Set<string>();
    for (const source of parsed.sources) {
      if (source.channel) {
        coveredChannels.add(source.channel);
      }
    }
    for (const requiredChannel of CRAWLER_CHANNELS) {
      expect(coveredChannels.has(requiredChannel)).toBe(true);
    }
  });
});
