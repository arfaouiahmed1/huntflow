/**
 * Real Server-Side IMAP Sync Engine — Huntflow Agent Hardening
 *
 * Connects to IMAP server via imapflow (using Gmail XOAUTH2 tokens or custom IMAP settings),
 * fetches recent messages with UID-based deduplication, persists to emailsRepo,
 * and automatically classifies recruiter communications to update job statuses.
 */

import { ImapFlow } from "imapflow";
import { resolveMailAuth } from "@/lib/gmailAuth";
import { settingsRepo, emailsRepo, jobsRepo, interviewsRepo } from "@/lib/db";
import { EmailMessage, InterviewEvent } from "@/types";
import { classifyRecruiterEmail } from "./imapClassifier";

export interface ImapSyncOptions {
  limit?: number;
  autoUpdateJobStatus?: boolean;
}

export interface ImapSyncResult {
  success: boolean;
  syncedCount: number;
  newEmailsCount: number;
  matchedJobsCount: number;
  updatedJobs: Array<{ jobId: string; company: string; status: string; category: string }>;
  error?: string;
}

export async function syncImapInbox(opts: ImapSyncOptions = {}): Promise<ImapSyncResult> {
  const limit = Math.min(50, Math.max(5, opts.limit || 20));
  const autoUpdate = opts.autoUpdateJobStatus ?? true;

  // 1. Resolve Auth (Gmail OAuth first, then fallback to custom mail_settings)
  const gmailAuth = await resolveMailAuth();
  let imapConfig: { host: string; port: number; secure: boolean; auth: { user: string; pass?: string; accessToken?: string } } | null = null;

  if (gmailAuth?.imap) {
    imapConfig = {
      host: gmailAuth.imap.host,
      port: gmailAuth.imap.port,
      secure: gmailAuth.imap.secure,
      auth: {
        user: gmailAuth.imap.auth.user,
        accessToken: gmailAuth.imap.auth.accessToken,
      },
    };
  } else {
    // Check custom mail_settings in settings table
    try {
      const rawSettings = settingsRepo.get("mail_settings");
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings) as { imapHost?: string; imapPort?: number; imapUser?: string; imapPass?: string; imapSecure?: boolean };
        if (parsed.imapHost && parsed.imapUser && parsed.imapPass) {
          imapConfig = {
            host: parsed.imapHost,
            port: parsed.imapPort || 993,
            secure: parsed.imapSecure ?? true,
            auth: {
              user: parsed.imapUser,
              pass: parsed.imapPass,
            },
          };
        }
      }
    } catch {}
  }

  if (!imapConfig) {
    return {
      success: false,
      syncedCount: 0,
      newEmailsCount: 0,
      matchedJobsCount: 0,
      updatedJobs: [],
      error: "No active Gmail OAuth or custom IMAP credentials configured.",
    };
  }

  const client = new ImapFlow({
    host: imapConfig.host,
    port: imapConfig.port,
    secure: imapConfig.secure,
    auth: imapConfig.auth,
    logger: false,
  });

  const updatedJobs: Array<{ jobId: string; company: string; status: string; category: string }> = [];
  let syncedCount = 0;
  let newEmailsCount = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Fetch latest messages from INBOX by sequence range
      const status = await client.status("INBOX", { messages: true });
      const totalMessages = status.messages || 0;

      if (totalMessages > 0) {
        const startSeq = Math.max(1, totalMessages - limit + 1);
        const range = `${startSeq}:${totalMessages}`;

        const existingEmails = emailsRepo.list();
        const existingIds = new Set(existingEmails.map((e) => e.id));
        const allJobs = jobsRepo.list();

        for await (const message of client.fetch(range, { envelope: true, uid: true, bodyStructure: true, source: true })) {
          syncedCount++;
          const uid = message.uid;
          const emailId = `imap_${uid}`;

          if (existingIds.has(emailId)) {
            continue; // UID-based idempotency — skip already synced
          }

          const envelope = message.envelope;
          const subject = envelope?.subject || "No Subject";
          const senderAddress = envelope?.from?.[0]?.address || "";
          const date = envelope?.date ? new Date(envelope.date).toISOString() : new Date().toISOString();

          // Extract basic body text from raw source
          const rawSource = message.source ? message.source.toString("utf-8") : "";
          const bodyText = rawSource.slice(0, 4000);

          // Classify communication
          const classification = classifyRecruiterEmail(subject, bodyText, senderAddress);

          // Attempt matching to active job
          let matchedJobId: string | undefined;
          for (const j of allJobs) {
            const companyMatch =
              senderAddress.toLowerCase().includes(j.company.toLowerCase().replace(/[^a-z0-9]/g, "")) ||
              subject.toLowerCase().includes(j.company.toLowerCase());

            if (companyMatch) {
              matchedJobId = j.id;

              if (autoUpdate && classification.suggestedStatusUpdate) {
                if (classification.suggestedStatusUpdate === "rejected" && j.status !== "rejected") {
                  jobsRepo.upsert({ ...j, status: "rejected" });
                  updatedJobs.push({ jobId: j.id, company: j.company, status: "rejected", category: "rejection" });
                } else if (classification.suggestedStatusUpdate === "interviewing" && j.status !== "interviewing" && j.status !== "offer") {
                  jobsRepo.upsert({ ...j, status: "interviewing" });
                  updatedJobs.push({ jobId: j.id, company: j.company, status: "interviewing", category: "interview_invite" });

                  if (classification.interviewMeetingLink) {
                    const event: InterviewEvent = {
                      id: `int_${Date.now()}_${j.id.slice(0, 4)}`,
                      jobId: j.id,
                      title: `Recruiter Screen @ ${j.company}`,
                      type: "phone",
                      scheduledAt: new Date(Date.now() + 3 * 86400000).toISOString(),
                      durationMin: 30,
                      location: classification.interviewMeetingLink,
                      status: "scheduled",
                      notes: `Scheduling link extracted from email: ${classification.interviewMeetingLink}`,
                      createdAt: new Date().toISOString(),
                    };
                    interviewsRepo.upsert(event);
                  }
                }
              }
              break;
            }
          }

          const emailRecord: EmailMessage = {
            id: emailId,
            jobId: matchedJobId,
            direction: "received",
            subject,
            body: bodyText,
            sentAt: date,
            threadId: `thread_${uid}`,
            status: "replied",
            read: false,
          };

          emailsRepo.upsert(emailRecord);
          existingIds.add(emailId);
          newEmailsCount++;
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();

    return {
      success: true,
      syncedCount,
      newEmailsCount,
      matchedJobsCount: updatedJobs.length,
      updatedJobs,
    };
  } catch (err) {
    try {
      await client.logout();
    } catch {}

    return {
      success: false,
      syncedCount,
      newEmailsCount,
      matchedJobsCount: updatedJobs.length,
      updatedJobs,
      error: err instanceof Error ? err.message : "IMAP connection error",
    };
  }
}
