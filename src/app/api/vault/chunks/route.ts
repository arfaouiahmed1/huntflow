import { NextRequest } from "next/server";
import { vaultRepo } from "@/lib/db";
import { routeError } from "@/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const docId = (url.searchParams.get("docId") ?? "").trim();
    if (!docId) {
      return Response.json({ error: "docId is required." }, { status: 400 });
    }
    const doc = vaultRepo.getDoc(docId);
    if (!doc) {
      return Response.json({ error: "not found." }, { status: 404 });
    }
    const chunks = vaultRepo.chunksFor(docId);
    return Response.json({
      doc,
      embedModel: doc.embedModel,
      chunks: chunks.map((c) => ({
        idx: c.idx,
        content: c.content.slice(0, 800),
        tokens: c.tokens,
        embedding_len: c.embedding.length,
      })),
    });
  } catch (err) {
    return routeError(err);
  }
}
