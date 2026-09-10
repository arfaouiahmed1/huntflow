import { describe, it, expect } from "vitest";
import { parseSseBuffer, readSseStream } from "./sseClient";

describe("parseSseBuffer", () => {
  it("parses event + data frames and ignores keepalives", () => {
    const raw = `: keepalive\n\nevent: token\ndata: {"delta":"Hi"}\n\nevent: done\ndata: {"reply":"Hi"}\n\n`;
    const packets = parseSseBuffer(raw);
    expect(packets).toHaveLength(2);
    expect(packets[0]).toEqual({ event: "token", data: { delta: "Hi" } });
    expect(packets[1].event).toBe("done");
  });

  it("skips malformed frames without killing the stream", () => {
    const raw = `event: token\ndata: not-json\n\nevent: token\ndata: {"delta":"ok"}\n\n`;
    expect(parseSseBuffer(raw)).toEqual([{ event: "token", data: { delta: "ok" } }]);
  });
});

describe("readSseStream", () => {
  it("delivers packets across chunk boundaries", async () => {
    const enc = new TextEncoder();
    const chunks = [`event: token\ndata: {"del`, `ta":"a"}\n\nevent: done\ndata: {}\n\n`];
    const res = new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          for (const ch of chunks) c.enqueue(enc.encode(ch));
          c.close();
        },
      })
    );
    const seen: string[] = [];
    await readSseStream(res, (p) => seen.push(p.event));
    expect(seen).toEqual(["token", "done"]);
  });

  it("throws on transport failure so callers fall back", async () => {
    await expect(readSseStream(new Response("nope", { status: 500 }), () => undefined)).rejects.toThrow();
  });
});
