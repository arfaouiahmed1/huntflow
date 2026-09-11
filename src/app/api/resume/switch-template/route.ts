import { NextRequest, NextResponse } from "next/server";
import { readBody, routeError, jsonError } from "@/lib/errors";
import { loadTemplateSource, templateMeta } from "@/lib/pdf/resumeTemplates";
import { extractTexSections, assembleTemplateWithSections } from "@/lib/pdf/templateSwitcher";
import { UserProfile } from "@/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await readBody(req)) as {
      tex: string;
      targetTemplateId: string;
      profile?: UserProfile;
    };

    if (!body?.targetTemplateId) {
      return jsonError("targetTemplateId is required", 400, "BAD_BODY");
    }

    const meta = templateMeta(body.targetTemplateId);
    if (!meta) {
      return jsonError(`Unknown template: ${body.targetTemplateId}`, 404, "NOT_FOUND");
    }

    const templateSource = loadTemplateSource(body.targetTemplateId);
    const sections = extractTexSections(body.tex || "", body.profile);
    const newTex = assembleTemplateWithSections(templateSource, sections);

    return NextResponse.json({
      ok: true,
      templateId: body.targetTemplateId,
      templateName: meta.name,
      tex: newTex,
    });
  } catch (err: unknown) {
    return routeError(err instanceof Error ? err.message : String(err));
  }
}
