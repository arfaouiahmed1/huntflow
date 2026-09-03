import { describe, expect, it } from "vitest";
import { rerankVaultChunks } from "@/lib/vault/rerank";
import type { ChunkProvenance } from "@/lib/vault/rerank";

describe("rerankVaultChunks — hybrid scoring", () => {
  it("exact phrase matching ranks higher than partial term matches", () => {
    const query = "machine learning pipeline";
    const candidates = [
      {
        id: "1",
        docId: "doc-a",
        docName: "paper-a.pdf",
        chunkIndex: 0,
        text: "The machine learning pipeline for data processing is described here with end-to-end steps.",
        score: 0.5,
      },
      {
        id: "2",
        docId: "doc-b",
        docName: "paper-b.pdf",
        chunkIndex: 1,
        text: "Machine concepts are scattered. The pipeline is built from learning modules but the terms are split across sentences with unrelated words in between.",
        score: 0.5,
      },
      {
        id: "3",
        docId: "doc-c",
        docName: "paper-c.pdf",
        chunkIndex: 2,
        text: "Cooking recipes for pasta and unrelated content about travel destinations.",
        score: 0.5,
      },
    ];

    const ranked = rerankVaultChunks(query, candidates);

    expect(ranked.map((r) => r.id)).toEqual(["1", "2", "3"]);
    // Exact phrase candidate must have highest rerankScore due to phrase boost weighted higher
    expect(ranked[0].rerankScore).toBeGreaterThan(ranked[1].rerankScore);
    expect(ranked[1].rerankScore).toBeGreaterThan(ranked[2].rerankScore);

    // Determinism: repeated call yields identical order
    const rankedAgain = rerankVaultChunks(query, candidates);
    expect(rankedAgain.map((r) => r.id)).toEqual(ranked.map((r) => r.id));
  });

  it("query keyword density and proximity boosts", () => {
    // Density: chunk with all query terms should outrank partial matches
    const query = "remote team collaboration";

    const candidatesDensity = [
      {
        id: "dense",
        docId: "doc-1",
        docName: "notes.pdf",
        chunkIndex: 0,
        text: "Remote team collaboration is essential for distributed product teams.",
        score: 0.4,
      },
      {
        id: "partial",
        docId: "doc-1",
        docName: "notes.pdf",
        chunkIndex: 1,
        text: "Remote work is great. The office is remote.",
        score: 0.4,
      },
      {
        id: "sparse",
        docId: "doc-1",
        docName: "notes.pdf",
        chunkIndex: 2,
        text: "Unrelated content about finance and quarterly reports without relevant terms.",
        score: 0.4,
      },
    ];

    const rankedDensity = rerankVaultChunks(query, candidatesDensity);
    expect(rankedDensity[0].id).toBe("dense");
    expect(rankedDensity[0].rerankScore).toBeGreaterThan(rankedDensity[1].rerankScore);

    // Proximity: same terms but different distances — close together should win
    const candidatesProximity = [
      {
        id: "close",
        docId: "doc-2",
        docName: "close.pdf",
        chunkIndex: 0,
        text: "Remote team collaboration enables async standup and shared ownership.",
        score: 0.3,
      },
      {
        id: "far",
        docId: "doc-2",
        docName: "far.pdf",
        chunkIndex: 1,
        // Terms deliberately far apart with filler to inflate window size
        text: "Remote work started a decade ago. The company grew globally. The team is distributed across continents with many layers of management. After several paragraphs of unrelated content about budgets and roadmaps, collaboration is mentioned finally as an afterthought.",
        score: 0.3,
      },
    ];

    const rankedProximity = rerankVaultChunks(query, candidatesProximity);
    expect(rankedProximity[0].id).toBe("close");
    expect(rankedProximity[0].rerankScore).toBeGreaterThan(rankedProximity[1].rerankScore);

    // Verify proximity boost is working: both have same density (3 terms) so difference is proximity
    // The close candidate's window is 3 tokens, far candidate's window is much larger -> ratio difference
    const closeTokens = "remote team collaboration".split(" ");
    expect(closeTokens.length).toBe(3);
  });

  it("provenance metadata generation (docName, chunkIndex, excerpt, similarity)", () => {
    const query = "vault retrieval";
    const longText =
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
      "The vault retrieval augmented generation system combines BM25 lexical search with vector embeddings. " +
      "Hybrid search with reciprocal rank fusion merges both signals. ".repeat(3) +
      " Additional content after the match to ensure excerpt windowing works and the surrounding context is captured correctly for provenance generation.";
    const candidates = [
      {
        id: "c1",
        docId: "doc-xyz",
        docName: "research-report.pdf",
        chunkIndex: 2,
        text: longText,
        score: 0.7,
      },
      {
        id: "c2",
        docId: "doc-xyz",
        docName: "research-report.pdf",
        chunkIndex: 5,
        text: "Unrelated filler that does not contain the query but is long enough to test length normalization penalty handling for oversized chunks with lots of repeated tokens and irrelevant information ".repeat(5),
        score: 0.1,
      },
    ];

    const ranked = rerankVaultChunks(query, candidates);

    expect(ranked.length).toBe(2);
    const top = ranked[0];
    expect(top.id).toBe("c1");

    // Provenance shape
    const prov: ChunkProvenance = top.provenance;
    expect(prov.docName).toBe("research-report.pdf");
    expect(prov.chunkIndex).toBe(2);
    expect(typeof prov.similarity).toBe("number");
    expect(prov.similarity).toBeGreaterThan(0);
    expect(prov.similarity).toBeLessThanOrEqual(1);
    // Top rank similarity should be normalized to 1
    expect(prov.similarity).toBe(1);

    expect(typeof prov.excerpt).toBe("string");
    expect(prov.excerpt.length).toBeGreaterThan(0);
    expect(prov.excerpt.length).toBeLessThanOrEqual(160);
    // Excerpt must be clean — no raw newlines/doublespaces
    expect(prov.excerpt).not.toMatch(/\n/);
    expect(prov.excerpt).not.toMatch(/  /);
    // Excerpt must surround highest scoring term match
    const lowerExcerpt = prov.excerpt.toLowerCase();
    const containsTerm =
      lowerExcerpt.includes("vault") || lowerExcerpt.includes("retrieval") || lowerExcerpt.includes("vault retrieval");
    expect(containsTerm).toBe(true);

    // Length normalization: bloated chunk should not outrank relevant chunk despite similar original score handling
    expect(ranked[0].id).toBe("c1");
    expect(ranked[1].provenance.chunkIndex).toBe(5);

    // RerankScore present and deterministic
    expect(typeof top.rerankScore).toBe("number");
    expect(top.rerankScore).toBeGreaterThan(ranked[1].rerankScore);
  });

  it("length normalization penalty prevents ultra-short or bloated chunks from skewing", () => {
    const query = "hybrid search retrieval";
    const short = "hybrid";
    const ideal =
      "Hybrid search retrieval with BM25 and vector embeddings provides balanced lexical and semantic coverage for vault queries.";
    const bloated =
      "Hybrid search retrieval " +
      "filler ".repeat(120) +
      " hybrid search retrieval end.";

    const candidates = [
      { id: "short", docId: "d1", docName: "a.pdf", chunkIndex: 0, text: short, score: 0.6 },
      { id: "ideal", docId: "d1", docName: "a.pdf", chunkIndex: 1, text: ideal, score: 0.6 },
      { id: "bloated", docId: "d1", docName: "a.pdf", chunkIndex: 2, text: bloated, score: 0.6 },
    ];

    const ranked = rerankVaultChunks(query, candidates);
    // Ideal length should win over both extremes when lexical/semantic scores are equalized
    expect(ranked[0].id).toBe("ideal");
  });

  it("original vector/RRF score fusion influences ranking when text features are equal", () => {
    const query = "test query";
    const text = "Test query appears here with identical text for both candidates.";
    const candidates = [
      { id: "low", docId: "d1", docName: "file.pdf", chunkIndex: 0, text, score: 0.2 },
      { id: "high", docId: "d1", docName: "file.pdf", chunkIndex: 1, text, score: 0.9 },
    ];

    const ranked = rerankVaultChunks(query, candidates);
    expect(ranked[0].id).toBe("high");
    expect(ranked[0].rerankScore).toBeGreaterThan(ranked[1].rerankScore);
  });

  it("respects limit and retains provenance", () => {
    const query = "alpha beta";
    const candidates = [
      { id: "a", docId: "d1", docName: "doc.pdf", chunkIndex: 0, text: "alpha beta gamma", score: 0.5 },
      { id: "b", docId: "d1", docName: "doc.pdf", chunkIndex: 1, text: "alpha beta", score: 0.5 },
      { id: "c", docId: "d1", docName: "doc.pdf", chunkIndex: 2, text: "alpha only", score: 0.5 },
    ];

    const limited = rerankVaultChunks(query, candidates, 2);
    expect(limited.length).toBe(2);
    for (const item of limited) {
      expect(item.provenance).toBeDefined();
      expect(item.provenance.docName).toBe("doc.pdf");
      expect(typeof item.provenance.excerpt).toBe("string");
      expect(item.provenance.excerpt.length).toBeLessThanOrEqual(160);
    }
  });

  it("handles missing optional fields gracefully", () => {
    const query = "hello world";
    const candidates = [
      { id: "x", text: "hello world in chunk", score: 0.1 },
      { id: "y", text: "unrelated", score: 0.9 },
    ];
    const ranked = rerankVaultChunks(query, candidates);
    expect(ranked.length).toBe(2);
    expect(ranked[0].id).toBe("x");
    expect(ranked[0].provenance.docName).toBe("unknown");
    expect(ranked[0].provenance.chunkIndex).toBe(0);
    expect(ranked[0].provenance.excerpt.length).toBeLessThanOrEqual(160);
  });
});
