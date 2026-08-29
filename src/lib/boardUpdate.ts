/**
 * Pure state reducer for live crawler board cards (SSE `board_update` frames).
 *
 * Structured payloads emitted by the Scrapling sidecar (server.py
 * `board_event()` / `end_run()` data: `{type: "board"|"run", source_id,
 * source_name, status, found, matched, error, screenshot?, cloudinary?}`)
 * take priority; legacy string-only frames fall back to regex parsing so old
 * sidecars keep working.
 */

export type BoardLiveStatus = "idle" | "running" | "success" | "failed" | "error";

export interface BoardUpdateData {
  type?: string;
  source_id?: string;
  id?: string;
  source_name?: string;
  name?: string;
  category?: string;
  status?: string;
  found?: number;
  matched?: number;
  error?: string;
  screenshot?: string;
  cloudinary?: string;
  screenshotUrl?: string;
  cloudinaryUrl?: string;
  boards_crawled?: number;
}

export interface BoardUpdateEvent {
  id?: number;
  runId?: string;
  run_id?: string;
  ts?: string;
  kind?: string;
  message?: string;
  data?: BoardUpdateData | null;
}

export interface BoardLiveState {
  status: BoardLiveStatus;
  found: number;
  matched: number;
  error?: string | null;
  workerId?: number | null;
  message?: string | null;
  screenshotUrl?: string | null;
  cloudinaryUrl?: string | null;
}

export interface BoardReducerContext {
  sources: ReadonlyArray<{ id: string; name: string }>;
  displaySources: ReadonlyArray<{ id: string; name: string }>;
}

const IDLE_STATE: BoardLiveState = {
  status: "idle",
  found: 0,
  matched: 0,
  error: null,
  workerId: null,
  message: null,
};

