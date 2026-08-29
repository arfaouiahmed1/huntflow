import { beforeEach, describe, expect, it } from "vitest";
import { memoryRepo } from "@/lib/db";
import { embedMemory, relevantMemory } from "@/lib/agents/memory";
import { cosine, localEmbed } from "@/lib/vault/embeddings";

/**
 * Deterministic ranking proof for relevantMemory (task 40 — the trunk's proof).
 *
 * Score contract (src/lib/agents/memory.ts):
 *   score = jobScore(40 if jobId ∈ jobIds)
 *         + runScore(12 if runId matches)
 *         + overlap*4          (query terms ∩ content+source terms, ≥3 chars)
 *         + importance*6       (clamped ≥ 0)
 *         + globalDecision(3 for jobless decision/fact/outcome)
 *         + recency(max(0, 2 - candidateIndex/100))
 *         + cosine(c*12 when model+queryEmbedding match stored model — strict guard)
 *   TTL: candidates with expiresAt <= nowIso are dropped unless includeExpired.
 *
 * No mocks: every test seeds the real temp SQLite DB (vitest.setup.ts isolates
 * HUNTFLOW_DB_PATH per worker) and calls the real ranker. Determinism comes
 * from explicit `nowIso` / `expiresAt` values instead of the wall clock.
 */

const NOW = "2026-06-01T12:00:00.000Z";
const FUTURE = "2026-09-01T00:00:00.000Z";
const PAST = "2025-01-01T00:00:00.000Z";

function seed(entry: {
  kind: "note" | "insight" | "fact" | "decision" | "outcome";
  content: string;
  jobId?: string;
  runId?: string;
  source?: string;
  importance?: number;
  expiresAt?: string;
}) {
  return memoryRepo.add({
    kind: entry.kind,
    content: entry.content,
    jobId: entry.jobId,
    runId: entry.runId,
    source: entry.source ?? "test",
    importance: entry.importance ?? 0,
    expiresAt: entry.expiresAt ?? null,
  });
}

