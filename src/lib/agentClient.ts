/**
 * Shared client for talking to the Scrapling sidecar.
 *
 * Centralizes the base URL resolution and the shared-secret auth header so
 * every proxy route (scrape/crawl/apply/linkedin/*) sends the same token the
 * sidecar enforces. When no token is configured both sides stay open for
 * local dev; setting HUNTFLOW_AGENT_TOKEN on both sides locks them down.
 */

export const AGENT_BASE_URL = process.env.SCRAPLING_AGENT_URL || "http://127.0.0.1:8001";

export function agentHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = process.env.HUNTFLOW_AGENT_TOKEN || "";
  return {
    ...(token ? { "X-Huntflow-Token": token } : {}),
    ...extra,
  };
}
