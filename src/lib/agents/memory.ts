import { memoryRepo, agentStateRepo, MemoryEntry, memoryEmbeddingsRepo } from "@/lib/db";
import { cosine } from "@/lib/vault/embeddings";

export type MemoryKind = MemoryEntry["kind"];

export function remember(
  kind: MemoryKind,
  content: string,
  opts: { jobId?: string; source?: string; importance?: number } = {}
): MemoryEntry {
  const entry = memoryRepo.add({
    kind,
    content,
    jobId: opts.jobId,
    source: opts.source ?? "system",
    importance: opts.importance ?? 0,
  });
  memoryRepo.prune(500);
  return entry;
}

export function rememberUnique(
  kind: MemoryKind,
  content: string,
  opts: { jobId?: string; source?: string; importance?: number } = {},
): MemoryEntry {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  const source = opts.source ?? "system";
  const existing = memoryRepo
    .list({ limit: 500 })
    .find(
      (entry) =>
        entry.kind === kind &&
        entry.jobId === opts.jobId &&
        entry.source === source &&
        entry.content.replace(/\s+/g, " ").trim() === normalizedContent,
    );
  return existing ?? remember(kind, normalizedContent, { ...opts, source });
}

export function rememberShort(
  kind: MemoryKind,
  content: string,
  opts: { jobId?: string; runId?: string; source?: string; importance?: number; daysTTL?: number } = {},
): MemoryEntry {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  const source = opts.source ?? "system";
  const days = Math.max(7, Math.min(30, opts.daysTTL ?? 7));
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  const existing = memoryRepo
    .list({ limit: 500, includeExpired: true })
    .find(
      (entry) =>
        entry.kind === kind &&
        entry.jobId === opts.jobId &&
        entry.runId === opts.runId &&
        entry.source === source &&
        entry.content.replace(/\s+/g, " ").trim() === normalizedContent,
    );
  if (existing) return existing;
  const entry = memoryRepo.add({
    kind,
    content: normalizedContent,
    jobId: opts.jobId,
    runId: opts.runId,
    source,
    importance: opts.importance ?? 0,
    expiresAt,
  });
  memoryRepo.prune(500);
  return entry;
}

export function rememberLong(
  kind: MemoryKind,
  content: string,
  opts: { jobId?: string; source?: string; importance?: number } = {},
): MemoryEntry {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  const source = opts.source ?? "system";
  const importance = Math.max(opts.importance ?? 3, 3);
  const existing = memoryRepo
    .listLong({ limit: 500 })
    .find(
      (entry) =>
        entry.kind === kind &&
        entry.jobId === opts.jobId &&
        entry.source === source &&
        entry.content.replace(/\s+/g, " ").trim() === normalizedContent,
    );
  if (existing) return existing;
  return remember(kind, normalizedContent, { ...opts, source, importance });
}

export function listShort(opts: { kind?: MemoryKind; jobId?: string; runId?: string; source?: string; limit?: number; includeExpired?: boolean } = {}): MemoryEntry[] {
  return memoryRepo.listShort({
    kind: opts.kind,
    jobId: opts.jobId,
    runId: opts.runId,
    source: opts.source,
    limit: opts.limit,
    includeExpired: opts.includeExpired,
  });
}

export function listLong(opts: { kind?: MemoryKind; jobId?: string; source?: string; limit?: number } = {}): MemoryEntry[] {
  return memoryRepo.listLong({ kind: opts.kind, jobId: opts.jobId, source: opts.source, limit: opts.limit });
}

export function pruneExpired(nowIso = new Date().toISOString()): number {
  return memoryRepo.deleteExpired(nowIso);
}

export function embedMemory(memoryId: number, embedding: number[], model = "local") {
  return memoryEmbeddingsRepo.upsert({ memoryId, embedding, model });
}

export function recentMemory(opts: { kind?: MemoryKind; jobId?: string; limit?: number } = {}): MemoryEntry[] {
  return memoryRepo.list({ ...opts, limit: opts.limit ?? 50 });
}

function terms(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3),
  );
}

/** Retrieve a compact, relevance-ranked mix of job-scoped and global memories.
 *  v2: TTL filter (expiresAt > now), mixed short/long ranking (jobScore 40 + overlap*4 + importance*6),
 *  optional cosine via memory_embeddings when model + queryEmbedding present (model guard prevents local/openai mixing),
 *  and runId bonus for short-term run-scoped memories. */
export function relevantMemory(opts: {
  query: string;
  jobIds?: string[];
  kind?: MemoryKind;
  limit?: number;
  candidateLimit?: number;
  runId?: string;
  model?: string;
  queryEmbedding?: number[];
  includeExpired?: boolean;
  nowIso?: string;
}): MemoryEntry[] {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const queryTerms = terms(opts.query);
  const jobIds = new Set(opts.jobIds ?? []);
  const candidatesAll = memoryRepo.list({ kind: opts.kind, limit: opts.candidateLimit ?? 300, includeExpired: true });
  // TTL filter: exclude expired short-term memories (expiresAt <= now)
  const candidates = opts.includeExpired
    ? candidatesAll
    : candidatesAll.filter((e) => !e.expiresAt || e.expiresAt > nowIso);

  // Build embedding map with strict model guard (do not mix local vs openai)
  let embeddingMap: Map<number, number[]> | null = null;
  if (opts.queryEmbedding && opts.queryEmbedding.length && opts.model) {
    const all = memoryEmbeddingsRepo.list(10000);
    embeddingMap = new Map<number, number[]>();
    for (const em of all) {
      if (em.model !== opts.model) continue;
      embeddingMap.set(em.memoryId, em.embedding);
    }
  }

  return candidates
    .map((entry, recencyIndex) => {
      const entryTerms = terms(`${entry.content} ${entry.source}`);
      let overlap = 0;
      for (const term of queryTerms) if (entryTerms.has(term)) overlap += 1;
      const jobScore = entry.jobId && jobIds.has(entry.jobId) ? 40 : 0;
      const runScore = opts.runId && entry.runId === opts.runId ? 12 : 0;
      const importanceScore = Math.max(0, entry.importance) * 6;
      const globalDecisionScore = !entry.jobId && ["decision", "fact", "outcome"].includes(entry.kind) ? 3 : 0;
      const recencyScore = Math.max(0, 2 - recencyIndex / 100);
      let cosineScore = 0;
      if (embeddingMap && opts.queryEmbedding && entry.id != null) {
        const vec = embeddingMap.get(entry.id);
        if (vec && vec.length === opts.queryEmbedding.length) {
          const c = cosine(opts.queryEmbedding, vec);
          if (c > 0) cosineScore = c * 12;
        }
      }
      return { entry, score: jobScore + runScore + overlap * 4 + importanceScore + globalDecisionScore + recencyScore + cosineScore };
    })
    .filter(({ entry, score }) => score > 0 || (!queryTerms.size && !entry.jobId))
    .sort((a, b) => b.score - a.score || Number(b.entry.id ?? 0) - Number(a.entry.id ?? 0))
    .slice(0, opts.limit ?? 40)
    .map(({ entry }) => entry);
}

export function getAgentState(agent: string, key: string, fallback: unknown = null): unknown {
  const raw = agentStateRepo.get(agent, key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function setAgentState(agent: string, key: string, value: unknown) {
  agentStateRepo.set(agent, key, typeof value === "string" ? value : JSON.stringify(value));
}
