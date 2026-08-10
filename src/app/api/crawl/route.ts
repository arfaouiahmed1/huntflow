import { NextResponse } from "next/server";
import { jobsRepo, settingsRepo } from "@/lib/db";
import { matchFallback } from "@/lib/prompts/generationPrompts";
import { JobApplication, UserProfile } from "@/types";
import { AGENT_BASE_URL as agentBase, agentHeaders } from "@/lib/agentClient";
import { dedupKey } from "@/lib/dedup";

/**
 * Pure discovery + scoring endpoint. Crawls the Scrapling sidecar for fresh
 * job cards, scores each against the candidate profile, and returns them —
 * WITHOUT persisting anything. The /jobs page decides what to save.
 */
export { dedupKey };

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
  board_id?: string;
  hiring_post?: boolean;
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

export function loadProfile(): UserProfile {
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
    const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);

    let crawledJobs: CrawlJobLike[] = [];
    try {
      const res = await fetch(`${agentBase}/crawl`, {
        method: "POST",
        headers: agentHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ category, keyword, limit }),
      });
      if (!res.ok) throw new Error(`Crawl HTTP ${res.status}`);
      const data = await res.json();
      crawledJobs = data.jobs || [];
      console.log("CRAWL_DEBUG raw count", crawledJobs.length, JSON.stringify(crawledJobs.map((j) => ({ t: j.title, u: (j.url || "").slice(0, 60) }))));
    } catch {
      // Scrapling sidecar unreachable — report offline instead of fabricating mocks.
      return NextResponse.json({ success: true, count: 0, jobs: [], offline: true });
    }

    const seen = existingKeys();
    const scored: JobApplication[] = [];

    for (const j of crawledJobs) {
      const key = dedupKey(j);
      if (seen.has(key)) continue; // already tracked or previously decided on
      seen.add(key); // guard against duplicates within a single batch

      const jobLike = {
        title: j.title || "Software Engineer",
        company: j.company || "Company",
        location: j.location || "Remote",
        jobDescription: j.jobDescription || "",
      } as JobApplication;

      const analysis = matchFallback(jobLike, profile);
      const fitCategory = analysis.matchScore >= 75 ? "direct_fit" : "tailored_fit";

      scored.push({
        id: j.id || `crawl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: j.title || "Unknown Role",
        company: j.company || "Unknown Company",
        location: j.location || "Remote",
        salary: j.salary,
        url: j.url,
        jobDescription: j.jobDescription || "",
        status: "wishlist",
        matchScore: analysis.matchScore,
        fitCategory,
        skillsGap: analysis,
        source: j.source,
        createdDate: new Date().toISOString(),
      });
    }

    scored.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

    return NextResponse.json({ success: true, count: scored.length, jobs: scored, offline: false });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
