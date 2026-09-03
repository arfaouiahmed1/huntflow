import { NextRequest, NextResponse } from "next/server";
import { AGENT_BASE_URL, agentHeaders } from "@/lib/agentClient";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { query?: string };

    if (!body.query || !body.query.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing query (company name or career URL)" },
        { status: 400 }
      );
    }

    const res = await fetch(`${AGENT_BASE_URL}/ats/discover`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...agentHeaders(),
      },
      body: JSON.stringify({ query: body.query.trim() }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { success: false, error: err.detail || "ATS board discovery failed" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      success: true,
      ok: true,
      ...data,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "ATS discovery failed" },
      { status: 500 }
    );
  }
}
