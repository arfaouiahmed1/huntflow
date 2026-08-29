import { describe, it, expect, beforeAll } from "vitest";
import {
  jobsRepo,
  contactsRepo,
  emailsRepo,
  interviewsRepo,
  remindersRepo,
  settingsRepo,
  metaRepo,
  memoryRepo,
  vaultRepo,
  resumeRepo,
  notificationsRepo,
  agentRunHistoryRepo,
  bootstrapSeed,
  isSeeded,
  resetDatabase,
  exportAllData,
  importAllData,
} from "@/lib/db";
import { JobApplication } from "@/types";
import { initialProfile } from "@/lib/initialData";

function makeJob(id: string, overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id,
    title: "Test Role",
    company: "Acme",
    location: "Remote",
    status: "wishlist",
    jobDescription: "desc",
    autoApplyStatus: "idle",
    autoApplyLogs: [],
    createdDate: "2026-08-01",
    ...overrides,
  };
}

beforeAll(() => {
  /* fresh throwaway DB per worker (vitest.setup.ts) */
});

describe("jobsRepo", () => {
  it("upserts, lists and gets", () => {
    jobsRepo.upsert(makeJob("j1", { title: "Backend Eng", status: "applied" }));
    const jobs = jobsRepo.list();
    expect(jobs.find((j) => j.id === "j1")?.title).toBe("Backend Eng");
    expect(jobsRepo.get("j1")?.status).toBe("applied");
  });

  it("upsert updates existing rows", () => {
    jobsRepo.upsert(makeJob("j1", { status: "offer" }));
    expect(jobsRepo.get("j1")?.status).toBe("offer");
  });

  it("round-trips screenshotUrl, cloudinaryUrl, and skipReason", () => {
    jobsRepo.upsert(
      makeJob("j-visual", {
        screenshotUrl: "proof-123.png",
        cloudinaryUrl: "https://res.cloudinary.com/demo/image/upload/v1/proof.png",
        skipReason: "salary_low",
      })
    );
    const retrieved = jobsRepo.get("j-visual");
    expect(retrieved?.screenshotUrl).toBe("proof-123.png");
    expect(retrieved?.cloudinaryUrl).toBe("https://res.cloudinary.com/demo/image/upload/v1/proof.png");
    expect(retrieved?.skipReason).toBe("salary_low");

    // Update the existing row
    jobsRepo.upsert(
      makeJob("j-visual", {
        screenshotUrl: "proof-updated.png",
        cloudinaryUrl: "https://res.cloudinary.com/demo/image/upload/v2/proof.png",
        skipReason: "not_remote",
      })
    );
    const updated = jobsRepo.get("j-visual");
    expect(updated?.screenshotUrl).toBe("proof-updated.png");
    expect(updated?.cloudinaryUrl).toBe("https://res.cloudinary.com/demo/image/upload/v2/proof.png");
    expect(updated?.skipReason).toBe("not_remote");
  });

  it("remove cascades to emails, interviews and reminders", () => {
    jobsRepo.upsert(makeJob("j2"));
    emailsRepo.upsert({
      id: "e2", jobId: "j2", direction: "sent", subject: "hi", body: "x",
      sentAt: "2026-08-01T00:00:00Z", threadId: "t2", status: "draft", read: false,
    });
    interviewsRepo.upsert({
      id: "i2", jobId: "j2", title: "Screen", type: "video", scheduledAt: "2026-08-10T10:00:00Z",
      durationMin: 30, location: "", notes: "", status: "scheduled", createdAt: "2026-08-01",
    });
    remindersRepo.upsert({
      id: "r2", kind: "follow_up", refId: "j2", dueAt: "2026-08-12", done: false, note: "n", createdAt: "2026-08-01",
    });

    jobsRepo.remove("j2");

    expect(jobsRepo.get("j2")).toBeNull();
    expect(emailsRepo.list().some((e) => e.id === "e2")).toBe(false);
    expect(interviewsRepo.list().some((i) => i.id === "i2")).toBe(false);
    expect(remindersRepo.list().some((r) => r.id === "r2")).toBe(false);
  });
});

