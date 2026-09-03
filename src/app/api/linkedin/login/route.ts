import { NextResponse } from 'next/server';
import { settingsRepo } from '@/lib/db';
import { AGENT_BASE_URL as AGENT_URL, agentHeaders } from '@/lib/agentClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const res = await fetch(`${AGENT_URL}/linkedin/login`, {
      method: 'POST',
      headers: agentHeaders(),
      signal: AbortSignal.timeout(540_000),
    });
    if (!res.ok) throw new Error(`Agent returned HTTP ${res.status}`);
    const data = await res.json();

    const { authenticated, state, checkpoint } = data as {
      authenticated?: boolean;
      state?: string;
      checkpoint?: boolean;
    };

    let profile: unknown;
    if (authenticated) {
      const handle = settingsRepo.get('linkedin_handle');
      if (handle) {
        try {
          const profRes = await fetch(`${AGENT_URL}/linkedin/profile`, {
            method: 'POST',
            headers: agentHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ url: handle }),
            signal: AbortSignal.timeout(90_000),
          });
          if (profRes.ok) {
            const profData = await profRes.json();
            profile = profData.profile;
          }
        } catch {
          /* auto-import is best-effort */
        }
      }
    }

    return NextResponse.json({ authenticated, state, checkpoint, profile });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'LinkedIn login window failed: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 502 }
    );
  }
}
