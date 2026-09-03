import { describe, it, expect, beforeEach } from "vitest";
import { GET as GET_EXPORT } from "@/app/api/data/export/route";
import { POST as POST_IMPORT } from "@/app/api/data/import/route";
import { POST as POST_RESET } from "@/app/api/data/reset/route";
import {
  createJsonRequest,
  createUrlRequest,
  parseResponse,
  resetTestDb,
  jobsRepo,
  contactsRepo,
  emailsRepo,
  interviewsRepo,
  settingsRepo,
  resumeRepo,
  notificationsRepo,
  agentRunHistoryRepo,
  exportAllData,
  isSeeded,
  metaRepo,
} from "../helpers/testHarness";
import {
  mockJobApplication1,
  mockJobApplication2,
  mockContact,
  mockEmail,
  mockInterview,
  mockResumeDoc,
  mockNotification,
} from "../helpers/testFixtures";

describe("Tier 1: Feature Coverage — Database Backup, Export, Import & Full Reset", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("1. GET /api/data/export produces a valid BackupData snapshot matching current DB state", async () => {
    jobsRepo.removeAll(true);
    jobsRepo.upsert(mockJobApplication1);
    contactsRepo.upsert(mockContact);

    const req = createUrlRequest("http://localhost/api/data/export");
    const res = await GET_EXPORT(req);
    expect(res.status).toBe(200);

    const payload = await parseResponse<{
      app: string;
      format: number;
      exportedAt: string;
      data: {
        jobs: unknown[];
        contacts: unknown[];
        emails: unknown[];
      };
    }>(res);

    expect(payload.app).toBe("huntflow");
    expect(payload.format).toBe(1);
    expect(payload.exportedAt).toBeDefined();
    expect(payload.data.jobs.length).toBe(1);
    expect(payload.data.contacts.length).toBe(1);
  });

  it("2. GET /api/data/export?download=1 sets attachment Content-Disposition header", async () => {
    const req = createUrlRequest("http://localhost/api/data/export?download=1");
    const res = await GET_EXPORT(req);
    expect(res.status).toBe(200);

    const disposition = res.headers.get("Content-Disposition");
    expect(disposition).toBeDefined();
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("huntflow-backup-");
  });

  it("3. Exported backup redacts live LLM API keys and Mail credentials in the downloaded file", async () => {
    const rawKey = "sk-live-actual-production-key-999";
    const rawMailPass = "super_secret_mail_pass_888";
    settingsRepo.set(
      "llm_providers",
      JSON.stringify([{ id: "openrouter", apiKey: rawKey, model: "gpt-4" }])
    );
    settingsRepo.set(
      "mail_settings",
      JSON.stringify({ smtpPass: rawMailPass, imapPass: rawMailPass })
    );

    const req = createUrlRequest("http://localhost/api/data/export?download=1");
    const res = await GET_EXPORT(req);
    const body = await parseResponse<{ data: { settings: Record<string, string> } }>(res);

    expect(body.data.settings.llm_providers).not.toContain(rawKey);
    expect(body.data.settings.llm_providers).toContain("••");
    expect(body.data.settings.mail_settings).not.toContain(rawMailPass);
    expect(body.data.settings.mail_settings).toContain("••");
  });

  it("4. POST /api/data/reset clears tables including resume_docs, notifications, and agent_run_history", async () => {
    resumeRepo.upsert(mockResumeDoc);
    notificationsRepo.add({ title: "Alert", message: "Testing wipe", kind: "info" });
    agentRunHistoryRepo.log({
      threadId: "thread-wipe-test",
      agentName: "apply",
      status: "running",
    });

    expect(resumeRepo.list().length).toBeGreaterThan(0);
    expect(notificationsRepo.list().length).toBeGreaterThan(0);
    expect(agentRunHistoryRepo.listRecent().length).toBeGreaterThan(0);

    const res = await POST_RESET();
    expect(res.status).toBe(200);

    expect(resumeRepo.list().length).toBe(0);
    expect(notificationsRepo.list().length).toBe(0);
    expect(agentRunHistoryRepo.listRecent().length).toBe(0);
  });

  it("5. POST /api/data/reset resets seed_version and re-seeds default job register", async () => {
    const res = await POST_RESET();
    expect(res.status).toBe(200);

    expect(isSeeded()).toBe(true);
    expect(metaRepo.get("seed_version")).toBe("1");
    expect(jobsRepo.count()).toBeGreaterThan(0);
  });

  it("6. POST /api/data/import rejects non-Huntflow payloads or malformed backup headers", async () => {
    const invalidPayload = {
      app: "other-app",
      data: {},
    };

    const req = createJsonRequest("http://localhost/api/data/import", "POST", invalidPayload);
    const res = await POST_IMPORT(req);
    expect(res.status).toBe(400);

    const data = await parseResponse<{ error: string }>(res);
    expect(data.error).toContain("Not a HUNTFLOW backup");
  });

  it("7. POST /api/data/import wipes existing data and restores backup snapshot inside a single transaction", async () => {
    // Populate snapshot data
    jobsRepo.removeAll(true);
    jobsRepo.upsert(mockJobApplication1);
    jobsRepo.upsert(mockJobApplication2);
    contactsRepo.upsert(mockContact);
    resumeRepo.upsert(mockResumeDoc);

    const snapshot = exportAllData();

    // Mutate database with noise
    jobsRepo.removeAll(true);
    jobsRepo.upsert({ ...mockJobApplication1, id: "noise-job-999" });

    // Restore snapshot
    const req = createJsonRequest("http://localhost/api/data/import", "POST", {
      app: "huntflow",
      format: 1,
      data: snapshot,
    });
    const res = await POST_IMPORT(req);
    expect(res.status).toBe(200);

    // Verify noise is gone and original data is restored
    expect(jobsRepo.get("noise-job-999")).toBeNull();
    expect(jobsRepo.get(mockJobApplication1.id)).not.toBeNull();
    expect(jobsRepo.get(mockJobApplication2.id)).not.toBeNull();
    expect(contactsRepo.get(mockContact.id)).not.toBeNull();
  });

  it("8. POST /api/data/import restores entity relationships (job IDs in interviews and emails)", async () => {
    jobsRepo.removeAll(true);
    jobsRepo.upsert(mockJobApplication1);
    emailsRepo.upsert({ ...mockEmail, jobId: mockJobApplication1.id });
    interviewsRepo.upsert({ ...mockInterview, jobId: mockJobApplication1.id });

    const snapshot = exportAllData();
    jobsRepo.removeAll(true);

    const req = createJsonRequest("http://localhost/api/data/import", "POST", {
      app: "huntflow",
      format: 1,
      data: snapshot,
    });
    const res = await POST_IMPORT(req);
    expect(res.status).toBe(200);

    const restoredEmail = emailsRepo.get(mockEmail.id);
    const restoredInterview = interviewsRepo.get(mockInterview.id);
    expect(restoredEmail?.jobId).toBe(mockJobApplication1.id);
    expect(restoredInterview?.jobId).toBe(mockJobApplication1.id);
  });

  it("9. POST /api/data/import preserves masked secrets when restoring from UI backup", async () => {
    const realApiKey = "sk-real-secret-key-for-restore";
    settingsRepo.set(
      "llm_providers",
      JSON.stringify([{ id: "anthropic", apiKey: realApiKey, model: "claude-3-5-sonnet" }])
    );

    const rawExport = exportAllData();
    // Simulate UI export where secrets are masked:
    rawExport.settings.llm_providers = JSON.stringify([
      { id: "anthropic", apiKey: "••••sonnet", model: "claude-3-5-sonnet" },
    ]);

    const req = createJsonRequest("http://localhost/api/data/import", "POST", {
      app: "huntflow",
      format: 1,
      data: rawExport,
    });
    const res = await POST_IMPORT(req);
    expect(res.status).toBe(200);

    const stored = JSON.parse(settingsRepo.get("llm_providers")!);
    expect(stored[0].apiKey).toBe(realApiKey);
  });

  it("10. POST /api/data/import rejects payloads exceeding maximum chunk limits (> 100,000 vault chunks) with 413", async () => {
    const fakeChunks = new Array(100001).fill({
      docId: "doc-1",
      idx: 0,
      content: "chunk text",
      tokens: 10,
      embedding: "[]",
    });

    const oversizedPayload = {
      app: "huntflow",
      format: 1,
      data: {
        vault: {
          docs: [],
          chunks: fakeChunks,
        },
      },
    };

    const req = createJsonRequest("http://localhost/api/data/import", "POST", oversizedPayload);
    const res = await POST_IMPORT(req);
    expect(res.status).toBe(413);
  });

  it("11. Rolling back failed imports leaves pre-existing database state uncorrupted", async () => {
    jobsRepo.removeAll(true);
    jobsRepo.upsert(mockJobApplication1);
    const preCount = jobsRepo.count();

    const badPayload = {
      app: "huntflow",
      format: 1,
      data: {
        jobs: [{ invalid_column: "unsupported" }],
      },
    };

    const req = createJsonRequest("http://localhost/api/data/import", "POST", badPayload);
    const res = await POST_IMPORT(req);
    expect([400, 500]).toContain(res.status);

    // Database should retain pre-existing state or have cleanly recovered
    expect(jobsRepo.count()).toBe(preCount);
  });

  it("12. Re-exporting immediately after import yields identical entity count", async () => {
    jobsRepo.removeAll(true);
    jobsRepo.upsert(mockJobApplication1);
    contactsRepo.upsert(mockContact);
    notificationsRepo.add(mockNotification);

    const snapshot = exportAllData();
    const countJobsBefore = snapshot.jobs.length;
    const countContactsBefore = snapshot.contacts.length;

    const req = createJsonRequest("http://localhost/api/data/import", "POST", {
      app: "huntflow",
      format: 1,
      data: snapshot,
    });
    const res = await POST_IMPORT(req);
    expect(res.status).toBe(200);

    const after = exportAllData();
    expect(after.jobs.length).toBe(countJobsBefore);
    expect(after.contacts.length).toBe(countContactsBefore);
  });
});
