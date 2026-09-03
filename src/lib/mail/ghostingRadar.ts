/**
 * Ghosting Radar & Dormant Application Scanner — Huntflow Agent Hardening (Phase 3)
 *
 * Scans active applications for unresponsive recruiter periods (>14 days)
 * and queues high-impact follow-up nudges.
 */

import { JobApplication, EmailMessage } from "@/types";

export interface GhostedApplication {
  jobId: string;
  company: string;
  jobTitle: string;
  appliedDate: string;
  daysElapsed: number;
  daysSilent: number;
  riskCategory: "stale_14d" | "dormant_30d" | "critical_45d";
  recommendedNudgeAction: string;
  followupDraft: string;
  suggestedFollowUp: {
    subject: string;
    body: string;
  };
}

export interface GhostingReport extends Array<GhostedApplication> {
  totalScanned: number;
  ghostedCount: number;
  alerts: GhostedApplication[];
  oldestSilentDays: number;
}

export function scanGhostingRadar(
  jobs: JobApplication[],
  thresholdOrEmails?: number | EmailMessage[],
  candidateNameOrThreshold?: string | number,
  emailsParam?: EmailMessage[]
): GhostingReport {
  const now = Date.now();
  const alerts: GhostedApplication[] = [];

  let thresholdDays = 14;
  let candidateName = "Candidate";
  let emails: EmailMessage[] = [];

  if (typeof thresholdOrEmails === "number") {
    thresholdDays = thresholdOrEmails;
    if (typeof candidateNameOrThreshold === "string") candidateName = candidateNameOrThreshold;
    if (Array.isArray(emailsParam)) emails = emailsParam;
  } else if (Array.isArray(thresholdOrEmails)) {
    emails = thresholdOrEmails;
    if (typeof candidateNameOrThreshold === "number") thresholdDays = candidateNameOrThreshold;
  }

  const activeApplied = jobs.filter((j) => j.status === "applied");

  for (const job of activeApplied) {
    const appliedTimestamp = job.appliedDate
      ? new Date(job.appliedDate).getTime()
      : new Date(job.createdDate).getTime();
    if (Number.isNaN(appliedTimestamp)) continue;

    // Check if any recent emails exist for this company
    const hasRecentEmail = emails.some((e) => {
      const matchCompany =
        (e.subject || "").toLowerCase().includes(job.company.toLowerCase());
      const emailDate = new Date(e.sentAt).getTime();
      return matchCompany && now - emailDate < thresholdDays * 86400000;
    });

    if (hasRecentEmail) continue;

    const daysElapsed = Math.max(0, Math.floor((now - appliedTimestamp) / 86400000));
    if (daysElapsed >= thresholdDays) {
      const riskCategory =
        daysElapsed >= 45 ? "critical_45d" : daysElapsed >= 30 ? "dormant_30d" : "stale_14d";
      const action =
        daysElapsed >= 30
          ? "Send final proof case-study follow-up before archiving"
          : "Deploy Day 14 Value Nudge outreach email";

      const subject = `Following up on ${job.title} application — ${candidateName}`;
      const body = `Hi ${job.company} Team,

I wanted to follow up on my application for the ${job.title} position submitted on ${job.appliedDate || job.createdDate}. I remain very enthusiastic about the opportunity to contribute to ${job.company}.

Please let me know if there are any additional materials or details I can provide.

Best regards,
${candidateName}`;

      alerts.push({
        jobId: job.id,
        company: job.company,
        jobTitle: job.title,
        appliedDate: job.appliedDate || job.createdDate,
        daysElapsed,
        daysSilent: daysElapsed,
        riskCategory,
        recommendedNudgeAction: action,
        followupDraft: body,
        suggestedFollowUp: {
          subject,
          body,
        },
      });
    }
  }

  alerts.sort((a, b) => b.daysElapsed - a.daysElapsed);

  const report = Object.assign(alerts, {
    totalScanned: activeApplied.length,
    ghostedCount: alerts.length,
    alerts,
    oldestSilentDays: alerts.length > 0 ? alerts[0].daysElapsed : 0,
  });

  return report;
}
