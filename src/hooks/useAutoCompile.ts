"use client";
/* eslint-disable react-hooks/refs */
import { useCallback, useEffect, useRef, useState } from "react";

export type PdfState = "idle" | "compiling" | "ready" | "error";

export interface CompiledResult {
  token: string;
  pdfData: ArrayBuffer;
  logTail: string;
}

export interface UseAutoCompileOptions {
  tex: string;
  autoCompile: boolean;
  onCompiled?: (r: CompiledResult) => void;
  onError?: (msg: string, logTail: string) => void;
}

export interface UseAutoCompileReturn {
  compileNow: () => void;
  busy: boolean;
  latencyMs: number | null;
  pdfData: ArrayBuffer | null;
  pdfState: PdfState;
  pdfError: string | null;
  token: string | null;
  compiledTex: string | null;
  logTail: string;
}

/** Idle ms after the last keystroke before an auto compile fires. */
export const AUTO_COMPILE_DEBOUNCE_MS = 1200;

/** Chars of logTail kept when it is the only error detail available. */
const LOG_TAIL_ERROR_SLICE = 500;

export interface AutoCompileSnapshot {
  busy: boolean;
  latencyMs: number | null;
  pdfData: ArrayBuffer | null;
  pdfState: PdfState;
  pdfError: string | null;
  token: string | null;
  compiledTex: string | null;
  logTail: string;
}

/** Timeout handle for the debounce timer (node + DOM runtimes). */
export type DebounceTimer = NodeJS.Timeout;
const INITIAL_SNAPSHOT: AutoCompileSnapshot = {
  busy: false,
  latencyMs: null,
  pdfData: null,
  pdfState: "idle",
  pdfError: null,
  token: null,
  compiledTex: null,
  logTail: "",
};
interface EngineHandlers {
  onCompiled?: (r: CompiledResult) => void;
  onError?: (msg: string, logTail: string) => void;
}

interface CompilePayload {
  ok?: boolean;
  token?: string;
  logTail?: string;
  error?: { message?: string };
}

/**
 * Framework-agnostic debounce + generation-guarded compile engine.
 * The hook below is a thin React binding over this class so the exact
 * scheduling/abort semantics stay pinnable in the repo's node-only
 * vitest environment (no DOM renderer available for hook tests).
 */
export class AutoCompileEngine {
  private timer: DebounceTimer | null = null;
  private inFlight: AbortController | null = null;
  private generation = 0;
  private pendingTex: string | null = null;
  private disposed = false;
  private handlers: EngineHandlers = {};
  snapshot: AutoCompileSnapshot = { ...INITIAL_SNAPSHOT };

  constructor(private emit: (s: AutoCompileSnapshot) => void) {}

  setHandlers(handlers: EngineHandlers): void {
    this.handlers = handlers;
  }

  /** Schedule a debounced compile for the latest tex when autoCompile is on. */
  setSource(tex: string, autoCompile: boolean): void {
    if (this.disposed) return;
    if (!autoCompile) {
      this.clearTimer();
      this.pendingTex = null;
      return;
    }
    if (
      tex === this.snapshot.compiledTex &&
      this.snapshot.pdfState === "ready" &&
      this.inFlight === null &&
      this.pendingTex === null
    ) {
      return;
    }
    this.clearTimer();
    this.pendingTex = tex;
    this.timer = setTimeout(() => {
      this.timer = null;
      const next = this.pendingTex;
      this.pendingTex = null;
      if (next !== null) void this.start(next);
    }, AUTO_COMPILE_DEBOUNCE_MS);
  }

  /** Immediate compile of the given tex, bypassing the debounce. */
  compileNow(tex: string): void {
    if (this.disposed) return;
    this.clearTimer();
    this.pendingTex = null;
    void this.start(tex);
  }

  /** Abort in-flight work and drop pending timers. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimer();
    this.pendingTex = null;
    this.inFlight?.abort();
    this.inFlight = null;
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private publish(patch: Partial<AutoCompileSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit(this.snapshot);
  }

  private async start(tex: string): Promise<void> {
    this.generation += 1;
    const gen = this.generation;
    this.inFlight?.abort();
    const controller = new AbortController();
    this.inFlight = controller;
    const startedAt = Date.now();
    this.publish({ busy: true, pdfState: "compiling", pdfError: null });

    const fail = (msg: string, logTail: string): void => {
      if (this.inFlight === controller) this.inFlight = null;
      this.publish({ busy: false, pdfState: "error", pdfError: msg, logTail });
      this.handlers.onError?.(msg, logTail);
    };

    try {
      const post = await fetch("/api/resume/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tex }),
        signal: controller.signal,
      });
      const data = (await post.json()) as CompilePayload;
      if (gen !== this.generation || this.disposed) return;
      const logTail = typeof data?.logTail === "string" ? data.logTail : "";
      if (!post.ok || data?.ok === false || typeof data?.token !== "string") {
        const msg =
          data?.error?.message ??
          (logTail ? logTail.slice(-LOG_TAIL_ERROR_SLICE) : `Compile failed (HTTP ${post.status})`);
        fail(msg, logTail);
        return;
      }
      const token = data.token;
      const get = await fetch(`/api/resume/compile?token=${encodeURIComponent(token)}`, {
        signal: controller.signal,
      });
      if (gen !== this.generation || this.disposed) return;
      if (!get.ok) {
        fail(logTail ? logTail.slice(-LOG_TAIL_ERROR_SLICE) : `PDF fetch failed (HTTP ${get.status})`, logTail);
        return;
      }
      const pdfData = await get.arrayBuffer();
      if (gen !== this.generation || this.disposed) return;
      if (this.inFlight === controller) this.inFlight = null;
      this.publish({
        busy: false,
        latencyMs: Date.now() - startedAt,
        pdfData,
        pdfState: "ready",
        pdfError: null,
        token,
        compiledTex: tex,
        logTail,
      });
      this.handlers.onCompiled?.({ token, pdfData, logTail });
    } catch (err) {
      if (gen !== this.generation || this.disposed) return;
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : "Compile request failed";
      fail(msg, this.snapshot.logTail);
    }
  }
}

export function useAutoCompile(opts: UseAutoCompileOptions): UseAutoCompileReturn {
  const { tex, autoCompile, onCompiled, onError } = opts;
  const [snapshot, setSnapshot] = useState<AutoCompileSnapshot>(() => ({ ...INITIAL_SNAPSHOT }));
  const engineRef = useRef<AutoCompileEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new AutoCompileEngine((s) => setSnapshot(s));
  }
  const texRef = useRef(tex);
  texRef.current = tex;
  const handlersRef = useRef({ onCompiled, onError });
  handlersRef.current = { onCompiled, onError };

  useEffect(() => {
    engineRef.current?.setHandlers({
      onCompiled: (r) => handlersRef.current.onCompiled?.(r),
      onError: (msg, logTail) => handlersRef.current.onError?.(msg, logTail),
    });
  });

  useEffect(() => {
    engineRef.current?.setSource(tex, autoCompile);
  }, [tex, autoCompile]);

  useEffect(() => {
    const engine = engineRef.current;
    return () => engine?.dispose();
  }, []);

  const compileNow = useCallback(() => {
    engineRef.current?.compileNow(texRef.current);
  }, []);

  return { compileNow, ...snapshot };
}
