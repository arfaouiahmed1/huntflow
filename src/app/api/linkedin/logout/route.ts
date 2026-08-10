import { NextResponse } from 'next/server';
import { AGENT_BASE_URL as AGENT_URL, agentHeaders } from '@/lib/agentClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const res = await fetch(`${AGENT_URL}/linkedin/logout`, {
      method: 'POST',
      headers: agentHeaders(),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Agent returned HTTP ${res.status}`);
    return NextResponse.json(await res.json());
  } catch (err: unknown) {
    return NextResponse.json(
      { authenticated: false, error: 'LinkedIn logout failed: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 502 }
    );
  }
}
