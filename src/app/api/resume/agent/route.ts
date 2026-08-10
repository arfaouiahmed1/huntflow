import { NextRequest } from "next/server";
import { routeError, readBody } from "@/lib/errors";
import { runResumeAgent, ResumeAgentTask } from "@/agents/resumeAgent";
import { templateMeta } from "@/lib/pdf/resumeTemplates";
import { resumeRepo } from "@/lib/db";

const TASKS: ResumeAgentTask[] = ["draft", "improve", "tailor", "ats", "parse_pdf"];
const KINDS = ["resume", "cv", "cover_letter", "motivation_letter"] as const;

export async function POST(req: NextRequest) {
  try {
    const body = (await readBody(req)) as {
      task?: string;
      kind?: string;
      templateId?: string;
      profile?: unknown;
      current?: unknown;
      job?: unknown;
      extractedText?: string;
      llmSettings?: unknown;
      agentSettings?: unknown;
      docId?: string;
    };

    const task = TASKS.includes(body.task as ResumeAgentTask) ? (body.task as ResumeAgentTask) : "draft";
    const kind = KINDS.includes(body.kind as never) ? (body.kind as (typeof KINDS)[number]) : "resume";
    const templateId = typeof body.templateId === "string" && templateMeta(body.templateId) ? body.templateId : "classic-ats";

    let current = body.current as never;
    if (!current && typeof body.docId === "string") {
      const doc = resumeRepo.get(body.docId);
      if (doc) {
        current = { content: doc.content, tex: doc.tex } as never;
      }
    }

    const result = await runResumeAgent({
      task,
      kind,
      templateId,
      profile: body.profile as never,
      current,
      job: body.job as never,
      extractedText: typeof body.extractedText === "string" ? body.extractedText : undefined,
      llmSettings: body.llmSettings as never,
      agentSettings: body.agentSettings as never,
    });

    return Response.json({ ok: true, ...result });
  } catch (err) {
    return routeError(err instanceof Error ? err.message : typeof err === 'object' && err ? JSON.stringify(err) : String(err));
  }
}
