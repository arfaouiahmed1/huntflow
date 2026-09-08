import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { POST as CRAWL_POST } from "@/app/api/crawl/route";
import { GET as INBOX_GET } from "@/app/api/discovery/inbox/route";
import { POST as DECIDE_POST } from "@/app/api/discovery/decide/route";
import {
  closeDb,
  discoveryQueueRepo,
  getDb,
  jobsRepo,
  jobSourceEdgesRepo,
  migrate,
  settingsRepo,
} from "@/lib/db";
import type { JobApplication } from "@/types";
import { NextRequest } from "next/server";

function queuePayload(id: string, overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id,
    title: "Senior React Engineer",
    company: "Acme",
    location: "Remote",
    url: `https://acme.io/jobs/${id}`,
    status: "wishlist",
    jobDescription: "Build interfaces with React and TypeScript.",
    source: "remoteok",
    createdDate: new Date().toISOString(),
    canonicalKey: `acme::senior-react-engineer::${id}`,
    matchScore: 82,
    rankingBreakdown: { skill: 20 },
    autoApplyStatus: "idle",
    autoApplyLogs: [],
    ...overrides,
  } as JobApplication;
}

function queueUpsert(id: string, overrides: Partial<JobApplication> = {}) {
  const payload = queuePayload(id, overrides);
  return discoveryQueueRepo.upsert({
    canonicalKey: payload.canonicalKey!,
    sourceId: payload.source!,
    externalId: payload.id,
    runId: "run_test",
    payload,
    matchScore: payload.matchScore ?? null,
    rankingBreakdown: payload.rankingBreakdown ?? null,
  });
}

function decideReq(body: unknown) {
  return new NextRequest("http://localhost/api/discovery/decide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("discovery_queue persistence", () => {
  beforeEach(() => {
    closeDb();
    const db = getDb();
    migrate(db);
    migrate(db); // idempotent under the new table
    jobsRepo.removeAll();
    discoveryQueueRepo.deleteAll();
    settingsRepo.wipe();
  });

  afterEach(() => {
    closeDb();
  });

  it("upsert enters the inbox as new with a renderable payload", () => {
    const item = queueUpsert("q1");
    expect(item.status).toBe("new");
    expect(item.canonicalKey).toBe("acme::senior-react-engineer::q1");
    expect(item.matchScore).toBe(82);

    const pending = discoveryQueueRepo.list({ statuses: ["new", "seen"] });
    expect(pending).toHaveLength(1);
    const rendered = JSON.parse(pending[0]!.payloadJson) as JobApplication;
    expect(rendered.title).toBe("Senior React Engineer");
    expect(rendered.company).toBe("Acme");

    expect(discoveryQueueRepo.counts()).toMatchObject({ new: 1, pending: 1, total: 1 });
  });

  it("duplicate upserts are idempotent and refresh the payload", () => {
    queueUpsert("q1");
    const again = queueUpsert("q1", { matchScore: 91, salary: "$200k" });
    expect(again.status).toBe("new");
    expect(again.matchScore).toBe(91);
    expect(discoveryQueueRepo.counts().total).toBe(1);

    // Same source identity under a rotated canonical key still collapses.
    const payload = queuePayload("q1", { canonicalKey: "acme::senior-react-engineer::q1b" });
    discoveryQueueRepo.upsert({
      canonicalKey: "acme::senior-react-engineer::q1b",
      sourceId: "remoteok",
      externalId: "q1",
      runId: "run_test_2",
      payload,
      matchScore: 80,
    });
    expect(discoveryQueueRepo.counts().total).toBe(1);
  });

  it("re-crawls never reopen terminal decisions", () => {
    queueUpsert("q1");
    discoveryQueueRepo.decide("acme::senior-react-engineer::q1", "dismissed", { reason: "salary_low" });
    const refreshed = queueUpsert("q1", { matchScore: 99 });
    expect(refreshed.status).toBe("dismissed");
    expect(refreshed.dismissReason).toBe("salary_low");
    expect(refreshed.matchScore).toBe(99);
  });

  it("dismissed items never create tracker jobs; tracker excludes the inbox", () => {
    queueUpsert("q1");
    queueUpsert("q2");
    // Tracker sees nothing from queue ingest alone.
    expect(jobsRepo.list()).toHaveLength(0);

    const decided = discoveryQueueRepo.decide("acme::senior-react-engineer::q1", "dismissed", {
      reason: "stack_mismatch",
    });
    expect(decided?.status).toBe("dismissed");
    expect(decided?.dismissReason).toBe("stack_mismatch");
    expect(decided?.dismissedAt).toBeTruthy();
    expect(jobsRepo.list()).toHaveLength(0);
    expect(discoveryQueueRepo.list({ statuses: ["new", "seen"] })).toHaveLength(1);
  });

  it("pruneDecided only removes terminal rows older than the cutoff", () => {
    queueUpsert("q1");
    queueUpsert("q2");
    discoveryQueueRepo.decide("acme::senior-react-engineer::q1", "dismissed", { reason: "generic" });
    expect(discoveryQueueRepo.pruneDecided(new Date(Date.now() + 1000).toISOString())).toBe(1);
    expect(discoveryQueueRepo.get("acme::senior-react-engineer::q1")).toBeNull();
    expect(discoveryQueueRepo.get("acme::senior-react-engineer::q2")).not.toBeNull();
    // Fresh terminal rows survive a far-past cutoff.
    discoveryQueueRepo.decide("acme::senior-react-engineer::q2", "dismissed", { reason: "generic" });
    expect(discoveryQueueRepo.pruneDecided("2000-01-01T00:00:00.000Z")).toBe(0);
  });
});

