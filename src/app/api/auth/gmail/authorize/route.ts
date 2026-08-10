import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { gmailEnv } from "@/lib/gmailAuth";

const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const PKCE_COOKIE = "gmail_oauth_pkce";

/**
 * Kick off the Google OAuth consent flow with PKCE (S256).
 * The verifier + anti-CSRF state are parked in an httpOnly cookie so the
 * callback route can prove the exchange belongs to this browser session.
 */
export async function GET() {
  const { clientId, redirectUri, configured } = gmailEnv();
  if (!configured || !clientId) {
    return new NextResponse(
      "Gmail OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your environment " +
        "(.env.local) and restart the dev server.",
      { status: 500 }
    );
  }

  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("base64url");

  const cookieStore = await cookies();
  cookieStore.set(PKCE_COOKIE, JSON.stringify({ verifier, state }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "https://mail.google.com/",
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return NextResponse.redirect(`${AUTHORIZE_ENDPOINT}?${params.toString()}`);
}