describe("contacts / emails / interviews / reminders", () => {
  it("round-trips contacts with JSON company ids and supports get", () => {
    contactsRepo.upsert({
      id: "c1", name: "Ada", role: "HM", company: "Acme", email: "a@b.c", phone: "",
      linkedin: "", source: "linkedin", relationship: "recruiter", notes: "",
      priority: "high", companyIds: ["j1"], createdAt: "2026-08-01", updatedAt: "2026-08-01",
    });
    const c = contactsRepo.get("c1");
    expect(c?.name).toBe("Ada");
    expect(c?.companyIds).toEqual(["j1"]);
  });

  it("round-trips email read flag, interview prep, and supports get", () => {
    emailsRepo.upsert({
      id: "e3", direction: "sent", subject: "s", body: "b", sentAt: "2026-08-01T00:00:00Z",
      threadId: "t", status: "replied", read: true,
    });
    const e = emailsRepo.get("e3");
    expect(e?.read).toBe(true);
    expect(e?.status).toBe("replied");

    interviewsRepo.upsert({
      id: "i3", jobId: "j1", title: "Tech", type: "technical", scheduledAt: "2026-08-10T10:00:00Z",
      durationMin: 60, location: "Zoom", notes: "n", status: "scheduled", prep: ["one", "two"], createdAt: "2026-08-01",
    });
    const i = interviewsRepo.get("i3");
    expect(i?.prep).toEqual(["one", "two"]);

    remindersRepo.upsert({
      id: "r3", kind: "custom", dueAt: "2026-08-09", done: false, note: "review notes", createdAt: "2026-08-01",
    });
    const r = remindersRepo.get("r3");
    expect(r?.note).toBe("review notes");
  });
});

describe("settings / meta / memory / vault", () => {
  it("settings get/set/remove/wipe", () => {
    settingsRepo.set("llm_providers", "[]");
    expect(settingsRepo.get("llm_providers")).toBe("[]");
    expect(settingsRepo.all()).toHaveProperty("llm_providers");
    settingsRepo.remove("llm_providers");
    expect(settingsRepo.get("llm_providers")).toBeNull();
    settingsRepo.set("test_key", "test_val");
    settingsRepo.wipe();
    expect(settingsRepo.get("test_key")).toBeNull();
  });

  it("memory add/list/delete with clamps", () => {
    const m = memoryRepo.add({ kind: "note", content: "remember this", source: "test", importance: 3 });
    expect(m.id).toBeGreaterThan(0);
    expect(m.createdAt).toBeTruthy();
    const list = memoryRepo.list({ limit: 5 });
    expect(list.some((x) => x.id === m.id)).toBe(true);
    memoryRepo.delete(m.id as number);
    expect(memoryRepo.list().some((x) => x.id === m.id)).toBe(false);
  });

  it("vault docs support labels and stats", () => {
    vaultRepo.upsertDoc({
      id: "v1", filename: "resume.pdf", mime: "application/pdf", size: 100,
      status: "ready", embedModel: "local", chunkCount: 2, label: "resume", createdAt: "2026-08-01",
    });
    expect(vaultRepo.getDoc("v1")?.label).toBe("resume");
    vaultRepo.setLabel("v1", "uni_marks");
    expect(vaultRepo.getDoc("v1")?.label).toBe("uni_marks");
    expect(vaultRepo.stats()).toMatchObject({ docs: 1, chunks: 0 });
    vaultRepo.deleteDoc("v1");
    expect(vaultRepo.stats().docs).toBe(0);
  });
});

describe("seed bootstrap & resetDatabase", () => {
  it("seeds once, marks seed_version, and seeds initial profile", () => {
    expect(isSeeded()).toBe(false);
    bootstrapSeed();
    expect(jobsRepo.count()).toBeGreaterThan(0);
    expect(isSeeded()).toBe(true);
    expect(settingsRepo.get("profile")).toBeTruthy();
    const profile = JSON.parse(settingsRepo.get("profile") as string);
    expect(profile.name).toBe(initialProfile.name);
    const count = jobsRepo.count();
    bootstrapSeed();
    expect(jobsRepo.count()).toBe(count); // idempotent
  });

  it("resetDatabase wipes all 17 tables and re-seeds default state", () => {
    resumeRepo.upsert({
      id: "res-test",
      name: "Test Resume",
      kind: "resume",
      templateId: "classic",
      tex: "\\documentclass{article}",
      source: "scratch",
      autoCompile: true,
      createdAt: "2026-08-01",
      updatedAt: "2026-08-01",
    });
    notificationsRepo.add({ title: "Alert", message: "Test Alert" });
    agentRunHistoryRepo.log({
      threadId: "th-123",
      agentName: "atsAudit",
      status: "completed",
    });

    expect(resumeRepo.count()).toBeGreaterThan(0);
    expect(notificationsRepo.list().length).toBeGreaterThan(0);
    expect(agentRunHistoryRepo.listRecent().length).toBeGreaterThan(0);

    resetDatabase();

    expect(isSeeded()).toBe(true);
    expect(jobsRepo.count()).toBeGreaterThan(0);
    expect(settingsRepo.get("profile")).toBeTruthy();
    expect(resumeRepo.count()).toBe(0);
    expect(notificationsRepo.list().length).toBe(0);
    expect(agentRunHistoryRepo.listRecent().length).toBe(0);
  });
});

