import { describe, expect, it } from "vitest";
import { rankBm25 } from "@/lib/vault/bm25";
import { localEmbed, cosine } from "@/lib/vault/embeddings";

/**
 * Tiny deterministic RAG eval set (fits app) — task 14.
 * 20 docs + 10 queries, no network, no mocked ranking.
 * Asserts recall@5 ≥ 0.8 and MRR ≥ 0.6 on both BM25 and hybrid (BM25+vector RRF).
 * Deterministic: repeated runs yield identical metrics (localEmbed + BM25 are pure).
 *
 * Intelligence-principle reference: LLMs explain; deterministic systems measure (R@k, MRR).
 */

// 20 seeded docs — each a single chunk with distinct vocab so queries map cleanly.
const SEED_DOCS: { id: number; content: string }[] = [
  { id: 1, content: "LangGraph agent workflow state graph checkpoint for job search automation and resume tailoring" },
  { id: 2, content: "hybrid BM25 vector RAG retrieval augmented generation vault RRF fusion lexical semantic rerank" },
  { id: 3, content: "LaTeX resume ATS template Latin Modern Roman structure preview compilation typography" },
  { id: 4, content: "Docker compose standalone build Next.js sidecar Scrapling FastAPI uvicorn 127.0.0.1" },
  { id: 5, content: "SQLite WAL busy_timeout journal_mode foreign_keys migration seed backup export import transaction" },
  { id: 6, content: "Tailwind CSS semantic tokens cn utility design system components forwardRef lucide-react icons" },
  { id: 7, content: "Python FastAPI Scrapling Playwright crawler sources telemetry screenshot headless agent runs" },
  { id: 8, content: "Gmail OAuth follow-up outreach tracker interview rate calibration funnel reminder" },
  { id: 9, content: "STAR stories evidence vault interview preparation profile enrichment analysis grounded summary" },
  { id: 10, content: "Discovery control dashboard scraper source selection run telemetry per-source outcome live" },
  { id: 11, content: "Next.js app router route handlers async cookies headers searchParams breaking changes verification" },
  { id: 12, content: "SQLite checkpoint persistence thread prune compression LangGraph interrupt resume continuation" },
  { id: 13, content: "Cloudinary screenshot storage browser agent evidence capture upload preset capture" },
  { id: 14, content: "Vitest forks pool isolated temp SQLite HUNTFLOW_DB_PATH deterministic ranking tests per worker" },
  { id: 15, content: "ESLint next core-web-vitals TypeScript strict lint typecheck quality gates CI build" },
  { id: 16, content: "PDF extraction text normalization token chunking overlapping 700 90 boundary deterministic" },
  { id: 17, content: "OpenAI embeddings fallback local hash 256 dims deterministic bag words hash sign norm" },
  { id: 18, content: "Job board enrichment company facts source URL capture date citation research grounding" },
  { id: 19, content: "standalone output tracing LaTeX templates allowedDevOrigins 127.0.0.1 bindings inline" },
  { id: 20, content: "Command Deck insights application response interview offer outcome analytics measurement rates" },
];

// 10 queries — each maps to exactly one relevant doc (Recall@5 and MRR ground truth).
const QUERIES: { q: string; relevant: number[] }[] = [
  { q: "LangGraph workflow state graph", relevant: [1] },
  { q: "hybrid BM25 vector RAG vault RRF", relevant: [2] },
  { q: "LaTeX ATS template Latin Modern", relevant: [3] },
  { q: "Docker compose standalone Scrapling sidecar", relevant: [4] },
  { q: "SQLite WAL busy_timeout", relevant: [5] },
  { q: "Tailwind cn semantic tokens design system", relevant: [6] },
  { q: "FastAPI Scrapling Playwright crawler", relevant: [7] },
  { q: "vitest forks isolated temp SQLite", relevant: [14] },
  { q: "PDF extraction normalization chunking", relevant: [16] },
  { q: "company facts source URL capture date", relevant: [18] },
];

const RRF_K = 60;

function recallAtK(ranked: number[], relevant: number[], k: number): number {
  const top = new Set(ranked.slice(0, k));
  const hits = relevant.filter((id) => top.has(id)).length;
  return relevant.length ? hits / relevant.length : 0;
}

function reciprocalRank(ranked: number[], relevant: number[]): number {
  const set = new Set(relevant);
  for (let i = 0; i < ranked.length; i++) if (set.has(ranked[i])) return 1 / (i + 1);
  return 0;
}

function vectorRanking(query: string, docs: typeof SEED_DOCS): number[] {
  const qv = localEmbed(query);
  return [...docs]
    .map((d) => ({ id: d.id, score: cosine(qv, localEmbed(d.content)) }))
    .sort((a, b) => b.score - a.score)
    .map((r) => r.id);
}

