import { NextRequest } from "next/server";
import { routeError, readBody, jsonError } from "@/lib/errors";
import { analyzeAts } from "@/lib/ats/analyze";
import { resumeRepo } from "@/lib/db";

const MAX_TEX = 200_000;
const MAX_JD = 30_000;

export async function POST(req: NextRequest) {
  try {
    const body = (await readBody(req)) as { tex?: string; content?: unknown; jobDescription?: string; docId?: string };
    let tex = typeof body.tex === "string" ? body.tex : "";
    if (!tex && typeof body.docId === "string") {
      const doc = resumeRepo.get(body.docId);
      if (doc) tex = doc.tex;
    }
    if (!tex) return jsonError("tex or docId is required.", 400, "BAD_BODY");
    if (tex.length > MAX_TEX) return jsonError("Document too large.", 413, "TOO_LARGE");

    const jobDescription = typeof body.jobDescription === "string" ? body.jobDescription.slice(0, MAX_JD) : undefined;
    const report = analyzeAts(tex.slice(0, MAX_TEX), jobDescription);
    return Response.json({ ok: true, report });
  } catch (err) {
    return routeError(err);
  }
}
