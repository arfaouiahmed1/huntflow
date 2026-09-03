import { NextRequest, NextResponse } from "next/server";
import { readBody, routeError } from "@/lib/errors";
import { callLLMJSON, resolveChain } from "@/lib/llm/router";
import { ResumeContent } from "@/types";
import { cleanResumeContent } from "@/lib/llm/sanitize";
import { searchVault } from "@/lib/vault";
import { renderTemplate } from "@/lib/pdf/resumeTemplates";

export const runtime = "nodejs";

const COPILOT_SYSTEM_PROMPT = `You are the HUNTFLOW Elite Resume Strategist & Career Copilot.
You work directly on the user's Resume/CV in real-time.
Your goal is to optimize the user's resume content, rewrite bullet points with high-impact metrics (Google's X-Y-Z formula: "Accomplished [X] as measured by [Y], by doing [Z]"), tailor content for target roles, improve ATS keyword density, strengthen action verbs, pull facts from their personal Vault documents, and ensure flawless professional structure.

CRITICAL INSTRUCTIONS:
1. Return a JSON response adhering EXACTLY to the following schema:
{
  "reply": "string (Markdown formatted explanation of your recommendations, changes made, and strategic advice)",
  "actionSummary": "string (A concise 1-sentence summary of the exact modifications applied, e.g. 'Rewrote experience bullet points with quantitative impact and aligned keywords.')",
  "updatedResume": {
    "header": {
      "name": "string",
      "title": "string",
      "email": "string",
      "phone": "string",
      "location": "string",
      "linkedin": "string",
      "github": "string",
      "portfolio": "string"
    },
    "summary": "string",
    "skills": ["string", ...],
    "experience": [
      {
        "role": "string",
        "company": "string",
        "duration": "string",
        "location": "string",
        "bullets": ["string", ...]
      }
    ],
    "education": [
      {
        "degree": "string",
        "school": "string",
        "year": "string"
      }
    ],
    "projects": [
      {
        "name": "string",
        "tech": "string",
        "link": "string",
        "bullets": ["string", ...]
      }
    ]
  }
}

2. ALWAYS preserve the user's real career history, company names, and degrees while improving phrasing, impact, action verbs, and structure.
3. Use facts and project details from the VAULT KNOWLEDGE SNIPPETS when relevant.
4. If the user gives a specific editing instruction (e.g. "Add Docker and Kubernetes", "Rewrite bullet 1", "Make summary more concise"), apply it precisely in "updatedResume" and explain what you did in "reply".
`;

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
