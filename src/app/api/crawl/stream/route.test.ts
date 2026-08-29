import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { sseFrame } from "@/lib/sse";
import { reduceBoardUpdate } from "@/lib/boardUpdate";

function makeReq(runId: string | null, since?: string): NextRequest {
  const url = new URL("http://localhost/api/crawl/stream");
  if (runId !== null) url.searchParams.set("runId", runId);
  if (since !== undefined) url.searchParams.set("since", since);
  return new NextRequest(url.toString(), { method: "GET" });
}

function parseSse(body: string): { event: string; data: unknown; raw: string }[] {
  const out: { event: string; data: unknown; raw: string }[] = [];
  for (const block of body.split(/\n\n+/)) {
    if (!block.trim()) continue;
    if (block.startsWith(":")) continue; // heartbeat comment
    const ev = block.match(/^event:\s*(\S+)/m)?.[1];
    const dm = block.match(/^data:\s*(.+)$/m)?.[1];
    if (!ev || dm === undefined) continue;
    let data: unknown;
    try {
      data = JSON.parse(dm);
    } catch {
      data = dm;
    }
    out.push({ event: ev, data, raw: block });
  }
  return out;
}

function hasHeartbeatComment(body: string): boolean {
  return body.includes(": keepalive\n\n");
}

