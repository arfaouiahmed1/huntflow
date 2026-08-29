import { NextRequest, NextResponse } from "next/server";
import { resumeMultiAgentApp } from "@/agents/multiAgentAppGraph";
import { jobsRepo } from "@/lib/db";
import { JobApplication } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { threadId, jobId, approved, submit, editedPitch } = body;

    if (!threadId) {
      return NextResponse.json({ error: "Missing required parameter: threadId" }, { status: 400 });
    }

    const result = await resumeMultiAgentApp(threadId, {
      approved: Boolean(approved),
      submit: Boolean(submit),
      editedPitch: typeof editedPitch === "string" ? editedPitch : undefined,
    });

    if (jobId) {
      const job = jobsRepo.get(jobId);
      if (job) {
        jobsRepo.upsert({
          ...job,
          autoApplyStatus: result.status as JobApplication["autoApplyStatus"],
          autoApplyLogs: result.logs,
          multiAgentOutputs: {
            ...(job.multiAgentOutputs ?? {}),
            atsScore: result.atsScore,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      threadId: result.threadId,
      status: result.status,
      atsScore: result.atsScore,
      tailoredPitch: result.tailoredPitch,
      fields: result.fields,
      logs: result.logs,
    });
  } catch (err) {
    console.error("Resume multi-agent execution failed:", err);
    return NextResponse.json({ error: "Failed to resume multi-agent execution" }, { status: 500 });
  }
}
