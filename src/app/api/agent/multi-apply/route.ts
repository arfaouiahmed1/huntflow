import { NextRequest, NextResponse } from "next/server";
import { runMultiAgentApp } from "@/agents/multiAgentAppGraph";
import { RegionCode } from "@/lib/agents/regionalNorms";
import { jobsRepo, settingsRepo } from "@/lib/db";
import { JobApplication, UserProfile } from "@/types";

const inFlight = new Set<string>();

export async function POST(req: NextRequest) {
  let jobId: string | undefined;
  try {
    const body = await req.json();
    const { jobId: id, targetRegion, submit, minMatch, threadId } = body;
    jobId = id;

    if (!jobId) {
      return NextResponse.json({ error: "Missing required parameter: jobId" }, { status: 400 });
    }

    if (inFlight.has(jobId)) {
      return NextResponse.json({ error: "Pipeline already running for this job" }, { status: 429 });
    }
    inFlight.add(jobId);

    let profile: UserProfile;
    try {
      const rawProfile = settingsRepo.get("profile");
      if (!rawProfile) throw new Error("No profile found");
      profile = JSON.parse(rawProfile);
    } catch {
      inFlight.delete(jobId);
      return NextResponse.json({ error: "Profile not found or invalid in database" }, { status: 400 });
    }

    const job = jobsRepo.get(jobId);
    if (!job) {
      inFlight.delete(jobId);
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const jobInput = {
      id: job.id,
      title: job.title,
      company: job.company,
      url: job.url,
      jobDescription: job.jobDescription,
      matchScore: job.matchScore ?? undefined,
    };

    const result = await runMultiAgentApp({
      job: jobInput,
      profile,
      targetRegion: (targetRegion as RegionCode) || "US",
      submit: Boolean(submit),
      minMatch: Number(minMatch) || 70,
      threadId,
    });

    // Save outputs back to database so both the agent page and the drawer's
    // AutoApplyPanel see the same persisted analysis + terminal status.
    jobsRepo.upsert({
      ...job,
      // Do not overwrite matchScore with atsScore; matchScore is the initial JD-profile fit.
      autoApplyStatus: result.status as JobApplication["autoApplyStatus"],
      autoApplyLogs: result.logs,
      multiAgentOutputs: {
        atsScore: result.atsScore,
        recommendedTemplate: result.recommendedTemplate,
        matchingSkills: result.matchingSkills,
        missingSkills: result.missingSkills,
        salaryEstimate: result.salaryEstimate,
        outreachSubject: result.outreachSubject,
        interviewPrepTopics: result.interviewPrepTopics,
      },
    });

    return NextResponse.json({
      success: true,
      threadId: result.threadId,
      status: result.status,
      atsScore: result.atsScore,
      recommendedTemplate: result.recommendedTemplate,
      matchingSkills: result.matchingSkills,
      missingSkills: result.missingSkills,
      salaryEstimate: result.salaryEstimate,
      outreachSubject: result.outreachSubject,
      interviewPrepTopics: result.interviewPrepTopics,
      logs: result.logs,
    });
  } catch (err) {
    // Log the real error server-side; never echo internals to the client.
    console.error("Multi-agent execution failed:", err);
    return NextResponse.json({ error: "Multi-agent execution failed" }, { status: 500 });
  } finally {
    if (jobId) inFlight.delete(jobId);
  }
}
