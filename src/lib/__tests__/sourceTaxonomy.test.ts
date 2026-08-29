import { describe, expect, it } from "vitest";
import {
  applySourceFilters,
  DEFAULT_FILTER_SELECTION,
  EXPERIENCE_LABELS,
  EXPERIENCE_LEVELS,
  getExperienceOptions,
  getFallbackFilterOptions,
  getMarketOptions,
  getSourceTypeOptions,
  getWorkModeOptions,
  MARKET_LABELS,
  MARKETS,
  parseSourceCatalog,
  SOURCE_TYPE_LABELS,
  SOURCE_TYPES,
  WORK_MODE_LABELS,
  WORK_MODES,
  type ExperienceLevel,
  type Market,
  type SourceParseFailure,
  type SourceFilterSelection,
  type SourceType,
  type TaxonomySource,
  type WorkMode,
} from "@/lib/sourceTaxonomy";

/* ------------------------------------------------------------------ *
 * Fixtures — synthetic board IDs only; the module itself never hardcodes IDs.
 * ------------------------------------------------------------------ */

function makeSource(
  id: string,
  sourceType: SourceType,
  markets: readonly Market[],
  experience: ExperienceLevel = "all",
  workMode: WorkMode = "all"
): TaxonomySource {
  return {
    id,
    name: `Fixture ${id}`,
    sourceType,
    markets: [...markets],
    experience,
    workMode,
    enabledByDefault: true,
  };
}

/** Catalog order is intentional and asserted throughout. */
function fixtureCatalog(): readonly TaxonomySource[] {
  return [
    makeSource("fixture-alpha", "general", ["global"], "entry", "remote"),
    makeSource("fixture-beta", "remote_board", ["europe", "mena"], "entry", "remote"),
    makeSource("fixture-gamma", "community", ["americas"], "mid", "hybrid"),
    makeSource("fixture-delta", "remote_board", ["apac"], "senior", "onsite"),
    makeSource("fixture-epsilon", "general", ["europe"]),
  ];
}

const idsOf = (sources: readonly TaxonomySource[]): string[] => sources.map((s) => s.id);

/* Compile-time exhaustiveness guards: adding a union member without a label
 * or without updating these records must fail `tsc --noEmit`. */
const EXHAUSTIVE_SOURCE_TYPES: Record<SourceType, true> = {
  general: true,
  remote_board: true,
  community: true,
};
const EXHAUSTIVE_MARKETS: Record<Market, true> = {
  global: true,
  europe: true,
  mena: true,
  americas: true,
  apac: true,
};
const EXHAUSTIVE_EXPERIENCE: Record<ExperienceLevel, true> = {
  entry: true,
  mid: true,
  senior: true,
  all: true,
};
const EXHAUSTIVE_WORK_MODES: Record<WorkMode, true> = {
  remote: true,
  hybrid: true,
  onsite: true,
  all: true,
};

describe("source taxonomy unions", () => {
  it("declares exactly the four contract sourceType members", () => {
    expect([...SOURCE_TYPES].sort()).toEqual(Object.keys(EXHAUSTIVE_SOURCE_TYPES).sort());
  });

  it("declares exactly the five contract market members", () => {
    expect([...MARKETS].sort()).toEqual(Object.keys(EXHAUSTIVE_MARKETS).sort());
  });

  it("declares exactly the four contract experience members", () => {
    expect([...EXPERIENCE_LEVELS].sort()).toEqual(Object.keys(EXHAUSTIVE_EXPERIENCE).sort());
  });

  it("declares exactly the four contract workMode members", () => {
    expect([...WORK_MODES].sort()).toEqual(Object.keys(EXHAUSTIVE_WORK_MODES).sort());
  });

  it("gives every union member a non-empty exhaustive label", () => {
    for (const value of SOURCE_TYPES) expect(SOURCE_TYPE_LABELS[value].length).toBeGreaterThan(0);
    for (const value of MARKETS) expect(MARKET_LABELS[value].length).toBeGreaterThan(0);
    for (const value of EXPERIENCE_LEVELS) expect(EXPERIENCE_LABELS[value].length).toBeGreaterThan(0);
    for (const value of WORK_MODES) expect(WORK_MODE_LABELS[value].length).toBeGreaterThan(0);
  });
});

