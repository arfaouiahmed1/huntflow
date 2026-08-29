import { describe, it, expect } from "vitest";
import {
  reduceBoardUpdate,
  parseBoardUpdate,
  type BoardLiveState,
  type BoardUpdateEvent,
} from "@/lib/boardUpdate";

const SOURCES = [
  { id: "weworkremotely", name: "WeWorkRemotely" },
  { id: "hackernews", name: "Hacker News" },
  { id: "remoteok", name: "RemoteOK" },
];

const CTX = { sources: SOURCES, displaySources: SOURCES };

function idle(): Record<string, BoardLiveState> {
  return Object.fromEntries(
    SOURCES.map((s) => [
      s.id,
      { status: "idle" as const, found: 0, matched: 0, error: null, workerId: null, message: null },
    ])
  );
}

function running(): Record<string, BoardLiveState> {
  return Object.fromEntries(
    SOURCES.map((s) => [
      s.id,
      { status: "running" as const, found: 0, matched: 0, error: null, workerId: null, message: `Starting ${s.name}…` },
    ])
  );
}

function frame(partial: BoardUpdateEvent): BoardUpdateEvent {
  return partial;
}

describe("reduceBoardUpdate — structured frames", () => {
  it("flips a card to running by source_id", () => {
    const next = reduceBoardUpdate(idle(), frame({
      id: 1,
      kind: "info",
      message: "🔍 [Worker #1] Crawling WeWorkRemotely (remote)…",
      data: { type: "board", source_id: "weworkremotely", source_name: "WeWorkRemotely", status: "running", found: 0, matched: 0 },
    }), CTX);

    expect(next.weworkremotely.status).toBe("running");
    expect(next.hackernews.status).toBe("idle");
  });

  it("applies final found/matched counts on structured success by source_name", () => {
    const prev = running();
    const next = reduceBoardUpdate(prev, frame({
      id: 2,
      kind: "info",
      message: "✅ [Worker #1] WeWorkRemotely yielded 12 candidate card(s)",
      data: { type: "board", source_id: "weworkremotely", source_name: "WeWorkRemotely", status: "success", found: 12, matched: 4 },
    }), CTX);

    expect(next.weworkremotely).toMatchObject({ status: "success", found: 12, matched: 4 });
    expect(next.hackernews.status).toBe("running");
  });

  it("marks failures with the sidecar error text", () => {
    const next = reduceBoardUpdate(running(), frame({
      id: 3,
      kind: "warning",
      message: "⚠ [Worker #2] Skipped RemoteOK: HTTP 403",
      data: { type: "board", source_id: "remoteok", source_name: "RemoteOK", status: "failed", found: 0, matched: 0, error: "HTTP 403" },
    }), CTX);

    expect(next.remoteok.status).toBe("failed");
    expect(next.remoteok.error).toBe("HTTP 403");
  });

  it("attaches proof screenshots from structured fields", () => {
    const next = reduceBoardUpdate(running(), frame({
      id: 4,
      kind: "info",
      data: { type: "board", source_id: "hackernews", status: "success", found: 3, matched: 1, screenshot: "abc123/jobs-results.png" },
    }), CTX);

    expect(next.hackernews.screenshotUrl).toBe("abc123/jobs-results.png");
  });

  it("accepts camelCase screenshotUrl/cloudinaryUrl keys", () => {
    const next = reduceBoardUpdate(idle(), frame({
      id: 5,
      data: { type: "board", source_id: "remoteok", status: "success", screenshotUrl: "r/shot.png", cloudinaryUrl: "https://res.cloud/shot.png" },
    }), CTX);

    expect(next.remoteok.screenshotUrl).toBe("r/shot.png");
    expect(next.remoteok.cloudinaryUrl).toBe("https://res.cloud/shot.png");
  });
});

describe("reduceBoardUpdate — legacy string frames", () => {
  it("parses yielded counts and matches the board by display name", () => {
    const next = reduceBoardUpdate(running(), frame({
      id: 6,
      kind: "info",
      message: "[Worker #1] WeWorkRemotely yielded 0 candidate card(s)",
    }), CTX);

    expect(next.weworkremotely.status).toBe("success");
    expect(next.weworkremotely.found).toBe(0);
    expect(next.weworkremotely.workerId).toBe(1);
  });

  it("parses skipped boards into failed + error", () => {
    const next = reduceBoardUpdate(running(), frame({
      id: 7,
      kind: "warning",
      message: "⚠ [Worker #3] Skipped Hacker News: HTTPSConnectionPool max retries exceeded",
    }), CTX);

    expect(next.hackernews.status).toBe("failed");
    expect(next.hackernews.error).toContain("max retries exceeded");
  });

  it("ignores frames for unknown boards", () => {
    const prev = running();
    const next = reduceBoardUpdate(prev, frame({
      id: 8,
      kind: "info",
      message: "[Worker #9] Totally Fake Board yielded 7 candidate card(s)",
    }), CTX);

    expect(next).toEqual(prev);
  });
});

describe("reduceBoardUpdate — terminal run frames", () => {
  it("flips every running card to success and spreads the run-level screenshot", () => {
    const prev = running();
    const next = reduceBoardUpdate(prev, frame({
      id: 9,
      kind: "success",
      message: "🎉 Parallel crawl completed across 7 boards — found 12 job(s)",
      data: { type: "run", status: "success", boards_crawled: 7, found: 12, matched: 12, screenshot: "run1/final.png" },
    }), CTX);

    for (const s of SOURCES) {
      expect(next[s.id].status).toBe("success");
      expect(next[s.id].screenshotUrl).toBe("run1/final.png");
    }
  });

  it("keeps an existing per-board shot over the shared run-level one", () => {
    const prev = running();
    prev.weworkremotely.screenshotUrl = "per-board/wwr.png";
    const next = reduceBoardUpdate(prev, frame({
      id: 10,
      kind: "success",
      message: "Run abc finished",
      data: { type: "run", status: "success", screenshot: "run1/final.png" },
    }), CTX);

    expect(next.weworkremotely.screenshotUrl).toBe("per-board/wwr.png");
    expect(next.hackernews.screenshotUrl).toBe("run1/final.png");
  });

  it("flips everything to failed when the terminal status is failed", () => {
    const next = reduceBoardUpdate(running(), frame({
      id: 11,
      kind: "error",
      message: "Run xyz failed",
      data: { type: "run", status: "failed" },
    }), CTX);

    for (const s of SOURCES) expect(next[s.id].status).toBe("failed");
  });

  it("treats the plain completion banner as terminal even without data", () => {
    const next = reduceBoardUpdate(running(), frame({
      id: 12,
      kind: "info",
      message: "🎉 Parallel crawl completed across 3 boards — found 5 job(s)",
    }), CTX);

    for (const s of SOURCES) expect(next[s.id].status).toBe("success");
  });
});

describe("parseBoardUpdate — legacy regex extraction", () => {
  it("extracts name, worker, count and error from log strings", () => {
    expect(parseBoardUpdate("[Worker #2] Crawling RemoteOK (remote)…")).toMatchObject({
      boardName: "RemoteOK",
      workerId: 2,
    });
    expect(parseBoardUpdate("✅ [Worker #2] RemoteOK yielded 14 candidate card(s)")).toMatchObject({
      boardName: "RemoteOK",
      found: 14,
    });
    expect(parseBoardUpdate("⚠ [Worker #4] Skipped Hacker News: boom")).toMatchObject({
      boardName: "Hacker News",
      error: "boom",
    });
  });
});
