import { NextResponse } from "next/server";
import { jobsRepo, settingsRepo } from "@/lib/db";
import { runEmployerSimulator } from "@/agents/employerSimulatorAgent";
import { UserProfile } from "@/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { jobId } = body;
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const job = jobsRepo.get(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const rawProfile = settingsRepo.get("profile");
    const defaultProfile: UserProfile = {
      name: "Candidate",
      targetTitle: job.title,
      email: "candidate@example.com",
      phone: "",
      location: "Remote",
      summary: "Experienced developer",
      skills: ["React", "TypeScript", "Node.js"],
      experience: [],
      education: [],
    };
    let profile: UserProfile;
    try {
      profile = rawProfile ? JSON.parse(rawProfile) : defaultProfile;
    } catch {
      profile = defaultProfile;
    }

    const review = await runEmployerSimulator({
      job,
      profile,
      documents: job.documents,
    });

    const updatedJob = {
      ...job,
      employerReview: review,
    };
    jobsRepo.upsert(updatedJob);

    return NextResponse.json({
      success: true,
      review,
      job: updatedJob,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
