import { NextResponse } from "next/server";
import { runPartialPipeline } from "@/agents/multiAgentAppGraph";
import { jobsRepo } from "@/lib/db";
import { UserProfile } from "@/types";
import { RegionCode } from "@/lib/agents/regionalNorms";
import { readBody, toErrorMessage } from "@/lib/errors";

export async function POST(req: Request) {
  try {
    const raw = await readBody(req);
    const { jobId, profile, targetRegion, stopAfter, step } = (raw ?? {}) as {
      jobId?: string;
      profile?: UserProfile;
      targetRegion?: RegionCode;
      stopAfter?: string;
      step?: string;
    };

    const STEP_ALIASES: Record<string, string> = {
      intel: "companyIntel",
      companyIntel: "companyIntel",
      norms: "regionalNorms",
      regionalNorms: "regionalNorms",
      pii: "piiSanitizer",
      piiSanitizer: "piiSanitizer",
      tailor: "resumeCVTailor",
      resumeCVTailor: "resumeCVTailor",
      letter: "letterTailor",
      letterTailor: "letterTailor",
      prep: "interviewPrep",
      interviewPrep: "interviewPrep",
      salary: "salaryIntel",
      salaryIntel: "salaryIntel",
      email: "outreachEmail",
      outreachEmail: "outreachEmail",
      audit: "atsAudit",
      atsAudit: "atsAudit",
      apply: "autoApplyExecution",
      autoApplyExecution: "autoApplyExecution",
      gate: "orchestratorGate",
      orchestratorGate: "orchestratorGate",
    };

    const rawStopAfter = (stopAfter || step || "").trim();
    const effectiveStopAfter = STEP_ALIASES[rawStopAfter] || rawStopAfter;

    if (!jobId || !profile || !effectiveStopAfter) {
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
        location: job.location,
        jobDescription: job.jobDescription || "",
        url: job.url,
      },
      profile,
      targetRegion: targetRegion || "US",
      submit: false,
      stopAfter: effectiveStopAfter,
    });

    if (result.companyResearch) {
      jobsRepo.upsert({
        ...job,
        multiAgentOutputs: {
          ...(job.multiAgentOutputs ?? {}),
          companyResearch: result.companyResearch,
        },
      });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const msg = toErrorMessage(error);
    if (msg.includes("Invalid stopAfter node")) {
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    console.error("Partial pipeline execution error:", error);
    return NextResponse.json(
      { success: false, error: `Failed to execute partial pipeline: ${msg}` },
      { status: 500 }
    );
  }
}
