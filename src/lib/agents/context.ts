import {
  JobApplication,
  EmailMessage,
  InterviewEvent,
  Reminder,
  UserProfile,
} from "@/types";
import { relevantMemory, formatEpisodicContextForRole } from "@/lib/agents/memory";
import { usageRepo } from "@/lib/db";
import { truncateToTokens, estimateTokens } from "@/lib/llm/tokens";
import { localEmbed } from "@/lib/vault/embeddings";
import { searchVault } from "@/lib/vault";

export interface SharedContextInput {
  profile: UserProfile;
  jobs: JobApplication[];
  emails?: EmailMessage[];
  interviews?: InterviewEvent[];
  reminders?: Reminder[];
  memoryLimit?: number;
  maxTokens?: number;
  runId?: string;
  vaultHits?: { content: string; docId?: string; docName?: string; chunkIndex?: number; model?: string; score?: number; text?: string }[];
  embeddingModel?: string;
  queryEmbedding?: number[];
}

export interface SharedContextResult {
  context: string;
  tokens: number;
  stats: {
    jobs: number;
    open: number;
    memoryNotes: number;
    pendingFollowUps: number;
    upcomingInterviews: number;
  };
}

function fmt(date: string | undefined): string {
  if (!date) return "—";
  return date.slice(0, 10);
}

export async function buildSharedContext(input: SharedContextInput): Promise<SharedContextResult> {
  const maxTokens = input.maxTokens ?? 8000;
  const jobs = input.jobs;
  const emails = input.emails ?? [];
  const interviews = input.interviews ?? [];
  const reminders = input.reminders ?? [];

  const statusCounts = new Map<string, number>();
  for (const j of jobs) statusCounts.set(j.status, (statusCounts.get(j.status) ?? 0) + 1);
  const counts = [...statusCounts.entries()]
    .map(([s, n]) => `${s} ${n}`)
    .join(", ");

  const open = jobs.filter((j) => ["wishlist", "applied", "interviewing"].includes(j.status));
  const memoryQuery = [
    input.profile.targetTitle,
    ...(input.profile.skills ?? []),
    ...open.slice(0, 20).flatMap((job) => [job.title, job.company]),
  ].filter(Boolean).join(" ");

  let qEmbedding: number[] | undefined = input.queryEmbedding;
  const modelForMemory: string | undefined = input.embeddingModel;
  if (!qEmbedding && modelForMemory === "local" && memoryQuery) {
    qEmbedding = localEmbed(memoryQuery);
  }

  const memory = relevantMemory({
    query: memoryQuery,
    jobIds: open.map((job) => job.id),
    limit: input.memoryLimit ?? 40,
    runId: input.runId,
    model: modelForMemory,
    queryEmbedding: qEmbedding,
  });
  const pendingFollowUps = jobs.filter(
    (j) => j.followUpDue && j.followUpDue < new Date().toISOString().slice(0, 10) && !["offer", "rejected"].includes(j.status)
  );
  const upcomingInterviews = interviews.filter((i) => i.status === "scheduled" && i.scheduledAt >= new Date().toISOString());

  const activeEmails = emails.slice(-8).map((e) => `- [${e.direction}] ${e.subject}`).join("\n");
  const recentNotes = jobs.slice(-6).map((j) => `- ${j.title} @ ${j.company} (${j.status}${j.matchScore != null ? `, ${j.matchScore}% match` : ""})`).join("\n");
  const usage = usageRepo.totals();

  const parts: string[] = [];
  parts.push(`## USER PROFILE`);
  parts.push(
    `Name: ${input.profile.name} · Target: ${input.profile.targetTitle || "—"} · Location: ${input.profile.location || "—"}`
  );
  parts.push(`Summary: ${(input.profile.summary || "").trim().slice(0, 1500) || "—"}`);
  parts.push(
    `Experience: ${input.profile.experience?.length ?? 0} roles · Education: ${input.profile.education?.length ?? 0} entries · Skills: ${input.profile.skills?.join(", ") || "—"}`
  );

  parts.push(`## PIPELINE STATUS`);
  parts.push(`Total tracked: ${jobs.length} · By status: ${counts || "none"} · Open: ${open.length}`);
  parts.push(`Pending follow-ups overdue: ${pendingFollowUps.length} · Upcoming interviews: ${upcomingInterviews.length}`);
  if (activeEmails.trim()) parts.push(`Recent email activity:\n${activeEmails}`);
  if (recentNotes.trim()) parts.push(`Most recently touched jobs:\n${recentNotes}`);
  const upcomingReminders = reminders
    .filter((r) => !r.done && r.dueAt >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 5);
  if (upcomingReminders.length) {
    parts.push(`Upcoming reminders:\n${upcomingReminders.map((r) => `- ${r.note || r.kind} (due ${fmt(r.dueAt)})`).join("\n")}`);
  }

  parts.push(`## REMEMBERED`);
  if (memory.length) {
    parts.push(memory.map((m) => `- [${m.kind}${m.importance > 1 ? " ★" : ""} · ${m.source}] ${m.content} (${fmt(m.createdAt)})`).join("\n"));
  } else {
    parts.push("Nothing remembered yet.");
  }

  // Episodic Career Memory section
  const topJob = open[0] || jobs[0];
  if (topJob) {
    const episodicSection = formatEpisodicContextForRole({
      company: topJob.company || "",
      title: topJob.title || "",
      jobDescription: topJob.jobDescription || "",
    });
    if (episodicSection.trim()) {
      parts.push(episodicSection);
    }
  }

  // Proactive vault RAG: top 3 hits per memoryQuery via searchVault (docName#chunkIndex model), fallback to caller-supplied vaultHits
  let effectiveVaultHits = input.vaultHits;
  if ((!effectiveVaultHits || effectiveVaultHits.length === 0) && memoryQuery.trim()) {
    try {
      const hits = await searchVault(memoryQuery, 3);
      if (hits.length) {
        effectiveVaultHits = hits.map((h) => ({
          content: h.text,
          docId: h.docId,
          docName: h.docName,
          chunkIndex: h.chunkIndex,
          model: h.model,
          score: h.score,
        }));
      }
    } catch {
      // best-effort, no Redis — ignore vault errors
    }
  }

  if (effectiveVaultHits && effectiveVaultHits.length) {
    parts.push(`## VAULT EVIDENCE`);
    parts.push(
      effectiveVaultHits
        .slice(0, 3)
        .map((h) => {
          const content = (h.content ?? (h as { text?: string }).text ?? "").slice(0, 400);
          const docLabel = h.docName ? `${h.docName}#${h.chunkIndex ?? 0}` : (h.docId ?? "");
          const modelSuffix = h.model ? ` ${h.model}` : "";
          const suffix = docLabel ? ` [${docLabel}${modelSuffix}]` : "";
          return `- ${content}${suffix}`;
        })
        .join("\n")
    );
  }

  parts.push(`## USAGE`);
  parts.push(`LLM calls logged: ${usage.calls} · Tokens: ${usage.tokens} · Errors: ${usage.errors} · Avg latency: ${usage.avgLatencyMs}ms`);

  let context = parts.join("\n\n");
  context = truncateToTokens(context, maxTokens);
  return {
    context,
    tokens: estimateTokens(context),
    stats: {
      jobs: jobs.length,
      open: open.length,
      memoryNotes: memory.length,
      pendingFollowUps: pendingFollowUps.length,
      upcomingInterviews: upcomingInterviews.length,
    },
  };
}
