import { NextRequest, NextResponse } from "next/server";
import { AGENT_BASE_URL as AGENT_URL, agentHeaders } from "@/lib/agentClient";
import { readBody } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await readBody(req)) as { cookie?: string };
    if (!body?.cookie) {
      return NextResponse.json({ error: "cookie is required" }, { status: 400 });
    }

    const res = await fetch(`${AGENT_URL}/linkedin/cookie`, {
      method: "POST",
      headers: agentHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ cookie: body.cookie }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Scrapling agent returned ${res.status}: ${errText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "LinkedIn cookie authentication failed: " + (err instanceof Error ? err.message : String(err)) },
      { status: 502 }
    );
  }
}