describe("option derivation", () => {
  it("leads each list with its All option and follows catalog member order", () => {
    expect(getSourceTypeOptions().map((o) => o.value)).toEqual(["all", ...SOURCE_TYPES]);
    expect(getMarketOptions().map((o) => o.value)).toEqual(["all", ...MARKETS]);
    expect(getExperienceOptions().map((o) => o.value)).toEqual([...EXPERIENCE_LEVELS]);
    expect(getWorkModeOptions().map((o) => o.value)).toEqual([...WORK_MODES]);
  });

  it("returns the same frozen option instances on every call (stable ordering)", () => {
    const first = getSourceTypeOptions();
    expect(getSourceTypeOptions()).toBe(first);
    expect(getMarketOptions()).toBe(getMarketOptions());
    expect(getExperienceOptions()).toBe(getExperienceOptions());
    expect(getWorkModeOptions()).toBe(getWorkModeOptions());
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("exposes options that carry only value/label pairs (no fabricated source cards)", () => {
    for (const option of [
      ...getSourceTypeOptions(),
      ...getMarketOptions(),
      ...getExperienceOptions(),
      ...getWorkModeOptions(),
    ]) {
      expect(Object.keys(option).sort()).toEqual(["label", "value"]);
    }
  });

  it("provides offline fallback options identical to the live derivations", () => {
    const fallback = getFallbackFilterOptions();
    expect(fallback.sourceTypes).toBe(getSourceTypeOptions());
    expect(fallback.markets).toBe(getMarketOptions());
    expect(fallback.experiences).toBe(getExperienceOptions());
    expect(fallback.workModes).toBe(getWorkModeOptions());
  });
});

describe("applySourceFilters — one dimension at a time", () => {
  it("returns the catalog unchanged in original order when selection is empty", () => {
    const catalog = fixtureCatalog();
    const result = applySourceFilters(catalog, DEFAULT_FILTER_SELECTION);
    expect(idsOf(result)).toEqual(idsOf(catalog));
    expect(result[0]).toBe(catalog[0]);
    expect(result[4]).toBe(catalog[4]);
  });

  it("filters by sourceType independently", () => {
    const result = applySourceFilters(fixtureCatalog(), {
      ...DEFAULT_FILTER_SELECTION,
      sourceType: "remote_board",
    });
    expect(idsOf(result)).toEqual(["fixture-beta", "fixture-delta"]);
  });

  it("matches multi-market boards under any of their declared markets", () => {
    const europe = applySourceFilters(fixtureCatalog(), {
      ...DEFAULT_FILTER_SELECTION,
      market: "europe",
    });
    expect(idsOf(europe)).toEqual(["fixture-beta", "fixture-epsilon"]);

    const mena = applySourceFilters(fixtureCatalog(), { ...DEFAULT_FILTER_SELECTION, market: "mena" });
    expect(idsOf(mena)).toEqual(["fixture-beta"]);
  });

  it("filters by experience independently", () => {
    const result = applySourceFilters(fixtureCatalog(), {
      ...DEFAULT_FILTER_SELECTION,
      experience: "entry",
    });
    expect(idsOf(result)).toEqual(["fixture-alpha", "fixture-beta"]);
  });

  it("filters by workMode independently", () => {
    const result = applySourceFilters(fixtureCatalog(), {
      ...DEFAULT_FILTER_SELECTION,
      workMode: "remote",
    });
    expect(idsOf(result)).toEqual(["fixture-alpha", "fixture-beta"]);
  });
});

describe("applySourceFilters — combined dimensions", () => {
  it("intersects all four dimensions and preserves catalog order", () => {
    const selection: SourceFilterSelection = {
      sourceType: "remote_board",
      market: "europe",
      experience: "entry",
      workMode: "remote",
    };
    expect(idsOf(applySourceFilters(fixtureCatalog(), selection))).toEqual(["fixture-beta"]);
  });

  it("returns an intentional zero-match result for an impossible combination", () => {
    const selection: SourceFilterSelection = {
      sourceType: "community",
      market: "apac",
      experience: "all",
      workMode: "all",
    };
    const result = applySourceFilters(fixtureCatalog(), selection);
    expect(result).toEqual([]);
  });

  it("never mutates the input catalog or its items", () => {
    const catalog = Object.freeze(fixtureCatalog().map((source) => Object.freeze({ ...source })));
    const selection: SourceFilterSelection = {
      sourceType: "remote_board",
      market: "europe",
      experience: "entry",
      workMode: "remote",
    };
    expect(() => applySourceFilters(catalog, selection)).not.toThrow();
    expect(idsOf(applySourceFilters(catalog, selection))).toEqual(["fixture-beta"]);
    expect(catalog).toHaveLength(5);
  });
});

describe("parseSourceCatalog — Zod boundary", () => {
  it("parses a valid payload and defaults omitted experience/workMode to all", () => {
    const payload = {
      online: true,
      sources: [
        {
          id: "fixture-alpha",
          name: "Fixture Alpha",
          sourceType: "general",
          markets: ["global"],
          enabledByDefault: false,
        },
      ],
    };
    const result = parseSourceCatalog(payload);
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.sources).toEqual([
      {
        id: "fixture-alpha",
        name: "Fixture Alpha",
        sourceType: "general",
        markets: ["global"],
        experience: "all",
        workMode: "all",
        enabledByDefault: false,
      },
    ]);
  });

  it("strips unknown upstream keys instead of trusting them", () => {
    const payload = {
      sources: [
        {
          id: "fixture-alpha",
          name: "Fixture Alpha",
          sourceType: "general",
          markets: ["global"],
          enabledByDefault: true,
          selectors: { item: ".job" },
          internalSecret: "must-not-survive",
        },
      ],
    };
    const result = parseSourceCatalog(payload);
    expect(result.ok).toBe(true);
    expect(result.sources[0] && "selectors" in result.sources[0]).toBe(false);
    expect(result.sources[0] && "internalSecret" in result.sources[0]).toBe(false);
  });

  it("rejects an unknown sourceType as a typed failure with zero trusted objects from it", () => {
    const payload = {
      sources: [
        {
          id: "fixture-bad",
          name: "Fixture Bad",
          sourceType: "darkweb",
          markets: ["global"],
          enabledByDefault: true,
        },
      ],
    };
    const result = parseSourceCatalog(payload);
    expect(result.ok).toBe(false);
    expect(result.sources).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.boardId).toBe("fixture-bad");
    expect(result.failures[0]?.index).toBe(0);
    expect(result.failures[0]?.path).toContain("sourceType");
  });

  it("rejects an unknown market with typed board, index, and path evidence", () => {
    const payload = {
      sources: [
        {
          id: "fixture-bad-market",
          name: "Fixture Bad Market",
          sourceType: "general",
          markets: ["atlantis"],
          enabledByDefault: true,
        },
      ],
    };
    const expectedFailure: Pick<SourceParseFailure, "boardId" | "index" | "path"> = {
      boardId: "fixture-bad-market",
      index: 0,
      path: "markets.0",
    };

    const result = parseSourceCatalog(payload);

    expect(result.ok).toBe(false);
    expect(result.sources).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject(expectedFailure);
  });

  it("rejects an empty markets array as a typed failure", () => {
    const payload = {
      sources: [
        {
          id: "fixture-nomarket",
          name: "Fixture NoMarket",
          sourceType: "general",
          markets: [],
          enabledByDefault: true,
        },
      ],
    };
    const result = parseSourceCatalog(payload);
    expect(result.ok).toBe(false);
    expect(result.sources).toEqual([]);
    expect(result.failures[0]?.boardId).toBe("fixture-nomarket");
    expect(result.failures[0]?.path).toContain("markets");
  });

  it("reports invalid payload shapes as a typed failure with no trusted objects", () => {
    for (const payload of [null, 42, {}, { sources: "nope" }, { sources: [null, "x"] }]) {
      const result = parseSourceCatalog(payload);
      expect(result.ok).toBe(false);
      expect(result.sources).toEqual([]);
      expect(result.failures.length).toBeGreaterThan(0);
    }
  });

  it("keeps valid siblings while reporting malformed entries in a mixed payload", () => {
    const payload = {
      sources: [
        {
          id: "fixture-good",
          name: "Fixture Good",
          sourceType: "remote_board",
          markets: ["europe"],
          enabledByDefault: true,
        },
        {
          id: "fixture-bad-type",
          name: "Bad Type",
          sourceType: "darkweb",
          markets: ["global"],
          enabledByDefault: true,
        },
        {
          id: "fixture-bad-markets",
          name: "Bad Markets",
          sourceType: "general",
          markets: [],
          enabledByDefault: true,
        },
      ],
    };
    const result = parseSourceCatalog(payload);
    expect(result.ok).toBe(false);
    expect(idsOf(result.sources)).toEqual(["fixture-good"]);
    expect(result.failures.map((f) => f.boardId)).toEqual(["fixture-bad-type", "fixture-bad-markets"]);
  });

  it("returns parsed sources that are frozen at runtime", () => {
    const result = parseSourceCatalog({
      sources: [
        {
          id: "fixture-alpha",
          name: "Fixture Alpha",
          sourceType: "general",
          markets: ["global"],
          enabledByDefault: true,
        },
      ],
    });
    expect(Object.isFrozen(result.sources)).toBe(true);
    expect(Object.isFrozen(result.sources[0])).toBe(true);
    expect(Object.isFrozen(result.sources[0]?.markets)).toBe(true);
  });
});