describe("export / import roundtrip", () => {
  it("preserves all collections including resumes, notifications, and agent run history", () => {
    jobsRepo.upsert(
      makeJob("rt1", {
        title: "Roundtrip",
        status: "applied",
        matchScore: 80,
        screenshotUrl: "proof.png",
        cloudinaryUrl: "https://res.cloudinary.com/demo/proof.png",
        skipReason: "not_fit",
      })
    );
    settingsRepo.set("llm_providers", JSON.stringify([{ id: "custom", apiKey: "sekret-1234", enabled: true }]));
    settingsRepo.set("profile", JSON.stringify({ name: "Jane" }));
    memoryRepo.add({ kind: "fact", content: "export me", source: "test", importance: 2 });
    vaultRepo.upsertDoc({
      id: "v2", filename: "cv.txt", mime: "text/plain", size: 42,
      status: "ready", embedModel: "local", chunkCount: 1, label: "cv", createdAt: "2026-08-02",
    });
    vaultRepo.insertChunk({ docId: "v2", idx: 0, content: "hello world", tokens: 2, embedding: [0.1, 0.2] });
    resumeRepo.upsert({
      id: "res-rt",
      name: "CV Master",
      kind: "resume",
      templateId: "classic",
      tex: "\\documentclass{article}",
      source: "scratch",
      autoCompile: false,
      createdAt: "2026-08-01",
      updatedAt: "2026-08-01",
    });
    notificationsRepo.add({ title: "Backup Notif", message: "Notif Msg" });
    agentRunHistoryRepo.log({
      threadId: "th-rt",
      agentName: "resumeCVTailor",
      status: "success",
      atsScore: 92,
    });

    const snapshot = exportAllData();
    const jobsBefore = jobsRepo.count();

    expect(snapshot.resumeDocs?.length).toBeGreaterThanOrEqual(1);
    expect(snapshot.notifications?.length).toBeGreaterThanOrEqual(1);
    expect(snapshot.agentRunHistory?.length).toBeGreaterThanOrEqual(1);

    /* reset/wipe database */
    resetDatabase();

    const result = importAllData(snapshot);
    expect(result.counts.jobs).toBe(jobsBefore);
    expect(result.counts.vaultDocs).toBe(1);
    expect(result.counts.resumeDocs).toBeGreaterThanOrEqual(1);
    expect(result.counts.notifications).toBeGreaterThanOrEqual(1);
    expect(result.counts.agentRunHistory).toBeGreaterThanOrEqual(1);

    const restoredJob = jobsRepo.get("rt1");
    expect(restoredJob?.matchScore).toBe(80);
    expect(restoredJob?.screenshotUrl).toBe("proof.png");
    expect(restoredJob?.cloudinaryUrl).toBe("https://res.cloudinary.com/demo/proof.png");
    expect(restoredJob?.skipReason).toBe("not_fit");

    expect(JSON.parse(settingsRepo.get("llm_providers") as string)[0].apiKey).toBe("sekret-1234");
    expect(JSON.parse(settingsRepo.get("profile") as string).name).toBe("Jane");
    expect(memoryRepo.list().some((m) => m.content === "export me")).toBe(true);
    expect(vaultRepo.getDoc("v2")?.label).toBe("cv");
    expect(vaultRepo.chunksFor("v2")[0].embedding).toEqual([0.1, 0.2]);
    expect(resumeRepo.get("res-rt")?.name).toBe("CV Master");
    expect(notificationsRepo.list().some((n) => n.title === "Backup Notif")).toBe(true);
    expect(agentRunHistoryRepo.listByThread("th-rt")[0].atsScore).toBe(92);
    expect(metaRepo.get("seed_version")).toBe("1");
  });
});
