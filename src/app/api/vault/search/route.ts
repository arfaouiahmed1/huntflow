import { NextRequest } from "next/server";
import { routeError, readBody } from "@/lib/errors";
import { searchVault, vaultStats } from "@/lib/vault";

function responseFor(hits: Awaited<ReturnType<typeof searchVault>>) {
  return {
    hits,
    retrieval: {
      strategy: "bm25 + vector + reciprocal rank fusion",
      searchedChunks: vaultStats().chunks,
      vectorModels: [...new Set(hits.map((hit) => hit.model))],
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const query = (url.searchParams.get("q") ?? url.searchParams.get("query") ?? "").trim();
    if (!query) {
      return Response.json({ error: "query is required." }, { status: 400 });
    }
    const kParam = url.searchParams.get("k");
    const k = Math.min(20, Math.max(1, Number(kParam ?? 4) || 4));
    const hits = await searchVault(query, k);
    return Response.json(responseFor(hits));
  } catch (err) {
    return routeError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await readBody(req);
    const body = (raw ?? {}) as { query?: string; q?: string; k?: number };
    const query = (body.query ?? body.q ?? "").trim();
    if (!query) {
      return Response.json({ error: "query is required." }, { status: 400 });
    }
    const k = Math.min(20, Math.max(1, Number(body.k ?? 4) || 4));
    const hits = await searchVault(query, k);
    return Response.json(responseFor(hits));
  } catch (err) {
    return routeError(err);
  }
}
