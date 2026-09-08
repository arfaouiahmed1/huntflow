#!/usr/bin/env node
/**
 * HUNTFLOW continuous crawler worker (opt-in, boring v1).
 *
 * Scans enabled saved searches when due (default 180 min cadence + jitter,
 * server-computed) and triggers ONE `POST /api/crawl` per poll iteration at
 * concurrency 1. All persistence stays behind web-side routes — this process
 * never opens the SQLite file (single-writer discipline).
 *
 * Respectful by construction:
 * - server decides what is due (`GET /api/worker/status`); the worker never
 *   invents crawl targets or fans out to all boards at once;
 * - per-source cadence / circuit-breaker / crawlPolicy live in the web app +
 *   sidecar and are honoured on every call;
 * - failures only log and back off; the next poll retries on schedule.
 *
 * Enable (from repo root, web running):
 *   npm run worker:crawler
 * Or detached alongside the stack (web must be up first):
 *   docker compose --profile worker up -d worker
 *
 * Env:
 *   HUNTFLOW_WEB_URL            web base URL (default http://127.0.0.1:3000)
 *   HUNTFLOW_WORKER_POLL_SECONDS poll interval (default 60)
 *   HUNTFLOW_WORKER_CONCURRENCY  crawl concurrency 1-4 (default 1)
 *   HUNTFLOW_WORKER_LIMIT        roles per crawl (default 50, max 200)
 *   HUNTFLOW_WORKER_DRY_RUN=1    log due searches without crawling
 */

const WEB_URL = (process.env.HUNTFLOW_WEB_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const POLL_SECONDS = Math.min(Math.max(Number(process.env.HUNTFLOW_WORKER_POLL_SECONDS || 60), 15), 3600);
const CONCURRENCY = Math.min(Math.max(Math.floor(Number(process.env.HUNTFLOW_WORKER_CONCURRENCY || 1)), 1), 4);
const LIMIT = Math.min(Math.max(Math.floor(Number(process.env.HUNTFLOW_WORKER_LIMIT || 50)), 1), 200);
const DRY_RUN = process.env.HUNTFLOW_WORKER_DRY_RUN === "1";

const CHANNELS = new Set(["ats", "aggregator", "regional", "community", "directory", "all"]);

const ts = () => new Date().toISOString();
const log = (msg) => console.log(`[crawler-worker ${ts()}] ${msg}`);
const warn = (msg) => console.warn(`[crawler-worker ${ts()}] WARN ${msg}`);

let stopped = false;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    if (stopped) return;
    stopped = true;
    log(`received ${sig} — finishing current iteration then exiting`);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function parseQuery(queryJson) {
  let parsed = {};
  try {
    parsed = JSON.parse(queryJson || "{}");
  } catch {
    parsed = {};
  }
  const keyword =
    typeof parsed.keyword === "string" && parsed.keyword.trim()
      ? parsed.keyword.trim()
      : "developer";
  const facets = parsed.facets && typeof parsed.facets === "object" ? parsed.facets : {};
  return { keyword, facets };
}

async function runOnce() {
  let statusRes;
  try {
    statusRes = await fetch(`${WEB_URL}/api/worker/status`, { cache: "no-store" });
  } catch (err) {
    warn(`status poll failed (web down?): ${err.message}`);
    return;
  }
  if (!statusRes.ok) {
    warn(`status poll HTTP ${statusRes.status} — backing off`);
    return;
  }
  const status = await readJson(statusRes);
  if (!status || status.success !== true) {
    warn(`status poll bad payload — backing off`);
    return;
  }
  const pending = status.queue ? status.queue.pending : "?";
  const due = Array.isArray(status.dueSearches) ? status.dueSearches : [];
  log(`heartbeat — inbox pending=${pending} dueSearches=${due.length}`);
  if (due.length === 0) return;

  const search = due[0];
  const channel = CHANNELS.has(search.channel) ? search.channel : "all";
  const { keyword, facets } = parseQuery(search.queryJson);
  if (DRY_RUN) {
    log(`dry-run — would crawl "${search.name}" (${channel}) keyword="${keyword}"`);
    return;
  }
  log(`crawling due search "${search.name}" (${channel}) keyword="${keyword}" concurrency=${CONCURRENCY}`);
  let crawlRes;
  try {
    crawlRes = await fetch(`${WEB_URL}/api/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel,
        keyword,
        filters: facets,
        limit: LIMIT,
        concurrency: CONCURRENCY,
        saveSearchId: search.id,
      }),
    });
  } catch (err) {
    warn(`crawl trigger failed: ${err.message}`);
    return;
  }
  const data = await readJson(crawlRes);
  if (!crawlRes.ok || !data || data.success !== true) {
    warn(`crawl trigger HTTP ${crawlRes.status}: ${(data && data.error) || "unknown error"}`);
    return;
  }
  if (data.offline) {
    warn(`sidecar offline — crawler agent not running; retry on next poll`);
    return;
  }
  log(`crawl done — run=${data.runId || "n/a"} found=${data.count ?? 0} queued=${data.queued ?? 0}`);
}

async function main() {
  log(`starting — web=${WEB_URL} poll=${POLL_SECONDS}s concurrency=${CONCURRENCY} limit=${LIMIT}${DRY_RUN ? " DRY-RUN" : ""}`);
  while (!stopped) {
    await runOnce();
    if (stopped) break;
    await sleep(POLL_SECONDS * 1000);
  }
  log("stopped");
}

main().catch((err) => {
  console.error(`[crawler-worker ${ts()}] FATAL ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
