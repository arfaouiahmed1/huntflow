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
    <div className="overflow-hidden rounded-[1.5rem] border border-[var(--violet)]/25 bg-[var(--violet)]/[0.04]">
      <div className="flex items-center justify-between border-b border-[var(--violet)]/20 bg-[var(--violet)]/[0.06] px-6 py-4">
        <p className="flex items-center gap-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--violet)]">
          <BrainCircuit className="h-4 w-4" /> Agent reasoning — spacious trace
        </p>
        <span className="rounded-full border border-[var(--violet)]/30 bg-[var(--violet)]/10 px-3 py-1 font-mono text-[10px] font-bold text-[var(--violet)]">
          {entries.length} decision{entries.length === 1 ? "" : "s"}
        </span>
      </div>
      <div ref={timelineRef} className="max-h-[420px] space-y-4 overflow-y-auto px-6 py-6">
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--violet)]/20 bg-white/[0.02] p-10 text-center">
            <BrainCircuit className="mx-auto h-5 w-5 text-[var(--violet)]/70" />
            <p className="mx-auto mt-3 max-w-[40ch] text-xs leading-relaxed text-dim">
              {running ? "The agent will explain each decision here as it happens — every step gets a reasoning line." : "No reasoning yet — launch a run to watch the agent think in its own words."}
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className="flex gap-4 rounded-2xl border border-[var(--violet)]/15 bg-white/[0.03] p-4"
              >
                <span className="shrink-0 rounded-full bg-[var(--violet)]/10 px-2 py-1 font-mono text-[10px] tabular-nums text-[var(--violet)]">{entry.timestamp}</span>
                <BrainCircuit className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--violet)]" />
                <span className="min-w-0 text-sm leading-relaxed text-[var(--paper)]/90">
                  {entry.source && <span className="mr-2 rounded-full bg-[var(--violet)]/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--violet)]">[{entry.source}]</span>}
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
