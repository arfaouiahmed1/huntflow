import { NextRequest } from "next/server";
import { routeError, readBody, jsonError } from "@/lib/errors";
import { templateMeta, renderTemplate } from "@/lib/pdf/resumeTemplates";

export async function POST(req: NextRequest) {
  try {
    const body = (await readBody(req)) as { templateId?: string; content?: unknown };
    if (!body.templateId || !templateMeta(body.templateId)) return jsonError("Valid templateId is required.", 400, "BAD_BODY");
    if (!body.content || typeof body.content !== "object") return jsonError("content is required.", 400, "BAD_BODY");
    const tex = renderTemplate(body.templateId, body.content as never);
    return Response.json({ ok: true, tex });
  } catch (err) {
    return routeError(err);
  }
}
