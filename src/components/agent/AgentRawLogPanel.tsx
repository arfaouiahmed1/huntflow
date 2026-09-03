"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Radio, Sparkles, Terminal } from "lucide-react";
import AgentLiveConsole from "@/components/AgentLiveConsole";
import { cn } from "@/lib/utils";

export interface AgentLogEntry {
  timestamp: string;
  message: string;
  type: string;
}

interface AgentRawLogPanelProps {
  logs: AgentLogEntry[];
  running: boolean;
}

export default function AgentRawLogPanel({ logs, running }: AgentRawLogPanelProps) {
  const [open, setOpen] = useState(false);
  const logBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
  }, [logs.length, open]);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-[var(--line)]">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full cursor-pointer items-center justify-between bg-white/[0.02] px-4 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
        >
          <span className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-dim">
            <Terminal className="h-3.5 w-3.5" /> Raw activity log
            {running && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 px-2 py-0.5 text-[9px] font-bold normal-case tracking-normal text-[var(--chartreuse)]">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[var(--chartreuse)]" /> live tail
              </span>
            )}
            {!running && logs.length > 0 && (
              <span className="font-mono text-[9px] normal-case tracking-normal text-dim">{logs.length} events</span>
            )}
          </span>
          <ChevronDown className={cn("h-4 w-4 text-dim transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <div
            ref={logBoxRef}
            className="max-h-64 space-y-0.5 overflow-y-auto bg-ink-console px-4 py-3 font-mono text-[11px] leading-relaxed"
          >
            {logs.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-dim/70">Console is quiet. Events stream here during a run.</p>
            ) : (
              logs.map((log, index) => (
                <div key={`${log.timestamp}-${index}`} className="flex items-baseline gap-2.5">
                  <span className="shrink-0 text-[10px] tabular-nums text-dim/60">{log.timestamp}</span>
                  <Sparkles
                    className={cn(
                      "mt-0.5 h-3 w-3 shrink-0",
                      log.type === "success"
                        ? "text-[var(--chartreuse)]"
                        : log.type === "warning"
                          ? "text-[var(--amber)]"
                          : log.type === "error"
                            ? "text-[var(--coral)]"
                            : log.type === "reasoning"
                              ? "text-[var(--violet)]"
                              : "text-dim"
                    )}
                  />
                  <span className="text-[var(--paper)]/90">{log.message}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      {open ? (
        <div className="border-t border-[var(--line)] pt-4">
          <AgentLiveConsole title="Sidecar live activity" />
        </div>
      ) : (
        <p className="flex items-center gap-1.5 px-1 text-[10px] text-dim">
          <Radio className="h-3 w-3" /> Browser snapshots &amp; run history live inside the raw activity log above.
        </p>
      )}
    </>
  );
}
