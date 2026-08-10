import { NextRequest } from "next/server";
import { routeError } from "@/lib/errors";
import { ingestDocument, listDocuments, deleteDocument, vaultStats, setDocLabel } from "@/lib/vault";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_LABEL_LENGTH = 40;

export async function GET() {
  try {
    return Response.json({ docs: listDocuments(), stats: vaultStats() });
  } catch (err) {
    return routeError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "file field is required." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json({ error: `File too large — max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` }, { status: 413 });
    }
    const rawLabel = String(form.get("label") ?? "").trim().slice(0, MAX_LABEL_LENGTH);
    const buffer = Buffer.from(await file.arrayBuffer());
    const doc = await ingestDocument({
      buffer,
      filename: file.name,
      mime: file.type || "application/octet-stream",
      label: rawLabel,
    });
    return Response.json({ ok: true, doc });
  } catch (err) {
    return routeError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, label } = (await req.json()) as { id?: string; label?: string };
    if (!id) return Response.json({ error: "id is required." }, { status: 400 });
    const clean = String(label ?? "").trim().slice(0, MAX_LABEL_LENGTH);
    if (!setDocLabel(id, clean)) return Response.json({ error: "not found." }, { status: 404 });
    return Response.json({ ok: true, label: clean });
  } catch (err) {
    return routeError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id is required." }, { status: 400 });
    if (!deleteDocument(id)) return Response.json({ error: "not found." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    return routeError(err);
  }
}
