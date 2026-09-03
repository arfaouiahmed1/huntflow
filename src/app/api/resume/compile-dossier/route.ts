import { NextRequest, NextResponse } from "next/server";
import { compileCandidateDossier, DossierInput } from "@/lib/pdf/dossierCompiler";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DossierInput;

    if (!body.resumeContent || !body.resumeContent.header) {
      return NextResponse.json(
        { success: false, error: "Missing required resume content" },
        { status: 400 }
      );
    }

    const result = compileCandidateDossier(body);

    return NextResponse.json({
      success: true,
      typstMarkup: result.typstMarkup,
      estimatedPages: result.estimatedPages,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Dossier compilation failed" },
      { status: 500 }
    );
  }
}
