import { randomUUID } from "node:crypto";
import { vaultRepo, VaultDoc, VaultChunk } from "@/lib/db";
import { extractText, normalizeText } from "./extract";
import { chunkText } from "./chunk";
import { embedTexts, cosine } from "./embeddings";
import { rankBm25 } from "./bm25";
import { resolveChain, callLLMJSON } from "@/lib/llm/router";
import { rerankVaultChunks } from "./rerank";
import type { ChunkProvenance } from "./rerank";

const RRF_K = 60;

async function expandQuery(original: string): Promise<string[]> {
  const trimmed = original.trim();
  if (!trimmed) return [];
  try {
    const chain = resolveChain();
    if (!chain.length) return [trimmed];
    const result = await callLLMJSON<{ rewrites?: string[]; queries?: string[] }>(
      {
        system:
          "You are a query expansion helper for a local document vault. Given the user query, produce exactly 2 concise alternative phrasings that preserve intent and help retrieval. Respond with JSON {\"rewrites\": [\"phrase1\",\"phrase2\"]} — each 3-12 words, no markdown, no quotes.",
        user: trimmed,
        json: true,
        agent: "vault",
        maxOutput: 150,
      },
      chain
    );
    const raw = (result.rewrites ?? result.queries ?? []) as unknown[];
    const cleaned = raw
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 2);
    if (!cleaned.length) return [trimmed];
    const seen = new Set([trimmed.toLowerCase()]);
    const deduped: string[] = [];
    for (const r of cleaned) {
      const key = r.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(r);
      }
    }
    if (!deduped.length) return [trimmed];
    return [trimmed, ...deduped];
  } catch {
    return [trimmed];
  }
}

export interface VaultSearchHit {
  docId: string;
  docName: string;
  chunkId: number;
  text: string;
  score: number;
  model: string;
  chunkIndex: number;
  semanticScore: number;
  lexicalScore: number;
  semanticRank?: number;
  lexicalRank?: number;
  matchedTerms: string[];
  strategy: "hybrid" | "vector" | "lexical";
  provenance: ChunkProvenance;
  rerankScore: number;
}

export async function ingestDocument(input: {
  buffer: Buffer;
  filename: string;
  mime: string;
  label?: string;
}): Promise<VaultDoc> {
  const id = randomUUID();
  const doc: VaultDoc = {
    id,
    filename: input.filename,
    mime: input.mime,
    size: input.buffer.byteLength,
    status: "indexing",
    embedModel: "local",
    chunkCount: 0,
    label: input.label ?? "",
    createdAt: new Date().toISOString(),
  };
  vaultRepo.upsertDoc(doc);

  try {
    const raw = await extractText(input.buffer, input.mime, input.filename);
    const text = normalizeText(raw);
    if (!text) throw new Error("No readable text found in the file.");

    const chunks = chunkText(text);
    if (!chunks.length) throw new Error("File is too short to index.");

    const { vectors, model } = await embedTexts(chunks.map((c) => c.text));

    vaultRepo.deleteChunks(id);
    chunks.forEach((c, i) => {
      const chunk: Omit<VaultChunk, "id"> = {
        docId: id,
        idx: i,
        content: c.text,
        tokens: c.tokens,
        embedding: vectors[i] ?? [],
      };
      vaultRepo.insertChunk(chunk);
    });

    doc.status = "ready";
    doc.embedModel = model;
    doc.chunkCount = chunks.length;
    vaultRepo.upsertDoc(doc);
    return doc;
  } catch (err) {
    vaultRepo.deleteDoc(id);
    throw err;
  }
}

export function listDocuments(): VaultDoc[] {
  return vaultRepo.listDocs();
}

export function deleteDocument(id: string): boolean {
  const doc = vaultRepo.getDoc(id);
  if (!doc) return false;
  vaultRepo.deleteDoc(id);
  return true;
}

export function setDocLabel(id: string, label: string): boolean {
  const doc = vaultRepo.getDoc(id);
  if (!doc) return false;
  vaultRepo.setLabel(id, label);
  return true;
}

export function setDocEmbedModel(id: string, embedModel: string): boolean {
  const doc = vaultRepo.getDoc(id);
  if (!doc) return false;
  const normalized = embedModel.trim();
  if (!normalized || normalized.length > 80) return false;
  if (normalized !== "local" && !/^[a-z0-9_-]+\|[a-z0-9._-]+$/i.test(normalized)) return false;
  vaultRepo.setEmbedModel(id, normalized);
  return true;
}

