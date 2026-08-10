import { ApplicationStatus, EmailMessage, InterviewEvent, JobApplication } from "@/types";

/**
 * Deterministic board coaching — no LLM. Derives per-column summaries from the
 * live tracker dataset (counts, overdue follow-ups, upcoming interviews, inbox
 * replies) so the Coaching panel always reflects the real pipeline.
 *
 * `buildBoardGuidance(applications, interviews, emails)` returns a map keyed by
 * ApplicationStatus; each entry carries a one-line, actionable `summary`.
 */

export interface ColumnGuidance {
  /** Short, helpful agent-written line shown in the Coaching panel. */
  summary: string;
}

export interface BoardGuidanceOptions {
  /** ISO date (yyyy-mm-dd) to treat as "today". Defaults to the real date. */
  today?: string;
}

export type BoardGuidance = Record<ApplicationStatus, ColumnGuidance>;

const DAY_MS = 86_400_000;

function daysFrom(iso: string, today: Date): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return Number.NaN;
  return Math.round((d.getTime() - today.getTime()) / DAY_MS);
}

function isPast(dateStr: string, today: Date): boolean {
  const diff = daysFrom(dateStr, today);
  return Number.isFinite(diff) && diff < 0;
}

function isUpcoming(dateStr: string, today: Date, horizonDays: number): boolean {
  const diff = daysFrom(dateStr, today);
  return Number.isFinite(diff) && diff >= 0 && diff <= horizonDays;
}

function labelJob(job: JobApplication): string {
  return job.company?.trim() || job.title || "a role";
}

/** Comma-joined company labels, capped at `n` entries. */
function names(jobs: JobApplication[], n = 3): string {
  const labels = jobs
    .slice(0, n)
    .map(labelJob)
    .filter(Boolean);
  return labels.join(", ");
}

/** Highest-match jobs first, used to name the "sharpen your pitch" targets. */
function topMatches(jobs: JobApplication[], n = 3): string {
  return names([...jobs].sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1)), n);
}

function plural(n: number, noun: string, pluralNoun = noun + "s"): string {
  return `${n} ${n === 1 ? noun : pluralNoun}`;
}

export function buildBoardGuidance(
  applications: JobApplication[],
  interviews: InterviewEvent[] = [],
  emails: EmailMessage[] = [],
  opts: BoardGuidanceOptions = {}
): BoardGuidance {
  const today = new Date(`${opts.today ?? new Date().toISOString().slice(0, 10)}T00:00:00`);

  const byStatus = (status: ApplicationStatus) => applications.filter((a) => a.status === status);

  const wishlist = byStatus("wishlist");
  const applied = byStatus("applied");
  const interviewing = byStatus("interviewing");
  const offers = byStatus("offer");
  const rejected = byStatus("rejected");

  /* ---------------- Wishlist ---------------- */
  let wishlistSummary: string;
  if (wishlist.length === 0) {
    wishlistSummary = "No wishlist targets yet — crawl or search the boards and save high-fit roles.";
  } else {
    const manual = wishlist.filter((a) => !a.source);
    const crawled = wishlist.filter((a) => Boolean(a.source));
    if (manual.length === 0) {
      wishlistSummary = `${plural(crawled.length, "crawler-found target")} in Wishlist — review them under the Crawled filter and run match analysis before applying.`;
    } else {
      const targets = topMatches(manual, 3);
      const crawledNote = crawled.length ? ` (${plural(crawled.length, "from crawler")})` : "";
      wishlistSummary = `${plural(wishlist.length, "wishlist target")} — run match analysis on ${targets} to sharpen your pitch${crawledNote}.`;
    }
  }

  /* ---------------- Applied ---------------- */
  const appliedOverdue = applied.filter((a) => a.followUpDue && isPast(a.followUpDue, today));
  const appliedDueSoon = applied.filter((a) => a.followUpDue && isUpcoming(a.followUpDue, today, 3));
  const appliedIds = new Set(applied.map((a) => a.id));
  const inboxReplies = emails.filter(
    (e) => e.direction === "received" && Boolean(e.jobId) && appliedIds.has(e.jobId ?? "")
  ).length;

  let appliedSummary: string;
  if (appliedOverdue.length > 0) {
    appliedSummary = `Follow-ups overdue for ${names(appliedOverdue)} — reach out today.`;
  } else if (appliedDueSoon.length > 0) {
    appliedSummary = `Follow-ups due soon for ${names(appliedDueSoon)} — don't let them go cold.`;
  } else if (inboxReplies > 0) {
    appliedSummary = `${plural(inboxReplies, "new reply", "new replies")} in your inbox for applied roles — read and respond promptly.`;
  } else {
    appliedSummary = `${plural(applied.length, "application")} in flight — follow up 5–7 days after applying if you haven't heard back.`;
  }

  /* ---------------- Interviewing ---------------- */
  const interviewingIds = new Set(interviewing.map((a) => a.id));
  const upcoming = interviews
    .filter((iv) => iv.status === "scheduled" && Boolean(iv.jobId) && interviewingIds.has(iv.jobId ?? ""))
    .filter((iv) => isUpcoming(iv.scheduledAt, today, 7))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  let interviewingSummary: string;
  if (upcoming.length > 0) {
    const labels = upcoming
      .slice(0, 3)
      .map((iv) => {
        const job = applications.find((a) => a.id === iv.jobId);
        return job ? labelJob(job) : iv.title || iv.type || "a round";
      })
      .filter(Boolean);
    const date = upcoming[0].scheduledAt.slice(0, 10);
    interviewingSummary = `Prep for ${labels.join(", ")} — ${upcoming.length === 1 ? "round is" : "rounds are"} coming up (first: ${date}).`;
  } else if (interviewing.length > 0) {
    interviewingSummary = `${plural(interviewing.length, "interview")} in progress — stay warm with thank-you notes and keep prepping.`;
  } else {
    interviewingSummary = "No interviews scheduled yet — once you get a callback, prep the technical and behavioral rounds.";
  }

  /* ---------------- Offer ---------------- */
  let offerSummary: string;
  if (offers.length > 0) {
    offerSummary = `${plural(offers.length, "offer")} on the table (${names(offers, 2)}) — negotiate, align on the start date, and close out the other loops.`;
  } else {
    offerSummary = "No offers yet — keep the momentum; the applied + interviewing pipeline is where the next one comes from.";
  }

  /* ---------------- Rejected ---------------- */
  let rejectedSummary: string;
  if (rejected.length > 0) {
    rejectedSummary = `Rejections are data — request feedback from ${names(rejected, 2)} and fold the learnings into your pitch.`;
  } else {
    rejectedSummary = "No rejections logged — every closed loop teaches you something, so keep swinging.";
  }

  return {
    wishlist: { summary: wishlistSummary },
    applied: { summary: appliedSummary },
    interviewing: { summary: interviewingSummary },
    offer: { summary: offerSummary },
    rejected: { summary: rejectedSummary },
  };
}

/** Static one-liner shown under each column header in the board view. */
export const COLUMN_HINTS: Record<ApplicationStatus, string> = {
  wishlist: "Sharpen the pitch before you apply — run match analysis on the top fits.",
  applied: "Follow up 5–7 days after applying to stay top-of-mind.",
  interviewing: "Prep the technical round and send thank-you notes after each call.",
  offer: "Negotiate, align on the start date, and close out other loops.",
  rejected: "Request feedback and log the learnings for the next target.",
};
