import {
  JobApplication,
  EmailMessage,
  InterviewEvent,
  Reminder,
  UserProfile,
} from "@/types";
import { recentMemory } from "@/lib/agents/memory";
import { usageRepo } from "@/lib/db";
import { truncateToTokens, estimateTokens } from "@/lib/llm/tokens";

export interface SharedContextInput {
  profile: UserProfile;
  jobs: JobApplication[];
  emails?: EmailMessage[];
  interviews?: InterviewEvent[];
  reminders?: Reminder[];
  memoryLimit?: number;
  maxTokens?: number;
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

/**
 * Builds the token-budgeted shared context that every agent receives:
 * who the user is, what the pipeline looks like right now, what the
 * agents remembered before, and what is coming up. Truncates the tail
 * (job list details) first, then the memory feed.
 */
export function buildSharedContext(input: SharedContextInput): SharedContextResult {
  const maxTokens = input.maxTokens ?? 8000;
  const jobs = input.jobs;
  const emails = input.emails ?? [];
  const interviews = input.interviews ?? [];
  const reminders = input.reminders ?? [];
  const memory = recentMemory({ limit: input.memoryLimit ?? 40 });

  const statusCounts = new Map<string, number>();
  for (const j of jobs) statusCounts.set(j.status, (statusCounts.get(j.status) ?? 0) + 1);
  const counts = [...statusCounts.entries()]
    .map(([s, n]) => `${s} ${n}`)
    .join(", ");

  const open = jobs.filter((j) => ["wishlist", "applied", "interviewing"].includes(j.status));
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
    parts.push(memory.map((m) => `- [${m.kind}${m.importance > 1 ? " ★" : ""}] ${m.content} (${fmt(m.createdAt)})`).join("\n"));
  } else {
    parts.push("Nothing remembered yet.");
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
