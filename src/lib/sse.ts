/**
 * Minimal Server-Sent-Events helpers for the assistant streaming route.
 *
 * SSE framing is just field:value lines separated by blank lines. We emit one
 * `event:` + one JSON `data:` line per event so the client can switch on type
 * with a single structured payload instead of scraping a free-form body.
 *
 * These ship as plain strings (not a full encoder) because the caller builds a
 * `ReadableStream` per-request and only ever writes string chunks.
 */

/** Headers that disable buffering so tokens reach the client as they're produced. */
export const sseHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
  Connection: "keep-alive",
} as const;

/**
 * Frame a single event. `event` becomes the SSE `event:` field, `data` is
 * JSON-serialized into `data:`. Returns a self-terminated chunk (trailing
 * newline pair) ready for `controller.enqueue()` / the writer's `write()`.
 */
export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Wrapper type so route + client reason about a typed event, not a raw string. */
export type AssistantSseEvent =
  | { event: "config"; data: { stream: true } }
  | { event: "reasoning"; data: { note: string } }
  | { event: "tool_call"; data: { tool: string; detail: string } }
  | { event: "token"; data: { delta: string } }
  | {
      event: "done";
      data: {
        reply: string;
        steps: { kind: string; label: string; detail: string }[];
        usedTools: string[];
        llm: boolean;
      };
    }
  | { event: "error"; data: { code?: string; message: string } };