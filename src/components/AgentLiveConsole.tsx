"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Camera,
  CheckCircle2,
  Loader2,
  Radio,
  Terminal,
  TriangleAlert,
  XCircle,
  ArrowUpRight,
  ScanSearch,
  Send,
  Link2,
  Play,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { palette } from "@/lib/theme";

type EventKind = "info" | "success" | "warning" | "error" | "shot" | "reasoning";

interface ActivityEvent {
  id: number;
  run_id: string;
  ts: string;
  kind: EventKind;
  message: string;
  data?: { screenshot?: string; cloudinary?: string };
}

interface RunSummary {
  run_id: string;
  kind: string;
  url: string;
  label: string;
  started: string;
  started_ts: number;
  finished: string | null;
  finished_ts: number | null;
  status: string;
  events: number;
}

interface ActivityPayload {
  online: boolean;
  active: RunSummary | null;
  events: ActivityEvent[];
  runs: RunSummary[];
}

const KIND_STYLE: Record<EventKind, { color: string; icon: typeof Terminal }> = {
  info: { color: palette.paperDim, icon: Terminal },
  reasoning: { color: "var(--violet)", icon: Activity },
  success: { color: "var(--chartreuse)", icon: CheckCircle2 },
  warning: { color: "var(--amber)", icon: TriangleAlert },
  error: { color: "var(--coral)", icon: XCircle },
  shot: { color: "var(--sky)", icon: Camera },
};

const AGENT_IMG = process.env.NEXT_PUBLIC_SCRAPLING_AGENT_URL || "http://127.0.0.1:8001";

