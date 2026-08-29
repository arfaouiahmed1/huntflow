import { NextRequest } from "next/server";
import { UserProfile, JobApplication } from "@/types";
import { buildDocumentTex } from "@/lib/pdf/templates";
import { renderTemplate, templateMeta, contentFromProfile } from "@/lib/pdf/resumeTemplates";
import { compileLatex, findEngine } from "@/lib/pdf/compileLatex";

export const runtime = "nodejs";

let enginePromise: Promise<string> | null = null;

async function resolveEngine(): Promise<string> {
  enginePromise ??= findEngine().catch(() => "pdflatex");
  return enginePromise;
}

/**
 * Render the agent-written document for a chosen template.
 *
 * For resumes/CVs we lean on `renderTemplate` (the ATS-grade template registry)
 * when a `templateId` is supplied, seeding a ResumeContent from the profile and
 * folding the tailored-markdown body into it. Letters keep the letter template.
 */
const DOC_TYPE_TEMPLATE_DEFAULT: Record<string, string> = {
  tailoredResume: "classic-ats",
  resume: "classic-ats",
  cv: "classic-ats",
  coverLetter: "letter-cover",
  motivationLetter: "letter-motivation",
  followUpEmail: "letter-cover",
};

function resolveTemplateId(templateId: string | undefined, docType: string): string | undefined {
  if (templateId && templateMeta(templateId)) return templateId;
  return DOC_TYPE_TEMPLATE_DEFAULT[docType];
}

/**
 * Render the agent-written document for a chosen template.
 *
 * Unified pipeline: every doc type now prefers the ATS-grade template registry
 * (src/lib/pdf/templates/*.tex via renderTemplate) when a matching template
 * exists. Letters map to letter-*.tex; resumes map to classic-ats family.
 * Falls back to legacy buildDocumentTex only when no registry template matches
 * (guard against unknown docType/templateId combos).
 *
 * This makes /api/pdf and /api/resume/* share the exact same .tex source set
 * and the same placeholder substitution ({{NAME}} etc), so the Resume Studio
 * preview and the /jobs/seed-44 Documents tab export render identically.
 */
function texForTemplate(
  templateId: string | undefined,
  docType: string,
  profile: UserProfile,
  job: JobApplication,
  content: string
): string {
  const resolved = resolveTemplateId(templateId, docType);
  const isResumeKind = docType === "tailoredResume" || docType === "resume" || docType === "cv";
  const isLetterKind = docType === "coverLetter" || docType === "motivationLetter" || docType === "followUpEmail"
    || docType === "cover_letter" || docType === "motivation_letter";

  if (resolved && templateMeta(resolved)) {
    if (isResumeKind) {
      // Seed a structured ResumeContent from profile, fold tailored markdown into summary.
      // Preserve existing structured sections (experience/skills) from profile, but surface
      // the tailored body as summary so LLM-tailored bullets remain visible.
      const base = contentFromProfile(profile, "resume");
      const tail = content.trim();
      // If content looks like full resume markdown (contains section headers), keep as summary fallback,
      // otherwise embed as summary. Structured sections stay from profile — same as Studio preview.
      base.summary = tail.slice(0, 4000);
      return renderTemplate(resolved, base);
    }
    if (isLetterKind) {
      const base = contentFromProfile(profile, docType === "followUpEmail" ? "cover_letter" : "cover_letter");
      // Letters expect paragraphs[] — split tailored markdown into paragraphs
      const paras = content.split(/\n\n+/).map(p=>p.trim()).filter(Boolean).slice(0, 12);
      base.paragraphs = paras.length ? paras : [content.trim().slice(0, 4000)];
      base.recipient = job.company || "Hiring Manager";
      return renderTemplate(resolved, base as never);
    }
  }
  return buildDocumentTex(docType as never, profile, job, content);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      docType?: string;
      content?: string;
      profile?: UserProfile;
      job?: Partial<JobApplication>;
      templateId?: string;
    };

    const { docType, content, profile, job, templateId } = body;

    if (!docType || typeof content !== "string" || !content.trim()) {
      return Response.json({ error: "docType and content are required." }, { status: 400 });
    }
    if (!profile?.name) {
      return Response.json({ error: "A profile with a name is required." }, { status: 400 });
    }

    const jobLike = (job || { title: "", company: "" }) as JobApplication;
    const tex = texForTemplate(templateId, docType, profile, jobLike, content);

    const engine = await resolveEngine();
    const pdf = await compileLatex(tex, { engine: engine === "xelatex" ? "xelatex" : engine === "lualatex" ? "lualatex" : "pdflatex" });

    const fileName = `${profile.name.replace(/\s+/g, "_")}_${docType}.pdf`;
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(pdf.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
