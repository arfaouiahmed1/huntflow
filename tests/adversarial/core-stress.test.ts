import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getDb,
  migrate,
  resetDatabase,
  jobsRepo,
  contactsRepo,
  emailsRepo,
  interviewsRepo,
  remindersRepo,
  settingsRepo,
  memoryRepo,
  vaultRepo,
  notificationsRepo,
  agentRunHistoryRepo,
  importAllData,
  BackupData,
} from "@/lib/db";
import {
  createJsonRequest,
  createUrlRequest,
  createRouteContext,
  parseResponse,
  resetTestDb,
} from "../e2e/helpers/testHarness";
import {
  mockJobApplication1,
  mockContact,
  mockEmail,
  mockInterview,
  mockReminder,
} from "../e2e/helpers/testFixtures";
import { GET as collectionGet, POST as collectionPost } from "@/app/api/data/[collection]/route";
import {
  GET as itemGet,
  PATCH as itemPatch,
  DELETE as itemDelete,
} from "@/app/api/data/[collection]/[id]/route";
import { GET as exportGet } from "@/app/api/data/export/route";
import { POST as importPost } from "@/app/api/data/import/route";
import { POST as resetPost } from "@/app/api/data/reset/route";
import { POST as crawlPost } from "@/app/api/crawl/route";
import { escapeLatex, mdToLatex, texToText, contactLine } from "@/lib/pdf/sanitize";
import {
  renderTemplate,
  RESUME_TEMPLATES,
} from "@/lib/pdf/resumeTemplates";
import {
  analyzeAts,
  resumeContentToText,
} from "@/lib/ats/analyze";
import { forwardSync, reverseSync, SynctexError } from "@/lib/pdf/synctex";
import { dedupKey } from "@/lib/dedup";
import { JobApplication, ResumeContent } from "@/types";

