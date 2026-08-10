import { describe, it, expect } from "vitest";
import { buildBoardGuidance, COLUMN_HINTS } from "@/lib/boardGuidance";
import { ApplicationStatus, EmailMessage, InterviewEvent, JobApplication } from "@/types";

const TODAY = "2026-08-10";

function makeJob(id: string, overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id,
    title: `Role ${id}`,
    company: `Company ${id}`,
    location: "Remote",
    status: "wishlist",
    jobDescription: "desc",
    autoApplyStatus: "idle",
    autoApplyLogs: [],
    createdDate: "2026-08-01",
    ...overrides,
  };
}

function makeInterview(id: string, overrides: Partial<InterviewEvent> = {}): InterviewEvent {
  return {
    id,
    jobId: "j1",
    title: "Technical",
    type: "video",
    scheduledAt: "2026-08-15T10:00:00.000Z",
    durationMin: 45,
    location: "",
    notes: "",
    status: "scheduled",
    createdAt: "2026-08-01",
    ...overrides,
  };
}

function makeEmail(id: string, overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id,
    jobId: "a1",
    direction: "received",
    subject: "Re: application",
    body: "Thanks for applying!",
    sentAt: "2026-08-09T08:00:00.000Z",
    threadId: "t1",
    status: "sent",
    read: false,
    ...overrides,
  };
}

const guidance = (apps: JobApplication[], ivs: InterviewEvent[] = [], emails: EmailMessage[] = []) =>
  buildBoardGuidance(apps, ivs, emails, { today: TODAY });

describe("buildBoardGuidance — wishlist", () => {
  it("counts targets and names the highest-match companies", () => {
    const apps = [
      makeJob("w1", { company: "Acme", matchScore: 90 }),
      makeJob("w2", { company: "Globex", matchScore: 60 }),
      makeJob("w3", { company: "Initech", matchScore: 78 }),
    ];
    const g = guidance(apps);
    expect(g.wishlist.summary).toContain("3 wishlist targets");
    expect(g.wishlist.summary).toContain("Acme");
    expect(g.wishlist.summary).toContain("Initech");
  });

  it("distinguishes crawler-sourced targets", () => {
    const apps = [
      makeJob("m1", { company: "Acme", matchScore: 90 }),
      makeJob("c1", { company: "RemoteOK Co", source: "RemoteOK", matchScore: 55 }),
    ];
    const g = guidance(apps);
    expect(g.wishlist.summary).toContain("2 wishlist targets");
    expect(g.wishlist.summary).toContain("Acme");
    expect(g.wishlist.summary).toContain("1 from crawler");
  });

  it("handles the empty board", () => {
    const g = guidance([]);
    expect(g.wishlist.summary).toContain("No wishlist targets");
  });
});

describe("buildBoardGuidance — applied", () => {
  it("flags overdue follow-ups by company", () => {
    const apps = [
      makeJob("a1", { status: "applied", company: "Galadrim", followUpDue: "2026-08-04" }),
      makeJob("a2", { status: "applied", company: "Flatgigs", followUpDue: "2026-08-20" }),
    ];
    const g = guidance(apps);
    expect(g.applied.summary).toContain("overdue");
    expect(g.applied.summary).toContain("Galadrim");
    expect(g.applied.summary).not.toContain("Flatgigs");
  });

  it("flags follow-ups due within 3 days", () => {
    const apps = [
      makeJob("a1", { status: "applied", company: "DigeHealth", followUpDue: "2026-08-11" }),
    ];
    const g = guidance(apps);
    expect(g.applied.summary).toContain("due soon");
    expect(g.applied.summary).toContain("DigeHealth");
  });

  it("mentions fresh inbox replies when nothing is overdue", () => {
    const apps = [makeJob("a1", { status: "applied", company: "Glovo" })];
    const emails = [makeEmail("e1", { jobId: "a1" }), makeEmail("e2", { jobId: "a1" })];
    const g = guidance(apps, [], emails);
    expect(g.applied.summary).toContain("2 new replies");
  });

  it("falls back to a neutral in-flight message", () => {
    const apps = [makeJob("a1", { status: "applied", company: "Glovo" })];
    const g = guidance(apps);
    expect(g.applied.summary).toContain("1 application in flight");
  });
});

describe("buildBoardGuidance — interviewing", () => {
  it("names the jobs with interviews within the next 7 days", () => {
    const apps = [makeJob("i1", { status: "interviewing", company: "Wavestone" })];
    const ivs = [
      makeInterview("iv1", { jobId: "i1", scheduledAt: "2026-08-15T10:00:00.000Z", title: "Technical" }),
      makeInterview("iv2", { jobId: "i1", scheduledAt: "2026-09-01T10:00:00.000Z" }), // too far out
      makeInterview("iv3", { jobId: "i1", scheduledAt: "2026-08-05T10:00:00.000Z", status: "done" }), // past/done
    ];
    const g = guidance(apps, ivs);
    expect(g.interviewing.summary).toContain("Wavestone");
    expect(g.interviewing.summary).toContain("2026-08-15");
  });

  it("ignores interviews for jobs no longer interviewing", () => {
    const apps = [makeJob("a1", { status: "applied", company: "Acme" })];
    const ivs = [makeInterview("iv1", { jobId: "a1", scheduledAt: "2026-08-15T10:00:00.000Z" })];
    const g = guidance(apps, ivs);
    expect(g.interviewing.summary).toContain("No interviews scheduled");
  });
});

describe("buildBoardGuidance — offer / rejected", () => {
  it("encourages negotiation when offers exist", () => {
    const apps = [makeJob("o1", { status: "offer", company: "Stripe" })];
    const g = guidance(apps);
    expect(g.offer.summary).toContain("1 offer");
    expect(g.offer.summary).toContain("Stripe");
    expect(g.offer.summary).toContain("negotiate");
  });

  it("frames rejections as feedback opportunities", () => {
    const apps = [makeJob("r1", { status: "rejected", company: "BigCo" })];
    const g = guidance(apps);
    expect(g.rejected.summary).toContain("BigCo");
    expect(g.rejected.summary).toContain("feedback");
  });
});

describe("COLUMN_HINTS", () => {
  it("covers every board column with a non-empty hint", () => {
    const statuses: ApplicationStatus[] = ["wishlist", "applied", "interviewing", "offer", "rejected"];
    for (const s of statuses) {
      expect(COLUMN_HINTS[s].trim().length).toBeGreaterThan(0);
    }
  });
});
