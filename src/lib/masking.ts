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
