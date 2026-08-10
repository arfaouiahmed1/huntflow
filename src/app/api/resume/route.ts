import { NextRequest } from "next/server";
import { routeError, readBody, jsonError } from "@/lib/errors";
import { resumeRepo } from "@/lib/db";
import { ResumeDoc } from "@/types";
import { templateMeta, renderTemplate } from "@/lib/pdf/resumeTemplates";
import { newResumeDocDraft } from "@/agents/resumeAgent";

const MAX_TEX = 200_000;

function normalizeDoc(body: Partial<ResumeDoc> & { content?: unknown }): ResumeDoc | null {
  if (!body || typeof body !== "object") return null;
  const kind = body.kind === "cv" || body.kind === "cover_letter" || body.kind === "motivation_letter" ? body.kind : "resume";
  const templateId = typeof body.templateId === "string" && templateMeta(body.templateId) ? body.templateId : undefined;
  const tex = typeof body.tex === "string" ? body.tex.slice(0, MAX_TEX) : "";
  const now = new Date().toISOString();
  const id = typeof body.id === "string" && body.id ? body.id : "resume-" + Date.now();
  const existing = resumeRepo.get(id);
  const content = typeof body.content === "object" && body.content !== null && !Array.isArray(body.content)
    ? (body.content as ResumeDoc["content"])
    : existing?.content;

  return {
    id,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : (existing?.name ?? "Untitled"),
    kind,
    templateId: templateId ?? existing?.templateId ?? "classic-ats",
    tex: tex || existing?.tex || "",
    content,
    source: body.source === "pdf_import" || body.source === "linkedin" ? body.source : (existing?.source ?? "scratch"),
    sourceDocId: typeof body.sourceDocId === "string" ? body.sourceDocId : existing?.sourceDocId,
    targetJobId: typeof body.targetJobId === "string" ? body.targetJobId : existing?.targetJobId,
    autoCompile: typeof body.autoCompile === "boolean" ? body.autoCompile : (existing?.autoCompile ?? true),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export async function GET() {
  try {
    return Response.json({ docs: resumeRepo.list() });
  } catch (err) {
    return routeError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await readBody(req);
    const doc = normalizeDoc((raw ?? {}) as Partial<ResumeDoc>);
    if (!doc) return jsonError("Invalid resume payload.", 400, "BAD_BODY");
    if (!doc.tex && !doc.content) return jsonError("tex or content is required.", 400, "BAD_BODY");
    resumeRepo.upsert(doc);
    return Response.json({ ok: true, doc });
  } catch (err) {
    return routeError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonError("id is required.", 400, "BAD_BODY");
    if (!resumeRepo.get(id)) return jsonError("not found.", 404, "NOT_FOUND");
    resumeRepo.remove(id);
    return Response.json({ ok: true });
  } catch (err) {
    return routeError(err);
  }
}

/** Create a document from the user profile (From Scratch path). */
export async function PUT(req: NextRequest) {
  try {
    const raw = await readBody(req) as { kind?: ResumeDoc["kind"]; templateId?: string; name?: string; profile?: ResumeDoc["content"] & { name?: string; email?: string; phone?: string; location?: string; summary?: string; targetTitle?: string; skills?: string[]; experience?: { role: string; company: string; duration: string; bulletPoints: string[] }[]; education?: { degree: string; school: string; year: string }[]; linkedin?: string; github?: string; portfolio?: string } };
    const kind = raw.kind === "cv" || raw.kind === "cover_letter" || raw.kind === "motivation_letter" ? raw.kind : "resume";
    const templateId = typeof raw.templateId === "string" && templateMeta(raw.templateId) ? raw.templateId : "classic-ats";
    if (!raw.profile?.name) return jsonError("profile.name is required.", 400, "BAD_BODY");

    const now = new Date().toISOString();
    const doc: ResumeDoc = {
      id: "resume-" + Date.now(),
      name: raw.name?.trim()?.slice(0, 120) || `${raw.profile.name}'s ${kind === "resume" ? "Resume" : kind === "cv" ? "CV" : kind === "cover_letter" ? "Cover Letter" : "Motivation Letter"}`,
      kind,
      templateId,
      tex: "",
      source: "scratch",
      autoCompile: true,
      createdAt: now,
      updatedAt: now,
    };
    const draft = newResumeDocDraft(kind, templateId, raw.profile as never);
    doc.tex = draft.tex;
    doc.content = draft.content;
    resumeRepo.upsert(doc);
    return Response.json({ ok: true, doc, tex: renderTemplate(templateId, draft.content) });
  } catch (err) {
    return routeError(err);
  }
}