describe("relevantMemory deterministic ranking (jobScore 40 + overlap*4 + importance*6)", () => {
  beforeEach(() => {
    memoryRepo.wipe();
  });

  it("jobScore 40 dominates: a job-scoped memory beats a newer, higher-importance global memory", () => {
    const query = "langgraph retrieval evaluation";
    // Insertion order fixes ids ascending; candidates list id DESC so the last
    // inserted gets recencyIndex 0 (recency 2.0), earlier ones trail slightly.
    const globalOld = seed({
      kind: "fact",
      content: "LangGraph agent evaluation with retrieval benchmarks",
      importance: 0,
    }); // oldest → recency ~1.98
    const jobScoped = seed({
      kind: "fact",
      content: "LangGraph agent evaluation with retrieval benchmarks",
      jobId: "job-1",
      importance: 0,
    }); // middle → recency ~1.99
    const globalBoosted = seed({
      kind: "fact",
      content: "LangGraph agent evaluation with retrieval benchmarks",
      importance: 5,
    }); // newest → recency 2.0

    const ranked = relevantMemory({ query, jobIds: ["job-1"], nowIso: NOW });

    // jobScoped: 40 + 2*4 + 0 + ~1.99 ≈ 53.99
    // globalBoosted: 2*4 + 30(importance*6) + 3(global fact) + 2.0 ≈ 47.00
    // globalOld: 2*4 + 3 + ~1.98 ≈ 16.98
    // 40 > 30 + 3 + full recency swing ⇒ job dominance is structural, not recency luck.
    expect(ranked.map((m) => m.id)).toEqual([jobScoped.id, globalBoosted.id, globalOld.id]);
  });

  it("importance*6 orders equal-overlap globals independent of recency (newer low-importance loses)", () => {
    const query = "salary negotiation benchmarks";
    const high = seed({
      kind: "fact",
      content: "Salary negotiation benchmarks for product managers",
      importance: 5,
    }); // inserted FIRST (oldest)
    const mid = seed({
      kind: "fact",
      content: "Salary negotiation benchmarks for product managers",
      importance: 3,
    });
    const low = seed({
      kind: "fact",
      content: "Salary negotiation benchmarks for product managers",
      importance: 2,
    }); // newest

    const ranked = relevantMemory({ query, nowIso: NOW });

    // All three share identical overlap/kind; only importance differs (30/18/12).
    // Recency favors exactly the reverse order (low newest), yet importance*6 wins:
    // one importance step = 6 pts > max recency delta (~0.02 over tiny candidate sets).
    expect(ranked.map((m) => m.id)).toEqual([high.id, mid.id, low.id]);
  });

  it("overlap*4 separates equally-important memories by query-term coverage", () => {
    const query = "kubernetes deployment pipeline";
    const partial = seed({
      kind: "note",
      content: "Kubernetes cluster notes",
      importance: 3,
    }); // overlap 1 (kubernetes)
    const full = seed({
      kind: "note",
      content: "Kubernetes deployment pipeline rollback automation",
      importance: 3,
    }); // overlap 3

    const ranked = relevantMemory({ query, nowIso: NOW });
    const rankedIds = ranked.map((m) => m.id);

    // full: 3*4=12 vs partial: 1*4=4 — an 8-pt gap swamps any recency difference.
    expect(rankedIds[0]).toBe(full.id);
    expect(rankedIds).toContain(partial.id);
    expect(rankedIds.indexOf(full.id)).toBeLessThan(rankedIds.indexOf(partial.id));
  });

  it("TTL filter excludes expired short-term memories; boundary expiresAt === now is expired (strict >)", () => {
    const query = "onboarding checklist security";
    const live = seed({
      kind: "note",
      content: "Onboarding checklist security review",
      expiresAt: FUTURE,
    });
    const boundary = seed({
      kind: "note",
      content: "Onboarding checklist security review",
      expiresAt: NOW, // exactly now → NOT > now → excluded
    });
    const expired = seed({
      kind: "note",
      content: "Onboarding checklist security review",
      expiresAt: PAST,
    });

    // Sanity: all three rows exist in the DB (filter happens in relevantMemory).
    expect(memoryRepo.list({ includeExpired: true })).toHaveLength(3);

    const default_ = relevantMemory({ query, nowIso: NOW });
    expect(default_.map((m) => m.id)).toEqual([live.id]);

    const including = relevantMemory({ query, nowIso: NOW, includeExpired: true });
    // Newest-first among the included set (ids descend with insertion order).
    expect(including.map((m) => m.id)).toEqual([expired.id, boundary.id, live.id]);
  });

  it("runId bonus (+12) lets an older run-scoped memory overtake a newer non-matching one", () => {
    const query = "flaky retry backoff";
    const runA = seed({
      kind: "note",
      content: "Flaky retry backoff investigation",
      runId: "run-A",
    }); // older
    const runB = seed({
      kind: "note",
      content: "Flaky retry backoff investigation",
      runId: "run-B",
    }); // newer

    // Without runId: recency decides → newer runB first.
    const neutral = relevantMemory({ query, nowIso: NOW });
    expect(neutral.map((m) => m.id)).toEqual([runB.id, runA.id]);

    // With runId "run-A": +12 flips the order despite the recency disadvantage.
    const scoped = relevantMemory({ query, runId: "run-A", nowIso: NOW });
    expect(scoped.map((m) => m.id)).toEqual([runA.id, runB.id]);
  });

  it("cosine adds c*12 only under a strict model match (local/openai spaces never mix)", () => {
    const query = "alpha beta";
    const dGamma = seed({ kind: "note", content: "Alpha beta gamma summary" }); // older
    const dDelta = seed({ kind: "note", content: "Alpha beta delta summary" }); // newer

    // Baseline without embeddings: equal overlap (2 each) + equal importance ⇒ recency wins.
    const baseline = relevantMemory({ query, nowIso: NOW });
    expect(baseline.map((m) => m.id)).toEqual([dDelta.id, dGamma.id]);

    embedMemory(dGamma.id!, localEmbed("alpha beta gamma"), "local");
    embedMemory(dDelta.id!, localEmbed("alpha beta delta"), "openai|text-embedding-3-small");

    // Model guard: querying in the "local" space must ignore the openai-space vector.
    // dGamma gets cosine(localEmbed(q), localEmbed(dGamma)) * 12 > 0 and overtakes dDelta;
    // dDelta's mismatched embedding contributes nothing.
    const guarded = relevantMemory({
      query,
      model: "local",
      queryEmbedding: localEmbed("alpha beta"),
      nowIso: NOW,
    });
    expect(guarded[0].id).toBe(dGamma.id);
    expect(guarded.map((m) => m.id)).toContain(dDelta.id);

    // The boost is real cosine affinity, not presence of an embedding map:
    // orthogonal-ish vectors stay below the delta needed to flip recency.
    const qv = localEmbed("alpha beta");
    const cGamma = cosine(qv, localEmbed("alpha beta gamma"));
    expect(cGamma).toBeGreaterThan(0);
  });
});
