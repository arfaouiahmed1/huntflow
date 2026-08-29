import { NextRequest, NextResponse } from "next/server";
import { AGENT_BASE_URL, agentHeaders } from "@/lib/agentClient";

export async function GET() {
  try {
    const res = await fetch(`${AGENT_BASE_URL}/config`, {
      headers: agentHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ online: false }, { status: 503 });
    const data = await res.json();
    return NextResponse.json({ online: true, ...data });
  } catch {
    return NextResponse.json({ online: false }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Concurrency guard 1..16 is enforced sidecar-side (max(1,min(...,16)) + 400 on out-of-range).
    // Also forwards enabledByDefault toggle and per-board enabled_overrides/sources_enabled
    // without auto-writing sources.json — sidecar keeps overrides in-memory only.
    const res = await fetch(`${AGENT_BASE_URL}/config`, {
      method: "POST",
      headers: agentHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { detail?: string })?.detail || `Sidecar error ${res.status}`;
      return NextResponse.json({ error: detail }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