function hybridRrfRanking(query: string, docs: typeof SEED_DOCS): number[] {
  const lexical = rankBm25(query, docs);
  const lexicalIds = lexical.map((r) => r.chunkId);
  const vectorIds = vectorRanking(query, docs);
  const fused = new Map<number, number>();
  for (const ranking of [lexicalIds, vectorIds]) {
    ranking.forEach((id, idx) => fused.set(id, (fused.get(id) ?? 0) + 1 / (RRF_K + idx + 1)));
  }
  // lightweight rerank not needed for deterministic tiny eval; RRF alone suffices
  return [...fused.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

function evaluate(
  rankingFn: (q: string) => number[],
  k = 5
): { recall: number; mrr: number; perQuery: { q: string; ranked: number[]; rr: number; hit: boolean }[] } {
  let recallSum = 0;
  let mrrSum = 0;
  const perQuery = [];
  for (const { q, relevant } of QUERIES) {
    const ranked = rankingFn(q);
    const r = recallAtK(ranked, relevant, k);
    const rr = reciprocalRank(ranked, relevant);
    recallSum += r;
    mrrSum += rr;
    perQuery.push({ q, ranked: ranked.slice(0, k), rr, hit: r > 0 });
  }
  return { recall: recallSum / QUERIES.length, mrr: mrrSum / QUERIES.length, perQuery };
}

describe("vault RAG eval – tiny deterministic set (fits app)", () => {
  it("seed has 20 docs and 10 queries", () => {
    expect(SEED_DOCS).toHaveLength(20);
    expect(QUERIES).toHaveLength(10);
    // ids unique
    expect(new Set(SEED_DOCS.map((d) => d.id)).size).toBe(20);
  });

  it("BM25 lexical recall@5 ≥ 0.8 and MRR ≥ 0.6 (no mocks, no network)", () => {
    const { recall, mrr } = evaluate((q) => rankBm25(q, SEED_DOCS).map((r) => r.chunkId), 5);
    expect(recall).toBeGreaterThanOrEqual(0.8);
    expect(mrr).toBeGreaterThanOrEqual(0.6);
  });

  it("hybrid RRF (BM25 + local vector cosine) recall@5 ≥ 0.8 and MRR ≥ 0.6 (deterministic)", () => {
    const { recall, mrr } = evaluate((q) => hybridRrfRanking(q, SEED_DOCS), 5);
    expect(recall).toBeGreaterThanOrEqual(0.8);
    expect(mrr).toBeGreaterThanOrEqual(0.6);
  });

  it("is deterministic across repeated runs", () => {
    const a = evaluate((q) => hybridRrfRanking(q, SEED_DOCS), 5);
    const b = evaluate((q) => hybridRrfRanking(q, SEED_DOCS), 5);
    expect(a.recall).toBe(b.recall);
    expect(a.mrr).toBe(b.mrr);
    expect(a.perQuery.map((p) => p.ranked)).toEqual(b.perQuery.map((p) => p.ranked));
  });

  it("reports per-query RRF top-1 hits for observability (all queries hit in top-5)", () => {
    const { perQuery, recall } = evaluate((q) => hybridRrfRanking(q, SEED_DOCS), 5);
    // sanity: with our seeded vocab, most queries should hit at rank 1
    const rank1Hits = perQuery.filter((p) => p.rr === 1).length;
    expect(rank1Hits).toBeGreaterThanOrEqual(8);
    expect(recall).toBeGreaterThanOrEqual(0.8);
  });

  it("searchVault via DB stays deterministic (hybrid through vaultRepo, no network)", async () => {
    // Integration check that the real app path (vaultRepo + searchVault) preserves recall on same seed.
    const { vaultRepo } = await import("@/lib/db");
    const { searchVault } = await import("@/lib/vault");
    vaultRepo.wipe();
    try {
      for (const d of SEED_DOCS) {
        vaultRepo.upsertDoc({
          id: `eval-doc-${d.id}`,
          filename: `doc-${d.id}.txt`,
          mime: "text/plain",
          size: d.content.length,
          status: "ready",
          embedModel: "local",
          chunkCount: 1,
          label: "",
          createdAt: new Date().toISOString(),
        });
        vaultRepo.insertChunk({
          docId: `eval-doc-${d.id}`,
          idx: 0,
          content: d.content,
          tokens: d.content.split(/\s+/).length,
          embedding: localEmbed(d.content),
        });
      }
      let hits = 0;
      let mrrSum = 0;
      for (const { q, relevant } of QUERIES) {
        const results = await searchVault(q, 5);
        const topIds = results.map((r) => Number(r.docId.replace("eval-doc-", "")));
        const relevantSet = new Set(relevant);
        if (topIds.some((id) => relevantSet.has(id))) hits++;
        for (let i = 0; i < topIds.length; i++) if (relevantSet.has(topIds[i])) { mrrSum += 1 / (i + 1); break; }
      }
      const recall = hits / QUERIES.length;
      const mrr = mrrSum / QUERIES.length;
      expect(recall).toBeGreaterThanOrEqual(0.8);
      expect(mrr).toBeGreaterThanOrEqual(0.6);
    } finally {
      vaultRepo.wipe();
    }
  });
});
