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
function texForTemplate(
  templateId: string | undefined,
  docType: string,
  profile: UserProfile,
  job: JobApplication,
  content: string
): string {
  if (templateId && templateMeta(templateId) && (docType === "tailoredResume" || docType === "resume" || docType === "cv")) {
    const base = contentFromProfile(profile, "resume");
    base.summary = content.trim().slice(0, 1200);
    return renderTemplate(templateId, base);
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
