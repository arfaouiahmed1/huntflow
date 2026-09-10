/**
 * Minimal SSE reader for POST-based event streams (browser).
 *
 * The server frames one `event:` + one JSON `data:` line per event
 * (see src/lib/sse.ts); comment keepalives (`: keepalive`) are ignored.
 * Pure frame parsing is exported for unit tests.
 */

export interface SsePacket {
  event: string;
  data: unknown;
}

/** Split a raw SSE text buffer into packets (ignores comments/incomplete tails). */
export function parseSseBuffer(buffer: string): SsePacket[] {
  const packets: SsePacket[] = [];
  for (const frame of buffer.split("\n\n")) {
    let event: string | null = null;
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (!event || dataLines.length === 0) continue;
    try {
      packets.push({ event, data: JSON.parse(dataLines.join("\n")) as unknown });
    } catch {
      /* malformed frame — skip, the stream stays usable */
    }
  }
  return packets;
}

/**
 * Consume a fetch Response body as SSE, invoking onEvent per packet.
 * Resolves when the stream closes. Throws on transport-level failure
 * so callers can fall back to the JSON endpoint.
 */
export async function readSseStream(
  res: Response,
  onEvent: (packet: SsePacket) => void,
  signal?: AbortSignal
): Promise<void> {
  if (!res.ok || !res.body) throw new Error(`Stream returned ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      return;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const packet of parseSseBuffer(`${frames.join("\n\n")}${frames.length > 0 ? "\n\n" : ""}`)) {
      onEvent(packet);
    }
  }
  for (const packet of parseSseBuffer(buffer)) onEvent(packet);
}
