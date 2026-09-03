import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  jobsRepo,
  settingsRepo,
  crawlerRunsRepo,
  crawlerJobsStagingRepo,
  jobSourceEdgesRepo,
  crawlerSourceStateRepo,
  savedSearchesRepo,
} from "@/lib/db";
import { resolveCloudinaryConfig } from "@/lib/cloudinaryConfig";
import { matchFallback } from "@/lib/prompts/generationPrompts";
import { JobApplication, UserProfile } from "@/types";
import { AGENT_BASE_URL as agentBase, agentHeaders } from "@/lib/agentClient";
import { collapseDuplicateJobs, dedupKey } from "@/lib/dedup";
import { normalizeJobCandidate } from "@/lib/crawler/normalizer";
import { rankCandidate } from "@/lib/crawler/ranking";
import { researchCompany } from "@/lib/agents/companyResearch";
import { executeCompanyIntelTool } from "@/lib/agents/tools/multiAgentTools";
import type { CanonicalJobCandidate } from "@/lib/crawler/contracts";

const CrawlRequestSchema = z.object({
  channel: z.enum(["ats", "aggregator", "regional", "community", "directory", "all"]).optional(),
  category: z.string().optional(),
  query: z.string().optional(),
  keyword: z.string().optional(),
  filters: z
    .object({
      regions: z.array(z.string()).optional(),
      countryCodes: z.array(z.string()).optional(),
      workModes: z.array(z.enum(["remote", "hybrid", "onsite"])).optional(),
      employmentTypes: z.array(z.enum(["full_time", "part_time", "contract", "internship"])).optional(),
      seniorities: z.array(z.enum(["intern", "junior", "mid", "senior", "staff", "lead", "principal"])).optional(),
      techTags: z.array(z.string()).optional(),
      languages: z.array(z.string()).optional(),
      salaryMin: z.number().optional(),
      salaryCurrency: z.string().optional(),
      visaSignals: z.array(z.enum(["explicit", "likely", "unknown"])).optional(),
      postedWithinDays: z.number().optional(),
      interviewStyle: z.string().optional(),
    })
    .optional(),
  sourceIds: z.array(z.unknown()).optional(),
  targetBoards: z
    .array(
      z.object({
        provider: z.string(),
        token: z.string(),
        companyName: z.string().optional(),
      })
    )
    .optional(),
  limit: z.number().optional(),
  concurrency: z.number().optional(),
  saveSearchId: z.string().optional(),
});

export interface CrawlJobLike {
  id?: string;
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
  url?: string;
  jobDescription?: string;
  source?: string;
  category?: string;
  hiring_post?: boolean;
  hiringPost?: boolean;
  screenshot?: string;
  screenshotUrl?: string;
  cloudinary?: string;
  cloudinaryUrl?: string;
  external_id?: string;
  atsType?: string;
}

export interface CrawlSourceResult {
  source_id: string;
  source_name: string;
  status: "success" | "warning" | "failed" | "skipped";
  found?: number;
  matched?: number;
  error?: string;
}
const fallbackProfile: UserProfile = {
  name: "Candidate",
  email: "candidate@example.com",
  phone: "",
  location: "Remote",
  summary: "Experienced software engineer",
  targetTitle: "Software Engineer",
  skills: ["TypeScript", "React", "Node.js", "Python"],
  experience: [],
  education: [],
};

function loadProfile(): UserProfile {
  try {
    const raw = settingsRepo.get("profile");
    if (raw) return JSON.parse(raw) as UserProfile;
  } catch {
    // fallback
  }
  return fallbackProfile;
}

function getStoredConcurrency(): number {
  return resolveCloudinaryConfig().concurrency || 1;
}