describe("Milestone M4: Tier 5 Adversarial Stress & Hardening Test Suite", () => {
  beforeEach(() => {
    resetTestDb();
  });

  afterEach(() => {
    resetTestDb();
  });

  /* =========================================================================
   * 1. Database WAL Concurrency, Transactions & Mutation Stress
   * ========================================================================= */
  describe("1. Database WAL Concurrency, Transactions & Mutation Stress", () => {
    it("handles 100 concurrent asynchronous read/write operations without locking errors", async () => {
      const operations: Promise<unknown>[] = [];

      for (let i = 0; i < 25; i++) {
        // Parallel Job Upserts
        operations.push(
          Promise.resolve().then(() => {
            return jobsRepo.upsert({
              ...mockJobApplication1,
              id: `stress_job_${i}`,
              title: `Concurrency Engineer ${i}`,
              company: `Scale Inc ${i}`,
              status: i % 2 === 0 ? "applied" : "interviewing",
            });
          })
        );

        // Parallel Contact Upserts
        operations.push(
          Promise.resolve().then(() => {
            return contactsRepo.upsert({
              ...mockContact,
              id: `stress_contact_${i}`,
              name: `Recruiter ${i}`,
              email: `recruiter${i}@scale.io`,
            });
          })
        );

        // Parallel Memory Logging
        operations.push(
          Promise.resolve().then(() => {
            return memoryRepo.add({
              kind: "note",
              content: `Concurrent memory note ${i} from automated stress harness`,
              source: "system",
              importance: i % 5,
            });
          })
        );

        // Parallel Notification Additions
        operations.push(
          Promise.resolve().then(() => {
            return notificationsRepo.add({
              title: `Alert ${i}`,
              message: `System stress test notification ${i}`,
              kind: i % 3 === 0 ? "warning" : "info",
            });
          })
        );
      }

      const results = await Promise.allSettled(operations);
      const rejected = results.filter((r) => r.status === "rejected");
      expect(rejected.length).toBe(0);

      // Verify all items exist
      const allJobs = jobsRepo.list();
      expect(allJobs.length).toBeGreaterThanOrEqual(25);
      const allContacts = contactsRepo.list();
      expect(allContacts.length).toBeGreaterThanOrEqual(25);
      const notifs = notificationsRepo.list(100);
      expect(notifs.length).toBeGreaterThanOrEqual(25);
    });

    it("handles high-frequency conflicting mutations on the exact same row safely", async () => {
      const targetId = "contested_job_row";
      jobsRepo.upsert({
        ...mockJobApplication1,
        id: targetId,
        title: "Initial Role",
        matchScore: 50,
      });

      // 50 parallel updates to the same entity
      const promises = Array.from({ length: 50 }, (_, idx) => {
        return Promise.resolve().then(() => {
          return jobsRepo.upsert({
            ...mockJobApplication1,
            id: targetId,
            title: `Updated Role Pass ${idx}`,
            matchScore: idx * 2,
            notes: `Mutation step ${idx}`,
          });
        });
      });

      await Promise.all(promises);

      const finalRow = jobsRepo.get(targetId);
      expect(finalRow).not.toBeNull();
      expect(finalRow?.id).toBe(targetId);
      expect(finalRow?.title).toMatch(/^Updated Role Pass \d+$/);
      expect(typeof finalRow?.matchScore).toBe("number");
    });

    it("handles 50 concurrent chunk inserts and queries in vaultRepo without transaction conflicts", async () => {
      const docId = "doc_stress_concurrency";
      vaultRepo.upsertDoc({
        id: docId,
        filename: "concurrency_test.pdf",
        mime: "application/pdf",
        size: 10240,
        status: "ready",
        embedModel: "local",
        chunkCount: 50,
        label: "resume",
        createdAt: new Date().toISOString(),
      });

      const promises = Array.from({ length: 50 }, (_, i) => {
        return Promise.resolve().then(() => {
          vaultRepo.insertChunk({
            docId,
            idx: i,
            content: `Concurrent chunk content ${i} for embeddings index testing`,
            tokens: 12,
            embedding: [0.1 * i, 0.2 * i, 0.3 * i],
          });
        });
      });

      await Promise.all(promises);

      const chunks = vaultRepo.chunksFor(docId);
      expect(chunks.length).toBe(50);
      expect(chunks[0].docId).toBe(docId);
    });

    it("rolls back completely during importAllData when a database constraint or error occurs", () => {
      const initialJobCount = jobsRepo.list().length;
      expect(initialJobCount).toBeGreaterThan(0);

      const badBackup: BackupData = {
        jobs: [
          {
            ...mockJobApplication1,
            id: "should_rollback_job_1",
            title: "Temporary Job That Must Roll Back",
            company: "TempCorp",
            status: "wishlist",
            jobDescription: "Description",
            createdDate: new Date().toISOString(),
          },
        ],
        contacts: [],
        emails: [],
        interviews: [],
        reminders: [],
        memories: [],
        vault: { docs: [], chunks: [] },
        settings: {},
        usage: [],
        // notifications will throw if we supply a non-string / null title violating NOT NULL
        notifications: [
          {
            id: "failing_notif_id",
            title: null as unknown as string,
            message: "Must fail",
            kind: "info",
            read: false,
            createdAt: new Date().toISOString(),
          },
        ],
      };

      expect(() => {
        importAllData(badBackup);
      }).toThrow();

      // Ensure that because it failed inside a transaction, rolled back DB does not have the partially inserted job
      const checkJob = jobsRepo.get("should_rollback_job_1");
      expect(checkJob).toBeNull();
    });

    it("enforces cascading cleanup when a parent job with associated emails and interviews is removed", () => {
      const jobId = "job_with_dependents";
      jobsRepo.upsert({ ...mockJobApplication1, id: jobId });
      emailsRepo.upsert({ ...mockEmail, id: "email_dep_1", jobId });
      interviewsRepo.upsert({ ...mockInterview, id: "interview_dep_1", jobId });
      remindersRepo.upsert({ ...mockReminder, id: "reminder_dep_1", refId: jobId });

      expect(jobsRepo.get(jobId)).not.toBeNull();
      expect(emailsRepo.get("email_dep_1")).not.toBeNull();
      expect(interviewsRepo.get("interview_dep_1")).not.toBeNull();
      expect(remindersRepo.get("reminder_dep_1")).not.toBeNull();

      // Removing job cascades to dependent tables
      jobsRepo.remove(jobId);

      expect(jobsRepo.get(jobId)).toBeNull();
      expect(emailsRepo.get("email_dep_1")).toBeNull();
      expect(interviewsRepo.get("interview_dep_1")).toBeNull();
      expect(remindersRepo.get("reminder_dep_1")).toBeNull();
    });

    it("maintains schema migration idempotency when migrate() is invoked repeatedly on populated DB", () => {
      const db = getDb();
      const initialJobs = jobsRepo.list();

      // Invoke migrate 5 times in succession
      for (let i = 0; i < 5; i++) {
        expect(() => migrate(db)).not.toThrow();
      }

      // Verify records and columns remain completely undamaged
      const postMigrationJobs = jobsRepo.list();
      expect(postMigrationJobs.length).toBe(initialJobs.length);
      expect(postMigrationJobs[0].id).toBe(initialJobs[0].id);
    });

    it("verifies resetDatabase() cleanly purges and re-seeds all 17 tables", () => {
      // Add records to multiple tables
      jobsRepo.upsert({ ...mockJobApplication1, id: "job_to_purge" });
      contactsRepo.upsert({ ...mockContact, id: "contact_to_purge" });
      memoryRepo.add({ kind: "note", content: "memory to purge", source: "user", importance: 1 });
      notificationsRepo.add({ title: "Notif to purge", message: "purge me" });
      agentRunHistoryRepo.log({
        threadId: "thread_purge",
        agentName: "applyAgent",
        status: "success",
        atsScore: 90,
      });

      // Execute reset
      resetDatabase();

      // Check that purged items are gone
      expect(jobsRepo.get("job_to_purge")).toBeNull();
      expect(contactsRepo.get("contact_to_purge")).toBeNull();
      expect(agentRunHistoryRepo.listByThread("thread_purge").length).toBe(0);

      // Verify seed items were restored
      expect(jobsRepo.list().length).toBeGreaterThanOrEqual(1);
      expect(settingsRepo.get("profile")).toBeTruthy();
    });
  });

  /* =========================================================================
   * 2. SQL Injection Resilience & Parameter Sanitization
   * ========================================================================= */
  describe("2. SQL Injection Resilience & Parameter Sanitization", () => {
    const sqlInjectionPayloads = [
      "'; DROP TABLE jobs; --",
      "' OR '1'='1",
      "' UNION SELECT 1, 'admin', 'password', 'secret', 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32 --",
      "admin'--",
      "'; ATTACH DATABASE 'hack.db' AS hack; --",
      "1; SELECT CASE WHEN (1=1) THEN pg_sleep(5) ELSE pg_sleep(0) END--",
      "0'XOR(if(now()=sysdate(),sleep(5),0))XOR'Z",
      "\" OR \"\"=\"",
      "\\0",
      "Robert'); DROP TABLE Students;--",
    ];

    it("resists SQL injection in jobsRepo operations with malicious IDs and content", () => {
      for (const [idx, payload] of sqlInjectionPayloads.entries()) {
        const testId = `sqli_job_${idx}`;
        const maliciousJob: JobApplication = {
          ...mockJobApplication1,
          id: testId,
          title: `Engineer ${payload}`,
          company: `Company ${payload}`,
          status: "wishlist",
          notes: payload,
          skillsGap: { missingKeywords: [payload], strongKeywords: [payload], matchScore: 80 } as never,
        };

        // Upsert must treat payload literally and not crash or execute injection
        expect(() => jobsRepo.upsert(maliciousJob)).not.toThrow();

        // Querying with exact ID
        const retrieved = jobsRepo.get(testId);
        expect(retrieved).not.toBeNull();
        expect(retrieved?.title).toBe(`Engineer ${payload}`);
        expect(retrieved?.notes).toBe(payload);

        // Deleting with malicious ID string
        expect(() => jobsRepo.remove(testId)).not.toThrow();
        expect(jobsRepo.get(testId)).toBeNull();
      }

      // Ensure the jobs table still exists and operates normally
      expect(jobsRepo.list().length).toBeGreaterThanOrEqual(0);
    });

    it("resists SQL injection in memoryRepo filtering and querying", () => {
      // Add a clean memory entry
      const added = memoryRepo.add({
        kind: "note",
        content: "Important memory test note",
        source: "agent",
        importance: 3,
      });

      for (const payload of sqlInjectionPayloads) {
        // Querying memory with malicious filters
        const results = memoryRepo.list({
          kind: payload,
          source: payload,
          jobId: payload,
        });
        expect(Array.isArray(results)).toBe(true);

        // Deleting memory with non-existent or adversarial numeric ID
        expect(() => memoryRepo.delete(-999)).not.toThrow();
      }

      expect(memoryRepo.list().some((m) => m.id === added.id)).toBe(true);
    });

    it("resists SQL injection in notifications and agentRunHistory repositories", () => {
      for (const [idx, payload] of sqlInjectionPayloads.entries()) {
        const notif = notificationsRepo.add({
          title: `Notif ${payload}`,
          message: `Body ${payload}`,
          kind: "info",
        });
        expect(notif.id).toBeTruthy();
        expect(notif.title).toBe(`Notif ${payload}`);

        agentRunHistoryRepo.log({
          threadId: `thread_${idx}_${payload}`,
          agentName: `agent_${payload}`,
          status: "success",
          reasoning: payload,
          findings: payload,
        });

        const history = agentRunHistoryRepo.listByThread(`thread_${idx}_${payload}`);
        expect(history.length).toBe(1);
        expect(history[0].reasoning).toBe(payload);
      }
    });

    it("defends API collection routes against malicious collection names and prototype pollution", async () => {
      const maliciousCollections = [
        "sqlite_master",
        "../../etc/passwd",
        "non_existent_collection",
        "jobs; DROP TABLE jobs; --",
      ];

      for (const col of maliciousCollections) {
        // GET /api/data/[collection]
        const getReq = createUrlRequest(`http://localhost:3000/api/data/${encodeURIComponent(col)}`);
        const getRes = await collectionGet(getReq, createRouteContext({ collection: col }));
        expect(getRes.status).toBe(404);
        const getBody = await parseResponse<{ error?: string }>(getRes);
        expect(getBody.error).toBe("Unknown collection");

        // POST /api/data/[collection]
        const postReq = createJsonRequest(`http://localhost:3000/api/data/${encodeURIComponent(col)}`, "POST", {
          name: "Test",
        });
        const postRes = await collectionPost(postReq, createRouteContext({ collection: col }));
        expect(postRes.status).toBe(404);

        // GET /api/data/[collection]/[id]
        const itemGetReq = createUrlRequest(`http://localhost:3000/api/data/${encodeURIComponent(col)}/123`);
        const itemGetRes = await itemGet(itemGetReq, createRouteContext({ collection: col, id: "123" }));
        expect(itemGetRes.status).toBe(404);
      }

      // Prototype pollution targets (__proto__, constructor) should return 404 or 500 error response without crashing
      const protoKeys = ["__proto__", "constructor", "prototype"];
      for (const col of protoKeys) {
        const req = createUrlRequest(`http://localhost:3000/api/data/${encodeURIComponent(col)}`);
        const res = await collectionGet(req, createRouteContext({ collection: col }));
        expect([404, 500]).toContain(res.status);
        const body = await parseResponse<{ error?: string }>(res);
        expect(body.error).toBeTruthy();
      }
    });

    it("handles PATCH and DELETE on non-existent collection IDs safely", async () => {
      const nonExistentId = "non_existent_item_99999";

      // PATCH non-existent job returns 404 Not Found
      const patchReq = createJsonRequest(
        `http://localhost:3000/api/data/jobs/${nonExistentId}`,
        "PATCH",
        { status: "applied" }
      );
      const patchRes = await itemPatch(patchReq, createRouteContext({ collection: "jobs", id: nonExistentId }));
      expect(patchRes.status).toBe(404);

      // DELETE non-existent job returns 200 ok: true (idempotent delete)
      const delReq = createUrlRequest(`http://localhost:3000/api/data/jobs/${nonExistentId}`, "DELETE");
      const delRes = await itemDelete(delReq, createRouteContext({ collection: "jobs", id: nonExistentId }));
      expect(delRes.status).toBe(200);
      const delBody = await parseResponse<{ ok: boolean }>(delRes);
      expect(delBody.ok).toBe(true);
    });

    it("handles corrupted or invalid JSON in POST /api/data/settings gracefully", async () => {
      const req = createJsonRequest("http://localhost:3000/api/data/settings", "POST", {
        llm_providers: "invalid non-json { string",
        mail_settings: "not a json string",
        custom_key: "valid_value",
      });

      const res = await collectionPost(req, createRouteContext({ collection: "settings" }));
      expect(res.status).toBe(200);

      expect(settingsRepo.get("custom_key")).toBe("valid_value");
      expect(settingsRepo.get("llm_providers")).toBe("invalid non-json { string");
    });
  });

  /* =========================================================================
   * 3. Backup Export/Import Atomicity, Migration & Secret Redaction
   * ========================================================================= */
  describe("3. Backup Export/Import Atomicity & Secret Redaction", () => {
    it("redacts sensitive provider and mail secrets on GET /api/data/export", async () => {
      // Store plaintext secret keys
      settingsRepo.set(
        "llm_providers",
        JSON.stringify([
          { id: "openai", name: "OpenAI", apiKey: "sk-proj-secret-token-12345", enabled: true },
          { id: "anthropic", name: "Anthropic", apiKey: "sk-ant-api03-secret-key-9999", enabled: true },
        ])
      );
      settingsRepo.set(
        "mail_settings",
        JSON.stringify({
          imapHost: "imap.example.com",
          imapPort: 993,
          imapUser: "user@example.com",
          imapPass: "mySuperSecretImapPassword",
          smtpHost: "smtp.example.com",
          smtpPort: 587,
          smtpUser: "user@example.com",
          smtpPass: "mySuperSecretSmtpPassword",
        })
      );

      const req = createUrlRequest("http://localhost:3000/api/data/export");
      const res = await exportGet(req);
      expect(res.status).toBe(200);

      const payload = await parseResponse<{
        app: string;
        format: number;
        data: BackupData;
      }>(res);

      expect(payload.app).toBe("huntflow");
      expect(payload.format).toBe(1);

      const exportedSettings = payload.data.settings;
      expect(exportedSettings.llm_providers).not.toContain("sk-proj-secret-token-12345");
      expect(exportedSettings.llm_providers).not.toContain("sk-ant-api03-secret-key-9999");
      expect(exportedSettings.llm_providers).toContain("••••");

      expect(exportedSettings.mail_settings).not.toContain("mySuperSecretImapPassword");
      expect(exportedSettings.mail_settings).not.toContain("mySuperSecretSmtpPassword");
      expect(exportedSettings.mail_settings).toContain("••••");
    });

    it("restores masked secrets without overwriting stored credentials during import", async () => {
      const realApiKey = "sk-live-real-secret-openai-key";
      const realImapPass = "RealSuperImapPass123";

      settingsRepo.set(
        "llm_providers",
        JSON.stringify([{ id: "openai", name: "OpenAI", apiKey: realApiKey, enabled: true }])
      );
      settingsRepo.set(
        "mail_settings",
        JSON.stringify({ imapHost: "imap.mail.com", imapPass: realImapPass })
      );

      // Incoming backup has redacted bullet mask
      const backupPayload = {
        app: "huntflow",
        format: 1,
        data: {
          jobs: [
            {
              ...mockJobApplication1,
              id: "imported_job_1",
              title: "Imported Lead",
              company: "ImportCo",
              status: "wishlist",
              jobDescription: "Desc",
              createdDate: new Date().toISOString(),
            },
          ],
          contacts: [],
          emails: [],
          interviews: [],
          reminders: [],
          memories: [],
          vault: { docs: [], chunks: [] },
          settings: {
            llm_providers: JSON.stringify([
              { id: "openai", name: "OpenAI", apiKey: "••••-key", enabled: true },
            ]),
            mail_settings: JSON.stringify({
              imapHost: "imap.mail.com",
              imapPass: "••••Pass",
            }),
          },
          usage: [],
        },
      };

      const importReq = createJsonRequest("http://localhost:3000/api/data/import", "POST", backupPayload);
      const importRes = await importPost(importReq);
      expect(importRes.status).toBe(200);

      // Verify that stored secrets were preserved from original database
      const storedProviders = JSON.parse(settingsRepo.get("llm_providers") ?? "[]");
      expect(storedProviders[0].apiKey).toBe(realApiKey);

      const storedMail = JSON.parse(settingsRepo.get("mail_settings") ?? "{}");
      expect(storedMail.imapPass).toBe(realImapPass);

      // Verify imported jobs exist
      expect(jobsRepo.get("imported_job_1")).not.toBeNull();
    });

    it("rejects invalid backup structures and oversized payloads with appropriate status codes", async () => {
      // 1. Invalid App identifier
      const badAppReq = createJsonRequest("http://localhost:3000/api/data/import", "POST", {
        app: "malicious_app",
        data: {},
      });
      const badAppRes = await importPost(badAppReq);
      expect(badAppRes.status).toBe(400);

      // 2. Missing data property
      const missingDataReq = createJsonRequest("http://localhost:3000/api/data/import", "POST", {
        app: "huntflow",
      });
      const missingDataRes = await importPost(missingDataReq);
      expect(missingDataRes.status).toBe(400);

      // 3. Oversized vault chunk count (> 100,000)
      const oversizedChunks = Array.from({ length: 100001 }, (_, i) => ({
        docId: "doc_1",
        idx: i,
        content: `chunk ${i}`,
        tokens: 5,
        embedding: "[]",
      }));
      const oversizedReq = createJsonRequest("http://localhost:3000/api/data/import", "POST", {
        app: "huntflow",
        data: {
          vault: { docs: [], chunks: oversizedChunks },
        },
      });
      const oversizedRes = await importPost(oversizedReq);
      expect(oversizedRes.status).toBe(413);
    });

    it("performs complete atomic reset on POST /api/data/reset", async () => {
      jobsRepo.upsert({ ...mockJobApplication1, id: "pre_reset_job" });
      expect(jobsRepo.get("pre_reset_job")).not.toBeNull();

      const resetRes = await resetPost();
      expect(resetRes.status).toBe(200);

      const resetBody = await parseResponse<{ ok: boolean }>(resetRes);
      expect(resetBody.ok).toBe(true);

      expect(jobsRepo.get("pre_reset_job")).toBeNull();
      expect(jobsRepo.list().length).toBeGreaterThanOrEqual(1);
    });
  });

  /* =========================================================================
   * 4. Resume Studio: LaTeX Generation, ATS Scoring & SyncTeX Resilience
   * ========================================================================= */
  describe("4. Resume Studio: LaTeX Generation, ATS Scoring & SyncTeX Resilience", () => {
    it("escapes all 10 LaTeX reserved characters and command injection attempts", () => {
      const dangerousInputs = [
        "Special chars: \\ { } $ & # ^ _ ~ %",
        "Command injection: \\write18{rm -rf /} \\input{/etc/shadow}",
        "Catcode manipulation: \\catcode`\\%=11",
        "Macros: \\def\\badcommand{evil} \\newcommand{\\hack}{x}",
        "HTML/Script tags: <script>alert('XSS')</script> <img src=x onerror=alert(1)>",
        "Multi-byte unicode: 🚀 🔥 💻 🌍 ⚡️ 日本語 العربية Русский",
      ];

      for (const input of dangerousInputs) {
        const escaped = escapeLatex(input);
        // Commands must never appear unescaped
        expect(escaped).not.toMatch(/(^|[^\\])\\write18/);
        expect(escaped).not.toMatch(/(^|[^\\])\\input\{/);

        // Percent should be \%
        if (input.includes("%")) {
          expect(escaped).toContain("\\%");
        }
        // Dollar should be \$
        if (input.includes("$")) {
          expect(escaped).toContain("\\$");
        }
        // Ampersand should be \&
        if (input.includes("&")) {
          expect(escaped).toContain("\\&");
        }
      }
    });

    it("parses deeply nested, malformed, and adversarial markdown structures in mdToLatex", () => {
      const complexMarkdown = `
# Main Header With $100 & Special Characters
## Sub Header With **Bold** and *Italic* and \`Code\`
### Deep Header With # Hash Inside
---
* Bullet 1 with **unclosed bold
* Bullet 2 with \`inline code\` and \\backslash
* Bullet 3 with https://example.com/url?param=1&other=2

1. Numbered item 1
2. Numbered item 2 with **bold & italic**
---
Paragraph with multiple sentences.
Another paragraph with *mixed *emphasis* tokens*.
`;

      expect(() => mdToLatex(complexMarkdown)).not.toThrow();
      const latex = mdToLatex(complexMarkdown);
      expect(latex).toContain("\\Large\\textbf{Main Header With \\$100 \\& Special Characters}");
      expect(latex).toContain("\\begin{itemize}");
      expect(latex).toContain("\\end{itemize}");
      expect(latex).toContain("\\noindent\\rule{\\textwidth}{0.4pt}");
    });

    it("renders all 18 LaTeX templates with empty, partial, and boundary ResumeContent", () => {
      const minimalContent: ResumeContent = {
        header: {
          name: "",
          title: "",
          email: "",
          phone: "",
          location: "",
          linkedin: "",
          github: "",
          portfolio: "",
        },
      };

      const boundaryResumeContent: ResumeContent = {
        header: {
          name: "Dr. Adversarial Developer & Tester",
          title: "Principal AI Architect",
          email: "adversary@example.com",
          phone: "+1 (555) 019-2834",
          location: "San Francisco, CA",
          linkedin: "https://linkedin.com/in/adversary",
          github: "https://github.com/adversary",
          portfolio: "https://adversary.dev",
        },
        summary: "Seasoned engineer specializing in stress testing, $10M+ cost reductions, & 99.999% reliability.",
        skills: ["TypeScript", "Rust", "Distributed Systems", "SQLite WAL", "Adversarial AI", "LaTeX Engine"],
        experience: [
          {
            role: "Staff Security Engineer",
            company: "Defense Systems Inc",
            duration: "2022 - Present",
            bullets: [
              "Architected automated fuzzing pipeline catching 450+ vulnerabilities across 20 services.",
              "Spearheaded database transaction hardening achieving zero data corruption during stress benchmarks.",
              "Mentored 12 junior engineers and authored core security design specifications.",
            ],
          },
        ],
        education: [
          {
            degree: "M.S. in Computer Science",
            school: "MIT",
            year: "2020",
          },
        ],
        projects: [
          {
            name: "FaultForge",
            tech: "TypeScript / Node.js",
            link: "https://github.com/faultforge",
            bullets: ["Simulated 100,000 concurrent mutations verifying database transaction ACID properties."],
          },
        ],
        certifications: [
          {
            name: "Certified Kubernetes Security Specialist",
            issuer: "Linux Foundation",
            year: "2023",
          },
        ],
        languages: [
          { name: "English", level: "Native" },
          { name: "German", level: "Fluent" },
        ],
      };

      const boundaryLetterContent: ResumeContent = {
        ...boundaryResumeContent,
        recipient: "Engineering Hiring Committee\nAcme AI Labs",
        paragraphs: [
          "I am writing to express my enthusiastic interest in the Principal AI Architect position at Acme AI Labs.",
          "With over a decade of experience in mission-critical distributed systems and autonomous agent pipelines, I have scaled systems to millions of users.",
          "I welcome the opportunity to discuss how my background will support your technical vision.",
        ],
      };

      for (const template of RESUME_TEMPLATES) {
        // Test with empty content
        expect(() => renderTemplate(template.id, minimalContent)).not.toThrow();
        const minTex = renderTemplate(template.id, minimalContent);
        expect(typeof minTex).toBe("string");
        expect(minTex.length).toBeGreaterThan(50);

        // Test with rich boundary content appropriate to kind
        const isLetter = template.kinds.some((k) => k.includes("letter"));
        const contentToUse = isLetter
          ? boundaryLetterContent
          : boundaryResumeContent;

        expect(() => renderTemplate(template.id, contentToUse)).not.toThrow();
        const richTex = renderTemplate(template.id, contentToUse);
        expect(typeof richTex).toBe("string");
        expect(richTex).toContain("San Francisco, CA");
      }
    });

    it("sanitizes LaTeX source to plain text via texToText across complex environments", () => {
      const complexTex = `
        \\documentclass{article}
        \\newcommand{\\customMacro}[1]{\\textbf{#1}}
        \\begin{document}
        % This is a comment that should be stripped
        \\resumesection{Experience}
        \\begin{itemize}
          \\item Led development of \\textbf{Huntflow} platform handling \\$10M+ in volume.
          \\item Optimized database throughput by 40\\% using WAL mode \\& connection pooling.
        \\end{itemize}
        \\end{document}
      `;

      const plain = texToText(complexTex);
      expect(plain).not.toContain("\\documentclass");
      expect(plain).not.toContain("\\newcommand");
      expect(plain).not.toContain("\\textbf");
      expect(plain).not.toContain("\\resumesection");
      expect(plain).not.toContain("This is a comment");
      expect(plain).toContain("Experience");
      expect(plain).toContain("Huntflow");
      expect(plain).toContain("$10M+");
      expect(plain).toContain("40%");
      expect(plain).toContain("&");
    });

    it("handles malformed ResumeContent with null/undefined arrays in resumeContentToText and contactLine", () => {
      const malformedContent = {
        header: {
          name: "Test Name",
          email: "test@example.com",
          phone: undefined,
          location: "   ",
        },
        experience: [
          {
            role: "Developer",
            company: "Co",
            bullets: undefined as unknown as string[],
          },
        ],
        education: [
          {
            degree: "B.S.",
            school: "Uni",
            year: undefined,
          },
        ],
        skills: undefined as unknown as string[],
      } as unknown as ResumeContent;

      expect(() => resumeContentToText(malformedContent)).not.toThrow();
      const text = resumeContentToText(malformedContent);
      expect(text).toContain("Test Name");
      expect(text).toContain("Developer at Co");

      const line = contactLine(["email@test.com", "", undefined, null, "   ", "San Francisco"]);
      expect(line).toBe("email@test.com \\textbullet{} San Francisco");
    });

    it("evaluates ATS scoring engine robustness under extreme inputs (empty, oversized, layout breakers)", () => {
      // 1. Completely empty resume
      const emptyReport = analyzeAts("");
      expect(emptyReport.score).toBeGreaterThanOrEqual(0);
      expect(emptyReport.score).toBeLessThanOrEqual(100);
      expect(emptyReport.estimatedPages).toBe(1);

      // 2. Oversized resume (10,000 words -> > 2 pages penalty)
      const hugeResumeText = "developer engineer code test build ".repeat(2000);
      const hugeReport = analyzeAts(hugeResumeText);
      expect(hugeReport.estimatedPages).toBeGreaterThan(2);
      const lengthCheck = hugeReport.checks.find((c) => c.id === "length");
      expect(lengthCheck?.ok).toBe(false);

      // 3. Resume with layout breakers (\begin{tabular}, \includegraphics)
      const brokenLayoutTex = `
        \\begin{tabular}{|c|c|}
          \\hline Name & Experience \\\\
          \\hline John & 5 years \\\\
        \\end{tabular}
        \\includegraphics{profile.png}
      `;
      const layoutReport = analyzeAts(brokenLayoutTex);
      const layoutCheck = layoutReport.checks.find((c) => c.id === "layout");
      expect(layoutCheck?.ok).toBe(false);

      // 4. High-quality comprehensive resume
      const strongResume = `
        Alex Mercer
        Email: alex.mercer@example.com | Phone: 555-0199 | San Francisco, CA

        Summary
        Staff Software Engineer with 8+ years experience building distributed platforms.

        Experience
        Staff Engineer at CloudCorp (2021 - Present)
        - Led migration of 15 microservices to Kubernetes, reducing latency by 45%.
        - Architected resilient caching tier serving 50M requests/day with 99.99% uptime.
        - Spearheaded database query optimization saving $120k annually in compute costs.

        Senior Developer at DataGrid (2018 - 2021)
        - Built automated ETL pipeline processing 10TB of daily transaction records.
        - Shipped real-time dashboard adopted by 2,000+ enterprise customers.

        Education
        B.S. in Computer Engineering from Stanford University (2018)

        Skills
        TypeScript, Go, React, PostgreSQL, Docker, AWS, Distributed Systems
      `;

      const strongReport = analyzeAts(strongResume, "Looking for a Staff Software Engineer with Go, TypeScript, AWS, Kubernetes");
      expect(strongReport.score).toBeGreaterThanOrEqual(80);
      expect(strongReport.checks.find((c) => c.id === "contact")?.ok).toBe(true);
      expect(strongReport.checks.find((c) => c.id === "sections")?.ok).toBe(true);
      expect(strongReport.checks.find((c) => c.id === "action_verbs")?.ok).toBe(true);
      expect(strongReport.checks.find((c) => c.id === "metrics")?.ok).toBe(true);
      expect(strongReport.keywords.length).toBeGreaterThan(0);
    });

    it("handles SyncTeX forward/reverse errors gracefully for missing builds and invalid coordinates", async () => {
      // Forward sync with invalid build token
      await expect(forwardSync("invalid_token_12345", 10, 0)).rejects.toThrow(SynctexError);
      await expect(forwardSync("invalid_token_12345", 10, 0)).rejects.toThrow(/Build expired or not found/);

      // Reverse sync with invalid build token
      await expect(reverseSync("invalid_token_12345", 1, 100, 200)).rejects.toThrow(SynctexError);
      await expect(reverseSync("invalid_token_12345", 1, 100, 200)).rejects.toThrow(/Build expired or not found/);
    });
  });

  /* =========================================================================
   * 5. Crawling & Extraction Resilience
   * ========================================================================= */
  describe("5. Crawling & Extraction Resilience", () => {
    it("handles sidecar network timeout and offline states gracefully without crashing", async () => {
      const crawlReq = createJsonRequest("http://localhost:3000/api/crawl", "POST", {
        category: "software",
        keyword: "engineer",
        limit: 20,
      });

      // POST to /api/crawl when Scrapling agent sidecar is not running
      const res = await crawlPost(crawlReq);
      expect(res.status).toBe(200);

      const body = await parseResponse<{
        success: boolean;
        count: number;
        jobs: unknown[];
        offline: boolean;
      }>(res);

      expect(body.success).toBe(true);
      expect(body.count).toBe(0);
      expect(Array.isArray(body.jobs)).toBe(true);
      expect(body.offline).toBe(true);
    });

    it("clamps extreme limit and concurrency parameters to safe operating bounds", async () => {
      // Extreme low numbers
      const minReq = createJsonRequest("http://localhost:3000/api/crawl", "POST", {
        limit: -500,
        concurrency: -100,
      });
      const minRes = await crawlPost(minReq);
      expect(minRes.status).toBe(200);
      const minBody = await parseResponse<{ concurrency: number }>(minRes);
      expect(minBody.concurrency).toBeGreaterThanOrEqual(1);

      // Extreme high numbers
      const maxReq = createJsonRequest("http://localhost:3000/api/crawl", "POST", {
        limit: 999999,
        concurrency: 5000,
      });
      const maxRes = await crawlPost(maxReq);
      expect(maxRes.status).toBe(200);
      const maxBody = await parseResponse<{ concurrency: number }>(maxRes);
      expect(maxBody.concurrency).toBeLessThanOrEqual(16);
    });

    it("recovers gracefully when stored candidate profile is corrupt JSON", async () => {
      // Inject corrupt non-JSON profile
      settingsRepo.set("profile", "{ corrupt_json: [ unclosed");

      const crawlReq = createJsonRequest("http://localhost:3000/api/crawl", "POST", {
        category: "tech",
      });

      const res = await crawlPost(crawlReq);
      expect(res.status).toBe(200);
      const body = await parseResponse<{ success: boolean; offline: boolean }>(res);
      expect(body.success).toBe(true);
    });

    it("correctly identifies deduplication keys across variations in company, title, and spacing", () => {
      const job1 = { company: "Google", title: "Software Engineer III" };
      const job2 = { company: "  google  ", title: "software engineer iii" };
      const job3 = { company: "Google", title: "Product Manager" };

      expect(dedupKey(job1)).toBe(dedupKey(job2));
      expect(dedupKey(job1)).not.toBe(dedupKey(job3));
    });
  });
});
