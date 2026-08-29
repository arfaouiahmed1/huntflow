import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    getDb().prepare("SELECT 1 AS ok").get();
    return Response.json({ status: "ok", database: "ready" }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ status: "degraded", database: "unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
