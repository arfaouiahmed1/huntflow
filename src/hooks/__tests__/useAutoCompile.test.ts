import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoCompileEngine, AUTO_COMPILE_DEBOUNCE_MS } from "@/hooks/useAutoCompile";

function postResponse(token: string) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ ok: true, token, logTail: "compiled fine" }),
  };
}

function pdfResponse(body = new ArrayBuffer(8)) {
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k.toLowerCase() === "x-latency-ms" ? "42" : null) },
    arrayBuffer: async () => body,
  };
}

function failingPostResponse() {
  return {
    ok: false,
    status: 500,
    headers: { get: () => null },
    json: async () => ({
      ok: false,
      logTail: "! LaTeX Error: File `foo.sty' not found.\n\nl.10 \\usepackage{foo}",
    }),
  };
}

const fetchMockCalls = () =>
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<
    [string, RequestInit]
  >;

describe("AutoCompileEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(async (url: string, init: RequestInit) =>
      init.method === "POST" ? postResponse("tok_123") : pdfResponse()
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces setSource by AUTO_COMPILE_DEBOUNCE_MS and POSTs the latest tex", async () => {
    const engine = new AutoCompileEngine(() => {});
    engine.setSource("hello tex", true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(AUTO_COMPILE_DEBOUNCE_MS - 1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const [url, init] = fetchMockCalls()[0];
    expect(url).toContain("/api/resume/compile");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ tex: "hello tex" });
  });

  it("collapses rapid setSource keystrokes into a single request", async () => {
    const engine = new AutoCompileEngine(() => {});
    engine.setSource("a", true);
    await vi.advanceTimersByTimeAsync(500);
    engine.setSource("ab", true);
    await vi.advanceTimersByTimeAsync(500);
    engine.setSource("abc", true);
    await vi.advanceTimersByTimeAsync(200);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(AUTO_COMPILE_DEBOUNCE_MS);
    const posts = fetchMockCalls().filter((c) => c[1].method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1].body as string)).toEqual({ tex: "abc" });
  });

  it("compileNow bypasses the debounce and compiles immediately", async () => {
    const engine = new AutoCompileEngine(() => {});
    engine.compileNow("final tex");
    const [url, init] = fetchMockCalls()[0];
    expect(url).toContain("/api/resume/compile");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ tex: "final tex" });
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.snapshot.busy).toBe(false);
    expect(engine.snapshot.pdfState).toBe("ready");
  });

  it("compileNow during a pending debounce replaces the timer", async () => {
    const engine = new AutoCompileEngine(() => {});
    engine.setSource("draft one", true);
    engine.compileNow("draft two");
    await vi.advanceTimersByTimeAsync(10_000);
    // only the immediate call went out; the debounce timer was cleared
    const posts = fetchMockCalls().filter((c) => c[1].method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1].body as string)).toEqual({ tex: "draft two" });
  });

  it("stale in-flight compile is dropped when a newer one supersedes it", async () => {
    const gateA = Promise.withResolvers<unknown>();
    const gateB = Promise.withResolvers<unknown>();
    let gets = 0;
    globalThis.fetch = vi.fn((url: string, init: RequestInit) => {
      if (init.method === "POST") {
        if (fetchMockCalls().filter((c) => c[1].method === "POST").length === 1) {
          return gateA.promise; // first POST held open
        }
        gateB.resolve(postResponse("tok_new"));
        return gateB.promise;
      }
      gets += 1;
      return Promise.resolve(pdfResponse());
    }) as unknown as typeof fetch;

    const engine = new AutoCompileEngine(() => {});
    engine.compileNow("old");
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.snapshot.busy).toBe(true);
    expect(engine.snapshot.pdfState).toBe("compiling");

    engine.compileNow("new");
    await vi.advanceTimersByTimeAsync(0);
    expect(gets).toBe(1);
    expect(engine.snapshot.pdfState).toBe("ready");
    expect(engine.snapshot.compiledTex).toBe("new");

    // late resolution of the stale POST must not clobber the latest result
    gateA.resolve(postResponse("tok_old"));
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.snapshot.compiledTex).toBe("new");
    expect(engine.snapshot.token).toBe("tok_new");
    expect(engine.snapshot.pdfState).toBe("ready");
    expect(gets).toBe(1);
  });

  it("tracks busy/state transitions and exposes token, pdfData, logTail, compiledTex, latencyMs", async () => {
    const engine = new AutoCompileEngine(() => {});
    expect(engine.snapshot.busy).toBe(false);
    expect(engine.snapshot.pdfState).toBe("idle");
    engine.compileNow("body");
    expect(engine.snapshot.busy).toBe(true);
    expect(engine.snapshot.pdfState).toBe("compiling");
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.snapshot.busy).toBe(false);
    expect(engine.snapshot.pdfState).toBe("ready");
    expect(engine.snapshot.pdfData).not.toBeNull();
    expect(engine.snapshot.token).toBe("tok_123");
    expect(engine.snapshot.compiledTex).toBe("body");
    expect(engine.snapshot.logTail).toBe("compiled fine");
    expect(engine.snapshot.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("enters error state with pdfError from the logTail when the compile fails", async () => {
    globalThis.fetch = vi.fn(async () => failingPostResponse()) as unknown as typeof fetch;
    const engine = new AutoCompileEngine(() => {});
    engine.compileNow("bad tex");
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.snapshot.pdfState).toBe("error");
    expect(engine.snapshot.busy).toBe(false);
    expect(engine.snapshot.pdfError).toContain("LaTeX Error");
  });

  it("dispose clears a pending debounce without firing", async () => {
    const engine = new AutoCompileEngine(() => {});
    engine.setSource("never fires", true);
    engine.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});