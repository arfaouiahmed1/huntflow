import { NextRequest } from "next/server";
import { routeError, readBody } from "@/lib/errors";
import { runApplyAgent, ApplyAgentInput } from "@/agents/applyAgent";
import { UserProfile, TailoredDocuments } from "@/types";
import { LLMSettings } from "@/lib/llm/providers";
import { remember, setAgentState } from "@/lib/agents/memory";
import { buildSharedContext } from "@/lib/agents/context";
import { jobsRepo, emailsRepo, interviewsRepo, remindersRepo } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const raw = await readBody(req);
    const body = (raw ?? {}) as {
      job?: ApplyAgentInput["job"];
      profile?: UserProfile;
      documents?: TailoredDocuments;
      submit?: boolean;
      llmSettings?: LLMSettings | null;
    };

    const { job, profile, documents, submit, llmSettings } = body;

    if (!job?.title || !profile?.name) {
      return Response.json({ error: "Job and profile payload required." }, { status: 400 });
    }
    if (submit) {
      return Response.json(
        { error: "External submission requires a resumed supervised approval." },
        { status: 400 }
      );
    }

    const shared = await buildSharedContext({
      profile,
      jobs: jobsRepo.list(),
      emails: emailsRepo.list(),
      interviews: interviewsRepo.list(),
      reminders: remindersRepo.list(),
      maxTokens: 6000,
    });

    const result = await runApplyAgent({
      job: {
        id: job.id,
        title: job.title,
        company: job.company,
        url: job.url,
        jobDescription: job.jobDescription,
        matchScore: typeof job.matchScore === "number" ? job.matchScore : undefined,
      },
      profile,
      documents,
      submit: !!submit,
      llmSettings: llmSettings ?? null,
      sharedContext: shared.context,
    });

    setAgentState("apply-agent", "last_run", {
      at: new Date().toISOString(),
      jobId: job.id,
      title: job.title,
      company: job.company,
      status: result.status,
      matchScore: result.matchScore,
    });
    remember("outcome", `Apply agent ${result.status} for ${job.title} @ ${job.company}${result.matchScore != null ? ` (${result.matchScore}% match)` : ""}${result.status === "skipped" ? ` — ${result.decision?.reason ?? "no reason given"}` : ""}`, {
      jobId: job.id,
      source: "apply-agent",
      importance: result.status === "applied" ? 3 : 1,
    });

    return Response.json({ ok: true, ...result });
  } catch (err) {
    return routeError(err);
  }
}