export function parseWorkerId(message: string): number | null {
  const m = message.match(/\[Worker #(\d+)\]/);
  return m ? Number.parseInt(m[1], 10) : null;
}

/** Legacy fallback: scrape board identity out of free-form log strings. */
export function parseBoardUpdate(message: string): {
  boardName: string | null;
  workerId: number | null;
  found: number | null;
  error: string | null;
} {
  const msg = message || "";
  const workerId = parseWorkerId(msg);

  let boardName: string | null = null;
  const crawlMatch = msg.match(/Crawling\s+(.+?)\s+\(/);
  if (crawlMatch) boardName = crawlMatch[1].trim();
  else {
    const yieldMatch = msg.match(/\] (.+?) yielded/);
    if (yieldMatch) boardName = yieldMatch[1].trim();
    else {
      const skipMatch = msg.match(/Skipped\s+(.+?):/);
      if (skipMatch) boardName = skipMatch[1].trim();
    }
  }

  let found: number | null = null;
  const foundMatch = msg.match(/yielded\s+(\d+)/i);
  if (foundMatch) found = Number.parseInt(foundMatch[1], 10);

  let error: string | null = null;
  if (/Skipped|failed|⚠/.test(msg)) {
    const afterColon = msg.split(":").slice(1).join(":").trim();
    error = afterColon || msg;
    if (error.length > 180) error = error.slice(0, 180) + "…";
  }

  return { boardName, workerId, found, error };
}

function resolveTargetId(
  structuredId: string | null,
  structuredName: string | null,
  ctx: BoardReducerContext
): string | null {
  if (structuredId && ctx.sources.some((s) => s.id === structuredId)) {
    return structuredId;
  }
  if (!structuredName) return null;
  const lower = structuredName.toLowerCase();
  const byName = ctx.sources.find((s) => s.name.toLowerCase() === lower);
  if (byName) return byName.id;
  for (const s of ctx.sources) {
    const n = s.name.toLowerCase();
    if (n.includes(lower) || lower.includes(n)) return s.id;
  }
  return null;
}

export function reduceBoardUpdate(
  prev: Record<string, BoardLiveState>,
  raw: BoardUpdateEvent,
  ctx: BoardReducerContext
): Record<string, BoardLiveState> {
  const rawMessage = raw.message || "";
  const d: BoardUpdateData = raw.data ?? {};

  const structuredFound = typeof d.found === "number" ? d.found : null;
  const structuredMatched = typeof d.matched === "number" ? d.matched : null;
  const structuredError = typeof d.error === "string" ? d.error : null;
  const structuredName =
    typeof d.source_name === "string" && d.source_name
      ? d.source_name
      : typeof d.name === "string" && d.name
        ? d.name
        : null;
  const structuredId =
    typeof d.source_id === "string" && d.source_id
      ? d.source_id
      : typeof d.id === "string" && d.id
        ? d.id
        : null;
  const structuredStatus = typeof d.status === "string" ? d.status : null;
  const shot =
    typeof d.screenshot === "string" && d.screenshot
      ? d.screenshot
      : typeof d.screenshotUrl === "string" && d.screenshotUrl
        ? d.screenshotUrl
        : null;
  const cloud =
    typeof d.cloudinary === "string" && d.cloudinary
      ? d.cloudinary
      : typeof d.cloudinaryUrl === "string" && d.cloudinaryUrl
        ? d.cloudinaryUrl
        : null;

  let workerId: number | null = null;
  let found = structuredFound;
  let matched = structuredMatched;
  let error = structuredError;

  let targetId = resolveTargetId(structuredId, structuredName, ctx);

  if (targetId) {
    workerId = parseWorkerId(rawMessage);
  } else {
    const parsed = parseBoardUpdate(rawMessage);
    workerId = parsed.workerId;
    if (found == null) found = parsed.found;
    if (error == null) error = parsed.error;
    if (matched == null) {
      const mMatch = rawMessage.match(/(\d+)\s*matched/i);
      if (mMatch) matched = Number.parseInt(mMatch[1], 10);
    }
    targetId = resolveTargetId(null, parsed.boardName, ctx);
  }

  const isTerminal =
    d.type === "run" ||
    /Run .* (success|failed|completed)/i.test(rawMessage) ||
    /Parallel crawl completed/i.test(rawMessage);

  // Terminal run frame without a single board target — finalize every card.
  if (isTerminal && !targetId) {
    const failAll = structuredStatus === "failed" || raw.kind === "error";
    const next = { ...prev };
    let changed = false;
    for (const s of ctx.displaySources) {
      const cur = next[s.id];
      if (cur && (cur.status === "running" || cur.status === "idle")) {
        next[s.id] = {
          ...cur,
          status: failAll ? "failed" : "success",
          message: rawMessage.slice(0, 160),
          screenshotUrl: cur.screenshotUrl ?? shot,
          cloudinaryUrl: cur.cloudinaryUrl ?? cloud,
        };
        changed = true;
      }
    }
    return changed ? next : prev;
  }

  if (!targetId) return prev;

  const cur = prev[targetId] ?? IDLE_STATE;
  let nextStatus: BoardLiveStatus = cur.status;

  if (structuredStatus === "running") nextStatus = "running";
  else if (structuredStatus === "success") nextStatus = "success";
  else if (structuredStatus === "failed" || structuredStatus === "error") nextStatus = "failed";
  else if (/Crawling/i.test(rawMessage)) nextStatus = "running";
  else if (/yielded/i.test(rawMessage)) nextStatus = "success";
  else if (/Skipped|failed/i.test(rawMessage)) nextStatus = "failed";
  else if (raw.kind === "success") nextStatus = "success";

  // Synthetic offline/error frames flip running→failed so consumers see the error state.
  if (raw.kind === "warning" && /offline|poll failed/i.test(rawMessage) && cur.status === "running") {
    nextStatus = "failed";
  }

  const nextFound = found != null ? found : cur.found;
  const nextMatchedBase = matched != null ? matched : found != null ? Math.min(found, cur.matched) : cur.matched;
  const finalMatched = nextStatus === "success" && matched == null && found != null ? found : nextMatchedBase;

  return {
    ...prev,
    [targetId]: {
      status: nextStatus,
      found: nextFound,
      matched: finalMatched,
      error: error ?? cur.error,
      workerId: workerId ?? cur.workerId,
      message: rawMessage.slice(0, 200) || cur.message,
      screenshotUrl: shot ?? cur.screenshotUrl ?? null,
      cloudinaryUrl: cloud ?? cur.cloudinaryUrl ?? null,
    },
  };
}
