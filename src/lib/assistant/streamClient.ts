/**
 * Typed consumer for the `/api/assistant` endpoint.
 *
 * When the server is streaming, it sends `text/event-stream` frames with the
 * event types declared in `AssistantSseEvent`. We read the body incrementally,
 * parse each `event:`/`data:` frame, and dispatch to `onEvent`. When the server
 * falls back to the classic single JSON shape (older clients, curl, or a
 * transport that flattened the stream), we detect that and hand back the same
 * result through `onEvent` — so callers never have to branch.
 */

export interface ActionHandlers {
  onReasoning?: (note: string) => void;
  onToolCall?: (tool: string, detail: string) => void;
  onToken?: (delta: string) => void;
  onDone?: (result: { reply: string; steps?: { kind: string; label: string; detail: string }[] }) => void;
  onError?: (message: string) => void;
}

export interface StreamOptions {
  onEvent?: ActionHandlers;
  signal?: AbortSignal;
}

/** Split an SSE frame string into `(eventName, jsonData)` pairs. */
function parseEvent(frame: string): { event: string; data: string } | null {
  const headerMatch = frame.match(/^data:\s*(.+)$/m);
  if (!headerMatch) return null;
  const data = headerMatch[1].trim();
  if (!data) return null;
  const eventMatch = frame.match(/^event:\s*(\S+)\s*$/m);
  return { event: eventMatch ? eventMatch[1] : "message", data };
}

/**
 * Extract complete SSE events from a buffer. Returns the parsed events and the
 * leftover (incomplete) tail, which must stay buffered until the next chunk.
 * A frame is only "complete" once its `\n\n` terminator arrives — this keeps a
 * JSON payload that spans multiple network chunks from being parsed mid-way.
 */
function eventsFromText(buffer: string): { events: { event: string; data: string }[]; rest: string } {
  const events: { event: string; data: string }[] = [];
  let rest = buffer;
  while (true) {
    const sep = rest.indexOf("\n\n");
    if (sep === -1) break;
    const block = rest.slice(0, sep);
    rest = rest.slice(sep + 2);
    const parsed = parseEvent(block);
    if (parsed) events.push(parsed);
  }
  return { events, rest };
}

/**
 * Consume an assistant response, streamed or JSON. Resolves when the `done` /
 * `error` event fires or the stream closes. Falls back gracefully if the server
 * replied with a plain JSON body instead of SSE.
 */
export async function consumeAssistant(
  body: string,
  options: StreamOptions = {}
): Promise<void> {
  const { onEvent } = options;
  const res = await fetch("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body,
    signal: options.signal,
  });

  const contentType = res.headers.get("content-type") ?? "";

  // Non-streaming fallback: the server returned one JSON response. This is the
  // path used by older infrastructure, proxies that don't passthrough SSE, and
  // every test of the route — it must behave exactly like the pre-stream client.
  if (!contentType.includes("text/event-stream")) {
    const data = await res.json();
    if (!res.ok) {
      onEvent?.onError?.(data?.error ?? `HTTP ${res.status}`);
      return;
    }
    onEvent?.onDone?.({
      reply: data.reply,
      steps: data.steps,
    });
    return;
  }

  if (!res.ok || !res.body) {
    onEvent?.onError?.(`HTTP ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = eventsFromText(buffer);
      buffer = rest;
      for (const ev of events) handleEvent(ev, onEvent);
    }
  } catch (err) {
    onEvent?.onError?.(err instanceof Error ? err.message : "Stream interrupted.");
  }
}

function handleEvent(ev: { event: string; data: string }, onEvent?: ActionHandlers): void {
  if (ev.event === "message") return;
  let payload: unknown;
  try {
    payload = JSON.parse(ev.data);
  } catch {
    onEvent?.onError?.("Received a malformed stream frame.");
    return;
  }
  const typed = payload as Record<string, unknown>;

  switch (ev.event) {
    case "reasoning":
      onEvent?.onReasoning?.(String(typed.note ?? ""));
      break;
    case "tool_call":
      onEvent?.onToolCall?.(String(typed.tool ?? ""), String(typed.detail ?? ""));
      break;
    case "token":
      onEvent?.onToken?.(String(typed.delta ?? ""));
      break;
    case "done":
      onEvent?.onDone?.({
        reply: String(typed.reply ?? ""),
        steps: Array.isArray(typed.steps) ? (typed.steps as { kind: string; label: string; detail: string }[]) : undefined,
      });
      break;
    case "error":
      onEvent?.onError?.(String(typed.message ?? "Assistant stream failed."));
      break;
    default:
      break; // unknown future event types are ignored forward-compatibly
  }
}

export type { AssistantSseEvent } from "@/lib/sse";