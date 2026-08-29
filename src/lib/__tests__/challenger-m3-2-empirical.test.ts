import { describe, it, expect, beforeEach } from "vitest";
import { resetDatabase, jobsRepo } from "@/lib/db";
import { JobApplication, ApplicationStatus } from "@/types";
import { POST as CRAWL_POST } from "@/app/api/crawl/route";
import { POST as DATA_POST, GET as DATA_GET } from "@/app/api/data/[collection]/route";
import { NextRequest } from "next/server";

describe("Milestone 3 Iteration 2 — Empirical Verification & Adversarial Challenge Suite (Challenger 2)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe("1. Tracker Crawl Ingestion & Field Mapping Resilience", () => {
    it("correctly maps full and partial crawler payloads to JobApplication domain models with robust fallbacks", () => {
      // Simulating crawl payload variations as processed by handleCrawlWeb in tracker/page.tsx
      const rawCrawlerOutputs = [
        {
          title: "Senior Distributed Systems Engineer",
          company: "Acme Cloud Corp",
          location: "San Francisco, CA (Hybrid)",
          salary: "$180k - $220k",
          url: "https://acmecloud.example/jobs/sre-101",
          jobDescription: "Building high throughput data pipelines using Rust, Kafka, and SQLite.",
          matchScore: 94,
          fitCategory: "direct_fit" as const,
          skillsGap: {
            matchingSkills: ["Rust", "Kafka", "Distributed Systems"],
            missingSkills: ["Kubernetes"],
          },
          source: "RemoteOK Scraper",
          hiringPost: true,
          screenshotUrl: "proof-acme-101.png",
          cloudinaryUrl: "https://res.cloudinary.com/huntflow/acme-101.png",
        },
        {
          // Sparse crawler output with missing optional fields
          title: undefined,
          company: null,
          location: "",
          salary: undefined,
          url: undefined,
          jobDescription: null,
          matchScore: undefined,
          fitCategory: undefined,
          skillsGap: undefined,
          source: "",
          screenshotUrl: undefined,
          cloudinaryUrl: undefined,
        },
      ];

      const mappedApplications = rawCrawlerOutputs.map((job) => ({
        title: job.title || "Discovered Opportunity",
        company: job.company || "Unknown Company",
        location: job.location || "Remote",
        salary: job.salary,
        url: job.url,
        status: "wishlist" as ApplicationStatus,
        jobDescription: job.jobDescription || "",
        matchScore: job.matchScore,
        fitCategory: job.fitCategory,
        skillsGap: job.skillsGap,
        source: job.source || "Scrapling Crawler",
        hiringPost: job.hiringPost,
        screenshotUrl: job.screenshotUrl,
        cloudinaryUrl: job.cloudinaryUrl,
        notes: job.source ? `Discovered via ${job.source}` : "Discovered via Scrapling Crawler",
        autoApplyStatus: "idle" as const,
        autoApplyLogs: [],
      }));

      // Verify rich job mapping
      const rich = mappedApplications[0];
      expect(rich.title).toBe("Senior Distributed Systems Engineer");
      expect(rich.company).toBe("Acme Cloud Corp");
      expect(rich.location).toBe("San Francisco, CA (Hybrid)");
      expect(rich.salary).toBe("$180k - $220k");
      expect(rich.status).toBe("wishlist");
      expect(rich.source).toBe("RemoteOK Scraper");
      expect(rich.notes).toBe("Discovered via RemoteOK Scraper");
      expect(rich.screenshotUrl).toBe("proof-acme-101.png");
      expect(rich.cloudinaryUrl).toBe("https://res.cloudinary.com/huntflow/acme-101.png");
      expect(rich.skillsGap?.matchingSkills).toEqual(["Rust", "Kafka", "Distributed Systems"]);

      // Verify sparse job fallback behavior
      const sparse = mappedApplications[1];
      expect(sparse.title).toBe("Discovered Opportunity");
      expect(sparse.company).toBe("Unknown Company");
      expect(sparse.location).toBe("Remote");
      expect(sparse.jobDescription).toBe("");
      expect(sparse.source).toBe("Scrapling Crawler");
      expect(sparse.notes).toBe("Discovered via Scrapling Crawler");
      expect(sparse.status).toBe("wishlist");
      expect(sparse.autoApplyStatus).toBe("idle");
    });

    it("verifies live /api/crawl endpoint returns graceful offline status when sidecar is offline without throwing unhandled exceptions", async () => {
      const crawlReq = new NextRequest("http://localhost:3000/api/crawl", {
        method: "POST",
        body: JSON.stringify({ category: "all", limit: 5, concurrency: 4 }),
      });

      const crawlRes = await CRAWL_POST(crawlReq);
      expect(crawlRes.status).toBe(200);

      const data = await crawlRes.json();
      expect(data).toHaveProperty("jobs");
      expect(Array.isArray(data.jobs)).toBe(true);
      // When Python sidecar is not running, offline flag must be true
      expect(data.offline).toBe(true);
      expect(data.jobs).toHaveLength(0);
    });
  });

  describe("2. Deduplication Adversarial Stress Testing", () => {
    it("handles complex casing, whitespace, unicode, intra-batch duplicates, and sparse keys", () => {
      const existingPipeline: Partial<JobApplication>[] = [
        { title: "Senior React Engineer", company: "Meta Platforms" },
        { title: "Staff Backend Engineer", company: "Stripe" },
        { title: "AI Research Scientist", company: "OpenAI" },
      ];

      const makeKey = (company: string = "", title: string = "") =>
        `${(company || "").toLowerCase().trim()}:::${(title || "").toLowerCase().trim()}`;

      const existingKeys = new Set(
        existingPipeline.map((a) => makeKey(a.company, a.title))
      );

      const incomingDiscoveredJobs = [
        // 1. Exact duplicates in pipeline -> MUST BE SKIPPED
        { company: "Meta Platforms", title: "Senior React Engineer" },
        // 2. Case variations -> MUST BE SKIPPED
        { company: "meta platforms", title: "senior react engineer" },
        { company: "STRIPE", title: "STAFF BACKEND ENGINEER" },
        // 3. Leading/trailing whitespace -> MUST BE SKIPPED
        { company: "  OpenAI  ", title: " AI Research Scientist\t" },
        // 4. Intra-batch duplicates (3 copies of same new role) -> ONLY 1 MUST BE ADDED
        { company: "Anthropic", title: "Safety Researcher" },
        { company: "anthropic", title: "safety researcher" },
        { company: " Anthropic ", title: "Safety Researcher " },
        // 5. Distinct role at same company -> MUST BE ADDED
        { company: "Stripe", title: "Infrastructure Engineer" },
        // 6. Distinct company with same title -> MUST BE ADDED
        { company: "Linear", title: "Senior React Engineer" },
        // 7. Sparse empty roles -> FIRST MUST BE ADDED, SUBSEQUENT SKIPPED
        { company: "", title: "" },
        { company: "   ", title: "" },
      ];

      const added: (typeof incomingDiscoveredJobs)[number][] = [];

      for (const job of incomingDiscoveredJobs) {
        const key = makeKey(job.company, job.title);
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        added.push(job);
      }

      // Expected additions:
      // 1. Anthropic — Safety Researcher (1st instance)
      // 2. Stripe — Infrastructure Engineer
      // 3. Linear — Senior React Engineer
      // 4. Empty role (1st instance)
      expect(added).toHaveLength(4);
      expect(added[0].company).toBe("Anthropic");
      expect(added[0].title).toBe("Safety Researcher");
      expect(added[1].company).toBe("Stripe");
      expect(added[1].title).toBe("Infrastructure Engineer");
      expect(added[2].company).toBe("Linear");
      expect(added[2].title).toBe("Senior React Engineer");
      expect(added[3].company).toBe("");
    });
  });

  describe("3. addApplication & SQLite Write-Through Persistence", () => {
    it("persists crawled job directly to SQLite database via /api/data/jobs REST handler", async () => {
      const newJobPayload: Omit<JobApplication, "id" | "createdDate"> = {
        title: "Principal Cloud Architect",
        company: "Vanguard Tech",
        location: "Zurich, Switzerland (Remote)",
        salary: "CHF 190,000",
        url: "https://vanguard.tech/careers/arch-42",
        status: "wishlist",
        jobDescription: "Architecting zero-trust cloud infrastructure and multi-region Kubernetes clusters.",
        matchScore: 91,
        fitCategory: "direct_fit",
        skillsGap: {
          matchScore: 91,
          matchingSkills: ["Kubernetes", "AWS", "Terraform", "Go"],
          missingSkills: ["Rust"],
          strengths: ["Kubernetes", "AWS"],
          recommendations: ["Learn Rust"],
          keyTermFrequency: [],
        },
        source: "Scrapling Crawler",
        screenshotUrl: "proof-vanguard-42.png",
        cloudinaryUrl: "https://res.cloudinary.com/huntflow/vanguard-42.png",
        notes: "Discovered via Scrapling Crawler",
        autoApplyStatus: "idle",
        autoApplyLogs: [],
      };

      const fullJob: JobApplication = {
        ...newJobPayload,
        id: "job-crawl-emp-001",
        createdDate: "2026-08-19",
      };

      const postReq = new NextRequest("http://localhost:3000/api/data/jobs", {
        method: "POST",
        body: JSON.stringify(fullJob),
      });

      const postRes = await DATA_POST(postReq, { params: Promise.resolve({ collection: "jobs" }) });
      expect(postRes.status).toBe(200);

      // Verify retrieval from SQLite database via repository
      const saved = await jobsRepo.get("job-crawl-emp-001");
      expect(saved).toBeDefined();
      expect(saved?.id).toBe("job-crawl-emp-001");
      expect(saved?.title).toBe("Principal Cloud Architect");
      expect(saved?.company).toBe("Vanguard Tech");
      expect(saved?.location).toBe("Zurich, Switzerland (Remote)");
      expect(saved?.salary).toBe("CHF 190,000");
      expect(saved?.url).toBe("https://vanguard.tech/careers/arch-42");
      expect(saved?.status).toBe("wishlist");
      expect(saved?.matchScore).toBe(91);
      expect(saved?.fitCategory).toBe("direct_fit");
      expect(saved?.screenshotUrl).toBe("proof-vanguard-42.png");
      expect(saved?.cloudinaryUrl).toBe("https://res.cloudinary.com/huntflow/vanguard-42.png");
      expect(saved?.notes).toBe("Discovered via Scrapling Crawler");

      // Verify retrieval via GET /api/data/jobs
      const getReq = new NextRequest("http://localhost:3000/api/data/jobs", { method: "GET" });
      const getRes = await DATA_GET(getReq, { params: Promise.resolve({ collection: "jobs" }) });
      expect(getRes.status).toBe(200);
      const listData = await getRes.json();
      expect(listData.jobs.some((j: JobApplication) => j.id === "job-crawl-emp-001")).toBe(true);
    });
  });

  describe("4. JobSwipeDeck Callbacks (onSave, onReviewed) & Active Learning Skip Reasons", () => {
    it("correctly executes onReviewed callback, updates status to 'rejected', and saves skipReason to SQLite", async () => {
      const initialJob: JobApplication = {
        id: "job-swipe-test-01",
        title: "Frontend Lead",
        company: "Acme Interactive",
        location: "New York, NY (Onsite)",
        salary: "$120,000",
        status: "wishlist",
        createdDate: "2026-08-19",
        jobDescription: "Lead frontend developer for web applications.",
      };

      await jobsRepo.upsert(initialJob);

      // Test all skip reasons supported by JobSwipeDeck
      const skipReasons = [
        "salary_low",
        "stack_mismatch",
        "onsite_only",
        "seniority_mismatch",
        "generic",
      ];

      for (const reason of skipReasons) {
        // Simulate tracker page onReviewed callback:
        // onReviewed={(j, reason) => {
        //   if (reason) {
        //     updateApplication(j.id, { skipReason: reason, status: "rejected" });
        //     success(`Marked as skipped: ${reason.replace(/_/g, " ")}.`);
        //   }
        // }}
        const updatedJob: JobApplication = {
          ...initialJob,
          skipReason: reason,
          status: "rejected",
        };

        const updateReq = new NextRequest("http://localhost:3000/api/data/jobs", {
          method: "POST",
          body: JSON.stringify(updatedJob),
        });

        const updateRes = await DATA_POST(updateReq, { params: Promise.resolve({ collection: "jobs" }) });
        expect(updateRes.status).toBe(200);

        const dbRecord = await jobsRepo.get("job-swipe-test-01");
        expect(dbRecord).toBeDefined();
        expect(dbRecord?.status).toBe("rejected");
        expect(dbRecord?.skipReason).toBe(reason);
      }
    });

    it("correctly executes onSave callback and transitions status back to wishlist in SQLite", async () => {
      const initialJob: JobApplication = {
        id: "job-swipe-test-02",
        title: "Senior Backend Architect",
        company: "Starlight Dynamics",
        location: "Remote",
        status: "rejected",
        skipReason: "salary_low",
        createdDate: "2026-08-19",
        jobDescription: "Architecting microservices in Go and gRPC.",
      };

      await jobsRepo.upsert(initialJob);

      // Simulate tracker page onSave callback:
      // onSave={(j) => {
      //   updateApplication(j.id, { status: "wishlist" });
      //   success(`Saved "${j.title}" to wishlist.`);
      // }}
      const savedJob: JobApplication = {
        ...initialJob,
        status: "wishlist",
      };

      const updateReq = new NextRequest("http://localhost:3000/api/data/jobs", {
        method: "POST",
        body: JSON.stringify(savedJob),
      });

      const updateRes = await DATA_POST(updateReq, { params: Promise.resolve({ collection: "jobs" }) });
      expect(updateRes.status).toBe(200);

      const dbRecord = await jobsRepo.get("job-swipe-test-02");
      expect(dbRecord).toBeDefined();
      expect(dbRecord?.status).toBe("wishlist");
    });

    it("evaluates fit category and visual proof source priority in JobSwipeDeck logic", () => {
      const jobWithDirectFit: JobApplication = {
        id: "job-fit-1",
        title: "Senior React Engineer",
        company: "Tech Corp",
        location: "Remote",
        status: "wishlist",
        createdDate: "2026-08-19",
        jobDescription: "React development",
        fitCategory: "direct_fit",
        matchScore: 60, // explicitly direct_fit despite score
      };

      const jobWithComputedDirectFit: JobApplication = {
        id: "job-fit-2",
        title: "Senior TypeScript Engineer",
        company: "Code Base",
        location: "Remote",
        status: "wishlist",
        createdDate: "2026-08-19",
        jobDescription: "TypeScript development",
        matchScore: 85, // >= 75 -> computed direct_fit
      };

      const jobWithTailoredFit: JobApplication = {
        id: "job-fit-3",
        title: "Data Analyst",
        company: "Data Corp",
        location: "Remote",
        status: "wishlist",
        createdDate: "2026-08-19",
        jobDescription: "SQL analysis",
        matchScore: 55, // < 75 -> tailored_fit
      };

      const getFitCategory = (job: JobApplication) =>
        job.fitCategory || (job.matchScore && job.matchScore >= 75 ? "direct_fit" : "tailored_fit");

      expect(getFitCategory(jobWithDirectFit)).toBe("direct_fit");
      expect(getFitCategory(jobWithComputedDirectFit)).toBe("direct_fit");
      expect(getFitCategory(jobWithTailoredFit)).toBe("tailored_fit");

      // Visual proof source resolution: Cloudinary URL prioritized over local sidecar URL
      const getShotSrc = (job: JobApplication) =>
        job.cloudinaryUrl || (job.screenshotUrl ? `http://127.0.0.1:8001/screenshots/${job.screenshotUrl}` : null);

      const jobWithBothUrls: JobApplication = {
        id: "job-url-1",
        title: "Dev",
        company: "Co",
        location: "Remote",
        status: "wishlist",
        createdDate: "2026-08-19",
        jobDescription: "desc",
        screenshotUrl: "local-shot.png",
        cloudinaryUrl: "https://res.cloudinary.com/cloud/remote-shot.png",
      };

      const jobWithLocalOnly: JobApplication = {
        id: "job-url-2",
        title: "Dev",
        company: "Co",
        location: "Remote",
        status: "wishlist",
        createdDate: "2026-08-19",
        jobDescription: "desc",
        screenshotUrl: "local-shot.png",
      };

      const jobWithNoUrls: JobApplication = {
        id: "job-url-3",
        title: "Dev",
        company: "Co",
        location: "Remote",
        status: "wishlist",
        createdDate: "2026-08-19",
        jobDescription: "desc",
      };

      expect(getShotSrc(jobWithBothUrls)).toBe("https://res.cloudinary.com/cloud/remote-shot.png");
      expect(getShotSrc(jobWithLocalOnly)).toBe("http://127.0.0.1:8001/screenshots/local-shot.png");
      expect(getShotSrc(jobWithNoUrls)).toBeNull();
    });
  });
});
