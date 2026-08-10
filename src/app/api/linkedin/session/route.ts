import { NextResponse } from 'next/server';
import { AGENT_BASE_URL as AGENT_URL, agentHeaders } from '@/lib/agentClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch(`${AGENT_URL}/linkedin/session`, {
      headers: agentHeaders(),
      signal: AbortSignal.timeout(90_000),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Agent returned HTTP ${res.status}`);
    return NextResponse.json(await res.json());
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'LinkedIn session check failed: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 502 }
    );
  }
}
