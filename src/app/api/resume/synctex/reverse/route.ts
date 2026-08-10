import { NextRequest } from "next/server";
import { routeError, readBody, jsonError } from "@/lib/errors";
import { reverseSync, SynctexError } from "@/lib/pdf/synctex";

export async function POST(req: NextRequest) {
  try {
    const body = (await readBody(req)) as { token?: string; page?: number; x?: number; y?: number };
    if (!body.token) return jsonError("token is required.", 400, "BAD_BODY");
    const page = Number(body.page);
    const x = Number(body.x);
    const y = Number(body.y);
    if (![page, x, y].every((n) => Number.isFinite(n))) return jsonError("page, x and y must be numbers.", 400, "BAD_BODY");
    const result = await reverseSync(body.token, Math.floor(page), x, y);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof SynctexError) {
      return Response.json({ ok: false, error: { code: "SYNCTEX_FAILED", message: err.message } }, { status: 422 });
    }
    return routeError(err);
  }
}
