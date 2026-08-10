import { NextRequest } from "next/server";
import { routeError, jsonError } from "@/lib/errors";
import { extractText } from "@/lib/vault/extract";
import { runResumeAgent } from "@/agents/resumeAgent";
import { templateMeta } from "@/lib/pdf/resumeTemplates";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("file field is required.", 400, "BAD_BODY");
    if (file.size > MAX_UPLOAD_BYTES) return jsonError("File too large — max 25 MB.", 413, "TOO_LARGE");

    const kind = (String(form.get("kind") ?? "resume") as "resume" | "cv" | "cover_letter" | "motivation_letter").match(/^(resume|cv|cover_letter|motivation_letter)$/) ? String(form.get("kind")) as "resume" | "cv" | "cover_letter" | "motivation_letter" : "resume";
    const templateId = typeof form.get("templateId") === "string" && templateMeta(String(form.get("templateId"))) ? String(form.get("templateId")) : "classic-ats";

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractText(buffer, file.type || "application/octet-stream", file.name);

    const result = await runResumeAgent({
      task: "parse_pdf",
      kind,
      extractedText: text,
      templateId,
    });

    return Response.json({ ok: true, text, ...result });
  } catch (err) {
    return routeError(err);
  }
}
