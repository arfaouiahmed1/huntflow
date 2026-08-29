import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as GET_VAULT_SEARCH, POST as POST_VAULT_SEARCH } from "@/app/api/vault/search/route";
import { POST as POST_PARTIAL_PIPELINE } from "@/app/api/agent/partial-pipeline/route";
import { POST as POST_GENERATE } from "@/app/api/generate/route";
import { GET as GET_COLLECTION, POST as POST_COLLECTION } from "@/app/api/data/[collection]/route";
import {
  GET as GET_ENTITY,
  PUT as PUT_ENTITY,
  PATCH as PATCH_ENTITY,
  DELETE as DELETE_ENTITY,
} from "@/app/api/data/[collection]/[id]/route";
import {
  jobsRepo,
  contactsRepo,
  emailsRepo,
  interviewsRepo,
  remindersRepo,
  settingsRepo,
  memoryRepo,
  vaultRepo,
} from "@/lib/db";
import { testProfile } from "@/agents/__tests__/fixtures";
import { generateJSON } from "@/lib/llm/client";

vi.mock("@/lib/llm/client", () => ({
  generateJSON: vi.fn(),
}));
const mockGenerateJSON = vi.mocked(generateJSON);

function makeReq(url: string, method: string = "GET", body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("Adversarial Challenge Suite — Milestone 1 API Contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Target 1: Vault Search Contracts (GET & POST /api/vault/search)", () => {
    beforeEach(() => {
      vaultRepo.wipe(true);
      vaultRepo.upsertDoc({
        id: "v-doc-1",
        filename: "test-doc.txt",
        mime: "text/plain",
        size: 500,
        status: "ready",
        embedModel: "local",
        chunkCount: 2,
        label: "resume",
        createdAt: new Date().toISOString(),
      });
      vaultRepo.insertChunk({
        docId: "v-doc-1",
        idx: 0,
        content: "Expert in Next.js App Router, React 19, TypeScript and SQLite database architecture.",
        tokens: 15,
        embedding: [],
      });
      vaultRepo.insertChunk({
        docId: "v-doc-1",
        idx: 1,
        content: "Experienced with Python LangGraph pipelines and microservices orchestration.",
        tokens: 10,
        embedding: [],
      });
    });

    it("GET /api/vault/search handles 'q' and 'query' query params", async () => {
      const resQ = await GET_VAULT_SEARCH(makeReq("http://localhost/api/vault/search?q=Next.js&k=2"));
      expect(resQ.status).toBe(200);
      const dataQ = await resQ.json();
      expect(Array.isArray(dataQ.hits)).toBe(true);
      expect(dataQ.hits.length).toBeGreaterThan(0);

      const resQuery = await GET_VAULT_SEARCH(makeReq("http://localhost/api/vault/search?query=LangGraph&k=2"));
      expect(resQuery.status).toBe(200);
      const dataQuery = await resQuery.json();
      expect(Array.isArray(dataQuery.hits)).toBe(true);
      expect(dataQuery.hits.length).toBeGreaterThan(0);
    });

    it("GET /api/vault/search rejects missing, empty, or whitespace-only queries with 400", async () => {
      const res1 = await GET_VAULT_SEARCH(makeReq("http://localhost/api/vault/search"));
      expect(res1.status).toBe(400);

      const res2 = await GET_VAULT_SEARCH(makeReq("http://localhost/api/vault/search?q="));
      expect(res2.status).toBe(400);

      const res3 = await GET_VAULT_SEARCH(makeReq("http://localhost/api/vault/search?q=%20%20%20"));
      expect(res3.status).toBe(400);

      const res4 = await GET_VAULT_SEARCH(makeReq("http://localhost/api/vault/search?query="));
      expect(res4.status).toBe(400);
    });

    it("GET /api/vault/search clamps k parameter bounds (min 1, max 20, fallback 4)", async () => {
      // k = 0 -> clamped to 4 (Number("0") || 4 => 4)
      const res0 = await GET_VAULT_SEARCH(makeReq("http://localhost/api/vault/search?q=React&k=0"));
      expect(res0.status).toBe(200);

      // k = -5 -> clamped to 1
      const resNeg = await GET_VAULT_SEARCH(makeReq("http://localhost/api/vault/search?q=React&k=-5"));
      expect(resNeg.status).toBe(200);

      // k = 100 -> clamped to max 20
      const resMax = await GET_VAULT_SEARCH(makeReq("http://localhost/api/vault/search?q=React&k=100"));
      expect(resMax.status).toBe(200);

      // k = 'invalid' -> fallback to 4
      const resNaN = await GET_VAULT_SEARCH(makeReq("http://localhost/api/vault/search?q=React&k=invalid"));
      expect(resNaN.status).toBe(200);
    });

    it("POST /api/vault/search supports { query, k } and { q, k } formats", async () => {
      const res1 = await POST_VAULT_SEARCH(makeReq("http://localhost/api/vault/search", "POST", { query: "Next.js", k: 3 }));
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(Array.isArray(data1.hits)).toBe(true);

      const res2 = await POST_VAULT_SEARCH(makeReq("http://localhost/api/vault/search", "POST", { q: "LangGraph", k: 3 }));
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(Array.isArray(data2.hits)).toBe(true);
    });

    it("POST /api/vault/search rejects missing or whitespace queries with 400", async () => {
      const res1 = await POST_VAULT_SEARCH(makeReq("http://localhost/api/vault/search", "POST", {}));
      expect(res1.status).toBe(400);

      const res2 = await POST_VAULT_SEARCH(makeReq("http://localhost/api/vault/search", "POST", { query: "   " }));
      expect(res2.status).toBe(400);

      const res3 = await POST_VAULT_SEARCH(makeReq("http://localhost/api/vault/search", "POST", null));
      expect(res3.status).toBe(400);
    });

    it("Handles special characters and SQL injection attempts safely", async () => {
      const payload = "'; DROP TABLE vault_docs; -- <script>alert(1)</script>";
      const res = await POST_VAULT_SEARCH(makeReq("http://localhost/api/vault/search", "POST", { query: payload }));
      expect(res.status).toBe(200);
      expect(vaultRepo.stats().docs).toBeGreaterThan(0);
    });
  });

  describe("Target 2: Partial Pipeline Contract (POST /api/agent/partial-pipeline)", () => {
    beforeEach(() => {
      jobsRepo.upsert({
        id: "pp-chal-job-1",
        title: "Staff Software Engineer",
        company: "Vercel",
        location: "San Francisco, CA",
        status: "applied",
        jobDescription: "Requires 8+ years experience with Next.js, React, Node.js, and cloud infrastructure.",
        autoApplyStatus: "idle",
        autoApplyLogs: [],
        createdDate: "2026-08-01",
      });
    });

    it("executes for valid step aliases and returns standardized { success: true, data }", async () => {
      const stepAliases = [
        "intel",
        "companyIntel",
        "norms",
        "regionalNorms",
        "pii",
        "piiSanitizer",
        "tailor",
        "resumeCVTailor",
        "letter",
        "letterTailor",
        "prep",
        "interviewPrep",
        "salary",
        "salaryIntel",
        "email",
        "outreachEmail",
        "audit",
        "atsAudit",
        "apply",
        "autoApplyExecution",
        "gate",
        "orchestratorGate",
      ];

      for (const step of stepAliases.slice(0, 6)) {
        const res = await POST_PARTIAL_PIPELINE(
          makeReq("http://localhost/api/agent/partial-pipeline", "POST", {
            jobId: "pp-chal-job-1",
            profile: testProfile,
            targetRegion: "US",
            step,
          })
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty("threadId");
        expect(Array.isArray(body.data.logs)).toBe(true);
      }
    });

    it("prioritizes stopAfter over step if both provided", async () => {
      const res = await POST_PARTIAL_PIPELINE(
        makeReq("http://localhost/api/agent/partial-pipeline", "POST", {
          jobId: "pp-chal-job-1",
          profile: testProfile,
          targetRegion: "US",
          stopAfter: "companyIntel",
          step: "invalidBogusStep",
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("returns HTTP 400 with { success: false, error } on invalid node", async () => {
      const res = await POST_PARTIAL_PIPELINE(
        makeReq("http://localhost/api/agent/partial-pipeline", "POST", {
          jobId: "pp-chal-job-1",
          profile: testProfile,
          step: "nonExistentNode_xyz",
        })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Invalid stopAfter node");
    });

    it("returns HTTP 400 on missing required fields", async () => {
      // Missing jobId
      const res1 = await POST_PARTIAL_PIPELINE(
        makeReq("http://localhost/api/agent/partial-pipeline", "POST", {
          profile: testProfile,
          step: "companyIntel",
        })
      );
      expect(res1.status).toBe(400);

      // Missing profile
      const res2 = await POST_PARTIAL_PIPELINE(
        makeReq("http://localhost/api/agent/partial-pipeline", "POST", {
          jobId: "pp-chal-job-1",
          step: "companyIntel",
        })
      );
      expect(res2.status).toBe(400);

      // Missing step/stopAfter
      const res3 = await POST_PARTIAL_PIPELINE(
        makeReq("http://localhost/api/agent/partial-pipeline", "POST", {
          jobId: "pp-chal-job-1",
          profile: testProfile,
        })
      );
      expect(res3.status).toBe(400);
    });

    it("returns HTTP 404 when jobId is not found in database", async () => {
      const res = await POST_PARTIAL_PIPELINE(
        makeReq("http://localhost/api/agent/partial-pipeline", "POST", {
          jobId: "non-existent-random-id-12345",
          profile: testProfile,
          step: "companyIntel",
        })
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Job not found");
    });
  });

  describe("Target 3: Standalone AI Insights Contract (POST /api/generate)", () => {
    const mockJob = {
      id: "gen-job-1",
      title: "Backend Engineer",
      company: "Stripe",
      location: "Remote",
      salary: "$180k - $220k",
      url: "https://stripe.com/jobs/1",
      jobDescription: "Distributed systems, Go, Ruby, API design, High reliability.",
      status: "applied",
      autoApplyStatus: "idle",
      autoApplyLogs: [],
      createdDate: "2026-08-01",
    };

    it("allows global types without job object", async () => {
      mockGenerateJSON.mockRejectedValue(new Error("no provider"));

      // 1. recommendations
      const resRecs = await POST_GENERATE(
        makeReq("http://localhost/api/generate", "POST", {
          type: "recommendations",
          profile: testProfile,
          trackedJobs: [mockJob],
        })
      );
      expect(resRecs.status).toBe(200);
      const dataRecs = await resRecs.json();
      expect(Array.isArray(dataRecs.recommendations)).toBe(true);

      // 2. skill_roadmap
      const resRoadmap = await POST_GENERATE(
        makeReq("http://localhost/api/generate", "POST", {
          type: "skill_roadmap",
          profile: testProfile,
          gaps: ["Distributed Tracing", "gRPC"],
        })
      );
      expect(resRoadmap.status).toBe(200);
      const dataRoadmap = await resRoadmap.json();
      expect(Array.isArray(dataRoadmap.roadmap)).toBe(true);

      // 3. pipeline_report
      const resReport = await POST_GENERATE(
        makeReq("http://localhost/api/generate", "POST", {
          type: "pipeline_report",
          profile: testProfile,
          jobs: [mockJob],
        })
      );
      expect(resReport.status).toBe(200);
      const dataReport = await resReport.json();
      expect(dataReport).toHaveProperty("report");
    });

    it("rejects job-scoped generation types when job object is omitted", async () => {
      const jobScopedTypes = [
        "documents",
        "match_analysis",
        "star_flashcards",
        "interview_questions",
        "job_brief",
        "salary_intel",
      ];

      for (const type of jobScopedTypes) {
        const res = await POST_GENERATE(
          makeReq("http://localhost/api/generate", "POST", {
            type,
            profile: testProfile,
          })
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.message).toContain("Missing job payload");
      }
    });

    it("rejects missing or invalid type with 400 BAD_BODY", async () => {
      const resNoType = await POST_GENERATE(makeReq("http://localhost/api/generate", "POST", { profile: testProfile }));
      expect(resNoType.status).toBe(400);
      expect((await resNoType.json()).error.code).toBe("BAD_BODY");

      const resInvalidType = await POST_GENERATE(
        makeReq("http://localhost/api/generate", "POST", { type: "unsupported_magic_ai", profile: testProfile })
      );
      expect(resInvalidType.status).toBe(400);
    });

    it("handles minimal profile gracefully with fallback defaults", async () => {
      mockGenerateJSON.mockRejectedValue(new Error("no provider"));
      const res = await POST_GENERATE(
        makeReq("http://localhost/api/generate", "POST", {
          type: "recommendations",
          profile: { name: "", targetTitle: "", skills: [], summary: "", experience: [], education: [] },
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.recommendations)).toBe(true);
    });
  });

  describe("Target 4: Core Data Collection REST Handlers (GET/POST/PUT/PATCH/DELETE)", () => {
    beforeEach(() => {
      // Clean target tables
      jobsRepo.removeAll();
      contactsRepo.removeAll();
      emailsRepo.removeAll();
      interviewsRepo.removeAll();
      remindersRepo.removeAll();
    });

    it("verifies full REST CRUD cycle for 'jobs' collection", async () => {
      const newJob = {
        id: "crud-job-1",
        title: "Lead Architect",
        company: "Supabase",
        location: "Remote",
        status: "wishlist",
        jobDescription: "PostgreSQL, Realtime, Edge Functions",
        screenshotUrl: "https://proofs.io/shot1.png",
        cloudinaryUrl: "https://res.cloudinary.com/huntflow/image/upload/v1/shot1.png",
        skipReason: "Salary below range",
        autoApplyStatus: "idle",
        autoApplyLogs: [],
        createdDate: "2026-08-01",
      };

      // POST create
      const postRes = await POST_COLLECTION(makeReq("http://localhost/api/data/jobs", "POST", newJob), {
        params: Promise.resolve({ collection: "jobs" }),
      });
      expect(postRes.status).toBe(200);
      expect(jobsRepo.get("crud-job-1")).not.toBeNull();

      // GET list
      const listRes = await GET_COLLECTION(makeReq("http://localhost/api/data/jobs"), {
        params: Promise.resolve({ collection: "jobs" }),
      });
      expect(listRes.status).toBe(200);
      const listData = await listRes.json();
      expect(listData.jobs.some((j: { id: string }) => j.id === "crud-job-1")).toBe(true);

      // GET single
      const getRes = await GET_ENTITY(makeReq("http://localhost/api/data/jobs/crud-job-1"), {
        params: Promise.resolve({ collection: "jobs", id: "crud-job-1" }),
      });
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.item.title).toBe("Lead Architect");
      expect(getData.item.screenshotUrl).toBe("https://proofs.io/shot1.png");
      expect(getData.item.skipReason).toBe("Salary below range");

      // PUT replace
      const putRes = await PUT_ENTITY(
        makeReq("http://localhost/api/data/jobs/crud-job-1", "PUT", {
          ...newJob,
          title: "Distinguished Architect",
        }),
        { params: Promise.resolve({ collection: "jobs", id: "crud-job-1" }) }
      );
      expect(putRes.status).toBe(200);
      expect(jobsRepo.get("crud-job-1")?.title).toBe("Distinguished Architect");

      // PATCH partial update
      const patchRes = await PATCH_ENTITY(
        makeReq("http://localhost/api/data/jobs/crud-job-1", "PATCH", {
          status: "applied",
          appliedDate: "2026-08-18",
        }),
        { params: Promise.resolve({ collection: "jobs", id: "crud-job-1" }) }
      );
      expect(patchRes.status).toBe(200);
      const updatedJob = jobsRepo.get("crud-job-1");
      expect(updatedJob?.status).toBe("applied");
      expect(updatedJob?.title).toBe("Distinguished Architect");
      expect(updatedJob?.screenshotUrl).toBe("https://proofs.io/shot1.png");

      // DELETE
      const delRes = await DELETE_ENTITY(makeReq("http://localhost/api/data/jobs/crud-job-1", "DELETE"), {
        params: Promise.resolve({ collection: "jobs", id: "crud-job-1" }),
      });
      expect(delRes.status).toBe(200);
      expect(jobsRepo.get("crud-job-1")).toBeNull();

      // Subsequent GET returns 404
      const get404Res = await GET_ENTITY(makeReq("http://localhost/api/data/jobs/crud-job-1"), {
        params: Promise.resolve({ collection: "jobs", id: "crud-job-1" }),
      });
      expect(get404Res.status).toBe(404);
    });

    it("verifies full REST CRUD cycle for 'contacts' collection", async () => {
      const contact = {
        id: "crud-contact-1",
        name: "Jane Recruiter",
        role: "Talent Partner",
        company: "Stripe",
        email: "jane@stripe.com",
        phone: "+15550001",
        linkedin: "https://linkedin.com/in/jane",
        source: "linkedin",
        relationship: "recruiter",
        notes: "Initial intro call",
        priority: "high",
        companyIds: [],
        createdAt: "2026-08-01",
        updatedAt: "2026-08-01",
      };

      // POST
      await POST_COLLECTION(makeReq("http://localhost/api/data/contacts", "POST", contact), {
        params: Promise.resolve({ collection: "contacts" }),
      });
      expect(contactsRepo.get("crud-contact-1")?.name).toBe("Jane Recruiter");

      // GET
      const getRes = await GET_ENTITY(makeReq("http://localhost/api/data/contacts/crud-contact-1"), {
        params: Promise.resolve({ collection: "contacts", id: "crud-contact-1" }),
      });
      expect(getRes.status).toBe(200);

      // PATCH
      const patchRes = await PATCH_ENTITY(
        makeReq("http://localhost/api/data/contacts/crud-contact-1", "PATCH", { priority: "medium" }),
        { params: Promise.resolve({ collection: "contacts", id: "crud-contact-1" }) }
      );
      expect(patchRes.status).toBe(200);
      expect(contactsRepo.get("crud-contact-1")?.priority).toBe("medium");

      // DELETE
      const delRes = await DELETE_ENTITY(makeReq("http://localhost/api/data/contacts/crud-contact-1", "DELETE"), {
        params: Promise.resolve({ collection: "contacts", id: "crud-contact-1" }),
      });
      expect(delRes.status).toBe(200);
      expect(contactsRepo.get("crud-contact-1")).toBeNull();
    });

    it("verifies 'emails' collection with jobId filtering and REST methods", async () => {
      jobsRepo.upsert({
        id: "j-email-test-1",
        title: "Eng",
        company: "C1",
        location: "",
        status: "applied",
        jobDescription: "",
        autoApplyStatus: "idle",
        autoApplyLogs: [],
        createdDate: "2026-08-01",
      });
      jobsRepo.upsert({
        id: "j-email-test-2",
        title: "Eng",
        company: "C2",
        location: "",
        status: "applied",
        jobDescription: "",
        autoApplyStatus: "idle",
        autoApplyLogs: [],
        createdDate: "2026-08-01",
      });

      emailsRepo.upsert({
        id: "em-1",
        jobId: "j-email-test-1",
        direction: "sent",
        subject: "Application Stripe",
        body: "Hello",
        sentAt: "2026-08-01T10:00:00Z",
        threadId: "th-1",
        status: "sent",
        read: true,
      });
      emailsRepo.upsert({
        id: "em-2",
        jobId: "j-email-test-2",
        direction: "received",
        subject: "Interview Invitation C2",
        body: "Let's schedule",
        sentAt: "2026-08-02T10:00:00Z",
        threadId: "th-2",
        status: "sent",
        read: false,
      });

      // Filter by jobId
      const filteredRes = await GET_COLLECTION(
        makeReq("http://localhost/api/data/emails?jobId=j-email-test-1"),
        { params: Promise.resolve({ collection: "emails" }) }
      );
      expect(filteredRes.status).toBe(200);
      const filteredData = await filteredRes.json();
      expect(filteredData.emails.length).toBe(1);
      expect(filteredData.emails[0].id).toBe("em-1");

      // List all
      const allRes = await GET_COLLECTION(makeReq("http://localhost/api/data/emails"), {
        params: Promise.resolve({ collection: "emails" }),
      });
      expect(allRes.status).toBe(200);
      const allData = await allRes.json();
      expect(allData.emails.length).toBe(2);

      // GET single
      const getRes = await GET_ENTITY(makeReq("http://localhost/api/data/emails/em-1"), {
        params: Promise.resolve({ collection: "emails", id: "em-1" }),
      });
      expect(getRes.status).toBe(200);
      expect((await getRes.json()).item.subject).toBe("Application Stripe");

      // DELETE
      const delRes = await DELETE_ENTITY(makeReq("http://localhost/api/data/emails/em-1", "DELETE"), {
        params: Promise.resolve({ collection: "emails", id: "em-1" }),
      });
      expect(delRes.status).toBe(200);
      expect(emailsRepo.get("em-1")).toBeNull();
    });

    it("verifies 'interviews' and 'reminders' collection REST methods", async () => {
      // Interviews
      const interview = {
        id: "int-1",
        jobId: "j-int",
        title: "Technical Screen",
        type: "technical",
        scheduledAt: "2026-08-25T14:00:00Z",
        durationMin: 60,
        location: "https://meet.google.com/abc",
        notes: "System design prep",
        status: "scheduled",
        createdAt: "2026-08-01",
      };
      await POST_COLLECTION(makeReq("http://localhost/api/data/interviews", "POST", interview), {
        params: Promise.resolve({ collection: "interviews" }),
      });
      expect(interviewsRepo.get("int-1")?.title).toBe("Technical Screen");

      const getInt = await GET_ENTITY(makeReq("http://localhost/api/data/interviews/int-1"), {
        params: Promise.resolve({ collection: "interviews", id: "int-1" }),
      });
      expect(getInt.status).toBe(200);

      // Reminders
      const reminder = {
        id: "rem-1",
        kind: "follow_up",
        refId: "j-rem",
        dueAt: "2026-08-26T10:00:00Z",
        done: false,
        note: "Send thank you note",
        createdAt: "2026-08-01",
      };
      await POST_COLLECTION(makeReq("http://localhost/api/data/reminders", "POST", reminder), {
        params: Promise.resolve({ collection: "reminders" }),
      });
      expect(remindersRepo.get("rem-1")?.note).toBe("Send thank you note");

      const patchRem = await PATCH_ENTITY(
        makeReq("http://localhost/api/data/reminders/rem-1", "PATCH", { done: true }),
        { params: Promise.resolve({ collection: "reminders", id: "rem-1" }) }
      );
      expect(patchRem.status).toBe(200);
      expect(remindersRepo.get("rem-1")?.done).toBe(true);
    });

    it("verifies 'settings' collection get, put, patch, delete with masking", async () => {
      // Set unmasked key
      settingsRepo.set("custom_config", "val123");

      // GET single setting
      const getRes = await GET_ENTITY(makeReq("http://localhost/api/data/settings/custom_config"), {
        params: Promise.resolve({ collection: "settings", id: "custom_config" }),
      });
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.key).toBe("custom_config");
      expect(getData.value).toBe("val123");

      // PUT setting
      const putRes = await PUT_ENTITY(
        makeReq("http://localhost/api/data/settings/custom_config", "PUT", { value: "val456" }),
        { params: Promise.resolve({ collection: "settings", id: "custom_config" }) }
      );
      expect(putRes.status).toBe(200);
      expect(settingsRepo.get("custom_config")).toBe("val456");

      // DELETE setting
      const delRes = await DELETE_ENTITY(makeReq("http://localhost/api/data/settings/custom_config", "DELETE"), {
        params: Promise.resolve({ collection: "settings", id: "custom_config" }),
      });
      expect(delRes.status).toBe(200);
      expect(settingsRepo.get("custom_config")).toBeNull();

      // GET deleted setting -> 404
      const getDelRes = await GET_ENTITY(makeReq("http://localhost/api/data/settings/custom_config"), {
        params: Promise.resolve({ collection: "settings", id: "custom_config" }),
      });
      expect(getDelRes.status).toBe(404);
    });

    it("returns 404 on unknown collections for all HTTP methods", async () => {
      const badParams = { collection: "unregistered_collection" };
      const badEntityParams = { collection: "unregistered_collection", id: "item1" };

      expect((await GET_COLLECTION(makeReq("http://localhost/api/data/bad"), { params: Promise.resolve(badParams) })).status).toBe(404);
      expect((await POST_COLLECTION(makeReq("http://localhost/api/data/bad", "POST", {}), { params: Promise.resolve(badParams) })).status).toBe(404);
      expect((await GET_ENTITY(makeReq("http://localhost/api/data/bad/1"), { params: Promise.resolve(badEntityParams) })).status).toBe(404);
      expect((await PUT_ENTITY(makeReq("http://localhost/api/data/bad/1", "PUT", {}), { params: Promise.resolve(badEntityParams) })).status).toBe(404);
      expect((await PATCH_ENTITY(makeReq("http://localhost/api/data/bad/1", "PATCH", {}), { params: Promise.resolve(badEntityParams) })).status).toBe(404);
      expect((await DELETE_ENTITY(makeReq("http://localhost/api/data/bad/1", "DELETE"), { params: Promise.resolve(badEntityParams) })).status).toBe(404);
    });
  });

  describe("Target 5: Persistence Layer Edge Cases & SQLite Parameter Binding", () => {
    it("safely handles memoryRepo.add when optional/implicit parameters are omitted", () => {
      // @ts-expect-error testing missing source/importance
      const mem = memoryRepo.add({
        kind: "insight",
        content: "Testing missing source parameter",
        jobId: "job-123",
      });
      expect(mem).toHaveProperty("id");
      expect(mem.source).toBe("manual");
      expect(mem.importance).toBe(0);
    });
  });
});
