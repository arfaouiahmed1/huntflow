import { describe, it, expect, beforeAll } from "vitest";
import { GET } from "@/app/api/data/route";
import { GET as GET_COLLECTION, POST as POST_COLLECTION } from "@/app/api/data/[collection]/route";
import {
  GET as GET_ENTITY,
  PUT as PUT_ENTITY,
  PATCH as PATCH_ENTITY,
  DELETE as DELETE_COLLECTION,
} from "@/app/api/data/[collection]/[id]/route";
import { POST as POST_RESET } from "@/app/api/data/reset/route";
import { GET as GET_STATS } from "@/app/api/data/stats/route";
import { NextRequest } from "next/server";
import { jobsRepo, contactsRepo, settingsRepo, emailsRepo, resumeRepo } from "@/lib/db";
import { isMasked, MASK_PREFIX } from "@/lib/masking";

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function put(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patch(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/data — hydration contract", () => {
  it("returns every collection the frontend hydrates from", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    for (const key of ["jobs", "contacts", "emails", "interviews", "reminders", "settings"]) {
      expect(data).toHaveProperty(key);
    }
    expect(Array.isArray(data.jobs)).toBe(true);
    expect(Array.isArray(data.contacts)).toBe(true);
    expect(Array.isArray(data.emails)).toBe(true);
    expect(Array.isArray(data.interviews)).toBe(true);
    expect(Array.isArray(data.reminders)).toBe(true);
  });

  it("seeds the database on first access", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.jobs.length).toBeGreaterThan(0);
  });
});

describe("GET /api/data — settings redaction", () => {
  it("masks stored API keys when returning llm_providers", async () => {
    const realKey = "sk-live-abcdefgh";
    settingsRepo.set("llm_providers", JSON.stringify([{ id: "openrouter", apiKey: realKey, enabled: true }]));
    const res = await GET();
    const { settings } = await res.json();
    const chain = JSON.parse(settings.llm_providers);
    expect(chain[0].apiKey).not.toBe(realKey);
    expect(isMasked(chain[0].apiKey)).toBe(true);
  });

  it("masks mail passwords when returning mail_settings", async () => {
    settingsRepo.set("mail_settings", JSON.stringify({ imapPass: "supersecret", smtpPass: "smtpsecret", imapUser: "u" }));
    const res = await GET();
    const { settings } = await res.json();
    const ms = JSON.parse(settings.mail_settings);
    expect(isMasked(ms.imapPass)).toBe(true);
    expect(isMasked(ms.smtpPass)).toBe(true);
    expect(ms.imapUser).toBe("u");
  });

  it("never leaks Gmail OAuth tokens when returning gmail_oauth", async () => {
    settingsRepo.set(
      "gmail_oauth",
      JSON.stringify({
        email: "you@gmail.com",
        accessToken: "ya29.ACCESS",
        refreshToken: "1//REFRESH",
        expiry: 9999999999999,
        scope: "https://mail.google.com/",
      })
    );
    const res = await GET();
    const { settings } = await res.json();
    const g = JSON.parse(settings.gmail_oauth);
    expect(g).not.toHaveProperty("accessToken");
    expect(g).not.toHaveProperty("refreshToken");
    expect(g).toHaveProperty("email", "you@gmail.com");
    expect(g).toHaveProperty("connected", true);
    expect(JSON.stringify(g)).not.toMatch(/ya29\.|1\/\/REFRESH/);
  });

  it("POSTing a masked chain back preserves the real stored key", async () => {
    const realKey = "sk-live-zyxwvu";
    settingsRepo.set("llm_providers", JSON.stringify([{ id: "gemini", apiKey: realKey, enabled: true }]));
    /* frontend round-trips the masked value */
    const res = await POST_COLLECTION(
      post("http://localhost/api/data/settings", {
        llm_providers: JSON.stringify([{ id: "gemini", apiKey: `${MASK_PREFIX}wvu`, enabled: true }]),
      }),
      { params: Promise.resolve({ collection: "settings" }) }
    );
    expect(res.status).toBe(200);
    const stored = JSON.parse(settingsRepo.get("llm_providers") as string);
    expect(stored[0].apiKey).toBe(realKey);
  });
});

