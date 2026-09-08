import { NextRequest, NextResponse } from "next/server";
import { renderTypstResume } from "@/lib/pdf/typstRenderer";
import { ResumeContent } from "@/types";

export async function POST(req: NextRequest) {
  const start = Date.now();
  try {
    const body = (await req.json()) as {
      templateId?: string;
      content?: ResumeContent;
    };

    if (!body.content || !body.content.header) {
      return NextResponse.json(
        { ok: false, success: false, error: "Missing required resume content" },
        { status: 400 }
      );
    }

    const templateId = body.templateId || "classic-ats";
    const typstMarkup = renderTypstResume(templateId, body.content);

    // Contract: this endpoint renders fast Typst *markup* for the HTML
    // approximation preview. It does not produce a compiled PDF — there is
    // no Typst PDF toolchain in this deployment. The LaTeX toolchain
    // (POST /api/resume/compile) remains the authoritative PDF path.
    // durationMs covers markup rendering only.
    return NextResponse.json({
      ok: true,
      success: true,
      engine: "typst",
      typstMarkup,
      templateId,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, success: false, error: err instanceof Error ? err.message : "Typst compilation failed" },
      { status: 500 }
    );
  }
}
