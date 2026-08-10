/**
 * Canonical dedup key for crawled jobs — client-safe (no server-only imports).
 * Used by the /api/crawl route and the /jobs page to avoid re-offering jobs
 * that are already tracked or have a prior crawl decision.
 */
export function dedupKey(job: { url?: string; title?: string; company?: string }): string {
  const url = (job.url || "").toLowerCase().trim();
  if (url) return url;
  return `${(job.title || "").trim().toLowerCase()}||${(job.company || "").trim().toLowerCase()}`;
}
