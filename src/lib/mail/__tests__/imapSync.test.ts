import { describe, it, expect, beforeEach, vi } from "vitest";
import { syncImapInbox } from "../imapSync";
import { emailsRepo, jobsRepo } from "@/lib/db";
import { POST as syncRoutePost, GET as syncRouteGet } from "@/app/api/mail/sync/route";
import { NextRequest } from "next/server";

// Mock imapflow client with a proper class constructor
vi.mock("imapflow", () => {
  class MockImapFlow {
    connect = vi.fn().mockResolvedValue(undefined);
    getMailboxLock = vi.fn().mockResolvedValue({ release: vi.fn() });
    status = vi.fn().mockResolvedValue({ messages: 2 });
    fetch = vi.fn().mockImplementation(async function* () {
      yield {
        uid: 101,
        envelope: {
          subject: "Update on your application at Datadog",
          from: [{ address: "recruiting@datadog.com", name: "Datadog Recruiting" }],
          date: new Date("2026-08-20T10:00:00Z"),
        },
        source: Buffer.from(
          "Thank you for interviewing with us. Unfortunately, we have decided to pursue other candidates at this time."
        ),
      };
      yield {
        uid: 102,
        envelope: {
          subject: "Next steps with Vercel",
          from: [{ address: "jobs@vercel.com", name: "Vercel Talent" }],
          date: new Date("2026-08-21T14:30:00Z"),
        },
        source: Buffer.from(
          "We would love to invite you to interview! Please schedule here: https://calendly.com/vercel/screen"
        ),
      };
    });
    logout = vi.fn().mockResolvedValue(undefined);
  }

  return {
    ImapFlow: MockImapFlow,
  };
});

// Mock resolveMailAuth to provide valid mock credentials
vi.mock("@/lib/gmailAuth", () => ({
  resolveMailAuth: vi.fn().mockResolvedValue({
    imap: {
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: "candidate@gmail.com", accessToken: "mock_token" },
    },
    smtp: {
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { type: "OAuth2", user: "candidate@gmail.com", accessToken: "mock_token" },
    },
  }),
}));

describe("Real Server-Side IMAP Sync Engine", () => {
  beforeEach(() => {
    // Clean emails and jobs
    const emails = emailsRepo.list();
    for (const e of emails) emailsRepo.remove(e.id);

    // Setup active jobs for matching
    jobsRepo.upsert({
      id: "job-datadog",
      title: "Senior Systems Engineer",
      company: "Datadog",
      location: "Remote",
      status: "applied",
      createdDate: new Date().toISOString(),
      jobDescription: "Datadog systems engineering",
    });

    jobsRepo.upsert({
      id: "job-vercel",
      title: "Staff Frontend Architect",
      company: "Vercel",
      location: "Remote",
      status: "applied",
      createdDate: new Date().toISOString(),
      jobDescription: "Vercel frontend engineering",
    });
  });

  it("syncs messages with UID deduplication and updates job statuses", async () => {
    const res = await syncImapInbox({ limit: 10, autoUpdateJobStatus: true });

    expect(res.success).toBe(true);
    expect(res.syncedCount).toBe(2);
    expect(res.newEmailsCount).toBe(2);

    // Verify emails were persisted into emailsRepo
    const saved = emailsRepo.list();
    expect(saved.some((e) => e.id === "imap_101")).toBe(true);
    expect(saved.some((e) => e.id === "imap_102")).toBe(true);

    // Verify Datadog job was updated to rejected
    const datadog = jobsRepo.get("job-datadog");
    expect(datadog?.status).toBe("rejected");

    // Verify Vercel job was updated to interviewing
    const vercel = jobsRepo.get("job-vercel");
    expect(vercel?.status).toBe("interviewing");

    // Re-running sync performs UID-based deduplication (0 new emails)
    const secondSync = await syncImapInbox({ limit: 10 });
    expect(secondSync.newEmailsCount).toBe(0);
  });

  it("handles bodyless POST /api/mail/sync from outreach and AppContext gracefully", async () => {
    const req = new NextRequest("http://localhost:3000/api/mail/sync", {
      method: "POST",
    });

    const res = await syncRoutePost(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.mode).toBe("imap_sync");
    expect(data.success).toBe(true);
  });
});
