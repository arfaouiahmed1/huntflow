import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENT_URL = process.env.SCRAPLING_AGENT_URL || 'http://127.0.0.1:8001';

export async function POST() {
  try {
    const res = await fetch(`${AGENT_URL}/linkedin/login`, {
      method: 'POST',
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`Agent returned HTTP ${res.status}`);
    return NextResponse.json(await res.json());
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'LinkedIn login window failed: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 502 }
    );
  }
}
