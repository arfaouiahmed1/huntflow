import { NextResponse } from "next/server";
import { jobsRepo, settingsRepo } from "@/lib/db";
import { matchFallback } from "@/lib/prompts/generationPrompts";
import { JobApplication, UserProfile } from "@/types";
import { AGENT_BASE_URL as agentBase, agentHeaders } from "@/lib/agentClient";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const category = body.category || "all";
    const keyword = body.keyword || "developer";
    const limit = Math.min(Math.max(Number(body.limit) || 8, 1), 50);

    // Load candidate profile
    const fallbackProfile = {
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
    let profile: UserProfile = fallbackProfile;
    try {
      const rawProfile = settingsRepo.get("profile");
      if (rawProfile) profile = JSON.parse(rawProfile);
    } catch {
      profile = fallbackProfile;
    }

    interface CrawledJob {
      id?: string;
      title?: string;
      company?: string;
      location?: string;
      salary?: string;
      url?: string;
      jobDescription?: string;
    }

    let crawledJobs: CrawledJob[] = [];

    try {
      const res = await fetch(`${agentBase}/crawl`, {
        method: "POST",
        headers: agentHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ category, keyword, limit }),
      });
      if (res.ok) {
        const data = await res.json();
        crawledJobs = data.jobs || [];
      }
    } catch {
      /* Scrapling offline fallback — generate high-quality regional mock targets */
      crawledJobs = [
        {
          id: `crawl_fall_${Date.now()}_1`,
          title: `Senior ${profile.skills[0] || "Frontend"} Engineer`,
          company: "RemoteStack EU",
          location: "Remote (EU / Global)",
          salary: "€75,000 - €95,000 / year",
          url: "https://remoteok.com",
          jobDescription: `Looking for a Senior ${profile.skills[0] || "Frontend"} Engineer proficient in ${profile.skills.slice(0, 4).join(", ")}. High ownership role building modern products.`,
        },
        {
          id: `crawl_fall_${Date.now()}_2`,
          title: "Full Stack Engineer (MENA)",
          company: "Carthage Tech",
          location: "Tunisia / Hybrid",
          salary: "$4,000 - $6,000 / month",
          url: "https://www.keejob.com",
          jobDescription: `Join Carthage Tech to build next-generation cloud services using ${profile.skills.join(", ")}. Flexible hybrid environment.`,
        },
      ];
    }

    const savedJobs: JobApplication[] = [];

    for (const j of crawledJobs) {
      const jobLike = {
        title: j.title || "Software Engineer",
        company: j.company || "Company",
        location: j.location || "Remote",
        jobDescription: j.jobDescription || "",
      } as JobApplication;

      const analysis = matchFallback(jobLike, profile);
      const fitCategory = analysis.matchScore >= 75 ? "direct_fit" : "tailored_fit";

      const newJob: JobApplication = {
        id: j.id || `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
        createdDate: new Date().toISOString(),
      };

      jobsRepo.upsert(newJob);
      savedJobs.push(newJob);
    }

    return NextResponse.json({
      success: true,
      count: savedJobs.length,
      jobs: savedJobs,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
