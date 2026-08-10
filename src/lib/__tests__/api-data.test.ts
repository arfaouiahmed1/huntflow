import { describe, it, expect, beforeAll } from "vitest";
import { GET } from "@/app/api/data/route";
import { POST as POST_COLLECTION } from "@/app/api/data/[collection]/route";
import { DELETE as DELETE_COLLECTION } from "@/app/api/data/[collection]/[id]/route";
import { GET as GET_STATS } from "@/app/api/data/stats/route";
import { NextRequest } from "next/server";
import { jobsRepo, contactsRepo, settingsRepo, emailsRepo } from "@/lib/db";
import { isMasked, MASK_PREFIX } from "@/lib/masking";

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
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

describe("collection CRUD — what the frontend's persist() uses", () => {
  it("upserts a job via POST and deletes via DELETE", async () => {
    const job = {
      id: "frontend-job-1",
      title: "Frontend Engineer",
      company: "Acme",
      location: "Remote",
      status: "wishlist",
      jobDescription: "desc",
      autoApplyStatus: "idle",
      autoApplyLogs: [],
      createdDate: "2026-08-01",
    };
    const up = await POST_COLLECTION(post("http://localhost/api/data/jobs", job), {
      params: Promise.resolve({ collection: "jobs" }),
    });
    expect(up.status).toBe(200);
    expect(await up.json()).toEqual({ ok: true });

    const data = await (await GET()).json();
    expect(data.jobs.some((j: { id: string }) => j.id === "frontend-job-1")).toBe(true);

    const del = await DELETE_COLLECTION(new NextRequest("http://localhost/api/data/jobs/frontend-job-1"), {
      params: Promise.resolve({ collection: "jobs", id: "frontend-job-1" }),
    });
    expect(del.status).toBe(200);
    expect(jobsRepo.get("frontend-job-1")).toBeNull();
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
