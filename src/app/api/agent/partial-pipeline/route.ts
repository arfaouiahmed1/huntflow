import { NextResponse } from "next/server";
import { runPartialPipeline } from "@/agents/multiAgentAppGraph";
import { jobsRepo } from "@/lib/db";
import { UserProfile } from "@/types";
import { RegionCode } from "@/lib/agents/regionalNorms";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { jobId, profile, targetRegion, stopAfter } = body as {
      jobId: string;
      profile: UserProfile;
      targetRegion: RegionCode;
      stopAfter: string;
    };

    if (!jobId || !profile || !stopAfter) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const job = jobsRepo.get(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const result = await runPartialPipeline({
      job: {
        id: job.id,
        title: job.title,
        company: job.company,
        jobDescription: job.jobDescription || "",
        url: job.url,
      },
      profile,
      targetRegion: targetRegion || "US",
      submit: false,
      stopAfter,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    console.error("Partial pipeline execution error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: msg || "Failed to execute partial pipeline" },
      { status: 500 }
    );
  }
}
