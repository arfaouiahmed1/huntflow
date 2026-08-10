"use client";

import { useEffect, useState, ElementType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Brain,
  Radar,
  Gauge,
  Terminal,
  BadgeCheck,
  Sparkles,
  Database,
  ChevronRight,
  Search,
  Code,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface AgentRunHistoryItem {
  id?: number;
  threadId: string;
  jobId?: string;
  agentName: string;
  status: string;
  region?: string;
  atsScore?: number;
  reasoning?: string;
  findings?: string;
  logs?: string;
  inputData?: string;
  outputData?: string;
  createdAt?: string;
}

function parseJSON(str?: string) {
  if (!str) return null;
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === "object" && parsed !== null ? parsed : { value: parsed };
  } catch {
    return null;
  }
}

function KeyValueCard({ title, data, icon: Icon }: { title: string; data: Record<string, unknown>; icon?: ElementType }) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-[var(--line)] bg-[#1a1d24]/40 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-[var(--line)] bg-black/40 px-3 py-2.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-dim" />}
        <span className="text-xs font-semibold text-[var(--paper)] tracking-wide">{title}</span>
      </div>
      <div className="p-3 space-y-2">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 sm:flex-row sm:justify-between py-0.5">
            <span className="text-xs text-dim font-mono">{k}</span>
            <span className="text-xs text-[var(--paper)] break-all max-w-[75%] sm:text-right font-medium">
              {typeof v === "object" ? JSON.stringify(v) : String(v)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TerminalLogs({ logs }: { logs: Array<{ message: string; type?: string }> }) {
  if (!logs || logs.length === 0) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-[var(--line)] bg-[#0d0f14] shadow-inner">
      <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[#14171f] px-3 py-2.5">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
        </div>
        <span className="ml-2 text-[10px] font-mono text-dim uppercase tracking-wider flex items-center gap-1.5">
          <Terminal className="h-3 w-3" /> Runtime Logs
        </span>
      </div>
      <div className="max-h-56 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed space-y-1.5">
        {logs.map((l, i) => {
          let color = "text-dim";
          if (l.type === "success") color = "text-[var(--chartreuse)]";
          else if (l.type === "warning") color = "text-yellow-400";
          else if (l.type === "error") color = "text-red-400";
          else if (l.type === "info") color = "text-[var(--paper)]";
          return (
            <div key={i} className="flex items-start gap-3 hover:bg-white/[0.02] rounded px-1 -mx-1">
              <span className="text-[#333742] select-none shrink-0">{String(i + 1).padStart(2, "0")}</span>
              <span className={cn("break-all", color)}>{l.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

export default function AgentReasoningDrawer({
  open,
  threadId,
  onClose,
}: {
  open: boolean;
  threadId: string | null;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<AgentRunHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignore = false;
    if (!open || !threadId) return;

    async function loadHistory() {
      setLoading(true);
      try {
        const r = await fetch(`/api/agent/run-history?threadId=${encodeURIComponent(threadId!)}`);
        const data = await r.json();
        if (!ignore) setHistory(data.history ?? []);
      } catch {
        /* ignore */
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadHistory();
    return () => {
      ignore = true;
    };
  }, [open, threadId]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-md">
        <motion.div
          initial={{ x: "100%", opacity: 0.5 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 250 }}
          className="flex flex-col w-full max-w-2xl border-l border-[var(--line)] bg-[#0d0f14] shadow-2xl h-full"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--line)] bg-[#0d0f14]/80 backdrop-blur-xl p-5 sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--chartreuse)]/10 border border-[var(--chartreuse)]/20 shadow-[0_0_15px_rgba(173,255,47,0.1)]">
                <Brain className="h-5 w-5 text-[var(--chartreuse)]" />
              </div>
              <div>
                <h2 className="font-bold text-[var(--paper)] text-lg tracking-tight">Agent Trace Explorer</h2>
                <p className="text-xs text-dim font-mono mt-0.5 flex items-center gap-1.5">
                  <Database className="h-3 w-3" /> {threadId}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-dim hover:bg-white/5 hover:text-[var(--paper)] transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 text-sm text-[var(--paper)] bg-gradient-to-b from-[#0d0f14] to-[#111319]">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-dim">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                >
                  <Brain className="h-8 w-8 opacity-50" />
                </motion.div>
                <span className="text-xs animate-pulse tracking-widest uppercase">Initializing Trace...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-dim opacity-70">
                <Radar className="h-10 w-10 mb-2" />
                <p className="text-sm">No execution history recorded.</p>
              </div>
            ) : (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="relative pl-7 before:absolute before:left-[11px] before:top-6 before:bottom-6 before:w-px before:bg-gradient-to-b before:from-[var(--chartreuse)]/50 before:via-[var(--line)] before:to-transparent"
              >
                {history.map((entry, idx) => {
                  const inputData = parseJSON(entry.inputData);
                  const outputData = parseJSON(entry.outputData);
                  const findings = parseJSON(entry.findings);
                  
                  let parsedLogs: Array<{ message: string; type?: string }> = [];
                  try {
                    if (entry.logs) {
                      const l = JSON.parse(entry.logs);
                      parsedLogs = Array.isArray(l) ? l : [l];
                    }
                  } catch {
                    /* ignore */
                  }

                  const itemVariants = {
                    hidden: { opacity: 0, y: 10 },
                    show: {
                      opacity: 1,
                      y: 0,
                      transition: { type: "spring" as const, stiffness: 300, damping: 24 },
                    },
                  };

                  return (
                    <motion.div key={idx} variants={itemVariants} className="relative mb-6 last:mb-0">
                      {/* Timeline Dot */}
                      <div className="absolute -left-[33px] top-1.5 flex h-[17px] w-[17px] items-center justify-center rounded-full bg-[#0d0f14] border-2 border-[var(--line)]">
                        <div className="h-1.5 w-1.5 rounded-full bg-[var(--chartreuse)] shadow-[0_0_8px_var(--chartreuse)]" />
                      </div>

                      <div className="rounded-2xl border border-[var(--line)] bg-[#13151a]/60 backdrop-blur-md p-5 shadow-lg transition-all hover:border-white/10 hover:shadow-xl">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="rounded-lg bg-white/5 p-1.5">
                              <Sparkles className="h-4 w-4 text-[var(--chartreuse)]" />
                            </div>
                            <span className="font-bold text-base text-[var(--paper)] tracking-tight">
                              {entry.agentName}
                            </span>
                            {entry.status === "completed" && (
                              <BadgeCheck className="h-4 w-4 text-green-400 ml-1" />
                            )}
                          </div>
                          {entry.atsScore != null && (
                            <div className="flex items-center gap-1.5 rounded-full bg-[var(--chartreuse)]/10 px-2.5 py-1 text-xs font-bold text-[var(--chartreuse)] border border-[var(--chartreuse)]/20">
                              <Gauge className="h-3.5 w-3.5" />
                              <span>{entry.atsScore}%</span>
                            </div>
                          )}
                        </div>

                        {/* Reasoning */}
                        {entry.reasoning && (
                          <div className="relative overflow-hidden rounded-xl bg-black/40 p-4 border border-white/5 mb-4 group">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[var(--chartreuse)] to-transparent opacity-50" />
                            <span className="font-semibold text-[var(--paper)] text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <Brain className="h-3.5 w-3.5 text-dim group-hover:text-[var(--chartreuse)] transition-colors" /> 
                              Reasoning & Rationale
                            </span>
                            <p className="text-[13px] leading-relaxed text-dim mt-1.5">
                              {entry.reasoning}
                            </p>
                          </div>
                        )}

                        {/* Data Cards */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                          <KeyValueCard title="Input Data" data={inputData} icon={ChevronRight} />
                          <KeyValueCard title="Findings" data={findings} icon={Search} />
                          <KeyValueCard title="Output Data" data={outputData} icon={Code} />
                        </div>

                        {/* Logs Terminal */}
                        <TerminalLogs logs={parsedLogs} />
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
