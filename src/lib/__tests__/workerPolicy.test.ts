import { describe, expect, it } from "vitest";
import {
  WORKER_DEFAULT_CADENCE_MINUTES,
  WORKER_DEFAULT_CONCURRENCY,
  WORKER_JITTER_RATIO,
  canRunSource,
  clampWorkerConcurrency,
  computeNextRun,
  hashSalt,
  isDue,
  jitterMs,
  selectDueSearches,
} from "@/lib/crawler/workerPolicy";

const NOW = Date.parse("2026-09-08T12:00:00.000Z");

describe("worker schedule policy", () => {
  it("treats missing or unparsable schedules as due", () => {
    expect(isDue(null, NOW)).toBe(true);
    expect(isDue(undefined, NOW)).toBe(true);
    expect(isDue("not-a-date", NOW)).toBe(true);
    expect(isDue(new Date(NOW - 1000).toISOString(), NOW)).toBe(true);
    expect(isDue(new Date(NOW).toISOString(), NOW)).toBe(true);
    expect(isDue(new Date(NOW + 60_000).toISOString(), NOW)).toBe(false);
  });

  it("jitter is deterministic and bounded by the ratio", () => {
    const cadence = 180;
    const bound = cadence * 60 * 1000 * WORKER_JITTER_RATIO;
    expect(jitterMs(cadence, 7)).toBe(jitterMs(cadence, 7));
    for (const salt of [0, 1, 42, 999, 123456]) {
      expect(Math.abs(jitterMs(cadence, salt))).toBeLessThanOrEqual(bound);
    }
    // Distinct salts decorrelate schedules sharing a cadence.
    const values = new Set([0, 1, 2, 3, 4].map((s) => jitterMs(cadence, s)));
    expect(values.size).toBeGreaterThan(1);
  });

  it("computes the next run one cadence out plus jitter", () => {
    const next = Date.parse(computeNextRun(180, NOW, 7));
    const base = NOW + 180 * 60 * 1000;
    expect(Math.abs(next - base)).toBeLessThanOrEqual(180 * 60 * 1000 * WORKER_JITTER_RATIO);
  });

  it("selects only enabled due searches, oldest-due first, capped", () => {
    const searches = [
      { id: "future", enabled: true, nextRunAt: new Date(NOW + 3600_000).toISOString(), lastRunAt: null },
      { id: "disabled-due", enabled: false, nextRunAt: new Date(NOW - 10_000).toISOString(), lastRunAt: null },
      { id: "older", enabled: true, nextRunAt: new Date(NOW - 20_000).toISOString(), lastRunAt: null },
      { id: "newer", enabled: true, nextRunAt: new Date(NOW - 5_000).toISOString(), lastRunAt: null },
      { id: "never", enabled: true, nextRunAt: null, lastRunAt: null },
    ];
    const picked = selectDueSearches(searches, NOW, 10);
    expect(picked.map((s) => s.id)).toEqual(["never", "older", "newer"]);
    expect(selectDueSearches(searches, NOW, 2)).toHaveLength(2);
  });

  it("gates sources on open circuits and future schedules", () => {
    expect(canRunSource(null, NOW)).toBe(true);
    expect(canRunSource(undefined, NOW)).toBe(true);
    expect(
      canRunSource({ sourceId: "a", circuitOpenUntil: new Date(NOW + 60_000).toISOString() }, NOW)
    ).toBe(false);
    expect(
      canRunSource({ sourceId: "a", circuitOpenUntil: new Date(NOW - 1000).toISOString() }, NOW)
    ).toBe(true);
    expect(canRunSource({ sourceId: "b", nextRunAt: new Date(NOW + 60_000).toISOString() }, NOW)).toBe(false);
    expect(canRunSource({ sourceId: "b", nextRunAt: new Date(NOW - 60_000).toISOString() }, NOW)).toBe(true);
  });

  it("clamps worker concurrency into the boring-safe band", () => {
    expect(clampWorkerConcurrency(undefined)).toBe(WORKER_DEFAULT_CONCURRENCY);
    expect(clampWorkerConcurrency(0)).toBe(1);
    expect(clampWorkerConcurrency(2)).toBe(2);
    expect(clampWorkerConcurrency(99)).toBe(4);
    expect(clampWorkerConcurrency("nope")).toBe(WORKER_DEFAULT_CONCURRENCY);
  });

  it("hashSalt is deterministic across calls", () => {
    expect(hashSalt("search_1")).toBe(hashSalt("search_1"));
    expect(hashSalt("search_1")).not.toBe(hashSalt("search_2"));
    expect(WORKER_DEFAULT_CADENCE_MINUTES).toBe(180);
  });
});
