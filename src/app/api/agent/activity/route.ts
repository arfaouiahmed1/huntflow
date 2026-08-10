import { NextRequest, NextResponse } from "next/server";

const AGENT_URL = process.env.SCRAPLING_AGENT_URL || "http://127.0.0.1:8001";

export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get("since") || "0";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${AGENT_URL}/activity?since=${since}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return NextResponse.json({ online: false }, { status: 503 });
    const data = await res.json();
    return NextResponse.json({ online: true, ...data });
  } catch {
    return NextResponse.json({ online: false }, { status: 503 });
  }
}
