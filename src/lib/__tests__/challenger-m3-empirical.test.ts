import { describe, it, expect, beforeEach } from "vitest";
import { cleanSkillsGap, cleanDocuments } from "@/lib/llm/sanitize";
import { resetDatabase, jobsRepo } from "@/lib/db";
import { JobApplication } from "@/types";
import { POST as generatePOST } from "@/app/api/generate/route";
import { NextRequest } from "next/server";
import { AddJobSchema, formatZodErrors } from "@/lib/validation";

describe("Milestone 3 Empirical Verification Suite (Challenger 2)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe("1. Deduplication Logic & Normalization", () => {
    it("deduplicates opportunities across case variations and surrounding whitespace", () => {
      const existingApps: Partial<JobApplication>[] = [
        { id: "job-1", title: "Senior Frontend Engineer", company: "Acme Corp" },
        { id: "job-2", title: "Full Stack Developer", company: "Globex Inc." },
      ];

      const makeKey = (company: string = "", title: string = "") =>
        `${company.toLowerCase().trim()}:::${title.toLowerCase().trim()}`;

      const existingKeys = new Set(
        existingApps.map((a) => makeKey(a.company, a.title))
      );

      const crawledJobs = [
        { company: "  acme corp ", title: "senior frontend engineer  ", url: "https://acme.com/1" },
        { company: "ACME CORP", title: "SENIOR FRONTEND ENGINEER", url: "https://acme.com/2" },
        { company: "Globex Inc.", title: "Full Stack Developer", url: "https://globex.com/1" },
        { company: "Initech", title: "Site Reliability Engineer", url: "https://initech.com/sre" },
        { company: "Initech", title: "Site Reliability Engineer", url: "https://initech.com/sre-duplicate" },
        { company: "", title: "", url: "https://unknown.com/job" },
      ];

      const toAdd: typeof crawledJobs = [];
      for (const job of crawledJobs) {
        const key = makeKey(job.company, job.title);
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        toAdd.push(job);
      }

      // Acme Corp and Globex Inc are duplicates; Initech has 1 unique + 1 duplicate; empty is added once
      expect(toAdd).toHaveLength(2);
      expect(toAdd[0].company).toBe("Initech");
      expect(toAdd[0].title).toBe("Site Reliability Engineer");
      expect(toAdd[1].company).toBe("");
    });
  });

  describe("2. Job Swipe Deck Callbacks & Skip Reason SQLite Persistence", () => {
    it("persists skipReason to SQLite database when onReviewed callback is triggered", async () => {
      const initialJob: JobApplication = {
        id: "job-deck-test-1",
        title: "Staff Platform Engineer",
        company: "Vandelay Industries",
        location: "Remote",
        jobDescription: "Architecting cloud systems with Kubernetes and Go.",
        status: "wishlist",
        createdDate: "2026-08-19",
      };

      await jobsRepo.upsert(initialJob);

      const fetched1 = await jobsRepo.get("job-deck-test-1");
      expect(fetched1).toBeDefined();
      expect(fetched1?.status).toBe("wishlist");
      expect(fetched1?.skipReason).toBeUndefined();

      // Simulate onReviewed callback with active learning skip reasons
      const skipReasons = ["salary_low", "stack_mismatch", "onsite_only", "seniority_mismatch", "generic"];

      for (const reason of skipReasons) {
        await jobsRepo.upsert({
          ...initialJob,
          skipReason: reason,
          status: "rejected",
        });

        const updated = await jobsRepo.get("job-deck-test-1");
        expect(updated?.status).toBe("rejected");
        expect(updated?.skipReason).toBe(reason);
      }
    });

    it("restores application back to wishlist when onSave callback is triggered", async () => {
      const initialJob: JobApplication = {
        id: "job-deck-test-2",
        title: "Lead AI Engineer",
        company: "Stark Tech",
        location: "Remote",
        jobDescription: "Deploying generative AI agents.",
        status: "rejected",
        skipReason: "salary_low",
        createdDate: "2026-08-19",
      };

      await jobsRepo.upsert(initialJob);

      // Simulate onSave: updates status to wishlist
      await jobsRepo.upsert({
        ...initialJob,
        status: "wishlist",
      });

      const saved = await jobsRepo.get("job-deck-test-2");
      expect(saved?.status).toBe("wishlist");
    });
  });

  describe("3. AI Status Badging & Metadata Propagation", () => {
    it("preserves AI metadata (source, provider, model, analyzedAt) in cleanSkillsGap", () => {
      const rawWithMeta = {
        matchScore: 92,
        matchingSkills: ["React", "TypeScript", "Next.js"],
        missingSkills: ["Kubernetes"],
        strengths: ["Strong frontend foundation"],
        recommendations: ["Learn cluster orchestration"],
        source: "live_llm",
        provider: "openrouter",
        model: "anthropic/claude-3.5-sonnet",
        analyzedAt: "2026-08-19T02:00:00.000Z",
      };

      const cleaned = cleanSkillsGap(rawWithMeta);
      expect(cleaned).not.toBeNull();
      expect(cleaned?.source).toBe("live_llm");
      expect(cleaned?.provider).toBe("openrouter");
      expect(cleaned?.model).toBe("anthropic/claude-3.5-sonnet");
      expect(cleaned?.analyzedAt).toBe("2026-08-19T02:00:00.000Z");
      expect(cleaned?.matchScore).toBe(92);
    });

    it("falls back gracefully to heuristic_fallback metadata when LLM is unavailable", () => {
      const rawHeuristic = {
        matchScore: 75,
        matchingSkills: ["React"],
        missingSkills: ["GraphQL"],
        strengths: ["Core JS skills"],
        recommendations: ["Build full stack app"],
        source: "heuristic_fallback",
        provider: "local_heuristic",
        model: "rule_engine_v1",
        analyzedAt: "2026-08-19T02:05:00.000Z",
      };

      const cleaned = cleanSkillsGap(rawHeuristic);
      expect(cleaned).not.toBeNull();
      expect(cleaned?.source).toBe("heuristic_fallback");
      expect(cleaned?.provider).toBe("local_heuristic");
      expect(cleaned?.model).toBe("rule_engine_v1");
    });

    it("preserves AI metadata in cleanDocuments", () => {
      const rawDocs = {
        tailoredResume: "Tailored resume markdown content...",
        coverLetter: "Dear Hiring Manager...",
        motivationLetter: "I am deeply inspired by...",
        followUpEmail: "Following up on my application...",
        source: "live_llm",
        provider: "openai",
        model: "gpt-4o",
        generatedAt: "2026-08-19T02:10:00.000Z",
      };

      const cleaned = cleanDocuments(rawDocs);
      expect(cleaned).not.toBeNull();
      expect(cleaned?.source).toBe("live_llm");
      expect(cleaned?.provider).toBe("openai");
      expect(cleaned?.model).toBe("gpt-4o");
      expect(cleaned?.generatedAt).toBe("2026-08-19T02:10:00.000Z");
      expect(cleaned?.tailoredResume).toBe("Tailored resume markdown content...");
    });

    it("/api/generate returns explicit source and provenance for match_analysis and documents", async () => {
      const mockProfile = {
        name: "Test Candidate",
        targetTitle: "Frontend Architect",
        skills: ["React", "TypeScript", "Tailwind CSS", "Next.js"],
        summary: "Senior Frontend Architect with 7 years experience.",
        experience: [],
        education: [],
      };

      const mockJob: JobApplication = {
        id: "job-gen-test",
        title: "Frontend Architect",
        company: "Acme Labs",
        location: "Remote",
        jobDescription: "Looking for Senior Frontend Architect with React and TypeScript skills.",
        status: "wishlist",
        createdDate: "2026-08-19",
      };

      // Test match_analysis endpoint
      const matchReq = new NextRequest("http://localhost:3000/api/generate", {
        method: "POST",
        body: JSON.stringify({
          type: "match_analysis",
          job: mockJob,
          profile: mockProfile,
        }),
      });

      const matchRes = await generatePOST(matchReq);
      expect(matchRes.status).toBe(200);
      const matchData = await matchRes.json();
      expect(matchData.analysis).toBeDefined();
      expect(matchData.analysis.source).toMatch(/^(live_llm|heuristic_fallback)$/);
      expect(matchData.analysis.provider).toBeDefined();
      expect(matchData.analysis.analyzedAt).toBeDefined();

      // Test documents endpoint
      const docReq = new NextRequest("http://localhost:3000/api/generate", {
        method: "POST",
        body: JSON.stringify({
          type: "documents",
          job: mockJob,
          profile: mockProfile,
        }),
      });

      const docRes = await generatePOST(docReq);
      expect(docRes.status).toBe(200);
      const docData = await docRes.json();
      expect(docData.documents).toBeDefined();
      expect(docData.documents.source).toMatch(/^(live_llm|heuristic_fallback)$/);
      expect(docData.documents.provider).toBeDefined();
      expect(docData.documents.generatedAt).toBeDefined();
    });
  });

  describe("4. Form Validation & Zod Error Formatting", () => {
    it("correctly rejects invalid AddJob payloads and formats field errors", () => {
      const invalidPayload = {
        title: "A", // too short (< 2)
        company: "", // empty
        description: "short", // < 20 chars
        status: "invalid_status",
      };

      const parsed = AddJobSchema.safeParse(invalidPayload);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        const errors = formatZodErrors(parsed.error);
        expect(errors.title).toBe("Job title must be at least 2 characters");
        expect(errors.company).toBe("Company name is required");
        expect(errors.description).toContain("Job description must be at least 20 characters");
      }
    });

    it("accepts valid AddJob payload with defaults", () => {
      const validPayload = {
        title: "Full Stack Engineer",
        company: "Acme Corp",
        description: "We are seeking an experienced Full Stack Engineer proficient in Next.js, TypeScript, and SQLite.",
        status: "wishlist",
      };

      const parsed = AddJobSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.location).toBe("Remote");
      }
    });
  });
});
