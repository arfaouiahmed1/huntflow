import { NextRequest } from "next/server";
import { routeError, readBody, jsonError, AppError } from "@/lib/errors";
import { compileWithSynctex, readBuildPdf, findEngine, PdfError } from "@/lib/pdf/compileLatex";

const MAX_TEX = 200_000;

export async function POST(req: NextRequest) {
  try {
    const body = (await readBody(req)) as { tex?: string; engine?: string };
    const tex = typeof body.tex === "string" ? body.tex : "";
    if (!tex.trim()) return jsonError("tex is required.", 400, "BAD_BODY");
    if (tex.length > MAX_TEX) return jsonError("Document too large to compile.", 413, "TOO_LARGE");

    await findEngine();
    const { token, logTail } = await compileWithSynctex(tex.slice(0, MAX_TEX));
    return Response.json({ ok: true, token, logTail });
  } catch (err) {
    if (err instanceof PdfError) {
      return Response.json({ ok: false, error: { code: "COMPILE_FAILED", message: err.message, details: { logTail: err.logTail } } }, { status: 422 });
    }
    return routeError(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const save = url.searchParams.get("save") === "1";
    if (!token) return jsonError("token is required.", 400, "BAD_BODY");
    const pdf = await readBuildPdf(token);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
        ...(save ? { "Content-Disposition": 'attachment; filename="resume.pdf"' } : {}),
      },
    });
  } catch (err) {
    if (err instanceof PdfError) return routeError(new AppError(err.message, "BUILD_EXPIRED", 410));
    return routeError(err);
  }
}
