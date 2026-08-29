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
import { agentScreenshotUrl } from "@/lib/agentScreenshot";

type EventKind = "info" | "success" | "warning" | "error" | "shot" | "reasoning";

interface ActivityEvent {
  id: number;
  run_id: string;
  ts: string;
  kind: EventKind;
  message: string;
  data?: { screenshot?: string; cloudinary?: string; action?: string; target?: string };
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
  active_runs?: RunSummary[];
  concurrency?: number;
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

export default function AgentLiveConsole({
  title = "Live agent activity",
}: {
  title?: string;
}) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [active, setActive] = useState<RunSummary | null>(null);
  const [activeRuns, setActiveRuns] = useState<RunSummary[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<EventKind | "all">("all");
  const [selectedRun, setSelectedRun] = useState<string | "all">("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const lastId = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

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
        if (data.active_runs) {
          setActiveRuns(data.active_runs);
        }
        setActive(data.active ?? null);
        if (data.runs) setRuns(data.runs);
      } catch (_err) {
        // Poll failure → offline pill is the user-facing signal; toast per 1.5s poll would spam.
        void _err;
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

  const runEvents = selectedRun === "all" ? events : events.filter((e) => e.run_id === selectedRun);
  const shown = filter === "all" ? runEvents : runEvents.filter((e) => e.kind === filter);
  const screenshots = runEvents
    .filter((e) => e.kind === "shot" && (e.data?.screenshot || e.data?.cloudinary))
    .map((e) => ({
      id: e.id,
      cloudinary: e.data?.cloudinary,
      screenshot: e.data?.screenshot,
      run_id: e.run_id,
      ts: e.ts,
      message: e.message,
    }));

  // Follow the newest shot so the user watches the agent live.
  useEffect(() => {
    if (stripRef.current) {
      stripRef.current.scrollLeft = stripRef.current.scrollWidth;
    }
  }, [screenshots.length]);

  const kinds: (EventKind | "all")[] = ["all", "info", "reasoning", "success", "warning", "error", "shot"];
  const kindCount = (k: EventKind | "all") =>
    k === "all" ? runEvents.length : runEvents.filter((e) => e.kind === k).length;

  return (
    <div className="space-y-4">
      {/* Live header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">
            <Radio className={cn("h-4 w-4", activeRuns.length > 0 ? "animate-pulse text-[var(--chartreuse)]" : "text-dim")} />
            {title}
          </p>
          {activeRuns.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 px-2 py-0.5 text-[9px] font-bold text-[var(--chartreuse)]">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[var(--chartreuse)]" />
              {activeRuns.length} ACTIVE WORKER{activeRuns.length > 1 ? "S" : ""}
            </span>
          )}
        </div>
        <span
          className={cn(
            "font-mono text-[10px] font-bold",
            online === null ? "text-dim" : online ? "text-[var(--chartreuse)]" : "text-[var(--coral)]"
          )}
        >
          {online === null ? "connecting…" : online ? "agent connected" : "agent offline"}
        </span>
      </div>

      {/* Active multi-run banner */}
      <AnimatePresence>
        {activeRuns.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="grid gap-2 sm:grid-cols-2"
          >
            {activeRuns.map((r, i) => (
              <div
                key={r.run_id || i}
                className="flex items-center gap-2.5 rounded-xl border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/5 px-3 py-2.5"
              >
                <CircleDot className="h-3.5 w-3.5 animate-pulse text-[var(--chartreuse)] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-[var(--paper)]">
                    {r.label || r.kind}
                  </p>
                  <p className="truncate font-mono text-[10px] text-dim">{r.url}</p>
                </div>
                <div className="text-right font-mono text-[10px] shrink-0">
                  <span className="text-[var(--chartreuse)]">⏱ <Elapsed run={r} /></span>
                  <span className="block text-dim">{r.events} events</span>
                </div>
              </div>
            ))}
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
                : "No activity yet. Start a crawl or supervised browser run to populate this feed."}
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

      {/* Lightbox Modal */}
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxSrc(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[90vh] max-w-5xl overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--ink-card)] p-2 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2 text-xs">
                <span className="flex items-center gap-2 font-mono font-bold text-[var(--sky)]">
                  <Camera className="h-4 w-4" /> Live Browser Snapshot
                  {lightboxSrc.includes("cloudinary") && (
                    <span className="rounded bg-[var(--chartreuse)]/20 px-1.5 py-0.5 text-[9px] text-[var(--chartreuse)]">
                      Cloudinary CDN
                    </span>
                  )}
                </span>
                <button
                  onClick={() => setLightboxSrc(null)}
                  className="rounded-lg p-1 text-dim hover:bg-white/10 hover:text-[var(--paper)]"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
              <div className="overflow-auto p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={lightboxSrc}
                  alt="Full Browser Snapshot"
                  className="max-h-[75vh] w-auto rounded-xl object-contain"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Screenshot strip */}
      {screenshots.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">
            <Camera className="h-4 w-4 text-[var(--sky)]" /> Snapshots — {screenshots.length}
          </p>
          <div ref={stripRef} className="flex gap-3 overflow-x-auto pb-2">
            {screenshots.slice(-8).map((shot) => {
              const src = agentScreenshotUrl(shot.screenshot, shot.cloudinary);
              if (!src) return null;
              return (
                <div
                  key={shot.id}
                  onClick={() => setLightboxSrc(src)}
                  className="group relative shrink-0 cursor-pointer overflow-hidden rounded-xl border border-[var(--line)] transition-transform hover:scale-[1.02]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt="Agent browser snapshot"
                    loading="lazy"
                    className="h-28 w-44 object-cover"
                  />
                  {shot.cloudinary && (
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-[var(--chartreuse)]">
                      Cloudinary
                    </span>
                  )}
                  <span className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <ArrowUpRight className="h-3.5 w-3.5 text-white" />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Run history */}
      {runs.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] bg-white/[0.02] px-4 py-2.5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">Run history</p>
            <button
              onClick={() => setSelectedRun("all")}
              className={cn(
                "rounded-md border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider",
                selectedRun === "all"
                  ? "border-[var(--sky)]/50 bg-[var(--sky)]/10 text-[var(--sky)]"
                  : "border-[var(--line)] text-dim hover:text-[var(--paper)]"
              )}
            >
              All activity
            </button>
          </div>
          <div className="divide-y divide-[var(--line)]/50">
            {runs.slice(0, 8).map((run) => (
              <button
                key={run.run_id}
                onClick={() => setSelectedRun(run.run_id)}
                className={cn(
                  "flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-left text-xs transition-colors hover:bg-white/[0.03]",
                  selectedRun === run.run_id && "bg-[var(--sky)]/5"
                )}
              >
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
                    run.status === "success" || run.status === "applied"
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
              </button>
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
