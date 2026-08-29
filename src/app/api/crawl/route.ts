import { NextResponse } from "next/server";
import { jobsRepo, settingsRepo } from "@/lib/db";
import { resolveCloudinaryConfig } from "@/lib/cloudinaryConfig";
import { matchFallback } from "@/lib/prompts/generationPrompts";
import { JobApplication, UserProfile } from "@/types";
import { AGENT_BASE_URL as agentBase, agentHeaders } from "@/lib/agentClient";
import { dedupKey } from "@/lib/dedup";
import { researchCompany } from "@/lib/agents/companyResearch";
import { executeCompanyIntelTool } from "@/lib/agents/tools/multiAgentTools";

/**
 * Discovery + scoring endpoint. Crawls the Scrapling sidecar for fresh job
 * cards, scores each against the candidate profile, and persists the first 30
 * as wishlist stubs so matchScore + source are available immediately; a
 * fire-and-forget background queue then enriches the top 10 (company intel,
 * fit/salary refresh) without blocking the response.
 */

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
}

export interface CrawlSourceResult {
  id: string;
  name: string;
  category: string;
  status: "success" | "failed";
  found: number;
  matched: number;
  error?: string | null;
}

function cleanText(value: unknown, fallback: string): string {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

function cleanTitle(value: unknown): string {
  return cleanText(value, "Unknown role")
    .replace(/^https?:\/\/\S+\s*(?:—|–|-|:)\s*/i, "")
    .replace(/^www\.\S+\s*(?:—|–|-|:)\s*/i, "")
    .trim();
}

function cleanCompany(value: unknown, url?: string): string {
  const raw = cleanText(value, "");
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).hostname.replace(/^www\./, "");
    } catch {
      /* use the posting URL below */
    }
  }
  if (raw) return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "Unknown company";
  } catch {
    return "Unknown company";
  }
}

const fallbackProfile: UserProfile = {
  name: "Candidate",
  targetTitle: "Software Engineer",
  email: "candidate@example.com",
  phone: "",
  location: "Remote",
  summary: "Experienced developer",
  skills: ["React", "TypeScript", "Node.js", "Python"],
  experience: [],
  education: [],
};

function loadProfile(): UserProfile {
  try {
    const rawProfile = settingsRepo.get("profile");
    if (rawProfile) {
      const parsed = JSON.parse(rawProfile) as Partial<UserProfile>;
      return { ...fallbackProfile, ...parsed, skills: parsed.skills ?? fallbackProfile.skills };
    }
  } catch {
    /* corrupt profile — keep fallback */
  }
  return fallbackProfile;
}

function getStoredConcurrency(): number {
  return resolveCloudinaryConfig().concurrency || 1;
}

