import { describe, it, expect, beforeEach } from "vitest";
import {
  AddJobSchema,
  ScrapeUrlSchema,
  VaultProfileSchema,
  VaultSearchSchema,
  VaultFileValidation,
  SettingsProfileSchema,
  CloudinarySettingsSchema,
  GoogleOAuthConfigSchema,
  LinkedInCookieSchema,
  MailSettingsSchema,
  formatZodErrors,
} from "@/lib/validation";
import {
  GET as GET_RESUME,
  POST as POST_RESUME,
  PUT as PUT_RESUME,
  DELETE as DELETE_RESUME,
} from "@/app/api/resume/route";
import { POST as POST_SCRAPE } from "@/app/api/scrape/route";
import {
  createJsonRequest,
  createUrlRequest,
  parseResponse,
  resetTestDb,
  jobsRepo,
  resumeRepo,
  settingsRepo,
} from "../../../tests/e2e/helpers/testHarness";
import { mockJobApplication1, mockUserProfile } from "../../../tests/e2e/helpers/testFixtures";
import { JOB_DETAIL_TABS } from "@/components/JobDetailView";
import { cleanSkillsGap, cleanDocuments } from "@/lib/llm/sanitize";
import { analyzeAts } from "@/lib/ats/analyze";
import { ResumeDoc } from "@/types";

