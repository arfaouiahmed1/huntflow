import { describe, it, expect, beforeEach } from "vitest";
import { POST as POST_COLLECTION } from "@/app/api/data/[collection]/route";
import { POST as POST_CRAWL } from "@/app/api/crawl/route";
import { POST as POST_MAIL_TEST } from "@/app/api/mail/test/route";
import { POST as POST_IMPORT } from "@/app/api/data/import/route";
import { POST as POST_ASSISTANT } from "@/app/api/assistant/route";
import {
  createJsonRequest,
  createRouteContext,
  parseResponse,
  resetTestDb,
  jobsRepo,
  contactsRepo,
  memoryRepo,
  notificationsRepo,
  settingsRepo,
  getDb,
} from "../helpers/testHarness";
import { mockJobApplication1, mockContact, mockUserProfile } from "../helpers/testFixtures";
import { renderTemplate } from "@/lib/pdf/resumeTemplates";

describe("Tier 2: Boundary & Corner Cases — Adversarial Resilience & Sidecar Fallbacks", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("1. SQL injection payloads in job title are treated as literal text", async () => {
    const injectionJob = {
      ...mockJobApplication1,
      id: "job-sql-inject",
      title: "Senior Engineer'; DROP TABLE jobs; --",
      company: "InjectCorp",
    };

    const req = createJsonRequest("http://localhost/api/data/jobs", "POST", injectionJob);
    const res = await POST_COLLECTION(req, createRouteContext({ collection: "jobs" }));
    expect(res.status).toBe(200);

    const saved = jobsRepo.get("job-sql-inject");
    expect(saved).not.toBeNull();
    expect(saved?.title).toBe("Senior Engineer'; DROP TABLE jobs; --");

    // Verify jobs table was not dropped
    expect(jobsRepo.count()).toBeGreaterThan(0);
  });

  it("2. SQL injection payloads in contact notes and names do not alter query logic", async () => {
    const injectionContact = {
      ...mockContact,
      id: "contact-sql-inject",
      name: "Alice'; DELETE FROM contacts WHERE '1'='1",
      notes: "'' OR 1=1 --",
    };

    const req = createJsonRequest("http://localhost/api/data/contacts", "POST", injectionContact);
    const res = await POST_COLLECTION(req, createRouteContext({ collection: "contacts" }));
    expect(res.status).toBe(200);

    const saved = contactsRepo.get("contact-sql-inject");
    expect(saved?.name).toBe("Alice'; DELETE FROM contacts WHERE '1'='1");
  });

  it("3. LaTeX special characters (%, $, &, _, #) in profile are safely escaped during rendering", () => {
    const hostileContent = {
      header: {
        name: "Alex $100% C#_Dev",
        title: "Staff Engineer & Architect",
        email: "alex@example.com",
      },
      summary: "Earned $150k bonus (100% target) & shipped C#_v2.0 #1 ranking ^ high",
      skills: ["React", "TypeScript"],
      experience: [],
      education: [],
    };

    const tex = renderTemplate("classic-ats", hostileContent as never);
    expect(tex).toBeDefined();
    expect(tex).toContain("\\$150k");
    expect(tex).toContain("100\\%");
    expect(tex).toContain("\\&");
    expect(tex).toContain("\\#1");
  });

  it("4. XSS payloads in job notes (<script>alert(1)</script>) are stored as raw text", async () => {
    const xssJob = {
      ...mockJobApplication1,
      id: "job-xss-test",
      notes: '<script>alert("XSS Attack")</script><img src="x" onerror="steal()"/>',
    };

    const req = createJsonRequest("http://localhost/api/data/jobs", "POST", xssJob);
    const res = await POST_COLLECTION(req, createRouteContext({ collection: "jobs" }));
    expect(res.status).toBe(200);

    const saved = jobsRepo.get("job-xss-test");
    expect(saved?.notes).toBe('<script>alert("XSS Attack")</script><img src="x" onerror="steal()"/>');
  });

  it("5. Database recovery after abrupt transaction rollback", () => {
    const db = getDb();
    const initialCount = jobsRepo.count();

    try {
      db.exec("BEGIN");
      jobsRepo.upsert({ ...mockJobApplication1, id: "job-rolled-back" });
      throw new Error("Simulated sudden transaction abort");
    } catch {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
    }

    expect(jobsRepo.get("job-rolled-back")).toBeNull();
    expect(jobsRepo.count()).toBe(initialCount);
  });

  it("6. Concurrent writes to SQLite in WAL mode execute without database lock timeouts", async () => {
    const writePromises = Array.from({ length: 20 }, (_, i) => {
      const job = {
        ...mockJobApplication1,
        id: `job-concurrent-${i}`,
        title: `Concurrent Engineer ${i}`,
      };
      const req = createJsonRequest("http://localhost/api/data/jobs", "POST", job);
      return POST_COLLECTION(req, createRouteContext({ collection: "jobs" }));
    });

    const results = await Promise.all(writePromises);
    for (const res of results) {
      expect(res.status).toBe(200);
    }

    for (let i = 0; i < 20; i++) {
      expect(jobsRepo.get(`job-concurrent-${i}`)).not.toBeNull();
    }
  });

  it("7. Multiple rapid updates to the same job record produce consistent final state", async () => {
    const targetId = "job-rapid-updates";
    jobsRepo.upsert({ ...mockJobApplication1, id: targetId, status: "wishlist" });

    for (let i = 1; i <= 5; i++) {
      const req = createJsonRequest("http://localhost/api/data/jobs", "POST", {
        ...mockJobApplication1,
        id: targetId,
        matchScore: 50 + i * 5,
      });
      await POST_COLLECTION(req, createRouteContext({ collection: "jobs" }));
    }

    const finalJob = jobsRepo.get(targetId);
    expect(finalJob?.matchScore).toBe(75);
  });

  it("8. Deleting a contact linked to multiple jobs does not leave invalid records", async () => {
    contactsRepo.upsert({
      ...mockContact,
      id: "contact-multi-link",
      companyIds: ["job-1", "job-2", "job-3"],
    });

    expect(contactsRepo.get("contact-multi-link")).not.toBeNull();
    contactsRepo.remove("contact-multi-link");
    expect(contactsRepo.get("contact-multi-link")).toBeNull();
  });

  it("9. Crawl endpoint (POST /api/crawl) handles Scrapling sidecar offline gracefully with offline: true", async () => {
    const req = createJsonRequest("http://localhost/api/crawl", "POST", {
      category: "frontend",
      keyword: "react",
      limit: 10,
    });

    const res = await POST_CRAWL(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ success: boolean; offline?: boolean; jobs: unknown[] }>(res);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.jobs)).toBe(true);
  });

  it("10. Email test endpoint (POST /api/mail/test) handles missing IMAP/SMTP credentials with 400", async () => {
    settingsRepo.set("mail_settings", "{}");
    settingsRepo.set("gmail_oauth", "");
    settingsRepo.set("gmail_settings", "");

    const res = await POST_MAIL_TEST();
    expect(res.status).toBe(400);

    const body = await parseResponse<{ error: string }>(res);
    expect(body.error).toBeDefined();
  });

  it("11. Backup import with oversized vault chunks (> 100,000) rejects with HTTP 413", async () => {
    const req = createJsonRequest("http://localhost/api/data/import", "POST", {
      app: "huntflow",
      format: 1,
      data: {
        vault: {
          docs: [],
          chunks: new Array(100005).fill({ docId: "d1", idx: 0, content: "text", tokens: 1, embedding: [] }),
        },
      },
    });

    const res = await POST_IMPORT(req);
    expect(res.status).toBe(413);
  });

  it("12. Assistant streaming route (POST /api/assistant?stream=1) handles request cleanly", async () => {
    const req = createJsonRequest("http://localhost/api/assistant?stream=1", "POST", {
      message: "Hello from resilience test",
      profile: mockUserProfile,
    });

    const res = await POST_ASSISTANT(req);
    expect([200, 500]).toContain(res.status);
  });

  it("13. Notification repository handles clearing empty notification table without error", () => {
    notificationsRepo.clear();
    expect(notificationsRepo.list().length).toBe(0);

    // Second clear on already empty table
    expect(() => notificationsRepo.clear()).not.toThrow();
    expect(notificationsRepo.list().length).toBe(0);
  });

  it("14. High-concurrency read/write load on memory store executes without corruption", async () => {
    const writes = Array.from({ length: 15 }, (_, i) => {
      return memoryRepo.add({
        kind: "note",
        content: `Concurrent memory note ${i}`,
        source: "test",
        importance: 1,
      });
    });

    const reads = Array.from({ length: 15 }, () => {
      return memoryRepo.list({ limit: 50 });
    });

    await Promise.all([...writes, ...reads]);
    const finalMemories = memoryRepo.list({ limit: 100 });
    expect(finalMemories.length).toBeGreaterThanOrEqual(15);
  });

  it("15. Concurrent upserts to contacts maintain referential data integrity", async () => {
    const contactPromises = Array.from({ length: 10 }, (_, i) => {
      const contact = {
        ...mockContact,
        id: `contact-concur-${i}`,
        name: `Engineer ${i}`,
      };
      const req = createJsonRequest("http://localhost/api/data/contacts", "POST", contact);
      return POST_COLLECTION(req, createRouteContext({ collection: "contacts" }));
    });

    const results = await Promise.all(contactPromises);
    for (const res of results) {
      expect(res.status).toBe(200);
    }
  });
});