function existingKeys(): Set<string> {
  const keys = new Set<string>();
  for (const job of jobsRepo.list()) keys.add(dedupKey(job));
  try {
    const decisions = JSON.parse(settingsRepo.get("crawl_decisions") ?? "{}") as Record<string, string>;
    for (const k of Object.keys(decisions)) keys.add(k);
  } catch {
    /* no decisions yet */
  }
  return keys;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const category = body.category || "all";
    const profile = loadProfile();
    const keyword =
      typeof body.keyword === "string" && body.keyword
        ? body.keyword
        : (profile.targetTitle?.trim().split(/\s+/)[0] || "developer");
    const limit = Math.min(Math.max(Number(body.limit) || 30, 1), 150);
    const concurrency = Math.min(Math.max(Number(body.concurrency) || getStoredConcurrency(), 1), 16);
    const sourceIds = Array.isArray(body.sourceIds)
      ? body.sourceIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0).slice(0, 50)
      : undefined;

    let crawledJobs: CrawlJobLike[] = [];
    let responseConcurrency = concurrency;
    let boardsCrawled = 0;
    let runId: string | null = null;
    let sourceResults: CrawlSourceResult[] = [];
    try {
      const res = await fetch(`${agentBase}/crawl`, {
        method: "POST",
        headers: agentHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          category,
          keyword,
          limit,
          concurrency,
          capture_screenshot: true,
          source_ids: sourceIds,
        }),
        signal: AbortSignal.timeout(150_000),
      });
      if (!res.ok) throw new Error(`Crawl HTTP ${res.status}`);
      const data = await res.json();
      crawledJobs = data.jobs || [];
      if (data.concurrency) responseConcurrency = data.concurrency;
      boardsCrawled = Number(data.boards_crawled) || 0;
      runId = typeof data.run_id === "string" ? data.run_id : null;
      sourceResults = Array.isArray(data.source_results) ? data.source_results : [];
    } catch {
      // Scrapling sidecar unreachable — report offline instead of fabricating mocks.
      return NextResponse.json({
        success: true,
        count: 0,
        jobs: [],
        offline: true,
        concurrency: responseConcurrency,
        boardsCrawled: 0,
        runId: null,
        sourceResults: [],
      });
    }

    const seen = existingKeys();
    const scored: JobApplication[] = [];

    for (const j of crawledJobs) {
      const url = typeof j.url === "string" ? j.url.trim() : "";
      if (url && !/^https?:\/\//i.test(url)) continue;
      const title = cleanTitle(j.title);
      const company = cleanCompany(j.company, url);
      const key = dedupKey({ ...j, title, company, url });
      if (seen.has(key)) continue; // already tracked or previously decided on
      seen.add(key); // guard against duplicates within a single batch

      const jobLike = {
        title,
        company,
        location: j.location || "Remote",
        jobDescription: j.jobDescription || "",
      } as JobApplication;

      const analysis = matchFallback(jobLike, profile);
      const fitCategory = analysis.matchScore >= 75 ? "direct_fit" : "tailored_fit";

      scored.push({
        id: j.id || `crawl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        company,
        location: j.location || "Remote",
        salary: j.salary,
        url: url || undefined,
        jobDescription: j.jobDescription || "",
        status: "wishlist",
        matchScore: analysis.matchScore,
        fitCategory,
        skillsGap: analysis,
        source: j.source,
        hiringPost: j.hiringPost,
        screenshotUrl: j.screenshot,
        cloudinaryUrl: j.cloudinary,
        createdDate: new Date().toISOString(),
      });
    }

    scored.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

    const stubsToPersist = scored.slice(0, Math.min(30, scored.length));
    for (const job of stubsToPersist) {
      try {
        // Deliberately unconditional — do not re-add an existence skip; every
        // deduped fresh job must land in the tracker as a wishlist stub.
        jobsRepo.upsert({
          ...job,
          status: "wishlist",
          jobDescription: job.jobDescription ?? "",
          createdDate: job.createdDate ?? new Date().toISOString(),
        });
      } catch (err) {
        console.warn("[crawl-enrich]", job?.id ?? "unknown", err);
      }
    }

    const enrichBatch = scored.slice(0, Math.min(10, scored.length));
    if (enrichBatch.length > 0) {
      const enrichLimit = Math.min(Math.max(concurrency, 1), 16);
      void (async () => {
        const queue = [...enrichBatch];
        const workers = Array.from({ length: Math.min(enrichLimit, queue.length) }, async () => {
          while (queue.length) {
            const job = queue.shift();
            if (!job) break;
            try {
              const jobLike = {
                title: job.title,
                company: job.company,
                location: job.location,
                jobDescription: job.jobDescription,
                salary: job.salary,
                url: job.url,
              } as JobApplication;
              const analysis = matchFallback(jobLike, profile);
              let companyResearch: Awaited<ReturnType<typeof researchCompany>> | null = null;
              try {
                const intel = await executeCompanyIntelTool({
                  company: job.company,
                  jobDescription: job.jobDescription ?? "",
                  jobUrl: job.url,
                });
                companyResearch = (intel.research as Awaited<ReturnType<typeof researchCompany>>) ?? null;
                if (!companyResearch) {
                  companyResearch = await researchCompany({ company: job.company, jobUrl: job.url });
                }
              } catch {
                try {
                  companyResearch = await researchCompany({ company: job.company, jobUrl: job.url });
                } catch {
                  companyResearch = null;
                }
              }
              const current = jobsRepo.get(job.id);
              const base = current ?? job;
              const enriched: JobApplication = {
                ...base,
                source: base.source ?? job.source,
                matchScore: analysis.matchScore ?? base.matchScore ?? job.matchScore,
                fitCategory: (analysis.matchScore >= 75 ? "direct_fit" : "tailored_fit") as JobApplication["fitCategory"],
                skillsGap: analysis,
                salary: base.salary ?? job.salary,
              };
              if (companyResearch) {
                const hq = companyResearch.facts.find((f) => f.label === "Headquarters")?.value;
                const founded = companyResearch.facts.find((f) => f.label === "Founded")?.value;
                const orgType = companyResearch.facts.find((f) => f.label === "Organization type")?.value;
                enriched.employerReview = {
                  ...(base.employerReview ?? {
                    acceptanceProbability: 50,
                    atsPassScore: 50,
                    verdict: "possible_callback" as const,
                    strengths: [],
                    riskFactors: [],
                    actionableFixes: [],
                    reviewedAt: new Date().toISOString(),
                  }),
                  companyIntel: {
                    history: companyResearch.summary?.slice(0, 900),
                    headquarters: hq,
                    foundingYear: founded,
                    stage: orgType,
                    research: companyResearch,
                  },
                };
                enriched.multiAgentOutputs = {
                  ...(base.multiAgentOutputs ?? {}),
                  companyResearch,
                };
              }
              try {
                jobsRepo.upsert(enriched);
              } catch {
                try {
                  jobsRepo.upsert({ ...base, matchScore: enriched.matchScore, skillsGap: enriched.skillsGap, fitCategory: enriched.fitCategory, source: enriched.source } as JobApplication);
                } catch (err) {
                  console.warn("[crawl-enrich]", job?.id ?? "unknown", err);
                }
              }
            } catch (err) {
              console.warn("[crawl-enrich]", job?.id ?? "unknown", err);
            }
          }
        });
        await Promise.allSettled(workers);
      })().catch((err) => {
        console.warn("[crawl-enrich]", "queue", err);
      });
    }

    return NextResponse.json({
      success: true,
      count: scored.length,
      jobs: scored,
      concurrency: responseConcurrency,
      boardsCrawled,
      runId,
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
