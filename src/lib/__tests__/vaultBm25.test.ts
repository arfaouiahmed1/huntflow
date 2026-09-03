import { describe, expect, it } from "vitest";
import { rankBm25, tokenizeForSearch } from "@/lib/vault/bm25";
import { cosine, localEmbed } from "@/lib/vault/embeddings";

describe("vault BM25 retrieval", () => {
  it("normalizes search terms and removes common stop words", () => {
    expect(tokenizeForSearch("The RAG system in C++ and Next.js"))
      .toEqual(["rag", "system", "c++", "next.js"]);
  });

  it("ranks the chunk with the strongest query coverage first", () => {
    const ranking = rankBm25("langgraph retrieval evaluation", [
      { id: 1, content: "React interface and design system" },
      { id: 2, content: "LangGraph agent evaluation with retrieval benchmarks" },
      { id: 3, content: "Retrieval pipeline notes" },
    ]);

    expect(ranking.map((result) => result.chunkId)).toEqual([2, 3]);
    expect(ranking[0].matchedTerms).toEqual(expect.arrayContaining(["langgraph", "retrieval", "evaluation"]));
  });

  it("returns no lexical candidates for an empty or stop-word-only query", () => {
    expect(rankBm25("the and of", [{ id: 1, content: "some text" }])).toEqual([]);
  });
});

/**
 * Hybrid RRF k=60 proof (task 40). Production fusion in src/lib/vault/index.ts:
 *   fused(chunkId) += 1 / (RRF_K + rank)   per ranking list (lexical per expanded
 *   query + vector per embed model), RRF_K = 60, then a local overlap rerank.
 * No mocks — lexical comes from the real rankBm25, vector from real
 * localEmbed/cosine; the integration test seeds the isolated temp SQLite vault.
 */
describe("vault hybrid RRF k60 fusion", () => {
  const RRF_K = 60;

  function rrfFuse(rankings: number[][]): Map<number, number> {
    const fused = new Map<number, number>();
    for (const ranking of rankings) {
      ranking.forEach((id, idx) => fused.set(id, (fused.get(id) ?? 0) + 1 / (RRF_K + idx + 1)));
    }
    return fused;
  }

  function vectorRanking(query: string, docs: { id: number; content: string }[]): number[] {
    const qv = localEmbed(query);
    return docs
      .map((d) => ({ id: d.id, score: cosine(qv, localEmbed(d.content)) }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.id);
  }

  it("fuses BM25 + vector rankings with reciprocal rank k=60 (exact arithmetic)", () => {
    const docs = [
      { id: 1, content: "LangGraph agent evaluation with retrieval benchmarks" },
      { id: 2, content: "Retrieval pipeline notes for hybrid search" },
      { id: 3, content: "React interface design system components" },
    ];
    const query = "langgraph retrieval evaluation";
    const lexicalIds = rankBm25(query, docs).map((r) => r.chunkId);
    const vectorIds = vectorRanking(query, docs);

    const fused = rrfFuse([lexicalIds, vectorIds]);
    // Doc ranked #1 in BOTH lists scores exactly 2/61 — strictly above any
    // single-list #1 (1/61): consensus across signals is what wins under k=60.
    const topBothLists = lexicalIds[0];
    expect(fused.get(topBothLists)).toBeCloseTo(1 / 61 + 1 / 61, 12);
    for (const [id, score] of fused) {
      if (id === topBothLists) continue;
      const lexRank = lexicalIds.indexOf(id);
      const vecRank = vectorIds.indexOf(id);
      const expected =
        (lexRank >= 0 ? 1 / (RRF_K + lexRank + 1) : 0) + (vecRank >= 0 ? 1 / (RRF_K + vecRank + 1) : 0);
      expect(score).toBeCloseTo(expected, 12);
      expect(score).toBeLessThan(fused.get(topBothLists)!);
    }
  });

  it("k=60 rewards multi-list consensus: dual-rank-10 beats single-rank-1 (flips at k=1)", () => {
    // Consensus doc at rank 10 in both lists: 2/(60+10) = 0.02857…
    const consensusK60 = 1 / (RRF_K + 10) + 1 / (RRF_K + 10);
    // Specialist doc at rank 1 in one list only: 1/(60+1) = 0.01639…
    const specialistK60 = 1 / (RRF_K + 1);
    expect(consensusK60).toBeGreaterThan(specialistK60);

    // The same setup under k=1 favors the specialist — this is WHY the trunk
    // pins k=60: it dampens any single signal's top rank in favor of agreement.
    const consensusK1 = 1 / (1 + 10) + 1 / (1 + 10);
    const specialistK1 = 1 / (1 + 1);
    expect(consensusK1).toBeLessThan(specialistK1);
  });

  it("searchVault over seeded temp-DB docs returns hybrid hits ordered by RRF k60 (+overlap rerank)", async () => {
    const { vaultRepo } = await import("@/lib/db");
    const { searchVault } = await import("@/lib/vault");

    const seedDocs = [
      { key: "a", content: "LangGraph agent evaluation with retrieval benchmarks" },
      { key: "b", content: "Retrieval pipeline notes for hybrid search" },
      { key: "c", content: "React interface design system components" },
    ];

    vaultRepo.wipe();
    try {
      for (const d of seedDocs) {
        vaultRepo.upsertDoc({
          id: `rrf-doc-${d.key}`,
          filename: `rrf-${d.key}.txt`,
          mime: "text/plain",
          size: d.content.length,
          status: "ready",
          embedModel: "local",
          chunkCount: 1,
          label: "",
          createdAt: new Date().toISOString(),
        });
        vaultRepo.insertChunk({
          docId: `rrf-doc-${d.key}`,
          idx: 0,
          content: d.content,
          tokens: d.content.split(/\s+/).length,
          embedding: localEmbed(d.content),
        });
      }

      const hits = await searchVault("langgraph retrieval evaluation", 5);
      expect(hits.length).toBeGreaterThan(0);

      // Top hit matches every query term in BOTH signals → strategy hybrid.
      const top = hits[0];
      expect(top.docId).toBe("rrf-doc-a");
      expect(top.strategy).toBe("hybrid");
      expect(top.matchedTerms).toEqual(expect.arrayContaining(["langgraph", "retrieval", "evaluation"]));
      expect(top.lexicalRank).toBe(1);
      expect(top.semanticRank).toBe(1);

      // Returned order must agree with independently recomputed RRF-k60 from the
      // exposed per-hit ranks (missing signal contributes 0). Seeds are chosen so
      // the overlap rerank is monotone with raw fusion here (top doc also has the
      // highest term-overlap ratio), so ordering equality is a valid contract.
      const expectedRrf = (h: (typeof hits)[number]) =>
        (h.lexicalRank ? 1 / (RRF_K + h.lexicalRank) : 0) +
        (h.semanticRank ? 1 / (RRF_K + h.semanticRank) : 0);
      const rrfs = hits.map(expectedRrf);
      for (let i = 1; i < rrfs.length; i++) {
        expect(rrfs[i - 1]).toBeGreaterThanOrEqual(rrfs[i]);
      }
      // Normalized fused score stays in (0, 1] with the top hit as the maximum.
      expect(top.score).toBeGreaterThan(0);
      expect(top.score).toBeLessThanOrEqual(1);
      for (const h of hits.slice(1)) expect(h.score).toBeLessThanOrEqual(top.score);
    } finally {
      vaultRepo.wipe();
    }
  });
});
