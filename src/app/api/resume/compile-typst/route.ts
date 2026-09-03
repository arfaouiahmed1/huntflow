import { NextRequest, NextResponse } from "next/server";
import { renderTypstResume } from "@/lib/pdf/typstRenderer";
import { ResumeContent } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      templateId?: string;
      content?: ResumeContent;
    };

    if (!body.content || !body.content.header) {
      return NextResponse.json(
        { success: false, error: "Missing required resume content" },
        { status: 400 }
      );
    }

    const typstMarkup = renderTypstResume(body.templateId || "classic-ats", body.content);

    return NextResponse.json({
      success: true,
      engine: "typst",
      typstMarkup,
      templateId: body.templateId || "classic-ats",
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Typst compilation failed" },
      { status: 500 }
    );
  }
}
