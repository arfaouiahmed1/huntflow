import { NextRequest, NextResponse } from "next/server";
import { readBody, routeError } from "@/lib/errors";
import { callLLMJSON, resolveChain } from "@/lib/llm/router";
import type { ResumeContent } from "@/types";
import { cleanResumeContent } from "@/lib/llm/sanitize";
import { searchVault } from "@/lib/vault";
import { renderTemplate } from "@/lib/pdf/resumeTemplates";
import { COPILOT_SYSTEM_PROMPT } from "@/lib/copilot/prompts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await readBody(req)) as {
      message: string;
      resume: ResumeContent;
      templateId?: string;
      history?: { role: "user" | "assistant"; content: string }[];
      targetJob?: { title?: string; company?: string; description?: string };
    };

    if (!body?.message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const currentResume = body.resume || {};

    // Search vault for relevant background knowledge
    let vaultContext = "";
    try {
      const hits = await searchVault(body.message, 4);
      if (hits && hits.length > 0) {
        vaultContext = `\n\nVAULT KNOWLEDGE SNIPPETS (User's real documents/certificates/notes):\n${hits
          .map((h) => `[Source: ${h.docName}] ${h.text}`)
          .join("\n---\n")}`;
      }
    } catch {
      // Vault search is optional enhancement
    }

    const targetJobContext = body.targetJob?.title
      ? `\n\nTARGET JOB CONTEXT:\nTitle: ${body.targetJob.title}\nCompany: ${body.targetJob.company || "N/A"}\nDescription:\n${(body.targetJob.description || "").slice(0, 3000)}`
      : "";

    const userPrompt = `CURRENT RESUME CONTENT:
${JSON.stringify(currentResume, null, 2)}
${vaultContext}
${targetJobContext}

USER REQUEST / INSTRUCTION:
${body.message}

Please analyze the resume against their vault info and request, execute the requested enhancements, and return the JSON payload with 'reply', 'actionSummary', and 'updatedResume'.`;

    const chain = resolveChain();
    const parsed = await callLLMJSON<{
      reply: string;
      actionSummary: string;
      updatedResume: ResumeContent;
    }>(
      {
        system: COPILOT_SYSTEM_PROMPT,
        user: userPrompt,
        agent: "resume",
      },
      chain
    );

    const sanitizedResume = (parsed?.updatedResume ? cleanResumeContent(parsed.updatedResume) : null) || currentResume;

    // Also generate LaTeX representation for backend preview/compile
    let tex = "";
    try {
      const tId = body.templateId || "classic-ats";
      tex = renderTemplate(tId, sanitizedResume);
    } catch {
      // Fallback
    }

    return NextResponse.json({
      ok: true,
      reply: parsed?.reply || "I've reviewed and updated your resume based on your request.",
      actionSummary: parsed?.actionSummary || "Updated resume content.",
      updatedResume: sanitizedResume,
      tex,
    });
  } catch (err: unknown) {
    return routeError(err instanceof Error ? err.message : String(err));
  }
}
