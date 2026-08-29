import { NextRequest, NextResponse } from "next/server";
import { AGENT_BASE_URL, agentHeaders } from "@/lib/agentClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rawSince = req.nextUrl.searchParams.get("since") || "0";
  const since = /^\d+$/.test(rawSince.trim()) ? rawSince.trim() : "0";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${AGENT_BASE_URL}/activity?since=${since}`, {
      headers: agentHeaders(),
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return NextResponse.json({ online: false }, { status: 503 });
    const data = await res.json();
    return NextResponse.json({ online: true, ...data });
  } catch {
    return NextResponse.json({ online: false }, { status: 503 });
  }
}
