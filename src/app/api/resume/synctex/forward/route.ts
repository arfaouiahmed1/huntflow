import { NextRequest } from "next/server";
import { routeError, readBody, jsonError } from "@/lib/errors";
import { forwardSync, SynctexError } from "@/lib/pdf/synctex";

export async function POST(req: NextRequest) {
  try {
    const body = (await readBody(req)) as { token?: string; line?: number; column?: number };
    if (!body.token) return jsonError("token is required.", 400, "BAD_BODY");
    const line = Number(body.line);
    if (!Number.isFinite(line) || line < 1) return jsonError("line must be a positive integer.", 400, "BAD_BODY");
    const column = Math.max(0, Number(body.column) || 0);
    const result = await forwardSync(body.token, Math.floor(line), Math.floor(column));
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof SynctexError) {
      return Response.json({ ok: false, error: { code: "SYNCTEX_FAILED", message: err.message } }, { status: 422 });
    }
    return routeError(err);
  }
}
