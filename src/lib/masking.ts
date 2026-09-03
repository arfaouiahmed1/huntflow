/** Mask secrets for client delivery and detect masked values on the way back. */

export const MASK_PREFIX = "••••";

export function maskSecret(secret?: string): string {
  if (!secret) return "";
  if (secret.length <= 6) return MASK_PREFIX;
  return `${MASK_PREFIX}${secret.slice(-4)}`;
}

export function isMasked(value: string | undefined | null): boolean {
  return Boolean(value && value.startsWith(MASK_PREFIX));
}

/** Redact provider API keys and mail passwords in a settings map (for client delivery / export). */
export function redactSettings(all: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(all)) {
    if (k === "llm_providers") {
      try {
        const chain = JSON.parse(v) as { apiKey?: string }[];
        out[k] = JSON.stringify(chain.map((p) => ({ ...p, apiKey: p.apiKey ? maskSecret(p.apiKey) : "" })));
      } catch {
        out[k] = v;
      }
    } else if (k === "mail_settings") {
      try {
        const ms = JSON.parse(v) as { imapPass?: string; smtpPass?: string };
        out[k] = JSON.stringify({
          ...ms,
          imapPass: ms.imapPass ? maskSecret(ms.imapPass) : "",
          smtpPass: ms.smtpPass ? maskSecret(ms.smtpPass) : "",
        });
      } catch {
        out[k] = v;
      }
    } else if (k === "cloudinary_settings") {
      try {
        const cs = JSON.parse(v) as { cloudName?: string; apiKey?: string; apiSecret?: string; concurrency?: number };
        out[k] = JSON.stringify({
          ...cs,
          apiKey: cs.apiKey ? maskSecret(cs.apiKey) : "",
          apiSecret: cs.apiSecret ? maskSecret(cs.apiSecret) : "",
        });
      } catch {
        out[k] = v;
      }
    } else if (k === "gmail_oauth" || k === "gmail_settings") {
      // Gmail OAuth tokens never round-trip through the browser — hand back
      // only a harmless status shape, never the access/refresh tokens.
      try {
        const t = JSON.parse(v) as { email?: string; expiry?: number; expiresAt?: number; connected?: boolean };
        out[k] = JSON.stringify({
          connected: Boolean(t.connected ?? true),
          email: t.email ?? "",
          expiry: t.expiry ?? t.expiresAt ?? 0,
        });
      } catch {
        out[k] = v;
      }
    } else if (k === "crawler_connector_keys" || k.startsWith("connector_key:") || k === "crawler_keys") {
      try {
        const keys = JSON.parse(v) as Record<string, string>;
        const masked: Record<string, string> = {};
        for (const [ck, cv] of Object.entries(keys)) {
          masked[ck] = typeof cv === "string" ? maskSecret(cv) : cv;
        }
        out[k] = JSON.stringify(masked);
      } catch {
        out[k] = maskSecret(v);
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}
