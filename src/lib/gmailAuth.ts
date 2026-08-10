import { settingsRepo } from "@/lib/db";

/**
 * Gmail OAuth (XOAUTH2) for the mail routes.
 *
 * Tokens are persisted server-side under the `gmail_oauth` settings key as a
 * single JSON blob. Only the server ever reads them — the browser only ever
 * sees `{ connected, email, expiry }` via gmailStatus()/redactSettings().
 */

export interface GmailOAuthTokens {
  email: string;
  accessToken: string;
  refreshToken: string;
  /** Access-token expiry as a ms epoch timestamp. */
  expiry: number;
  scope: string;
}

const GMAIL_OAUTH_KEY = "gmail_oauth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
/** Refresh when the access token is within 5 minutes of expiring. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_REDIRECT_URI = "http://localhost:3000/api/auth/gmail/callback";

export function gmailEnv(): {
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
  configured: boolean;
} {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || DEFAULT_REDIRECT_URI;
  return { clientId, clientSecret, redirectUri, configured: Boolean(clientId && clientSecret) };
}

export function storeGmailTokens(t: GmailOAuthTokens) {
  settingsRepo.set(GMAIL_OAUTH_KEY, JSON.stringify(t));
}

export function loadGmailTokens(): GmailOAuthTokens | null {
  const raw = settingsRepo.get(GMAIL_OAUTH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GmailOAuthTokens>;
    if (!parsed.email || !parsed.accessToken) return null;
    return parsed as GmailOAuthTokens;
  } catch {
    return null;
  }
}

export function clearGmailTokens() {
  settingsRepo.set(GMAIL_OAUTH_KEY, "");
}

/**
 * POST the refresh token to Google and return fresh credentials.
 * Writes the new access token + expiry back into `gmail_oauth`.
 */
export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Gmail OAuth is not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google token refresh failed (${res.status}): ${text.slice(0, 240)}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Google token refresh returned no access_token.");
  const access_token = data.access_token;
  const expires_in = data.expires_in ?? 3600;
  const stored = loadGmailTokens();
  if (stored) {
    storeGmailTokens({ ...stored, accessToken: access_token, expiry: Date.now() + expires_in * 1000 });
  }
  return { access_token, expires_in };
}

export interface GmailAuthBundle {
  user: string;
  accessToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/** Fresh Gmail credentials — refreshes the access token first when it is close to expiring. */
export async function getGmailAuth(): Promise<GmailAuthBundle | null> {
  const { clientId, clientSecret, configured } = gmailEnv();
  const tokens = loadGmailTokens();
  if (!configured || !clientId || !clientSecret || !tokens) return null;
  let accessToken = tokens.accessToken;
  if (tokens.expiry - REFRESH_SKEW_MS < Date.now()) {
    try {
      const refreshed = await refreshAccessToken(clientId, clientSecret, tokens.refreshToken);
      accessToken = refreshed.access_token;
    } catch {
      /* refresh failed (revoked token / offline) — let callers fall back to app-password config */
      return null;
    }
  }
  return {
    user: tokens.email,
    accessToken,
    clientId,
    clientSecret,
    refreshToken: tokens.refreshToken,
  };
}

/** Connection status for the browser — no secrets. */
export function gmailStatus(): { connected: boolean; email?: string; expiry?: number } {
  const tokens = loadGmailTokens();
  if (!tokens) return { connected: false };
  return { connected: true, email: tokens.email, expiry: tokens.expiry };
}

/** Revoke the current access token at Google, then clear the stored credentials. */
export async function revokeGmail(): Promise<void> {
  const tokens = loadGmailTokens();
  try {
    if (tokens?.accessToken) {
      await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(tokens.accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        cache: "no-store",
      });
    }
  } finally {
    clearGmailTokens();
  }
}

export interface ResolvedMailAuth {
  imap: {
    host: "imap.gmail.com";
    port: 993;
    secure: true;
    auth: { user: string; accessToken: string };
  };
  smtp: {
    host: "smtp.gmail.com";
    port: 465;
    secure: true;
    auth: {
      type: "OAuth2";
      user: string;
      clientId: string;
      clientSecret: string;
      refreshToken: string;
      accessToken: string;
    };
  };
}

/**
 * IMAP + SMTP configs for XOAUTH2, or null when Gmail OAuth is not connected.
 * The access token is guaranteed fresh here — getGmailAuth refreshes as needed.
 * (nodemailer auto-refreshes SMTP tokens; imapflow does NOT, so it gets the fresh one.)
 */
export async function resolveMailAuth(): Promise<ResolvedMailAuth | null> {
  const auth = await getGmailAuth();
  if (!auth) return null;
  return {
    imap: {
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: auth.user, accessToken: auth.accessToken },
    },
    smtp: {
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        type: "OAuth2",
        user: auth.user,
        clientId: auth.clientId,
        clientSecret: auth.clientSecret,
        refreshToken: auth.refreshToken,
        accessToken: auth.accessToken,
      },
    },
  };
}