function elapsed(active: RunSummary): string {
  if (!active?.started_ts) return "0s";
  const end = active.finished_ts ?? Date.now() / 1000;
  const s = Math.max(0, Math.floor(end - active.started_ts));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function Elapsed({ run }: { run: RunSummary }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (run.finished_ts) return;
    const id = setInterval(() => force((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [run.finished_ts]);
  return <>{elapsed(run)}</>;
}

export default function AgentLiveConsole() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [active, setActive] = useState<RunSummary | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<EventKind | "all">("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const lastId = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch(`/api/agent/activity?since=${lastId.current}`, { cache: "no-store" });
        if (!res.ok) {
          setOnline(false);
          return;
        }
        const data: ActivityPayload = await res.json();
        if (cancelled) return;
        setOnline(data.online);
        if (data.events?.length) {
          lastId.current = data.events[data.events.length - 1].id;
          setEvents((prev) => {
            const known = new Set(prev.map((e) => e.id));
            const fresh = data.events.filter((e) => !known.has(e.id));
            return [...prev, ...fresh].slice(-400);
          });
        }
        if (data.active) setActive(data.active);
        if (data.runs) setRuns(data.runs);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };

    const pollNow = () => {
      poll();
      timer = setInterval(poll, 1500);
    };
    pollNow();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  const onScroll = useCallback(() => {
    const el = logRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAutoScroll(nearBottom);
  }, []);

  const shown = filter === "all" ? events : events.filter((e) => e.kind === filter);
  const screenshots = events
    .filter((e) => e.kind === "shot" && (e.data?.screenshot || e.data?.cloudinary))
    .map((e) => ({
      id: e.id,
      cloudinary: e.data?.cloudinary,
      screenshot: e.data?.screenshot,
    }));

  // Follow the newest shot so the user watches the agent live.
  useEffect(() => {
    if (stripRef.current) {
      stripRef.current.scrollLeft = stripRef.current.scrollWidth;
    }
  }, [screenshots.length]);

  const kinds: (EventKind | "all")[] = ["all", "info", "reasoning", "success", "warning", "error", "shot"];
  const kindCount = (k: EventKind | "all") =>
    k === "all" ? events.length : events.filter((e) => e.kind === k).length;

  return (
    <div className="space-y-4">
      {/* Live header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">
          <Radio className={cn("h-4 w-4", active ? "animate-pulse text-[var(--chartreuse)]" : "text-dim")} />
          Live agent feed
          {active && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 px-2 py-0.5 text-[9px] font-bold text-[var(--chartreuse)]">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[var(--chartreuse)]" />
              RUNNING
            </span>
          )}
        </p>
        <span
          className={cn(
            "font-mono text-[10px] font-bold",
            online === null ? "text-dim" : online ? "text-[var(--chartreuse)]" : "text-[var(--coral)]"
          )}
        >
          {online === null ? "connecting…" : online ? "agent connected" : "agent offline"}
        </span>
      </div>

      {/* Active run banner */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--chartreuse)]/25 bg-[var(--chartreuse)]/5 px-4 py-3"
          >
            <span className="flex items-center gap-2 text-xs font-bold text-[var(--paper)]">
              <CircleDot className="h-4 w-4 animate-pulse text-[var(--chartreuse)]" />
              {active.label || active.kind}
            </span>
            <span className="max-w-[320px] truncate font-mono text-[10px] text-dim">{active.url}</span>
            <span className="ml-auto flex items-center gap-3 font-mono text-[10px]">
              <span className="text-[var(--chartreuse)]">⏱ <Elapsed run={active} /></span>
              <span className="text-dim">{active.events} events</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Console */}
      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-ink-console">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-[var(--line)] bg-white/[0.03] px-4 py-2.5">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--coral)]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--amber)]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--chartreuse)]/70" />
          </span>
          <span className="ml-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
            <Terminal className="h-3.5 w-3.5" /> scrapling — agent console
          </span>
          <div className="ml-auto flex gap-1">
            {kinds.map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cn(
                  "rounded-md border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider transition-colors",
                  filter === k
                    ? "border-[var(--chartreuse)]/50 bg-[var(--chartreuse)]/15 text-[var(--chartreuse)]"
                    : "border-transparent text-dim hover:text-[var(--paper)]"
                )}
              >
                {k}
                <span className="ml-1 opacity-60">{kindCount(k)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Log lines */}
        <div
          ref={logRef}
          onScroll={onScroll}
          className="max-h-[340px] space-y-0.5 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed"
        >
          {events.length === 0 ? (
            <p className="py-8 text-center text-[11px] text-dim/70">
              {online === false
                ? "Agent offline — start it with:  uv run uvicorn server:app --port 8001"
                : "No activity yet. Dispatch a run from the command center below…"}
            </p>
          ) : shown.length === 0 ? (
            <p className="py-8 text-center text-[11px] text-dim/70">No {filter} events logged.</p>
          ) : (
            shown.map((e) => {
              const style = KIND_STYLE[e.kind];
              const Icon = style.icon;
              return (
                <div key={e.id} className="flex items-baseline gap-2.5">
                  <span className="shrink-0 text-[10px] tabular-nums text-dim/60">{e.ts}</span>
                  <Icon className="mt-0.5 h-3 w-3 shrink-0" style={{ color: style.color }} />
                  <span className="text-[var(--paper)]/90" style={e.kind === "shot" ? { color: style.color } : undefined}>
                    {e.message}
                  </span>
                </div>
              );
            })
          )}
          {active && (
            <div className="flex items-baseline gap-2.5 pt-1 text-[var(--chartreuse)]/80">
              <span className="shrink-0 text-[10px] tabular-nums text-dim/60">{new Date().toLocaleTimeString()}</span>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="animate-pulse">waiting on next step…</span>
            </div>
          )}
        </div>
      </div>

      {/* Screenshot strip */}
      {screenshots.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">
            <Camera className="h-4 w-4 text-[var(--sky)]" /> Snapshots — {screenshots.length}
          </p>
          <div ref={stripRef} className="flex gap-3 overflow-x-auto pb-2">
            {screenshots.slice(-8).map((shot) => {
              const src = shot.cloudinary || `${AGENT_IMG}/screenshots/${shot.screenshot}`;
              return (
                <a
                  key={shot.id}
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative shrink-0 overflow-hidden rounded-xl border border-[var(--line)] transition-transform hover:scale-[1.02]"
                >
                  <img
                    src={src}
                    alt="Agent browser snapshot"
                    loading="lazy"
                    className="h-28 w-44 object-cover"
                  />
                  {shot.cloudinary && (
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-white/80">
                      live
                    </span>
                  )}
                  <span className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <ArrowUpRight className="h-3.5 w-3.5 text-white" />
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Run history */}
      {runs.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
          <p className="border-b border-[var(--line)] bg-white/[0.02] px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">
            Run history
          </p>
          <div className="divide-y divide-[var(--line)]/50">
            {runs.slice(0, 8).map((run) => (
              <div key={run.run_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-xs">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-white/[0.02]">
                  {run.kind === "linkedin" ? (
                    <Link2 className="h-3.5 w-3.5 text-[var(--sky)]" />
                  ) : run.kind === "apply" ? (
                    <Send className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
                  ) : (
                    <ScanSearch className="h-3.5 w-3.5 text-[var(--amber)]" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[var(--paper)]">{run.label || run.kind}</p>
                  <p className="truncate font-mono text-[10px] text-dim">{run.url}</p>
                </div>
                <span className="font-mono text-[10px] text-dim">
                  {run.finished && run.started_ts ? elapsed(run) : run.status === "running" ? "in progress" : elapsed(run)}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider",
                    run.status === "success"
                      ? "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                      : run.status === "failed"
                      ? "border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)]"
                      : run.status === "running"
                      ? "border-[var(--sky)]/40 bg-[var(--sky)]/10 text-[var(--sky)]"
                      : "border-[var(--amber)]/40 bg-[var(--amber)]/10 text-[var(--amber)]"
                  )}
                >
                  {run.status === "running" && <Play className="h-2.5 w-2.5 animate-pulse" />}
                  {run.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Offline hint */}
      {online === false && (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--coral)]/25 bg-[var(--coral)]/5 px-4 py-3">
          <Activity className="h-4 w-4 text-[var(--coral)]" />
          <p className="font-mono text-[10px] text-[var(--coral)]">
            Agent offline — nothing to watch. Start it with: uv run uvicorn server:app --port 8001
          </p>
        </div>
      )}
    </div>
  );
}