describe("POST /api/data/settings — profile roundtrip", () => {
  it("stores and returns the profile exactly as JSON", async () => {
    const profile = { name: "Test User", targetTitle: "Engineer", skills: ["a", "b"] };
    const res = await POST_COLLECTION(
      post("http://localhost/api/data/settings", { profile: JSON.stringify(profile) }),
      { params: Promise.resolve({ collection: "settings" }) }
    );
    expect(res.status).toBe(200);
    const getRes = await GET();
    const { settings } = await getRes.json();
    expect(JSON.parse(settings.profile)).toEqual(profile);
  });
});

describe("collection CRUD — RESTful collection and item methods", () => {
  it("GET /api/data/[collection] lists items or settings with redaction", async () => {
    jobsRepo.upsert({
      id: "list-job-1",
      title: "Staff Eng",
      company: "Acme",
      location: "Remote",
      status: "applied",
      jobDescription: "",
      autoApplyStatus: "idle",
      autoApplyLogs: [],
      createdDate: "2026-08-01",
    });
    const jobRes = await GET_COLLECTION(new NextRequest("http://localhost/api/data/jobs"), {
      params: Promise.resolve({ collection: "jobs" }),
    });
    expect(jobRes.status).toBe(200);
    const jobData = await jobRes.json();
    expect(Array.isArray(jobData.jobs)).toBe(true);
    expect(jobData.jobs.some((j: { id: string }) => j.id === "list-job-1")).toBe(true);

    const settingsRes = await GET_COLLECTION(new NextRequest("http://localhost/api/data/settings"), {
      params: Promise.resolve({ collection: "settings" }),
    });
    expect(settingsRes.status).toBe(200);
    const settingsData = await settingsRes.json();
    expect(settingsData).toHaveProperty("settings");
  });

  it("GET /api/data/emails?jobId= filters emails by job", async () => {
    emailsRepo.upsert({
      id: "em-filter-1",
      jobId: "filter-job-1",
      direction: "sent",
      subject: "Test",
      body: "Body",
      sentAt: "2026-08-01T00:00:00Z",
      threadId: "t-1",
      status: "sent",
      read: true,
    });
    const res = await GET_COLLECTION(new NextRequest("http://localhost/api/data/emails?jobId=filter-job-1"), {
      params: Promise.resolve({ collection: "emails" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.emails)).toBe(true);
    expect(data.emails.every((e: { jobId?: string }) => e.jobId === "filter-job-1")).toBe(true);
  });

  it("GET, PUT, PATCH, DELETE /api/data/[collection]/[id]", async () => {
    const job = {
      id: "rest-job-1",
      title: "Frontend Engineer",
      company: "Acme",
      location: "Remote",
      status: "wishlist",
      jobDescription: "desc",
      autoApplyStatus: "idle",
      autoApplyLogs: [],
      createdDate: "2026-08-01",
    };
    await POST_COLLECTION(post("http://localhost/api/data/jobs", job), {
      params: Promise.resolve({ collection: "jobs" }),
    });

    // GET single
    const getRes = await GET_ENTITY(new NextRequest("http://localhost/api/data/jobs/rest-job-1"), {
      params: Promise.resolve({ collection: "jobs", id: "rest-job-1" }),
    });
    expect(getRes.status).toBe(200);
    const single = await getRes.json();
    expect(single.item.title).toBe("Frontend Engineer");

    // PUT single
    const putRes = await PUT_ENTITY(
      put("http://localhost/api/data/jobs/rest-job-1", { ...job, title: "Principal Engineer" }),
      { params: Promise.resolve({ collection: "jobs", id: "rest-job-1" }) }
    );
    expect(putRes.status).toBe(200);
    expect(jobsRepo.get("rest-job-1")?.title).toBe("Principal Engineer");

    // PATCH single
    const patchRes = await PATCH_ENTITY(
      patch("http://localhost/api/data/jobs/rest-job-1", { status: "interviewing" }),
      { params: Promise.resolve({ collection: "jobs", id: "rest-job-1" }) }
    );
    expect(patchRes.status).toBe(200);
    expect(jobsRepo.get("rest-job-1")?.status).toBe("interviewing");
    expect(jobsRepo.get("rest-job-1")?.title).toBe("Principal Engineer");

    // DELETE single
    const delRes = await DELETE_COLLECTION(new NextRequest("http://localhost/api/data/jobs/rest-job-1"), {
      params: Promise.resolve({ collection: "jobs", id: "rest-job-1" }),
    });
    expect(delRes.status).toBe(200);
    expect(jobsRepo.get("rest-job-1")).toBeNull();
  });

  it("rejects unknown collections with 404", async () => {
    const res = await POST_COLLECTION(post("http://localhost/api/data/nope", { id: "x" }), {
      params: Promise.resolve({ collection: "nope" }),
    });
    expect(res.status).toBe(404);
    const del = await DELETE_COLLECTION(new NextRequest("http://localhost/api/data/nope/x"), {
      params: Promise.resolve({ collection: "nope", id: "x" }),
    });
    expect(del.status).toBe(404);
  });

  it("deleting a job cascades to its emails", async () => {
    jobsRepo.upsert({
      id: "cascade-job",
      title: "Cascade",
      company: "Co",
      location: "",
      status: "applied",
      jobDescription: "",
      autoApplyStatus: "idle",
      autoApplyLogs: [],
      createdDate: "2026-08-01",
    });
    emailsRepo.upsert({
      id: "cascade-mail", jobId: "cascade-job", direction: "sent", subject: "s", body: "b",
      sentAt: "2026-08-01T00:00:00Z", threadId: "t", status: "draft", read: false,
    });
    await DELETE_COLLECTION(new NextRequest("http://localhost/api/data/jobs/cascade-job"), {
      params: Promise.resolve({ collection: "jobs", id: "cascade-job" }),
    });
    expect(emailsRepo.list().some((e) => e.id === "cascade-mail")).toBe(false);
  });
});

describe("POST /api/data/reset — database reset route", () => {
  it("wipes database, resets seed_version, and re-seeds default data", async () => {
    resumeRepo.upsert({
      id: "reset-res",
      name: "Resume",
      kind: "resume",
      templateId: "classic",
      tex: "tex",
      source: "scratch",
      autoCompile: false,
      createdAt: "2026-08-01",
      updatedAt: "2026-08-01",
    });
    expect(resumeRepo.count()).toBeGreaterThan(0);

    const res = await POST_RESET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(resumeRepo.count()).toBe(0);
    expect(jobsRepo.count()).toBeGreaterThan(0);
  });
});

describe("GET /api/data/stats — dashboard contract", () => {
  beforeAll(async () => {
    jobsRepo.removeAll();
    contactsRepo.removeAll();
    jobsRepo.upsert({
      id: "stats-1", title: "A", company: "Co", location: "", status: "applied",
      jobDescription: "", appliedDate: "2026-08-05", autoApplyStatus: "idle",
      autoApplyLogs: [], createdDate: "2026-08-01",
    });
    contactsRepo.upsert({
      id: "c1", name: "X", role: "", company: "", email: "", phone: "", linkedin: "",
      source: "other", relationship: "other", notes: "", priority: "medium",
      companyIds: [], createdAt: "2026-08-01", updatedAt: "2026-08-01",
    });
  });

  it("returns the exact AnalyticsStats shape AppContext expects", async () => {
    const res = await GET_STATS();
    expect(res.status).toBe(200);
    const stats = await res.json();
    expect(Array.isArray(stats.funnel)).toBe(true);
    expect(stats.funnel[0]).toHaveProperty("status");
    expect(stats.funnel[0]).toHaveProperty("count");
    expect(Array.isArray(stats.weekly)).toBe(true);
    expect(stats.weekly).toHaveLength(8);
    expect(stats.weekly[0]).toHaveProperty("applied");
    expect(stats.weekly[0]).toHaveProperty("interviews");
    expect(typeof stats.responseRate.rate).toBe("number");
    expect(typeof stats.overdueFollowUps).toBe("number");
    expect(typeof stats.upcomingInterviews).toBe("number");
    expect(Array.isArray(stats.topCompanies)).toBe(true);
    expect(typeof stats.contactCount).toBe("number");
    expect(typeof stats.openPositions).toBe("number");
  });

  it("reflects seeded data in the funnel", async () => {
    const stats = await (await GET_STATS()).json();
    expect(stats.funnel.find((f: { status: string }) => f.status === "applied")?.count).toBe(1);
    expect(stats.contactCount).toBe(1);
  });
});