export async function POST(req: NextRequest) {
  try {
    const bodyRaw = await req.json().catch(() => ({}));
    const parseResult = CrawlRequestSchema.safeParse(bodyRaw);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request payload",
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { channel: rawChannel, category, query, keyword: kwParam, filters, sourceIds: rawSourceIds, targetBoards, limit: rawLimit, concurrency: rawConcurrency, saveSearchId } = parseResult.data;
    let channel = rawChannel || "all";
    if (!rawChannel && category) {
      if (category === "posts") channel = "community";
      else if (["remote", "general", "europe", "mena", "global"].includes(category)) channel = "aggregator";
      else channel = "all";
    }
    const profile = loadProfile();
    const effectiveKeyword = kwParam || query || profile.targetTitle?.trim().split(/\s+/)[0] || "developer";
    const effectiveConcurrency = Math.min(Math.max(rawConcurrency || getStoredConcurrency(), 1), 16);
    const limit = Math.min(Math.max(rawLimit || 50, 1), 200);
    const sourceIds = Array.isArray(rawSourceIds)
      ? rawSourceIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0).slice(0, 50)
      : undefined;

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let sidecarRunId: string | null = null;
    crawlerRunsRepo.create({
      id: runId,
      channel,
      query: effectiveKeyword,
      status: "running",
    });

    let crawledJobs: CrawlJobLike[] = [];
    let boardsCrawled = 0;
    let sourceResults: CrawlSourceResult[] = [];
    let offline = false;

    // 1. Direct ATS mode if targetBoards provided or channel === 'ats' with specific targets
    if (targetBoards && targetBoards.length > 0) {
      try {
        const res = await fetch(`${agentBase}/ats/crawl`, {
          method: "POST",
          headers: agentHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            boards: targetBoards,
            keyword: effectiveKeyword,
            limit,
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (res.ok) {
          const data = await res.json();
          crawledJobs = data.jobs || [];
          boardsCrawled = targetBoards.length;
        } else {
          throw new Error(`ATS crawl returned HTTP ${res.status}`);
        }
      } catch {
        offline = true;
      }
    } else {
      // 2. Multi-channel discovery crawl
      try {
        const res = await fetch(`${agentBase}/crawl`, {
          method: "POST",
          headers: agentHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            category: channel === "all" ? "all" : channel,
            keyword: effectiveKeyword,
            limit,
            concurrency: effectiveConcurrency,
            capture_screenshot: true,
            source_ids: sourceIds,
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (res.ok) {
          const data = await res.json();
          crawledJobs = data.jobs || [];
          boardsCrawled = Number(data.boards_crawled) || 0;
          sidecarRunId = typeof data.run_id === "string" ? data.run_id : typeof data.runId === "string" ? data.runId : null;
          sourceResults = Array.isArray(data.source_results) ? data.source_results : [];
        } else {
          throw new Error(`Crawl HTTP ${res.status}`);
        }
      } catch {
        offline = true;
      }
    }

    if (offline) {
      crawlerRunsRepo.update(runId, { status: "failed", finishedAt: new Date().toISOString() });
      return NextResponse.json({
        success: true,
        runId: null,
        status: "offline",
        count: 0,
        jobs: [],
        offline: true,
        concurrency: effectiveConcurrency,
        plannedSources: boardsCrawled,
        boardsCrawled: 0,
        sourceResults: [],
      });
    }

    // Build set of already-known / decided keys to avoid duplicates
    const seen = new Set<string>();
    for (const j of jobsRepo.list()) {
      const k = dedupKey(j);
      if (k) seen.add(k);
    }
    try {
      const rawDec = settingsRepo.get("crawl_decisions");
      if (rawDec) {
        const dec = JSON.parse(rawDec) as Record<string, string>;
        for (const [k, v] of Object.entries(dec)) {
          if (v === "saved" || v.startsWith("skipped")) seen.add(k);
        }
      }
    } catch {
      // ignore
    }

    // 3. Normalization, deterministic field extraction & staging
    const candidates: JobApplication[] = [];

    for (const rawJob of crawledJobs) {
      const rawDedup = dedupKey(rawJob);
      if (rawDedup && seen.has(rawDedup)) continue;
      if (rawDedup) seen.add(rawDedup);

      const extId = String(rawJob.external_id || rawJob.id || `${Date.now()}_${Math.random()}`);
      const sourceId = rawJob.atsType || rawJob.category || channel;

      // Stage in SQLite staging table
      crawlerJobsStagingRepo.stage(runId, sourceId, extId, rawJob);

      const norm = normalizeJobCandidate({
        title: rawJob.title || "Untitled Role",
        company: rawJob.company || "Unknown Company",
        location: rawJob.location || "Remote",
        url: rawJob.url,
        description: rawJob.jobDescription,
        salary: rawJob.salary,
        sourceConnector: sourceId,
      });

      if (norm.canonicalKey && seen.has(norm.canonicalKey)) continue;
      if (norm.canonicalKey) seen.add(norm.canonicalKey);

      // Filter checks if requested
      if (filters?.workModes && filters.workModes.length > 0 && !filters.workModes.includes(norm.workMode)) {
        continue;
      }
      if (filters?.seniorities && filters.seniorities.length > 0 && norm.seniority && !filters.seniorities.includes(norm.seniority)) {
        continue;
      }
      if (filters?.salaryMin && norm.salaryMax && norm.salaryMax < filters.salaryMin) {
        continue;
      }

      const jobId = rawJob.id || `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const jobApp: JobApplication = {
        id: jobId,
        title: rawJob.title || "Untitled Role",
        company: rawJob.company || "Unknown Company",
        location: rawJob.location || "Remote",
        salary: rawJob.salary,
        url: rawJob.url,
        status: "wishlist",
        jobDescription: rawJob.jobDescription || `${rawJob.title} at ${rawJob.company}`,
        source: rawJob.source || sourceId,
        createdDate: new Date().toISOString(),
        canonicalKey: norm.canonicalKey,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        seniority: norm.seniority || undefined,
        workMode: norm.workMode,
        employmentType: norm.employmentType || undefined,
        salaryMin: norm.salaryMin || undefined,
        salaryMax: norm.salaryMax || undefined,
        salaryCurrency: norm.salaryCurrency || undefined,
        visaSignal: norm.visaSignal,
        techTags: norm.techTags,
        sourceConfidence: norm.sourceConfidence,
      };
      const jobLike = {
        title: jobApp.title,
        company: jobApp.company,
        location: jobApp.location,
        jobDescription: jobApp.jobDescription,
      } as JobApplication;
      const analysis = matchFallback(jobLike, profile);
      jobApp.skillsGap = analysis;

      // Rank candidate against profile
      const ranked = rankCandidate(jobApp as unknown as CanonicalJobCandidate, {
        targetTitle: profile.targetTitle,
        skills: profile.skills,
        preferredWorkModes: profile.location?.toLowerCase().includes("remote") ? ["remote"] : ["remote", "onsite"],
        minSalary: filters?.salaryMin,
      });

      jobApp.matchScore = ranked.score;
      jobApp.rankingBreakdown = ranked.rankingBreakdown;
      jobApp.fitCategory = ranked.score >= 75 ? "direct_fit" : "tailored_fit";
      candidates.push(jobApp);
    }

    // 4. Bucketed Deduplication
    const uniqueJobs = collapseDuplicateJobs(candidates);
    uniqueJobs.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

    // 5. Persist top candidates to SQLite jobs repository
    const toPersist = uniqueJobs.slice(0, Math.min(limit, uniqueJobs.length));
    for (const job of toPersist) {
      try {
        jobsRepo.upsert(job);
        const sourceId = job.source || channel;
        jobSourceEdgesRepo.upsertEdge({
          jobId: job.id,
          sourceId,
          externalId: job.id,
          sourceUrl: job.url || "",
        });
      } catch (err) {
        console.warn("[crawl-persist]", job.id, err);
      }
    }

    // Update run status in SQLite
    crawlerRunsRepo.update(runId, {
      status: "completed",
      finishedAt: new Date().toISOString(),
      fetchedCount: crawledJobs.length,
      acceptedCount: uniqueJobs.length,
      duplicateCount: Math.max(0, candidates.length - uniqueJobs.length),
    });

    if (saveSearchId) {
      savedSearchesRepo.recordRun(saveSearchId);
    }

    // Background enrichment for top 5 candidates
    const enrichBatch = toPersist.slice(0, 5);
    if (enrichBatch.length > 0) {
      void (async () => {
        for (const job of enrichBatch) {
          try {
            const intel = await executeCompanyIntelTool({
              company: job.company,
              jobDescription: job.jobDescription,
              jobUrl: job.url,
            });
            const research = intel.research as Awaited<ReturnType<typeof researchCompany>> | undefined;
            if (research) {
              const current = jobsRepo.get(job.id);
              if (current) {
                jobsRepo.upsert({
                  ...current,
                  multiAgentOutputs: {
                    ...(current.multiAgentOutputs ?? {}),
                    companyResearch: research,
                  },
                });
              }
            }
          } catch {
            // Ignore enrichment failures in background
          }
        }
      })();
    }

    return NextResponse.json({
      success: true,
      runId: sidecarRunId || runId,
      status: "completed",
      count: uniqueJobs.length,
      jobs: uniqueJobs,
      concurrency: effectiveConcurrency,
      plannedSources: boardsCrawled,
      boardsCrawled,
      sourceResults,
      offline: false,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