describe("Milestone 3 Empirical Challenger 1 Verification Suite", () => {
  beforeEach(() => {
    resetTestDb();
  });

  /* ========================================================================
   * 1. Zod Schema Validation & Boundary Stress Tests
   * ======================================================================== */
  describe("1. Zod Schema Boundaries & Edge Cases", () => {
    describe("ScrapeUrlSchema & Scrape Route URL Enforcement", () => {
      it("accepts valid HTTP and HTTPS URLs", () => {
        expect(ScrapeUrlSchema.safeParse({ url: "https://careers.google.com/jobs/results/123" }).success).toBe(true);
        expect(ScrapeUrlSchema.safeParse({ url: "http://localhost:3000/job/456" }).success).toBe(true);
        expect(ScrapeUrlSchema.safeParse({ url: "https://sub.domain.co.uk/apply?id=99&ref=huntflow" }).success).toBe(true);
      });

      it("rejects empty strings, whitespace, and malformed non-URLs", () => {
        expect(ScrapeUrlSchema.safeParse({ url: "" }).success).toBe(false);
        expect(ScrapeUrlSchema.safeParse({ url: "   " }).success).toBe(false);
        expect(ScrapeUrlSchema.safeParse({ url: "not-a-valid-url" }).success).toBe(false);
        expect(ScrapeUrlSchema.safeParse({ url: "just text without protocol" }).success).toBe(false);
      });

      it("POST /api/scrape enforces HTTP/HTTPS and blocks SSRF targets", async () => {
        const reqInvalidProto = createJsonRequest("http://localhost/api/scrape", "POST", { url: "ftp://example.com/job" });
        const resInvalidProto = await POST_SCRAPE(reqInvalidProto);
        expect(resInvalidProto.status).toBe(400);

        const reqLoopback = createJsonRequest("http://localhost/api/scrape", "POST", { url: "http://127.0.0.1:8080/admin" });
        const resLoopback = await POST_SCRAPE(reqLoopback);
        expect(resLoopback.status).toBe(400);

        const reqLocalhost = createJsonRequest("http://localhost/api/scrape", "POST", { url: "http://localhost/secret" });
        const resLocalhost = await POST_SCRAPE(reqLocalhost);
        expect(resLocalhost.status).toBe(400);
      });
    });

    describe("AddJobSchema", () => {
      const validBase = {
        title: "Senior AI Engineer",
        company: "Anthropic",
        location: "San Francisco, CA",
        salary: "$180,000 - $240,000",
        status: "wishlist" as const,
        description: "We are seeking an experienced Senior AI Engineer to design and build frontier model tool-use systems.",
        url: "https://anthropic.com/careers/123",
      };

      it("accepts complete valid job payload and assigns default location", () => {
        const result = AddJobSchema.safeParse(validBase);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.title).toBe("Senior AI Engineer");
          expect(result.data.status).toBe("wishlist");
        }

        const noLocation = { ...validBase, location: undefined };
        const resNoLoc = AddJobSchema.safeParse(noLocation);
        expect(resNoLoc.success).toBe(true);
        if (resNoLoc.success) {
          expect(resNoLoc.data.location).toBe("Remote");
        }
      });

      it("enforces title length boundaries (min 2, max 120)", () => {
        expect(AddJobSchema.safeParse({ ...validBase, title: "A" }).success).toBe(false);
        expect(AddJobSchema.safeParse({ ...validBase, title: "  A  " }).success).toBe(false);
        expect(AddJobSchema.safeParse({ ...validBase, title: "AB" }).success).toBe(true);
        expect(AddJobSchema.safeParse({ ...validBase, title: "A".repeat(120) }).success).toBe(true);
        expect(AddJobSchema.safeParse({ ...validBase, title: "A".repeat(121) }).success).toBe(false);
      });

      it("enforces company length boundaries (min 1, max 100)", () => {
        expect(AddJobSchema.safeParse({ ...validBase, company: "" }).success).toBe(false);
        expect(AddJobSchema.safeParse({ ...validBase, company: "   " }).success).toBe(false);
        expect(AddJobSchema.safeParse({ ...validBase, company: "X" }).success).toBe(true);
        expect(AddJobSchema.safeParse({ ...validBase, company: "C".repeat(100) }).success).toBe(true);
        expect(AddJobSchema.safeParse({ ...validBase, company: "C".repeat(101) }).success).toBe(false);
      });

      it("enforces status enum validity", () => {
        const validStatuses = ["wishlist", "applied", "interviewing", "offer", "rejected"];
        for (const s of validStatuses) {
          expect(AddJobSchema.safeParse({ ...validBase, status: s }).success).toBe(true);
        }
        expect(AddJobSchema.safeParse({ ...validBase, status: "pending" }).success).toBe(false);
        expect(AddJobSchema.safeParse({ ...validBase, status: "archived" }).success).toBe(false);
        expect(AddJobSchema.safeParse({ ...validBase, status: "" }).success).toBe(false);
      });

      it("enforces description length boundaries (min 20, max 50,000)", () => {
        expect(AddJobSchema.safeParse({ ...validBase, description: "Short description" }).success).toBe(false); // 17 chars
        expect(AddJobSchema.safeParse({ ...validBase, description: "1234567890123456789" }).success).toBe(false); // 19 chars
        expect(AddJobSchema.safeParse({ ...validBase, description: "12345678901234567890" }).success).toBe(true); // 20 chars
        expect(AddJobSchema.safeParse({ ...validBase, description: "D".repeat(50000) }).success).toBe(true);
        expect(AddJobSchema.safeParse({ ...validBase, description: "D".repeat(50001) }).success).toBe(false);
      });

      it("allows optional empty string or valid URL for url and salary", () => {
        expect(AddJobSchema.safeParse({ ...validBase, url: "" }).success).toBe(true);
        expect(AddJobSchema.safeParse({ ...validBase, url: undefined }).success).toBe(true);
        expect(AddJobSchema.safeParse({ ...validBase, url: "invalid-url" }).success).toBe(false);
        expect(AddJobSchema.safeParse({ ...validBase, salary: "" }).success).toBe(true);
        expect(AddJobSchema.safeParse({ ...validBase, salary: undefined }).success).toBe(true);
        expect(AddJobSchema.safeParse({ ...validBase, salary: "S".repeat(81) }).success).toBe(false);
      });
    });

    describe("VaultProfileSchema & VaultSearchSchema", () => {
      it("validates full profile with work permit and work mode enums", () => {
        const validVaultProfile = {
          name: "Ahmed Arfaoui",
          email: "ahmed@example.com",
          phone: "+216 58 732 642",
          headline: "Lead AI Engineer",
          workPermitStatus: "authorized",
          preferredWorkMode: "remote",
          willingnessToRelocate: "yes",
          yearsOfExperience: 5,
          linkedin: "https://linkedin.com/in/ahmed-arfaoui",
          github: "https://github.com/ahmedarfaoui",
        };
        expect(VaultProfileSchema.safeParse(validVaultProfile).success).toBe(true);
      });

      it("rejects invalid years of experience (<0 or >60)", () => {
        const base = { name: "Ahmed", email: "a@b.com" };
        expect(VaultProfileSchema.safeParse({ ...base, yearsOfExperience: -1 }).success).toBe(false);
        expect(VaultProfileSchema.safeParse({ ...base, yearsOfExperience: 61 }).success).toBe(false);
        expect(VaultProfileSchema.safeParse({ ...base, yearsOfExperience: 0 }).success).toBe(true);
        expect(VaultProfileSchema.safeParse({ ...base, yearsOfExperience: 60 }).success).toBe(true);
        expect(VaultProfileSchema.safeParse({ ...base, yearsOfExperience: NaN }).success).toBe(true);
      });

      it("validates VaultSearch query boundaries (min 2, max 300)", () => {
        expect(VaultSearchSchema.safeParse({ query: "" }).success).toBe(false);
        expect(VaultSearchSchema.safeParse({ query: "a" }).success).toBe(false);
        expect(VaultSearchSchema.safeParse({ query: "ai" }).success).toBe(true);
        expect(VaultSearchSchema.safeParse({ query: "q".repeat(300) }).success).toBe(true);
        expect(VaultSearchSchema.safeParse({ query: "q".repeat(301) }).success).toBe(false);
      });
    });

    describe("VaultFileValidation", () => {
      it("accepts supported extensions within 25MB limit", () => {
        const validFile1 = { name: "resume.pdf", size: 5 * 1024 * 1024 } as File;
        const validFile2 = { name: "transcript.DOCX", size: 25 * 1024 * 1024 } as File;
        const validFile3 = { name: "notes.txt", size: 1000 } as File;
        const validFile4 = { name: "readme.md", size: 500 } as File;

        expect(VaultFileValidation.validateFile(validFile1).valid).toBe(true);
        expect(VaultFileValidation.validateFile(validFile2).valid).toBe(true);
        expect(VaultFileValidation.validateFile(validFile3).valid).toBe(true);
        expect(VaultFileValidation.validateFile(validFile4).valid).toBe(true);
      });

      it("rejects files exceeding 25MB or having disallowed extensions", () => {
        const oversized = { name: "huge.pdf", size: 25 * 1024 * 1024 + 1 } as File;
        const disallowed1 = { name: "script.exe", size: 1024 } as File;
        const disallowed2 = { name: "image.png", size: 1024 } as File;
        const disallowed3 = { name: "archive.zip", size: 1024 } as File;

        expect(VaultFileValidation.validateFile(oversized).valid).toBe(false);
        expect(VaultFileValidation.validateFile(disallowed1).valid).toBe(false);
        expect(VaultFileValidation.validateFile(disallowed2).valid).toBe(false);
        expect(VaultFileValidation.validateFile(disallowed3).valid).toBe(false);
      });
    });

    describe("Settings & Integration Schemas", () => {
      it("validates SettingsProfileSchema with experience and education arrays", () => {
        const validProfile = {
          name: "Ahmed Arfaoui",
          email: "ahmed@huntflow.ai",
          targetTitle: "Senior AI Engineer",
          experience: [
            {
              id: "exp-1",
              company: "Open Web Catcher",
              role: "AI Engineer",
              duration: "2024-2026",
              bulletPoints: ["Built LangGraph agent pipelines."],
            },
          ],
          education: [
            {
              id: "edu-1",
              degree: "Engineering Degree",
              school: "ESPRIT",
              year: "2026",
            },
          ],
        };
        expect(SettingsProfileSchema.safeParse(validProfile).success).toBe(true);

        // Missing role in experience
        const invalidExp = {
          ...validProfile,
          experience: [{ id: "exp-1", company: "Company", role: "" }],
        };
        expect(SettingsProfileSchema.safeParse(invalidExp).success).toBe(false);
      });

      it("validates CloudinarySettingsSchema concurrency boundaries (1-16)", () => {
        expect(CloudinarySettingsSchema.safeParse({ concurrency: 1 }).success).toBe(true);
        expect(CloudinarySettingsSchema.safeParse({ concurrency: 16 }).success).toBe(true);
        expect(CloudinarySettingsSchema.safeParse({ concurrency: 0 }).success).toBe(false);
        expect(CloudinarySettingsSchema.safeParse({ concurrency: 17 }).success).toBe(false);
      });

      it("validates Google OAuth & LinkedIn cookie min lengths", () => {
        expect(GoogleOAuthConfigSchema.safeParse({ clientId: "12345", clientSecret: "abcde" }).success).toBe(true);
        expect(GoogleOAuthConfigSchema.safeParse({ clientId: "1234", clientSecret: "abcde" }).success).toBe(false);

        expect(LinkedInCookieSchema.safeParse({ cookie: "li_at_session_cookie_valid" }).success).toBe(true);
        expect(LinkedInCookieSchema.safeParse({ cookie: "short" }).success).toBe(false);
      });

      it("validates MailSettingsSchema port numbers and emails", () => {
        expect(MailSettingsSchema.safeParse({ smtpPort: 587, imapPort: 993 }).success).toBe(true);
        expect(MailSettingsSchema.safeParse({ smtpPort: 0 }).success).toBe(false);
        expect(MailSettingsSchema.safeParse({ smtpPort: 70000 }).success).toBe(false);
        expect(MailSettingsSchema.safeParse({ smtpUser: "invalid-email" }).success).toBe(false);
        expect(MailSettingsSchema.safeParse({ smtpUser: "user@domain.com" }).success).toBe(true);
      });

      it("formatZodErrors properly formats single and nested error paths", () => {
        const parseResult = AddJobSchema.safeParse({
          title: "A",
          company: "",
          status: "invalid",
          description: "short",
        });
        expect(parseResult.success).toBe(false);
        if (!parseResult.success) {
          const errors = formatZodErrors(parseResult.error);
          expect(errors.title).toBeDefined();
          expect(errors.company).toBeDefined();
          expect(errors.status).toBeDefined();
          expect(errors.description).toBeDefined();
        }
      });
    });
  });

  /* ========================================================================
   * 2. Resume Studio Multi-Document Persistence & ATS Engine
   * ======================================================================== */
  describe("2. Multi-Document Resume Studio Endpoints & Logic", () => {
    it("GET /api/resume returns empty array on clean db and lists created drafts", async () => {
      const getRes = await GET_RESUME();
      expect(getRes.status).toBe(200);

      const data = await parseResponse<{ docs: ResumeDoc[] }>(getRes);
      expect(Array.isArray(data.docs)).toBe(true);
      expect(data.docs.length).toBe(0);

      // Create a doc via POST
      const postReq = createJsonRequest("http://localhost/api/resume", "POST", {
        name: "AI Engineer Specialized Resume",
        kind: "resume",
        templateId: "classic-ats",
        content: {
          header: { name: "Ahmed Arfaoui", title: "AI Engineer" },
          skills: ["LangGraph", "TypeScript"],
        },
      });
      const postRes = await POST_RESUME(postReq);
      expect(postRes.status).toBe(200);

      // Verify listed
      const listRes = await GET_RESUME();
      const listData = await parseResponse<{ docs: ResumeDoc[] }>(listRes);
      expect(listData.docs.length).toBe(1);
      expect(listData.docs[0].name).toBe("AI Engineer Specialized Resume");
    });

    it("PUT /api/resume creates a new version draft from base profile with valid template", async () => {
      const putReq = createJsonRequest("http://localhost/api/resume", "PUT", {
        name: "Executive CV from Profile",
        kind: "cv",
        templateId: "executive",
        profile: mockUserProfile,
      });
      const putRes = await PUT_RESUME(putReq);
      expect(putRes.status).toBe(200);

      const putData = await parseResponse<{ doc: ResumeDoc }>(putRes);
      expect(putData.doc.name).toBe("Executive CV from Profile");
      expect(putData.doc.kind).toBe("cv");
      expect(putData.doc.templateId).toBe("executive");
      expect(putData.doc.content?.header?.name).toBe(mockUserProfile.name);
    });

    it("DELETE /api/resume deletes document and subsequent fetch returns 404", async () => {
      const doc = resumeRepo.upsert({
        id: "res-to-delete-123",
        name: "Temporary Draft to Delete",
        kind: "resume",
        templateId: "classic-ats",
        tex: "Sample TeX",
        source: "scratch",
        autoCompile: false,
        createdAt: "2026-08-01",
        updatedAt: "2026-08-01",
      });
      expect(resumeRepo.get("res-to-delete-123")).not.toBeNull();

      const delReq = createUrlRequest(`http://localhost/api/resume?id=${doc.id}`, "DELETE");
      const delRes = await DELETE_RESUME(delReq);
      expect(delRes.status).toBe(200);

      expect(resumeRepo.get("res-to-delete-123")).toBeNull();

      // Deleting already deleted ID returns 404
      const delReq2 = createUrlRequest(`http://localhost/api/resume?id=${doc.id}`, "DELETE");
      const delRes2 = await DELETE_RESUME(delReq2);
      expect(delRes2.status).toBe(404);
    });

    it("analyzeAts computes score and checks deterministically", () => {
      const testResume = {
        header: {
          name: "Ahmed Dev",
          title: "Senior AI Engineer",
          email: "ahmed@example.com",
          phone: "",
          location: "",
          linkedin: "",
          github: "",
          portfolio: "",
        },
        summary: "Specialized in Python, LangGraph, TypeScript, and Docker containerized systems.",
        skills: ["Python", "TypeScript", "LangGraph", "Docker", "PostgreSQL", "FastAPI"],
        experience: [
          {
            company: "Tech Corp",
            role: "AI Engineer",
            duration: "2024-2026",
            bullets: ["Engineered multi-agent LLM systems with 95% tool-use precision."],
          },
        ],
        education: [
          {
            school: "University",
            degree: "BS Computer Science",
            year: "2024",
          },
        ],
      };

      const atsResult = analyzeAts(testResume);

      expect(atsResult.score).toBeGreaterThan(0);
      expect(Array.isArray(atsResult.checks)).toBe(true);
      expect(atsResult.checks.length).toBeGreaterThan(0);
      expect(atsResult.estimatedPages).toBeGreaterThanOrEqual(1);
    });
  });

  /* ========================================================================
   * 3. Shared Opportunity Container (JobDetailView) Contract
   * ======================================================================== */
  describe("3. JobDetailView Contract & Tab Architecture", () => {
    it("exposes the consolidated subpanel tabs in JOB_DETAIL_TABS", () => {
      const tabIds = JOB_DETAIL_TABS.map((t) => t.id);
      // Match & Intelligence merged into the Overview evidence flow (single scroll).
      expect(tabIds).toEqual(["overview", "docs", "flashcards", "questions", "agent"]);
      expect(JOB_DETAIL_TABS.length).toBe(5);
    });

    it("persists background agent toggle mode in settings store", async () => {
      settingsRepo.set("bg_agent_mode", "manual");
      expect(settingsRepo.get("bg_agent_mode")).toBe("manual");

      settingsRepo.set("bg_agent_mode", "auto");
      expect(settingsRepo.get("bg_agent_mode")).toBe("auto");
    });
  });

  /* ========================================================================
   * 4. Tracker Crawl Persistence & Deck Callback Wiring
   * ======================================================================== */
  describe("4. Tracker Crawl Ingestion & Swipe Deck Callbacks", () => {
    it("crawled jobs are ingested into SQLite jobs table with source and wishlist status", async () => {
      const initialCount = jobsRepo.list().length;

      // Pre-seed an existing job
      jobsRepo.upsert({
        ...mockJobApplication1,
        id: "job-preexisting-test-1",
        company: "Existing Corp Unique",
        title: "Frontend Lead Unique",
        status: "applied",
        createdDate: new Date().toISOString(),
      });

      // Simulate crawler response deduplication logic
      const discoveredJobs = [
        {
          title: "Frontend Lead Unique",
          company: "Existing Corp Unique", // duplicate, should be skipped
          location: "Remote",
          jobDescription: "Description 1",
        },
        {
          title: "Senior AI Researcher Unique",
          company: "Frontier Lab Unique", // fresh, should be added
          location: "Remote",
          jobDescription: "Research agentic reasoning systems.",
          matchScore: 92,
          fitCategory: "strong",
          source: "Scrapling Crawler",
        },
      ];

      const existingApps = jobsRepo.list();
      const existingKeys = new Set(
        existingApps.map((a) => `${(a.company || "").toLowerCase().trim()}:::${(a.title || "").toLowerCase().trim()}`)
      );

      let added = 0;
      for (const j of discoveredJobs) {
        const key = `${(j.company || "").toLowerCase().trim()}:::${(j.title || "").toLowerCase().trim()}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);

        jobsRepo.upsert({
          id: `job-crawled-${Date.now()}-${added}`,
          title: j.title,
          company: j.company,
          location: j.location,
          status: "wishlist",
          jobDescription: j.jobDescription,
          matchScore: j.matchScore,
          source: j.source || "Scrapling Crawler",
          createdDate: new Date().toISOString(),
        });
        added++;
      }

      expect(added).toBe(1);
      const allJobs = jobsRepo.list();
      expect(allJobs.length).toBe(initialCount + 2); // 1 pre-seed + 1 fresh crawled
      const freshJob = allJobs.find((j) => j.company === "Frontier Lab Unique");
      expect(freshJob).toBeDefined();
      expect(freshJob?.status).toBe("wishlist");
      expect(freshJob?.source).toBe("Scrapling Crawler");
    });

    it("swipe deck review action sets skipReason and updates status to rejected in SQLite", () => {
      const job = jobsRepo.upsert({
        ...mockJobApplication1,
        id: "job-swipe-test",
        status: "wishlist",
        createdDate: new Date().toISOString(),
        skipReason: undefined,
      });

      // User swipes left: reason "location_mismatch"
      jobsRepo.upsert({
        ...job,
        status: "rejected",
        skipReason: "location_mismatch",
      });

      const updated = jobsRepo.get("job-swipe-test");
      expect(updated?.status).toBe("rejected");
      expect(updated?.skipReason).toBe("location_mismatch");
    });
  });

  /* ========================================================================
   * 5. AI Status Badging & Metadata Provenance
   * ======================================================================== */
  describe("5. AI Status Badging & Metadata Provenance", () => {
    it("cleanSkillsGap preserves source, provider, model, and analyzedAt metadata", () => {
      const rawAnalysis = {
        matchScore: 90,
        matchingSkills: ["Python", "LangGraph"],
        missingSkills: ["Kubernetes"],
        strengths: ["Strong agent design"],
        recommendations: ["Learn Helm"],
        source: "live_llm",
        provider: "openrouter",
        model: "anthropic/claude-3.5-sonnet",
        analyzedAt: "2026-08-19T02:00:00.000Z",
      };

      const sanitized = cleanSkillsGap(rawAnalysis);
      expect(sanitized).not.toBeNull();
      expect(sanitized?.source).toBe("live_llm");
      expect(sanitized?.provider).toBe("openrouter");
      expect(sanitized?.model).toBe("anthropic/claude-3.5-sonnet");
      expect(sanitized?.analyzedAt).toBe("2026-08-19T02:00:00.000Z");
    });

    it("cleanDocuments preserves source, provider, model, and generatedAt metadata", () => {
      const rawDocs = {
        coverLetter: "Dear Hiring Team,\n\nI am writing to apply...",
        source: "live_llm",
        provider: "openrouter",
        model: "anthropic/claude-3.5-sonnet",
        generatedAt: "2026-08-19T02:00:00.000Z",
      };

      const sanitized = cleanDocuments(rawDocs);
      expect(sanitized).not.toBeNull();
      expect(sanitized?.source).toBe("live_llm");
      expect(sanitized?.provider).toBe("openrouter");
      expect(sanitized?.model).toBe("anthropic/claude-3.5-sonnet");
      expect(sanitized?.generatedAt).toBe("2026-08-19T02:00:00.000Z");
    });
  });
});
