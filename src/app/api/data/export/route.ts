import { NextRequest, NextResponse } from "next/server";
import { toErrorMessage } from "@/lib/errors";
import { exportAllData } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const snapshot = exportAllData();
    const payload = {
      app: "huntflow",
      format: 1,
      exportedAt: new Date().toISOString(),
      data: snapshot,
    };
    const url = new URL(req.url);
    if (url.searchParams.get("download") === "1") {
      const stamp = new Date().toISOString().slice(0, 10);
      return new NextResponse(JSON.stringify(payload, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="huntflow-backup-${stamp}.json"`,
        },
      });
    }
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
