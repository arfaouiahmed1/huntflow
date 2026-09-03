import { agentStateRepo } from "@/lib/db";

export interface CachedCompanyResearch {
  companyKey: string;
  research: unknown;
  cachedAt: number;
  expiresAt: number;
  source: "cache" | "live";
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_AGENT = "company_intel";
const CACHE_KEY = "company_research_cache";
const MAX_ENTRIES = 200;

const memoryCache = new Map<string, CachedCompanyResearch>();
let hydrated = false;

function isExpired(entry: CachedCompanyResearch, now: number = Date.now()): boolean {
  return now >= entry.expiresAt;
}

function tryHydrateFromDb(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = agentStateRepo.get(CACHE_AGENT, CACHE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    const entries: Array<[string, CachedCompanyResearch]> = [];

    if (Array.isArray(parsed)) {
      for (const item of parsed as unknown[]) {
        if (
          Array.isArray(item) &&
          item.length === 2 &&
          typeof item[0] === "string" &&
          item[1] !== null &&
          typeof item[1] === "object" &&
          "companyKey" in (item[1] as Record<string, unknown>) &&
          "cachedAt" in (item[1] as Record<string, unknown>) &&
          "expiresAt" in (item[1] as Record<string, unknown>)
        ) {
          entries.push([item[0] as string, item[1] as CachedCompanyResearch]);
        }
      }
    } else {
      const record = parsed as Record<string, unknown>;
      for (const [k, v] of Object.entries(record)) {
        if (
          v !== null &&
          typeof v === "object" &&
          "companyKey" in (v as Record<string, unknown>) &&
          "cachedAt" in (v as Record<string, unknown>) &&
          "expiresAt" in (v as Record<string, unknown>)
        ) {
          const entry = v as CachedCompanyResearch;
          if (
            typeof entry.companyKey === "string" &&
            typeof entry.cachedAt === "number" &&
            typeof entry.expiresAt === "number"
          ) {
            entries.push([k, entry]);
          }
        }
      }
    }

    const now = Date.now();
    for (const [k, entry] of entries) {
      if (isExpired(entry, now)) continue;
      memoryCache.set(k, entry);
    }

    if (memoryCache.size > MAX_ENTRIES) {
      const sorted = [...memoryCache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt);
      const excess = memoryCache.size - MAX_ENTRIES;
      for (let i = 0; i < excess; i++) {
        memoryCache.delete(sorted[i][0]);
      }
    }
  } catch {
    // ignore hydration errors — in-memory cache remains authoritative
  }
}

function tryPersistToDb(): void {
  try {
    const obj: Record<string, CachedCompanyResearch> = {};
    for (const [k, v] of memoryCache.entries()) {
      obj[k] = v;
    }
    agentStateRepo.set(CACHE_AGENT, CACHE_KEY, JSON.stringify(obj));
  } catch {
    // optional sync — ignore persistence failures (e.g., no DB in some test envs)
  }
}

/**
 * Extracts a clean domain from a URL string.
 * Examples:
 *  - "https://fusionauth.io/careers/senior-eng" -> "fusionauth.io"
 *  - "http://www.example.com/path?x=1" -> "example.com"
 *  - "fusionauth.io/careers" -> "fusionauth.io"
 * Returns null for missing, empty, or invalid inputs.
 */
export function extractCompanyDomain(url?: string): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const hasProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed);
    const toParse = hasProtocol ? trimmed : `https://${trimmed}`;
    const parsed = new URL(toParse);
    let hostname = parsed.hostname.toLowerCase().trim();
    if (!hostname) return null;
    hostname = hostname.replace(/\.+$/, "");
    if (hostname.startsWith("www.")) hostname = hostname.slice(4);
    if (!hostname.includes(".")) return null;
    if (!/^[a-z0-9.-]+$/.test(hostname)) return null;
    const labels = hostname.split(".");
    for (const label of labels) {
      if (!label || label.startsWith("-") || label.endsWith("-")) return null;
    }
    return hostname;
  } catch {
    return null;
  }
}

/**
 * Normalizes a company name and optional URL into a deterministic cache key.
 * - Lowercases, trims, collapses whitespace/punctuation, hyphenates.
 * - If a URL is provided, appends the clean domain as "::domain".
 * Handles spaces, uppercase, punctuation, and URLs deterministically.
 */
export function normalizeCompanyKey(companyName: string, companyUrl?: string): string {
  const raw = companyName ?? "";
  const normalizedName = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");

  const domain = extractCompanyDomain(companyUrl);
  if (domain) {
    const normalizedDomain = domain.toLowerCase().trim();
    if (!normalizedName) return normalizedDomain;
    // Avoid duplicating if name already encodes the domain (e.g., "fusionauth io" vs "fusionauth.io")
    const nameAsDomainDash = normalizedDomain.replace(/\./g, "-");
    if (normalizedName === nameAsDomainDash) return normalizedName;
    return `${normalizedName}::${normalizedDomain}`;
  }
  return normalizedName;
}

export function getCompanyResearchFromCache(
  companyName: string,
  companyUrl?: string
): CachedCompanyResearch | null {
  tryHydrateFromDb();
  const key = normalizeCompanyKey(companyName, companyUrl);
  if (!key) return null;
  const entry = memoryCache.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (isExpired(entry, now)) {
    memoryCache.delete(key);
    tryPersistToDb();
    return null;
  }
  return {
    ...entry,
    source: "cache",
  };
}

export function setCompanyResearchCache(
  companyName: string,
  research: unknown,
  companyUrl?: string,
  ttlMs?: number
): void {
  tryHydrateFromDb();
  const key = normalizeCompanyKey(companyName, companyUrl);
  if (!key) return;
  const ttl =
    typeof ttlMs === "number" && Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
  const now = Date.now();
  const entry: CachedCompanyResearch = {
    companyKey: key,
    research,
    cachedAt: now,
    expiresAt: now + ttl,
    source: "live",
  };
  memoryCache.set(key, entry);
  if (memoryCache.size > MAX_ENTRIES) {
    const sorted = [...memoryCache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    const excess = memoryCache.size - MAX_ENTRIES;
    for (let i = 0; i < excess; i++) {
      memoryCache.delete(sorted[i][0]);
    }
  }
  tryPersistToDb();
}

/**
 * Test-only helper to clear in-memory and persisted cache.
 * Not part of the public spec but useful for isolated tests.
 */
export function __clearCompanyResearchCacheForTests(): void {
  memoryCache.clear();
  hydrated = false;
  tryPersistToDb();
  // Rehydrate flag should allow next call to re-read (empty) state
  hydrated = true;
}
