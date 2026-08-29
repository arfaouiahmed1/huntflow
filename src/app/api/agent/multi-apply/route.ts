import { NextRequest, NextResponse } from "next/server";
import { runMultiAgentApp, streamMultiAgentApp, MultiAgentStreamEvent } from "@/agents/multiAgentAppGraph";
import { RegionCode } from "@/lib/agents/regionalNorms";
import { jobsRepo, settingsRepo } from "@/lib/db";
import { JobApplication, UserProfile } from "@/types";

const inFlight = new Set<string>();

export async function POST(req: NextRequest) {
  let jobId: string | undefined;
  try {
    const body = await req.json();
    const { jobId: id, targetRegion, submit, threadId, stream } = body;
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
      location: job.location,
      url: job.url,
      jobDescription: job.jobDescription,
      matchScore: job.matchScore ?? undefined,
    };


    if (stream) {
      const encoder = new TextEncoder();
      const currentJobId = jobId;

      const readable = new ReadableStream({
        async start(controller) {
          try {
            const { finalState, logs } = await streamMultiAgentApp(
              {
                job: jobInput,
                profile,
                targetRegion: (targetRegion as RegionCode) || "US",
                submit: Boolean(submit),
                threadId,
              },
              (event: MultiAgentStreamEvent) => {
                const payload = `data: ${JSON.stringify(event)}\n\n`;
                controller.enqueue(encoder.encode(payload));
              }
            );

            // Stream path must persist like the JSON path or the tracker never sees the outcome.
            try {
              const freshJob = jobsRepo.get(currentJobId);
              if (freshJob) {
                jobsRepo.upsert({
                  ...freshJob,
                  autoApplyStatus: (finalState.autoApplyStatus || "manual_required") as JobApplication["autoApplyStatus"],
                  autoApplyLogs: logs,
                  multiAgentOutputs: {
                    atsScore: finalState.atsScore,
                    recommendedTemplate: finalState.recommendedTemplate,
                    matchingSkills: finalState.matchingSkills,
                    missingSkills: finalState.missingSkills,
                    salaryEstimate: finalState.salaryEstimate,
                    outreachSubject: finalState.outreachSubject,
                    interviewPrepTopics: finalState.interviewPrepTopics,
                    companyResearch: finalState.companyResearch ?? undefined,
                  },
                });
              }
            } catch {}

            controller.close();
          } catch (streamErr) {
            const errPayload = `data: ${JSON.stringify({ kind: "error", message: String(streamErr) })}\n\n`;
            controller.enqueue(encoder.encode(errPayload));
            controller.close();
          } finally {
            if (currentJobId) inFlight.delete(currentJobId);
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const result = await runMultiAgentApp({
      job: jobInput,
      profile,
      targetRegion: (targetRegion as RegionCode) || "US",
      submit: Boolean(submit),
      threadId,
    });

    // Save outputs back to database so both the agent page and the drawer's
    // AutoApplyPanel see the same persisted analysis + terminal status.
    jobsRepo.upsert({
      ...job,
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
        companyResearch: result.companyResearch ?? undefined,
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
      companyResearch: result.companyResearch,
      logs: result.logs,
    });
  } catch (err) {
    console.error("Multi-agent execution failed:", err);
    return NextResponse.json({ error: "Multi-agent execution failed" }, { status: 500 });
  } finally {
    if (jobId) inFlight.delete(jobId);
  }
}