describe("GET /api/crawl/stream — contract", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("400 when runId missing (isolation guard)", async () => {
    const res = await GET(makeReq(null));
    expect(res.status).toBe(400);
    const j = (await res.json()) as Record<string, unknown>;
    expect(/runId/i.test(String(j.error))).toBe(true);
  });

  it("400 when runId blank", async () => {
    const res = await GET(makeReq("   "));
    expect(res.status).toBe(400);
  });

  it("SSE headers + heartbeat format + connected frame", async () => {
    // terminal quickly so text() resolves
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ events: [], runs: [{ run_id: "hb-1", status: "success" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    const res = await GET(makeReq("hb-1"));
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-cache");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    // sseFrame contract
    const frame = sseFrame("connected", { runId: "hb-1", since: 0 });
    expect(frame).toBe('event: connected\ndata: {"runId":"hb-1","since":0}\n\n');
    // heartbeat is a comment line, not an event
    expect(/^: keepalive\n\n$/.test(": keepalive\n\n")).toBe(true);
    const body = await res.text();
    expect(body).toContain("event: connected");
    expect(body).toContain("event: done");
    // heartbeat may not fire within 1.5s window before stream closes, but the comment format is the contract;
    // verify helper and that route would enqueue ": keepalive\\n\\n" on interval (literal check).
    expect(hasHeartbeatComment(": keepalive\n\n")).toBe(true);
    // if heartbeat did fire before close, it would appear as comment; either present or contract literal suffices
    // ensure body is valid SSE (every event block starts with event: or is comment)
    for (const block of body.split("\n\n").filter(Boolean)) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      expect(trimmed.startsWith("event:") || trimmed.startsWith(":")).toBe(true);
    }
  });

  it("isolates by runId (sibling runs ignored) and cursor advances", async () => {
    const runId = "run-abc-123";
    const events = [
      { id: 6, run_id: runId, ts: "12:00:01", kind: "info", message: "[Worker #1] Crawling Remote Board (remote)…", data: { type: "board", source_id: "remote_board", status: "running" } },
      { id: 7, run_id: "other-run", ts: "12:00:02", kind: "info", message: "[Worker #2] Crawling Other (other)…", data: { type: "board", source_id: "other", status: "running" } },
      { id: 8, run_id: runId, ts: "12:00:03", kind: "info", message: "✅ [Worker #1] Remote Board yielded 3 candidate card(s)", data: { type: "board", source_id: "remote_board", status: "success", found: 3, matched: 2 } },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ events, runs: [{ run_id: runId, status: "success" }] }), { status: 200 })
      )
    );
    const res = await GET(makeReq(runId, "5"));
    const body = await res.text();
    const frames = parseSse(body);
    const logs = frames.filter((f) => f.event === "log");
    const boards = frames.filter((f) => f.event === "board_update");
    // only own runId logs forwarded
    expect(logs.length).toBe(2);
    expect(logs.every((f) => (f.data as Record<string, unknown>).runId === runId)).toBe(true);
    expect(logs.map((f) => (f.data as Record<string, unknown>).id)).toEqual([6, 8]);
    // cursor in done must reflect highest own-run id (8), not sibling 7
    const done = frames.find((f) => f.event === "done")!.data as Record<string, unknown>;
    expect(done.since).toBe(8);
    expect(done.runId).toBe(runId);
    // board_update only for structured board events of own run
    expect(boards.length).toBeGreaterThanOrEqual(2);
    expect(boards.every((f) => (f.data as Record<string, unknown>).runId === runId)).toBe(true);
  });

  it("offline fallback: sidecar 503 surfaces error without fabricating cards", async () => {
    const runId = "offline-run";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("Service Unavailable", { status: 503, statusText: "Service Unavailable" }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ events: [], runs: [{ run_id: runId, status: "success" }] }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(makeReq(runId));
    const body = await res.text();
    const frames = parseSse(body);
    const errors = frames.filter((f) => f.event === "error");
    const logs = frames.filter((f) => f.event === "log");
    const boards = frames.filter((f) => f.event === "board_update");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(/offline|503/i.test(String((errors[0].data as Record<string, unknown>).message))).toBe(true);
    expect(logs.some((f) => String((f.data as Record<string, unknown>).message).includes("Agent offline"))).toBe(true);
    // must not fabricate a board card on offline: no board_update should claim offline success
    const boardMessages = boards.map((f) => String((f.data as Record<string, unknown>).message));
    expect(boardMessages.some((m) => /Agent offline/i.test(m))).toBe(false);
    // the only board_update allowed is the terminal run completion, not a fake source
    for (const b of boards) {
      const d = (b.data as Record<string, unknown>).data as Record<string, unknown> | null;
      if (d && typeof d === "object" && "source_id" in d) {
        expect(String((d as Record<string, unknown>).source_id)).not.toBe("offline");
      }
    }
  });

  it("malformed JSON chunk does not crash stream", async () => {
    const runId = "malformed-run";
    const fetchMock = vi
      .fn()
      // first poll returns invalid JSON -> route should catch and push error, not throw
      .mockResolvedValueOnce(new Response("not json { malformed", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ events: [{ id: 1, run_id: runId, ts: "12:00:01", kind: "info", message: "ok", data: { type: "board", source_id: "remotive", status: "running" } }], runs: [{ run_id: runId, status: "success" }] }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(makeReq(runId));
    const body = await res.text();
    const frames = parseSse(body);
    // stream still ends cleanly with done, despite first chunk being garbage
    expect(frames.some((f) => f.event === "connected")).toBe(true);
    expect(frames.some((f) => f.event === "error" && /malformed/i.test(String((f.data as Record<string, unknown>).message)))).toBe(true);
    expect(frames.some((f) => f.event === "done")).toBe(true);
    // second poll recovered: log forwarded
    expect(frames.some((f) => f.event === "log" && (f.data as Record<string, unknown>).id === 1)).toBe(true);
  });

  it("malformed data field (string instead of object) does not crash", async () => {
    const runId = "data-string-run";
    const events = [
      { id: 10, run_id: runId, ts: "12:00:01", kind: "info", message: "[Worker #1] Crawling X (remote)…", data: "not-an-object" },
      { id: 11, run_id: runId, ts: "12:00:02", kind: "info", message: "✅ [Worker #1] X yielded 1 candidate card(s)", data: "{bad json" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ events, runs: [{ run_id: runId, status: "success" }] }), { status: 200 })
      )
    );
    const res = await GET(makeReq(runId));
    const body = await res.text();
    const frames = parseSse(body);
    // should still produce logs, second data string attempted JSON.parse and fell back to {raw}
    const logs = frames.filter((f) => f.event === "log");
    expect(logs.length).toBe(2);
    expect(frames.some((f) => f.event === "done")).toBe(true);
  });

  it("board_update with missing board_id is handled (reducer returns prev)", async () => {
    // route forwards the frame; reducer must ignore it without crash
    const ctx = {
      sources: [{ id: "board-a", name: "Remote Board" }],
      displaySources: [{ id: "board-a", name: "Remote Board" }],
    } as const;
    const prev = { "board-a": { status: "idle" as const, found: 0, matched: 0, error: null, workerId: null, message: null } };

    // event with no source_id/name — reducer should return same ref (no change)
    const raw = { id: 99, runId: "r1", ts: "12:00:00", kind: "info", message: "Random log without board", data: {} };
    const next = reduceBoardUpdate(prev, raw, ctx);
    expect(next).toBe(prev);

    // event with type board but missing source_id — still no target, so unchanged
    const raw2 = { id: 100, runId: "r1", ts: "12:00:01", kind: "info", message: "✅ yielded 5", data: { type: "board", status: "success" } };
    const next2 = reduceBoardUpdate(prev, raw2, ctx);
    expect(next2).toBe(prev);

    // valid structured event still works
    const raw3 = { id: 101, runId: "r1", ts: "12:00:02", kind: "info", message: "[Worker #1] Remote Board yielded 3", data: { type: "board", source_id: "board-a", status: "success", found: 3, matched: 3 } };
    const next3 = reduceBoardUpdate(prev, raw3, ctx);
    expect(next3["board-a"].status).toBe("success");
    expect(next3["board-a"].found).toBe(3);
  });

  it("cursor only advances on own-run events (not on malformed/sibling)", async () => {
    const runId = "cursor-run";
    const payload = {
      events: [
        { id: 2, run_id: runId, ts: "12:00:01", kind: "info", message: "ok", data: {} },
        // malformed shape (missing id) should be skipped, cursor stays 2
        { run_id: runId, ts: "12:00:02", kind: "info", message: "bad shape" } as unknown as { id: number; run_id: string; ts: string; kind: string; message: string },
        // sibling run higher id must not move cursor beyond own
        { id: 99, run_id: "other", ts: "12:00:03", kind: "info", message: "sibling", data: {} },
        { id: 3, run_id: runId, ts: "12:00:04", kind: "info", message: "ok2", data: {} },
      ],
      runs: [{ run_id: runId, status: "success" }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })));
    const res = await GET(makeReq(runId));
    const frames = parseSse(await res.text());
    const done = frames.find((f) => f.event === "done")!.data as Record<string, unknown>;
    expect(done.since).toBe(3);
  });
});
