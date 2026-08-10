import { NextRequest } from "next/server";
import { UserProfile, JobApplication } from "@/types";
import { buildDocumentTex } from "@/lib/pdf/templates";
import { compileLatex, findEngine } from "@/lib/pdf/compileLatex";

export const runtime = "nodejs";

let enginePromise: Promise<string> | null = null;

async function resolveEngine(): Promise<string> {
  enginePromise ??= findEngine().catch(() => "pdflatex");
  return enginePromise;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      docType?: string;
      content?: string;
      profile?: UserProfile;
      job?: Partial<JobApplication>;
    };

    const { docType, content, profile, job } = body;

    if (!docType || typeof content !== "string" || !content.trim()) {
      return Response.json({ error: "docType and content are required." }, { status: 400 });
    }
    if (!profile?.name) {
      return Response.json({ error: "A profile with a name is required." }, { status: 400 });
    }

    const jobLike = (job || { title: "", company: "" }) as JobApplication;
    const tex = buildDocumentTex(docType as never, profile, jobLike, content);

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
