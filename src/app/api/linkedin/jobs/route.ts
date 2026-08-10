import { NextRequest, NextResponse } from 'next/server';
import { AGENT_BASE_URL as AGENT_URL, agentHeaders } from '@/lib/agentClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string' || !url.includes('linkedin.com/jobs')) {
      return NextResponse.json(
        { error: 'A LinkedIn jobs search URL is required (linkedin.com/jobs/search/...)' },
        { status: 400 }
      );
    }

    const res = await fetch(`${AGENT_URL}/linkedin/jobs`, {
      method: 'POST',
      headers: agentHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`Agent returned HTTP ${res.status}`);
    return NextResponse.json(await res.json());
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'LinkedIn jobs search failed: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 502 }
    );
  }
}
