import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseSourceCatalog } from "@/lib/sourceTaxonomy";

// ---------------------------------------------------------------------------
// Helpers — bounded, deterministic, no network
// ---------------------------------------------------------------------------

/** Read and parse scrapling-agent/sources.json from repo root. */
function loadRawCatalog(): Record<string, unknown> {
  // Resolve from cwd (vitest runs with cwd = repo root) and fallback to relative path
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

type RawBoard = {
  id: string;
  name: string;
  url: string;
  type: "static" | "stealth" | "posts";
  selectors: Record<string, string>;
  sourceType?: string;
  markets?: string[];
  experience?: string;
  workMode?: string;
  enabledByDefault?: boolean;
};

/** Flatten categorized sources.json into a plain array for parseSourceCatalog. */
function flattenForTaxonomy(raw: Record<string, unknown>): { sources: unknown[] } {
  const sources: unknown[] = [];
  for (const [category, boards] of Object.entries(raw)) {
    if (category.startsWith("_")) continue;
    if (!Array.isArray(boards)) continue;
    for (const b of boards as RawBoard[]) {
      sources.push(b);
    }
  }
  return { sources };
}

/** Flatten keeping raw board metadata (type + selectors) for smoke checks. */
function flattenRawBoards(raw: Record<string, unknown>): RawBoard[] {
  const out: RawBoard[] = [];
  for (const [category, boards] of Object.entries(raw)) {
    if (category.startsWith("_")) continue;
    if (!Array.isArray(boards)) continue;
    for (const b of boards as RawBoard[]) out.push(b);
  }
  return out;
}

/** Bounded selector/card smoke: resolvable without network. */
function isResolvableSelector(pattern: string): boolean {
  const p = pattern.trim();
  if (!p) return false;
  if (p === "text" || p === "href" || p === "domain") return true;
  // CSS-ish signals: class/id/attribute/pseudo/child combinator
  if (p.includes(".") || p.includes("[") || p.includes(">") || p.includes(":") || p.includes("#")) return true;
  // Bare element selector like "a", "h2", "article" — still resolvable if it looks like a tag
  // We keep the check conservative: at least one alphabetic char
  return /^[a-z][a-z0-9-]*$/i.test(p);
}

function isNonEmptyItem(selectorItem: unknown): boolean {
  return typeof selectorItem === "string" && selectorItem.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Task 6 — Requirement 1: 30-board catalog, zero typed failures, light defaults
// ---------------------------------------------------------------------------

describe("Task 6 — crawler catalog validation (parseSourceCatalog on sources.json)", () => {
  const raw = loadRawCatalog();
  const payload = flattenForTaxonomy(raw);
  const parsed = parseSourceCatalog(payload);

  it("yields exactly 30 parsed sources with zero typed failures", () => {
    expect(parsed.failures).toEqual([]);
    expect(parsed.ok).toBe(true);
    expect(parsed.sources).toHaveLength(30);
  });

  it("each crawl mechanism type (static/stealth/posts) has at least one entry", () => {
    const boards = flattenRawBoards(raw);
    const byType = boards.reduce<Record<string, number>>((acc, b) => {
      acc[b.type] = (acc[b.type] ?? 0) + 1;
      return acc;
    }, {});
    expect(byType["static"] ?? 0).toBeGreaterThanOrEqual(1);
    expect(byType["stealth"] ?? 0).toBeGreaterThanOrEqual(1);
    expect(byType["posts"] ?? 0).toBeGreaterThanOrEqual(1);
    // Exact current counts for evidence traceability
    expect(byType["static"]).toBe(21);
    expect(byType["stealth"]).toBe(7);
    expect(byType["posts"]).toBe(2);
  });

  it("enabledByDefault count is light (<=5) and health-like", () => {
    const enabled = parsed.sources.filter((s) => s.enabledByDefault);
    expect(enabled.length).toBeGreaterThan(0);
    expect(enabled.length).toBeLessThanOrEqual(5);
    // Health-like: enabled boards must be fast static ones, not stealth/posts,
    // and must have valid taxonomy markers already enforced by parseSourceCatalog.
    const rawBoards = flattenRawBoards(raw);
    const enabledRaw = rawBoards.filter((b) => b.enabledByDefault === true);
    expect(enabledRaw.length).toBe(enabled.length);
    expect(enabledRaw.length).toBe(4);
    for (const board of enabledRaw) {
      expect(board.type).toBe("static");
      expect(board.sourceType).toBeTruthy();
      expect(board.markets?.length).toBeGreaterThan(0);
      expect(isNonEmptyItem(board.selectors?.item)).toBe(true);
      expect(isResolvableSelector(board.selectors.item)).toBe(true);
    }
    // Ensure no unknown sourceType/market slipped through — parse already enforces
    // but we double-check health: enabled boards are remote_board/global (proven fast boards)
    for (const s of enabled) {
      expect(["general", "remote_board", "community"]).toContain(s.sourceType);
      expect(s.markets.length).toBeGreaterThan(0);
    }
  });

  it("no board is missing sourceType or markets (typed contract)", () => {
    const boards = flattenRawBoards(raw);
    const missing = boards.filter((b) => !b.sourceType || !b.markets || b.markets.length === 0);
    expect(missing).toEqual([]);
    // Also typed-parse level: zero failures already checked, but make it explicit
    expect(parsed.failures.length).toBe(0);
  });

  it("every board carries a non-empty id and name (hard health check)", () => {
    const boards = flattenRawBoards(raw);
    for (const b of boards) {
      expect(typeof b.id).toBe("string");
      expect(b.id.trim().length).toBeGreaterThan(0);
      expect(typeof b.name).toBe("string");
      expect(b.name.trim().length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Task 6 — Requirement 3: bounded selector/card smoke (no network)
// ---------------------------------------------------------------------------

describe("Task 6 — bounded selector/card smoke (no network, per mechanism)", () => {
  const raw = loadRawCatalog();
  const boards = flattenRawBoards(raw);

  function assertResolvableForType(type: RawBoard["type"]) {
    const candidates = boards.filter((b) => b.type === type);
    expect(candidates.length).toBeGreaterThan(0);
    const resolvable = candidates.filter(
      (b) => isNonEmptyItem(b.selectors?.item) && isResolvableSelector(b.selectors.item)
    );
    expect(resolvable.length).toBeGreaterThan(0);
    // Evidence: at least one concrete example per mechanism
    const example = resolvable[0]!;
    expect(example.selectors.item.trim().length).toBeGreaterThan(0);
    expect(isResolvableSelector(example.selectors.item)).toBe(true);
    return example;
  }

  it("at least one static board has non-empty selectors.item with resolvable pattern", () => {
    const ex = assertResolvableForType("static");
    expect(ex.type).toBe("static");
    // spot check a known fast board still marked enabled
    expect(boards.find((b) => b.id === "remotive")?.selectors.item).toBeTruthy();
  });

  it("at least one stealth board has non-empty selectors.item with resolvable pattern", () => {
    const ex = assertResolvableForType("stealth");
    expect(ex.type).toBe("stealth");
    // wellfound is a canonical stealth board
    expect(boards.find((b) => b.id === "wellfound")?.selectors.item).toContain("[");
  });

  it("at least one posts board has non-empty selectors.item with resolvable pattern", () => {
    const ex = assertResolvableForType("posts");
    expect(ex.type).toBe("posts");
    expect(ex.selectors.item).toContain(".");
  });

  it("every board — regardless of type — has a non-empty selectors.item and resolvable card selector", () => {
    // Bounded check: no network, just shape. All 30 should satisfy this currently.
    const bad = boards.filter(
      (b) => !isNonEmptyItem(b.selectors?.item) || !isResolvableSelector(b.selectors.item)
    );
    expect(bad).toEqual([]);
  });

  it("helper isResolvableSelector matches spec (contains '.' or '[' or is 'text'/'href')", () => {
    expect(isResolvableSelector(".job-card")).toBe(true);
    expect(isResolvableSelector("[data-testid='job-card']")).toBe(true);
    expect(isResolvableSelector("text")).toBe(true);
    expect(isResolvableSelector("href")).toBe(true);
    expect(isResolvableSelector("tr.athing.comtr")).toBe(true);
    expect(isResolvableSelector("")).toBe(false);
    expect(isResolvableSelector("   ")).toBe(false);
  });
});
