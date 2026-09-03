import { z } from "zod";
import type {
  CrawlerChannel,
  CrawlerRegion,
  SourceAttribution,
  SourceAuthMode,
  SourceCapability,
  SourceCrawlPolicy,
  SourceHealthStatus,
} from "./crawler/contracts";

/* ------------------------------------------------------------------ *
 * Taxonomy unions — single source of truth for the filter axes.
 * Structural contract mirrors the v2 source registry & contracts.
 * ------------------------------------------------------------------ */

export const SOURCE_TYPES = ["general", "remote_board", "community"] as const;
export const MARKETS = [
  "global",
  "americas",
  "europe",
  "mena",
  "africa",
  "apac",
] as const;
export const EXPERIENCE_LEVELS = ["entry", "mid", "senior", "all"] as const;
export const WORK_MODES = ["remote", "hybrid", "onsite", "all"] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];
export type Market = (typeof MARKETS)[number];
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export type WorkMode = (typeof WORK_MODES)[number];

/** Selectable values per control; the two axes without a native "all" add one. */
export type SourceTypeSelection = SourceType | "all";
export type MarketSelection = Market | "all";

/* ------------------------------------------------------------------ *
 * Exhaustive labels — Record keys are compiler-checked against the unions.
 * ------------------------------------------------------------------ */

export const SOURCE_TYPE_LABELS: Readonly<Record<SourceType, string>> = Object.freeze({
  general: "General",
  remote_board: "Remote boards",
  community: "Community",
});

export const MARKET_LABELS: Readonly<Record<Market, string>> = Object.freeze({
  global: "Global",
  americas: "Americas",
  europe: "Europe",
  mena: "MENA",
  africa: "Africa",
  apac: "APAC",
});

export const EXPERIENCE_LABELS: Readonly<Record<ExperienceLevel, string>> = Object.freeze({
  entry: "Entry level",
  mid: "Mid level",
  senior: "Senior",
  all: "All experience",
});

export const WORK_MODE_LABELS: Readonly<Record<WorkMode, string>> = Object.freeze({
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  all: "Any work mode",
});

const ALL_OPTION_LABELS: Readonly<Record<"sourceType" | "market", string>> = Object.freeze({
  sourceType: "All source types",
  market: "All markets",
});

/* ------------------------------------------------------------------ *
 * Parsed source card and option shapes.
 * ------------------------------------------------------------------ */

export interface TaxonomySource {
  readonly id: string;
  readonly name: string;
  readonly channel?: CrawlerChannel;
  readonly connector?: string;
  readonly regions?: readonly CrawlerRegion[];
  readonly countryCodes?: readonly string[];
  readonly languages?: readonly string[];
  readonly capabilities?: readonly SourceCapability[];
  readonly authMode?: SourceAuthMode;
  readonly crawlPolicy?: SourceCrawlPolicy;
  readonly cadenceMinutes?: number;
  readonly perDomainRps?: number;
  readonly termsUrl?: string;
  readonly attribution?: SourceAttribution;
  readonly health?: SourceHealthStatus;
  readonly description?: string;
  readonly sourceType: SourceType;
  readonly markets: readonly Market[];
  readonly experience: ExperienceLevel;
  readonly workMode: WorkMode;
  readonly enabledByDefault: boolean;
}

export type CrawlerSourceForControls = TaxonomySource & {
  category?: string;
  type?: "static" | "stealth" | "posts";
  url?: string;
  note?: string;
};

export interface FilterOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

export interface SourceFilterSelection {
  readonly sourceType: SourceTypeSelection;
  readonly market: MarketSelection;
  readonly experience: ExperienceLevel;
  readonly workMode: WorkMode;
}

export const DEFAULT_FILTER_SELECTION: Readonly<SourceFilterSelection> = Object.freeze({
  sourceType: "all",
  market: "all",
  experience: "all",
  workMode: "all",
});

function toOptions<Value extends string>(
  values: readonly Value[],
  labels: Readonly<Record<Value, string>>
): readonly FilterOption<Value>[] {
  return Object.freeze(values.map((value) => Object.freeze({ value, label: labels[value] })));
}

const SOURCE_TYPE_OPTIONS: readonly FilterOption<SourceTypeSelection>[] = Object.freeze([
  Object.freeze({ value: "all", label: ALL_OPTION_LABELS.sourceType }),
  ...toOptions(SOURCE_TYPES, SOURCE_TYPE_LABELS),
]);

