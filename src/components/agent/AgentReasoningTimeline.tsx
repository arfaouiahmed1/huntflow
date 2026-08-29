"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BrainCircuit } from "lucide-react";

export interface AgentReasoningEntry {
  id: number;
  timestamp: string;
  message: string;
  source?: string;
}

interface AgentReasoningTimelineProps {
  entries: AgentReasoningEntry[];
  running: boolean;
}

export default function AgentReasoningTimeline({ entries, running }: AgentReasoningTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [entries.length]);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--violet)]/25 bg-[var(--violet)]/[0.04]">
      <div className="flex items-center justify-between border-b border-[var(--violet)]/20 px-4 py-2.5">
        <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--violet)]">
          <BrainCircuit className="h-4 w-4" /> Agent reasoning
        </p>
        <span className="rounded-full border border-[var(--violet)]/30 bg-[var(--violet)]/10 px-2 py-0.5 font-mono text-[9px] font-bold text-[var(--violet)]">
          {entries.length} decision{entries.length === 1 ? "" : "s"}
        </span>
      </div>
      <div ref={timelineRef} className="max-h-56 space-y-2 overflow-y-auto px-4 py-3">
        {entries.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-dim">
            {running
              ? "The agent will explain each decision here as it happens…"
              : "No reasoning yet — launch a run to watch the agent think."}
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-baseline gap-2.5"
              >
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-dim/70">{entry.timestamp}</span>
                <BrainCircuit className="mt-0.5 h-3 w-3 shrink-0 text-[var(--violet)]" />
                <span className="min-w-0 text-xs leading-relaxed text-[var(--paper)]/90">
                  {entry.source && <span className="mr-1.5 font-mono text-[10px] text-dim">[{entry.source}]</span>}
                  {entry.message}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