/** Hybrid local retrieval: BM25 lexical rank + vector rank + RRF fusion (fit-for-app). */
export async function searchVault(query: string, k = 4, threshold = 0.12): Promise<VaultSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  // Use distinctEmbedModels to drive per-model hybrid groups (avoids mixing embedding spaces)
  const distinctModels = vaultRepo.distinctEmbedModels();
  const all = vaultRepo.allChunksWithModel();
  if (!all.length) return [];

  const expandedQueries = await expandQuery(trimmed);

  const byModel = new Map<string, (VaultChunk & { embedModel: string })[]>();
  for (const c of all) {
    const list = byModel.get(c.embedModel) ?? [];
    list.push(c);
    byModel.set(c.embedModel, list);
  }
  // Ensure distinctModels covers all groups even if a model has zero chunks (defensive)
  for (const m of distinctModels) {
    if (!byModel.has(m)) byModel.set(m, []);
  }

  const chunkById = new Map(all.map((chunk) => [chunk.id, chunk]));
  const lexicalById = new Map<number, { chunkId: number; score: number; matchedTerms: string[]; rank: number }>();
  const semanticById = new Map<number, { score: number; rank: number }>();
  const rankings: number[][] = [];

  // Per expanded query: BM25 lexical ranking (hybrid per expansion)
  for (const q of expandedQueries) {
    const lexical = rankBm25(q, all);
    if (lexical.length) {
      rankings.push(lexical.map((hit) => hit.chunkId));
      lexical.forEach((hit, index) => {
        const existing = lexicalById.get(hit.chunkId);
        if (!existing || hit.score > existing.score) {
          lexicalById.set(hit.chunkId, { ...hit, rank: index + 1 });
        }
      });
    }
  }

  // Per distinctEmbedModels × per expanded query: vector rankings with threshold 0.12
  for (const [model, chunks] of byModel) {
    if (!chunks.length) continue;
    for (const q of expandedQueries) {
      const { vectors } = await embedTexts([q], model).catch(() => ({ vectors: [] as number[][] }));
      const qv = vectors[0];
      if (!qv?.length) continue;
      const modelRanking = chunks
        .filter((chunk) => chunk.embedding.length > 0)
        .map((chunk) => ({ id: chunk.id, score: cosine(qv, chunk.embedding) }))
        .filter((result) => result.score >= threshold)
        .sort((a, b) => b.score - a.score);
      if (modelRanking.length) rankings.push(modelRanking.map((result) => result.id));
      modelRanking.forEach((result, index) => {
        const previous = semanticById.get(result.id);
        if (!previous || result.score > previous.score) {
          semanticById.set(result.id, { score: result.score, rank: index + 1 });
        }
      });
    }
  }

  const fused = new Map<number, number>();
  for (const ranking of rankings) {
    ranking.forEach((chunkId, index) => {
      fused.set(chunkId, (fused.get(chunkId) ?? 0) + 1 / (RRF_K + index + 1));
    });
  }
  if (!fused.size) return [];

  // Hybrid reranker — integrate rerankVaultChunks after RRF / fusion stage before returning final results
  const docs = new Map(vaultRepo.listDocs().map((doc) => [doc.id, doc.filename]));

  type VaultCandidate = {
    id: string;
    docId: string;
    docName: string;
    chunkIndex: number;
    text: string;
    score: number;
    chunkId: number;
    model: string;
    semanticScore: number;
    lexicalScore: number;
    semanticRank?: number;
    lexicalRank?: number;
    matchedTerms: string[];
    strategy: "hybrid" | "vector" | "lexical";
  };

  const candidates: VaultCandidate[] = [];
  for (const [chunkId, fusedScore] of fused.entries()) {
    const chunk = chunkById.get(chunkId);
    if (!chunk) continue;
    const lexicalSignal = lexicalById.get(chunkId);
    const semanticSignal = semanticById.get(chunkId);
    const strategy: VaultCandidate["strategy"] =
      lexicalSignal && semanticSignal ? "hybrid" : semanticSignal ? "vector" : "lexical";
    candidates.push({
      id: String(chunkId),
      docId: chunk.docId,
      docName: docs.get(chunk.docId) ?? chunk.docId,
      chunkIndex: chunk.idx,
      text: chunk.content,
      score: fusedScore,
      chunkId: chunk.id,
      model: chunk.embedModel,
      semanticScore: semanticSignal?.score ?? 0,
      lexicalScore: lexicalSignal?.score ?? 0,
      semanticRank: semanticSignal?.rank,
      lexicalRank: lexicalSignal?.rank,
      matchedTerms: lexicalSignal?.matchedTerms ?? [],
      strategy,
    });
  }

  if (!candidates.length) return [];

  const reranked = rerankVaultChunks(trimmed, candidates, k);

  const maxRerank = Math.max(...reranked.map((r) => r.rerankScore), 1);

  return reranked.map((r) => ({
    docId: r.docId,
    docName: r.docName,
    chunkId: r.chunkId,
    chunkIndex: r.chunkIndex,
    text: r.text.slice(0, 800),
    score: maxRerank > 0 ? r.rerankScore / maxRerank : 0,
    model: r.model,
    semanticScore: r.semanticScore,
    lexicalScore: r.lexicalScore,
    semanticRank: r.semanticRank,
    lexicalRank: r.lexicalRank,
    matchedTerms: r.matchedTerms,
    strategy: r.strategy,
    provenance: r.provenance,
    rerankScore: r.rerankScore,
  } satisfies VaultSearchHit));
}

export function vaultStats() {
  return vaultRepo.stats();
}