const MARKET_OPTIONS: readonly FilterOption<MarketSelection>[] = Object.freeze([
  Object.freeze({ value: "all", label: ALL_OPTION_LABELS.market }),
  ...toOptions(MARKETS, MARKET_LABELS),
]);

const EXPERIENCE_OPTIONS: readonly FilterOption<ExperienceLevel>[] = toOptions(
  EXPERIENCE_LEVELS,
  EXPERIENCE_LABELS
);

const WORK_MODE_OPTIONS: readonly FilterOption<WorkMode>[] = toOptions(WORK_MODES, WORK_MODE_LABELS);

export function getSourceTypeOptions(): readonly FilterOption<SourceTypeSelection>[] {
  return SOURCE_TYPE_OPTIONS;
}

export function getMarketOptions(): readonly FilterOption<MarketSelection>[] {
  return MARKET_OPTIONS;
}

export function getExperienceOptions(): readonly FilterOption<ExperienceLevel>[] {
  return EXPERIENCE_OPTIONS;
}

export function getWorkModeOptions(): readonly FilterOption<WorkMode>[] {
  return WORK_MODE_OPTIONS;
}

export interface FilterOptionSet {
  readonly sourceTypes: readonly FilterOption<SourceTypeSelection>[];
  readonly markets: readonly FilterOption<MarketSelection>[];
  readonly experiences: readonly FilterOption<ExperienceLevel>[];
  readonly workModes: readonly FilterOption<WorkMode>[];
}

/**
 * Static options for the sidecar-unavailable (503) path. These are filter
 * controls only — no source cards or IDs are ever fabricated here.
 */
export function getFallbackFilterOptions(): FilterOptionSet {
  return {
    sourceTypes: getSourceTypeOptions(),
    markets: getMarketOptions(),
    experiences: getExperienceOptions(),
    workModes: getWorkModeOptions(),
  };
}

/* ------------------------------------------------------------------ *
 * Zod boundary parsing — untrusted API payload in, typed result out.
 * ------------------------------------------------------------------ */

const SourcesPayloadSchema = z.object({
  schemaVersion: z.number().optional(),
  sources: z.array(z.unknown()),
});

const BoardIdPeekSchema = z.object({ id: z.string() });

const RawEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  channel: z.enum(["ats", "aggregator", "regional", "community", "directory"]).optional(),
  connector: z.string().optional(),
  regions: z.array(z.enum(MARKETS)).optional(),
  markets: z.array(z.enum(MARKETS)).optional(),
  countryCodes: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  capabilities: z.array(z.string()).optional(),
  authMode: z.enum(["none", "optional_key", "required_key", "user_session"]).optional(),
  crawlPolicy: z.enum(["automatic", "manual_only", "disabled"]).optional(),
  cadenceMinutes: z.number().optional(),
  perDomainRps: z.number().optional(),
  termsUrl: z.string().optional(),
  attribution: z.object({ name: z.string(), url: z.string(), licenseNotice: z.string().optional(), termsUrl: z.string().optional() }).optional(),
  health: z.enum(["healthy", "degraded", "unconfigured", "manual_only", "disabled", "circuit_open"]).optional(),
  description: z.string().optional(),
  sourceType: z.enum(SOURCE_TYPES).optional(),
  experience: z.enum(EXPERIENCE_LEVELS).default("all"),
  workMode: z.enum(WORK_MODES).default("all"),
  enabledByDefault: z.boolean().default(true),
}).passthrough();

