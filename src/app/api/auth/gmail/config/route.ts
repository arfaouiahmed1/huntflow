import { NextRequest, NextResponse } from "next/server";
import { storeGoogleCredentials, getGoogleClientStatus, gmailEnv } from "@/lib/gmailAuth";
import { readBody } from "@/lib/errors";

export async function GET() {
  const status = getGoogleClientStatus();
  const { redirectUri } = gmailEnv();
  return NextResponse.json({ ...status, redirectUri });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await readBody(req)) as { clientId?: string; clientSecret?: string };
    if (!body.clientId || !body.clientSecret) {
      return NextResponse.json({ error: "clientId and clientSecret are required" }, { status: 400 });
    }
    storeGoogleCredentials(body.clientId, body.clientSecret);
    return NextResponse.json({ ok: true, message: "Google OAuth credentials saved successfully." });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
