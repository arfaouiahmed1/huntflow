import { memoryRepo, agentStateRepo, MemoryEntry } from "@/lib/db";

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

export function recentMemory(opts: { kind?: MemoryKind; jobId?: string; limit?: number } = {}): MemoryEntry[] {
  return memoryRepo.list({ ...opts, limit: opts.limit ?? 50 });
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