export const TaxonomySourceSchema = RawEntrySchema.transform((raw) => {
  const regions: Market[] = raw.regions && raw.regions.length > 0
    ? raw.regions
    : raw.markets && raw.markets.length > 0
    ? raw.markets
    : ["global"];

  let derivedSourceType: SourceType = raw.sourceType ?? "general";
  if (!raw.sourceType && raw.channel) {
    if (raw.channel === "community") {
      derivedSourceType = "community";
    } else if (raw.channel === "aggregator") {
      derivedSourceType = "remote_board";
    } else {
      derivedSourceType = "general";
    }
  }
  const result: Record<string, unknown> = {
    id: raw.id,
    name: raw.name,
    sourceType: derivedSourceType,
    markets: regions,
    experience: raw.experience,
    workMode: raw.workMode,
    enabledByDefault: raw.enabledByDefault,
  };

  if (raw.channel !== undefined) result.channel = raw.channel;
  if (raw.connector !== undefined) result.connector = raw.connector;
  if (raw.regions !== undefined) result.regions = regions;
  if (raw.countryCodes !== undefined) result.countryCodes = raw.countryCodes;
  if (raw.languages !== undefined) result.languages = raw.languages;
  if (raw.capabilities !== undefined) result.capabilities = raw.capabilities;
  if (raw.authMode !== undefined) result.authMode = raw.authMode;
  if (raw.crawlPolicy !== undefined) result.crawlPolicy = raw.crawlPolicy;
  if (raw.cadenceMinutes !== undefined) result.cadenceMinutes = raw.cadenceMinutes;
  if (raw.perDomainRps !== undefined) result.perDomainRps = raw.perDomainRps;
  if (raw.termsUrl !== undefined) result.termsUrl = raw.termsUrl;
  if (raw.attribution !== undefined) result.attribution = raw.attribution;
  if (raw.health !== undefined) result.health = raw.health;
  if (raw.description !== undefined) result.description = raw.description;

  return result as unknown as TaxonomySource;
});

export interface SourceParseFailure {
  /** Position in the upstream array; null when the payload shape itself was invalid. */
  readonly index: number | null;
  /** Best-effort board id from the malformed entry; null when unreadable. */
  readonly boardId: string | null;
  readonly path: string;
  readonly message: string;
}

export interface SourceCatalogParse {
  /** True only when the payload was valid AND every entry parsed. */
  readonly ok: boolean;
  /** Only fully validated entries; malformed objects contribute nothing here. */
  readonly sources: readonly TaxonomySource[];
  readonly failures: readonly SourceParseFailure[];
}

function summarizeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

export function parseSourceCatalog(payload: unknown): SourceCatalogParse {
  const payloadResult = SourcesPayloadSchema.safeParse(payload);
  if (!payloadResult.success) {
    return {
      ok: false,
      sources: [],
      failures: [
        {
          index: null,
          boardId: null,
          path: "sources",
          message: summarizeIssues(payloadResult.error),
        },
      ],
    };
  }

  const sources: TaxonomySource[] = [];
  const failures: SourceParseFailure[] = [];
  payloadResult.data.sources.forEach((entry, index) => {
    if (typeof entry === "object" && entry !== null) {
      const e = entry as Record<string, unknown>;
      const hasMarketsKey = "markets" in e;
      const hasRegions = Array.isArray(e.regions) && e.regions.length > 0;
      const hasMarkets = Array.isArray(e.markets) && e.markets.length > 0;
      if (!hasRegions && !hasMarkets) {
        const peek = BoardIdPeekSchema.safeParse(entry);
        failures.push({
          index,
          boardId: peek.success ? peek.data.id : null,
          path: hasMarketsKey ? "markets" : "regions",
          message: "Array must contain at least 1 element(s)",
        });
        return;
      }
    }

    const entryResult = TaxonomySourceSchema.safeParse(entry);
    if (entryResult.success) {
      const data: Record<string, unknown> = {
        ...entryResult.data,
        markets: Object.freeze([...entryResult.data.markets]),
      };
      if (entryResult.data.regions) {
        data.regions = Object.freeze([...entryResult.data.regions]);
      }
      sources.push(Object.freeze(data) as unknown as TaxonomySource);
      return;
    }
    const peek = BoardIdPeekSchema.safeParse(entry);
    failures.push({
      index,
      boardId: peek.success ? peek.data.id : null,
      path: entryResult.error.issues[0]?.path.join(".") ?? "",
      message: summarizeIssues(entryResult.error),
    });
  });

  return {
    ok: failures.length === 0,
    sources: Object.freeze(sources),
    failures: Object.freeze(failures),
  };
}

/* ------------------------------------------------------------------ *
 * Pure filtering — four independent dimensions, catalog order preserved.
 * ------------------------------------------------------------------ */

export function applySourceFilters(
  sources: readonly TaxonomySource[],
  selection: SourceFilterSelection
): readonly TaxonomySource[] {
  return Object.freeze(
    sources.filter((source) => {
      if (selection.sourceType !== "all" && source.sourceType !== selection.sourceType) return false;
      if (selection.market !== "all" && !source.markets.includes(selection.market)) return false;
      if (selection.experience !== "all" && source.experience !== selection.experience) return false;
      if (selection.workMode !== "all" && source.workMode !== selection.workMode) return false;
      return true;
    })
  );
}
