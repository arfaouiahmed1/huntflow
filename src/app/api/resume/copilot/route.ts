import { NextRequest, NextResponse } from "next/server";
import { readBody, routeError } from "@/lib/errors";
import { callLLMJSON, resolveChain } from "@/lib/llm/router";
import { ResumeContent } from "@/types";
import { cleanResumeContent } from "@/lib/llm/sanitize";
import { searchVault } from "@/lib/vault";
import { renderTemplate } from "@/lib/pdf/resumeTemplates";

export const runtime = "nodejs";

const MAX_TEX = 200_000;

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

const COPILOT_TEX_SYSTEM_PROMPT = `You are the HUNTFLOW Elite Resume Strategist & Career Copilot.
You edit LaTeX directly. Return the complete file, no code fences.
You optimize resume LaTeX: rewrite bullets with high-impact metrics (Google XYZ formula), tailor keywords for target roles, improve ATS density, strengthen action verbs, pull facts from Vault snippets, keep compilable LaTeX structure intact.

CRITICAL INSTRUCTIONS:
1. Return JSON adhering EXACTLY to this schema:
{
  "reply": "string (Markdown explanation of recommendations and changes)",
  "actionSummary": "string (1-sentence summary of modifications)",
  "tex": "string (the COMPLETE edited .tex file, no code fences, must contain \\\\end{document})"
}
2. Preserve real career history, company names, degrees; improve phrasing only.
3. Use VAULT KNOWLEDGE SNIPPETS when relevant.
4. Apply the user's editing instruction precisely in "tex" and explain in "reply".
5. Never wrap tex in \`\`\` fences. Never truncate — return the full file.
`;

function sanitizeTex(raw: string): string {
  let out = (raw || "").trim();
  const fence = out.match(/```(?:latex|tex)?\s*([\s\S]*?)```/i);
  if (fence) out = fence[1].trim();
  out = out.replace(/^```(?:latex|tex)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (out && !out.includes("\\end{document}")) out += "\n\\end{document}\n";
  return out.slice(0, MAX_TEX);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await readBody(req)) as {
      message: string;
      tex?: string;
      resume?: ResumeContent;
      templateId?: string;
      history?: { role: "user" | "assistant"; content: string }[] | { sender: string; text: string }[];
      targetJob?: { title?: string; company?: string; description?: string };
    };

    if (!body?.message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

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

    const history = Array.isArray(body.history)
      ? body.history.slice(-6).map((m) => {
          if (m && typeof m === "object" && "content" in m) return m;
          const mm = m as unknown as { sender?: string; text?: string };
          return { role: mm.sender === "assistant" ? "assistant" : "user", content: mm.text ?? "" };
        })
      : [];
    const historyContext =
      history.length > 0
        ? `\n\nRECENT CONVERSATION HISTORY:\n${history.map((h) => `${h.role === "assistant" ? "Assistant" : "User"}: ${h.content}`).join("\n")}`
        : "";

    // Raw-.tex path: full-file replacement
    if (typeof body.tex === "string" && body.tex.trim()) {
      const inputTex = body.tex.slice(0, MAX_TEX);
      const userPrompt = `CURRENT .tex DOCUMENT:\n${inputTex}\n${vaultContext}\n${targetJobContext}${historyContext}\n\nUSER REQUEST / INSTRUCTION:\n${body.message}\n\nReturn JSON with 'reply', 'actionSummary', and 'tex' (complete edited file).`;
      const chain = resolveChain();
      const parsed = await callLLMJSON<{
        reply: string;
        actionSummary: string;
        tex: string;
      }>(
        {
          system: COPILOT_TEX_SYSTEM_PROMPT,
          user: userPrompt,
          agent: "resume",
        },
        chain
      );
      const tex = sanitizeTex(parsed?.tex || "");
      return NextResponse.json({
        ok: true,
        reply: parsed?.reply || "I've reviewed and updated your LaTeX based on your request.",
        actionSummary: parsed?.actionSummary || "Updated LaTeX content.",
        tex: tex || inputTex,
      });
    }

    const currentResume: ResumeContent = body.resume || {
      header: { name: "", title: "", email: "", phone: "", location: "", linkedin: "", github: "", portfolio: "" },
    };
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

    void history;
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
