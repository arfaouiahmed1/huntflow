import { memoryRepo } from "@/lib/db";
import { rememberLong, fingerprintEntries, getConsolidationFingerprint, setConsolidationFingerprint, pruneExpired } from "@/lib/agents/memory";
import { callLLM, resolveChain } from "@/lib/llm/router";
import { embedTexts } from "@/lib/vault/embeddings";

export interface ConsolidateOptions {
  /** Max episodic rows to scan (default 100). */
  limit?: number;
  /** Only consolidate this jobId; otherwise all per-job groups. */
  jobId?: string;
}

export interface ConsolidateResult {
  groups: number;
  consolidated: number;
  skipped: number;
  details: Array<{ jobId: string; created: number; skipped: boolean; reason?: string }>;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

interface LLMSummary {
  content: string;
  kind?: string;
  importance?: number;
}

interface LLMConsolidateResponse {
  summaries?: LLMSummary[];
  // also accept single-object fallback
  content?: string;
  kind?: string;
  importance?: number;
}

/**
 * Nightly long-memory consolidator (LLM summarizer, no Redis).
 *
 * - Groups per-job episodic `fact`/`insight` (short-term) by jobId
 * - For each group calls `callLLM` with JSON mode → expects { summaries: [{content, kind, importance}] }
 * - Writes a single deduplicated long memory via `rememberLong` (normalized compare dedup)
 * - Embeds the new long memory via `embedTexts` + `memoryRepo.embedFor` with model guard (stored model === embedTexts model)
 * - Never deletes source episodic memories; no external queue/Redis
 * - If no LLM chain is configured, no-ops gracefully (returns 0 consolidated, does not throw)
 */
export async function consolidateMemory(opts: ConsolidateOptions = {}): Promise<ConsolidateResult> {
  const limit = Math.max(1, Math.min(500, opts.limit ?? 100));

  // TTL pruning still works — purge expired short-term rows before grouping.
  // No new tables: uses existing `memory.expires_at` index and `deleteExpired`.
  try {
    pruneExpired();
  } catch {
    // pruning failure is non-fatal; continue with filtered view
  }
  const nowIso = new Date().toISOString();

  // Fetch episodic candidates: per-job fact/insight. Use list() then filter
  // so we capture both short TTL rows and any fact/insight that hasn't been
  // consolidated yet. Scope to jobId when requested. Expired rows are excluded
  // (TTL guard) so consolidation never revives stale short-term memories.
  const raw = memoryRepo.list({
    limit: Math.max(limit, 200),
    ...(opts.jobId ? { jobId: opts.jobId } : {}),
  });

  const episodicAll = raw.filter(
    (m) => (m.kind === "fact" || m.kind === "insight") && !!m.jobId
  );
  const episodic = episodicAll.filter((m) => !m.expiresAt || m.expiresAt > nowIso);

  // Further filter to requested jobId if supplied (list already filtered, but keep strict)
  const filtered = opts.jobId ? episodic.filter((m) => m.jobId === opts.jobId) : episodic;
  // Group by jobId
  const groups = new Map<string, typeof filtered>();
  for (const entry of filtered) {
    const key = entry.jobId as string;
    const arr = groups.get(key);
    if (arr) arr.push(entry);
    else groups.set(key, [entry]);
  }

  // Cap scan to `limit` episodic rows sorted newest-first (already DESC), keep grouping intact
  // If over limit, slice groups by total count
  let totalCount = 0;
  const cappedGroups = new Map<string, typeof filtered>();
  for (const [jobId, entries] of groups) {
    if (totalCount >= limit) break;
    const remaining = limit - totalCount;
    const slice = entries.slice(0, remaining);
    cappedGroups.set(jobId, slice);
    totalCount += slice.length;
  }

  if (cappedGroups.size === 0) {
    return { groups: 0, consolidated: 0, skipped: 0, details: [] };
  }

  const chain = resolveChain();
  if (chain.length === 0) {
    const details = [...cappedGroups.keys()].map((jobId) => ({
      jobId,
      created: 0,
      skipped: true,
      reason: "no provider chain",
    }));
    return { groups: cappedGroups.size, consolidated: 0, skipped: cappedGroups.size, details };
  }

  let consolidated = 0;
  let skipped = 0;
  const details: ConsolidateResult["details"] = [];

  for (const [jobId, entries] of cappedGroups) {
    if (entries.length === 0) {
      details.push({ jobId, created: 0, skipped: true, reason: "empty group" });
      skipped += 1;
      continue;
    }

    // Idempotency: if episodic fingerprint unchanged since last successful consolidation, skip LLM entirely.
    const fingerprint = fingerprintEntries(entries);
    const prevFp = getConsolidationFingerprint(jobId);
    if (prevFp === fingerprint) {
      details.push({ jobId, created: 0, skipped: true, reason: "idempotent (no new episodic)" });
      skipped += 1;
      continue;
    }

    // Build episodic context — newest first, cap to avoid prompt blow-up
    const episodicText = entries
      .slice(0, 20)
      .map((e, i) => `${i + 1}. [${e.kind}] ${normalize(e.content)}`)
      .join("\n");

    const system =
      "You are a memory consolidator for a job-search workspace. Summarize the episodic facts and insights for a single job into one durable long-term decision. " +
      "Preserve concrete facts (company, role, skills, dates, decisions, outcome). " +
      "Do not invent details. Respond with valid JSON only.";

    const user =
      `Job ${jobId} episodic memories (${entries.length} items):\n` +
      episodicText +
      `\n\nReturn JSON with shape {"summaries":[{"content":"single concise consolidated summary","kind":"decision","importance":3}]}.` +
      ` kind must be one of note, insight, fact, decision, outcome; importance 3-5. One summary per job is preferred.`;

    let payload: LLMConsolidateResponse | null = null;
    try {
      const result = await callLLM(
        { system, user, json: true, agent: "consolidator", maxOutput: 800 },
        chain
      );
      const rawText = result.text ?? "";
      // Try to parse JSON from provider (handles markdown fences)
      const cleaned = rawText.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      const arrStart = cleaned.indexOf("[");
      const arrEnd = cleaned.lastIndexOf("]");
      let jsonStr: string | null = null;
      if (start !== -1 && end > start) {
        jsonStr = cleaned.slice(start, end + 1);
      } else if (arrStart !== -1 && arrEnd > arrStart) {
        jsonStr = cleaned.slice(arrStart, arrEnd + 1);
      }
      if (!jsonStr) throw new Error("no json object in response");
      const parsed = JSON.parse(jsonStr) as LLMConsolidateResponse & { summaries?: unknown };
      // Normalize array-wrapped responses
      if (Array.isArray(parsed)) {
        payload = { summaries: parsed as LLMSummary[] };
      } else {
        payload = parsed as LLMConsolidateResponse;
      }
    } catch {
      details.push({ jobId, created: 0, skipped: true, reason: "llm failed or no json" });
      skipped += 1;
      continue;
    }

    let summaries: LLMSummary[] = [];
    if (payload && Array.isArray(payload.summaries) && payload.summaries.length) {
      summaries = payload.summaries.filter((s) => s && typeof s.content === "string" && normalize(s.content).length > 0);
    } else if (payload && typeof payload.content === "string" && normalize(payload.content).length > 0) {
      summaries = [{ content: payload.content, kind: payload.kind, importance: payload.importance }];
    }

    if (summaries.length === 0) {
      details.push({ jobId, created: 0, skipped: true, reason: "empty llm summaries" });
      skipped += 1;
      continue;
    }

    // Enforce single consolidated entry per job (spec: single rememberLong decision)
    // If LLM returned multiple, take first; dedup via normalized compare happens inside rememberLong
    const first = summaries[0];
    const content = normalize(first.content);
    const kind = (["note", "insight", "fact", "decision", "outcome"].includes(first.kind ?? "") ? first.kind : "decision") as
      | "note"
      | "insight"
      | "fact"
      | "decision"
      | "outcome";
    const importance = Number.isFinite(first.importance as number) ? Math.max(3, Math.min(5, Number(first.importance))) : 3;

    // Normalized dedup check via rememberLong (already does normalized compare over listLong)
    // Capture listLong before to detect dedup (rememberLong returns existing if duplicate)
    const beforeIds = new Set(memoryRepo.listLong({ jobId, limit: 500 }).map((e) => e.id));
    let created = 0;
    try {
      const entry = rememberLong(kind, content, { jobId, source: "consolidator", importance });
      const isNew = entry.id != null && !beforeIds.has(entry.id);
      if (isNew && entry.id != null) {
        created = 1;
        consolidated += 1;
        // Embed with model guard — embedTexts returns its model, store with same model so relevantMemory guard can match
        try {
          const { vectors, model } = await embedTexts([content]);
          const vec = vectors[0];
          if (vec && vec.length) {
            memoryRepo.embedFor(entry.id, vec, model);
          }
        } catch {
          // embedding failure is non-fatal; long memory remains
        }
        setConsolidationFingerprint(jobId, fingerprint);
      } else {
        // deduped — not counted as new; still mark fingerprint so next call is idempotent without LLM
        setConsolidationFingerprint(jobId, fingerprint);
        details.push({ jobId, created: 0, skipped: true, reason: "deduplicated (normalized)" });
        skipped += 1;
        continue;
      }
    } catch {
      details.push({ jobId, created: 0, skipped: true, reason: "rememberLong failed" });
      skipped += 1;
      continue;
    }

    details.push({ jobId, created, skipped: false });
  }

  return { groups: cappedGroups.size, consolidated, skipped, details };
}
