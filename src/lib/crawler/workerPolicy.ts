/**
 * HUNTFLOW crawler worker — pure schedule policy helpers.
 *
 * Boring by design: the continuous worker only crawls a saved search when it
 * is *due* (nextRunAt passed), staggers runs with jitter, keeps concurrency
 * at 1 by default, and backs off sources whose circuit breaker is open.
 * No timers, no I/O here — the worker executable and API routes consume these.
 */

export const WORKER_DEFAULT_CADENCE_MINUTES = 180;
export const WORKER_DEFAULT_CONCURRENCY = 1;
export const WORKER_DEFAULT_POLL_SECONDS = 60;
export const WORKER_JITTER_RATIO = 0.2;
export const WORKER_MAX_CONCURRENCY = 4;

export interface DueSearchLike {
  id: string;
  enabled: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
}

export interface SourceGateLike {
  sourceId: string;
  nextRunAt?: string | null;
  circuitOpenUntil?: string | null;
  consecutiveFailures?: number;
}

/** True when `nextRunAt` is missing (never ran) or lies at/before `nowMs`. */
export function isDue(nextRunAt: string | null | undefined, nowMs: number): boolean {
  if (!nextRunAt) return true;
  const t = Date.parse(nextRunAt);
  if (Number.isNaN(t)) return true;
  return t <= nowMs;
}

/**
 * Deterministic jitter in ms for a cadence: `±ratio * cadence`.
 * `salt` decorrelates searches that share a cadence (pass a hash of the id).
 */
export function jitterMs(cadenceMinutes: number, salt = 0, ratio = WORKER_JITTER_RATIO): number {
  const base = Math.max(1, cadenceMinutes) * 60 * 1000;
  const boundedSalt = ((salt % 1000) + 1000) % 1000;
  const centered = boundedSalt / 1000 - 0.5;
  return Math.round(centered * 2 * ratio * base);
}

/** Next run timestamp for a cadence starting at `nowMs`, with decorrelating jitter. */
export function computeNextRun(cadenceMinutes: number, nowMs: number, salt = 0): string {
  const base = Math.max(1, cadenceMinutes) * 60 * 1000;
  return new Date(nowMs + base + jitterMs(cadenceMinutes, salt)).toISOString();
}

/** Enabled searches whose schedule is due, oldest-due first, capped at `limit`. */
export function selectDueSearches<T extends DueSearchLike>(searches: T[], nowMs: number, limit = 1): T[] {
  return searches
    .filter((s) => s.enabled && isDue(s.nextRunAt, nowMs))
    .sort((a, b) => {
      const at = a.nextRunAt ? Date.parse(a.nextRunAt) : 0;
      const bt = b.nextRunAt ? Date.parse(b.nextRunAt) : 0;
      return at - bt;
    })
    .slice(0, Math.max(1, limit));
}

/** True when a source may be crawled now: no open circuit and no future nextRunAt. */
export function canRunSource(state: SourceGateLike | null | undefined, nowMs: number): boolean {
  if (!state) return true;
  if (state.circuitOpenUntil) {
    const openUntil = Date.parse(state.circuitOpenUntil);
    if (!Number.isNaN(openUntil) && openUntil > nowMs) return false;
  }
  if (state.nextRunAt) {
    const next = Date.parse(state.nextRunAt);
    if (!Number.isNaN(next) && next > nowMs) return false;
  }
  return true;
}

/** Clamp an operator-provided concurrency into the boring-safe band. */
export function clampWorkerConcurrency(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return WORKER_DEFAULT_CONCURRENCY;
  return Math.min(Math.max(Math.floor(n), 1), WORKER_MAX_CONCURRENCY);
}

/** Simple string hash for jitter salts (FNV-1a, 32-bit). */
export function hashSalt(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash);
}
