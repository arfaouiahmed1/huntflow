import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { gmailEnv, storeGmailTokens } from "@/lib/gmailAuth";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";
const PKCE_COOKIE = "gmail_oauth_pkce";
const SETTINGS_URL = "/settings";

/**
 * Google redirects here after the consent screen. Exchange the code for
 * tokens (PKCE verifier from the cookie, state checked for CSRF), resolve the
 * account email, persist the tokens server-side, then return to Settings.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Record<string, string>> }
) {
  await params;
  const { clientId, clientSecret, redirectUri, configured } = gmailEnv();

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const pkceRaw = cookieStore.get(PKCE_COOKIE)?.value;
  cookieStore.delete(PKCE_COOKIE);

  if (!configured || !clientId || !clientSecret) {
    return NextResponse.redirect(`${SETTINGS_URL}?gmail=error&reason=not_configured`);
  }
  if (oauthError) {
    return NextResponse.redirect(`${SETTINGS_URL}?gmail=error&reason=${encodeURIComponent(oauthError)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${SETTINGS_URL}?gmail=error&reason=missing_code`);
  }
  if (!pkceRaw) {
    return NextResponse.redirect(`${SETTINGS_URL}?gmail=error&reason=missing_pkce`);
  }
  let pkce: { verifier?: string; state?: string };
  try {
    pkce = JSON.parse(pkceRaw) as { verifier?: string; state?: string };
  } catch {
    return NextResponse.redirect(`${SETTINGS_URL}?gmail=error&reason=bad_pkce`);
  }
  if (!pkce.verifier || !pkce.state || pkce.state !== state) {
    return NextResponse.redirect(`${SETTINGS_URL}?gmail=error&reason=state_mismatch`);
  }

  try {
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: pkce.verifier,
    });
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.redirect(
        `${SETTINGS_URL}?gmail=error&reason=token_exchange&detail=${encodeURIComponent(text.slice(0, 160))}`
      );
    }
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      id_token?: string;
    };
    if (!data.access_token || !data.refresh_token) {
      return NextResponse.redirect(`${SETTINGS_URL}?gmail=error&reason=no_tokens`);
    }
    const email = await resolveEmail(data.access_token, data.id_token);
    if (!email) {
      return NextResponse.redirect(`${SETTINGS_URL}?gmail=error&reason=no_email`);
    }

    storeGmailTokens({
      email,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiry: Date.now() + (data.expires_in ?? 3600) * 1000,
      scope: data.scope ?? "",
    });
    return NextResponse.redirect(`${SETTINGS_URL}?gmail=connected`);
  } catch {
    return NextResponse.redirect(`${SETTINGS_URL}?gmail=error&reason=unknown`);
  }
}

/** Resolve the account email — prefer decoding the id_token, fall back to userinfo. */
async function resolveEmail(accessToken: string, idToken?: string): Promise<string | null> {
  if (idToken) {
    try {
      const payload = idToken.split(".")[1];
      if (payload) {
        const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string };
        if (decoded.email) return decoded.email;
      }
    } catch {
      /* malformed id_token — fall through to userinfo */
    }
  }
  try {
    const res = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const info = (await res.json()) as { email?: string };
    return info.email ?? null;
  } catch {
    return null;
  }
}
