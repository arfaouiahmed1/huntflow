import { NextResponse } from "next/server";
import { AGENT_BASE_URL, agentHeaders } from "@/lib/agentClient";

export async function GET() {
  try {
    const upstream = await fetch(`${AGENT_BASE_URL}/sources`, {
      headers: agentHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!upstream.ok) {
      return NextResponse.json({ online: false, sources: [] }, { status: 503 });
    }
    const payload = await upstream.json();
    return NextResponse.json({ online: true, ...payload });
  } catch {
    return NextResponse.json({ online: false, sources: [] }, { status: 503 });
  }
}
