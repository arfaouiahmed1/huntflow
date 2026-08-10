import { NextRequest, NextResponse } from 'next/server';
import { remember } from '@/lib/agents/memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENT_URL = process.env.SCRAPLING_AGENT_URL || 'http://127.0.0.1:8001';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string' || !url.includes('linkedin.com/in/')) {
      return NextResponse.json(
        { error: 'A public profile URL (linkedin.com/in/handle) is required' },
        { status: 400 }
      );
    }

    const res = await fetch(`${AGENT_URL}/linkedin/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`Agent returned HTTP ${res.status}`);
    const data = await res.json();
    try {
      const name = typeof data?.name === "string" ? data.name : undefined;
      const headline = typeof data?.headline === "string" ? data.headline : undefined;
      remember(
        "fact",
        `Imported LinkedIn profile${name ? ` of ${name}` : ""}${headline ? ` — ${headline}` : ""} (${url})`,
        { source: "linkedin", importance: 2 }
      );
    } catch {
      /* memory write is best-effort */
    }
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'LinkedIn profile fetch failed: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 502 }
    );
  }
}
