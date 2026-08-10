import { NextRequest } from "next/server";
import { routeError, readBody } from "@/lib/errors";
import { searchVault } from "@/lib/vault";

export async function POST(req: NextRequest) {
  try {
    const raw = await readBody(req);
    const body = (raw ?? {}) as { query?: string; k?: number };
    if (!body.query?.trim()) {
      return Response.json({ error: "query is required." }, { status: 400 });
    }
    const k = Math.min(20, Math.max(1, Number(body.k ?? 4) || 4));
    const hits = await searchVault(body.query, k);
    return Response.json({ hits });
  } catch (err) {
    return routeError(err);
  }
}