describe("POST /api/discovery/decide", () => {
  beforeEach(() => {
    closeDb();
    migrate(getDb());
    jobsRepo.removeAll();
    discoveryQueueRepo.deleteAll();
    jobSourceEdgesRepo.deleteAll();
  });

  afterEach(() => {
    closeDb();
    vi.unstubAllGlobals();
  });

  it("saved promotes a tracker job with crawler origin and a source edge", async () => {
    queueUpsert("q1");
    const res = await DECIDE_POST(decideReq({ canonicalKey: "acme::senior-react-engineer::q1", outcome: "saved" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.status).toBe("saved");

    const tracked = jobsRepo.list();
    expect(tracked).toHaveLength(1);
    expect(tracked[0]!.origin).toBe("crawler");
    expect(tracked[0]!.status).toBe("wishlist");
    expect(tracked[0]!.source).toBe("remoteok");

    const edges = jobSourceEdgesRepo.listByJob(tracked[0]!.id);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ sourceId: "remoteok", externalId: "q1" });

    const item = discoveryQueueRepo.get("acme::senior-react-engineer::q1");
    expect(item?.status).toBe("saved");
    expect(item?.savedJobId).toBe(tracked[0]!.id);
  });

  it("saved is idempotent — a second save links the same tracker job", async () => {
    queueUpsert("q1");
    const first = await DECIDE_POST(decideReq({ canonicalKey: "acme::senior-react-engineer::q1", outcome: "saved" }));
    const firstJob = ((await first.json()) as { job: JobApplication }).job;
    const second = await DECIDE_POST(decideReq({ canonicalKey: "acme::senior-react-engineer::q1", outcome: "saved" }));
    expect(second.status).toBe(200);
    const secondJob = ((await second.json()) as { job: JobApplication }).job;
    expect(secondJob.id).toBe(firstJob.id);
    expect(jobsRepo.list()).toHaveLength(1);
  });

  it("dismissed removes the card from the inbox and never touches the tracker", async () => {
    queueUpsert("q1");
    const res = await DECIDE_POST(
      decideReq({ canonicalKey: "acme::senior-react-engineer::q1", outcome: "dismissed", reason: "salary_low" })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(jobsRepo.list()).toHaveLength(0);
    expect(jobSourceEdgesRepo.listAll()).toHaveLength(0);

    const inbox = await INBOX_GET(
      new NextRequest("http://localhost/api/discovery/inbox?status=pending")
    );
    const inboxData = await inbox.json();
    expect(inboxData.jobs).toHaveLength(0);
    expect(inboxData.counts.dismissed).toBe(1);
  });

  it("returns structured errors for unknown keys and bad payloads", async () => {
    const missing = await DECIDE_POST(decideReq({ canonicalKey: "nope", outcome: "saved" }));
    expect(missing.status).toBe(404);
    expect((await missing.json()).success).toBe(false);

    const bad = await DECIDE_POST(decideReq({ canonicalKey: "x", outcome: "explode" }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).success).toBe(false);

    const empty = await DECIDE_POST(decideReq({ outcome: "saved" }));
    expect(empty.status).toBe(400);
  });
});

describe("GET /api/discovery/inbox", () => {
  beforeEach(() => {
    closeDb();
    migrate(getDb());
    jobsRepo.removeAll();
    discoveryQueueRepo.deleteAll();
  });

  afterEach(() => {
    closeDb();
  });

  it("lists pending inbox cards ordered by score with counts", async () => {
    queueUpsert("low", { matchScore: 40 });
    queueUpsert("high", { matchScore: 95 });
    const res = await INBOX_GET(new NextRequest("http://localhost/api/discovery/inbox?status=pending&limit=50"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.jobs).toHaveLength(2);
    expect(data.jobs[0].matchScore).toBe(95);
    expect(data.counts).toMatchObject({ new: 2, pending: 2 });
  });

  it("rejects invalid query parameters with a structured error", async () => {
    const res = await INBOX_GET(new NextRequest("http://localhost/api/discovery/inbox?status=bogus"));
    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
  });
});

describe("POST /api/crawl — queue-first ingest", () => {
  const crawledJobs = [
    { id: "c1", title: "Senior React Engineer", company: "Acme", url: "https://acme.io/jobs/1", jobDescription: "React role" },
    { id: "c2", title: "Backend Engineer", company: "Globex", url: "https://globex.io/jobs/2", jobDescription: "Node role" },
  ];

  beforeEach(() => {
    closeDb();
    migrate(getDb());
    jobsRepo.removeAll();
    discoveryQueueRepo.deleteAll();
    settingsRepo.wipe();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobs: crawledJobs }), { status: 200 }))
    );
  });

  afterEach(() => {
    closeDb();
    vi.unstubAllGlobals();
  });

  it("queues candidates in the inbox without writing tracker jobs", async () => {
    const res = await CRAWL_POST(
      new NextRequest("http://localhost/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "all", keyword: "engineer", limit: 20 }),
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.offline).toBe(false);
    expect(data.count).toBe(2);
    expect(data.queued).toBe(2);

    // Tracker untouched — manual listings stay separate.
    expect(jobsRepo.list()).toHaveLength(0);
    expect(discoveryQueueRepo.counts().pending).toBe(2);
  });

  it("re-crawling the same batch stays idempotent", async () => {
    const body = { category: "all", keyword: "engineer", limit: 20 };
    const mk = () =>
      new NextRequest("http://localhost/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    await CRAWL_POST(mk());
    await CRAWL_POST(mk());
    expect(discoveryQueueRepo.counts().total).toBe(2);
    expect(jobsRepo.list()).toHaveLength(0);
  });
});
