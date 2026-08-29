"use client";

import { forwardRef, useEffect, useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Globe,
  CheckCircle2,
  XCircle,
  Loader2,
  Image as ImageIcon,
  Zap,
  AlertTriangle,
  Radio,
  Eye,
  Layers,
} from "lucide-react";
import { agentScreenshotUrl } from "@/lib/agentScreenshot";
import {
  reduceBoardUpdate,
  type BoardLiveState,
  type BoardLiveStatus,
  type BoardUpdateEvent,
} from "@/lib/boardUpdate";
import { useToast } from "@/components/ui/Toaster";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type { BoardLiveStatus } from "@/lib/boardUpdate";

export interface BoardLiveCardProps extends React.HTMLAttributes<HTMLDivElement> {
  id: string;
  name: string;
  category: string;
  boardType: "static" | "stealth" | "posts";
  url?: string;
  status: BoardLiveStatus;
  found: number;
  matched: number;
  error?: string | null;
  /** Global concurrency 1-16 (validation.ts:214 clamp). Rendered as segmented gauge. */
  concurrency: number;
  workerId?: number | null;
  screenshotUrl?: string | null;
  cloudinaryUrl?: string | null;
  message?: string | null;
}

export interface BoardLiveSource {
  id: string;
  name: string;
  category: string;
  type: "static" | "stealth" | "posts";
  url: string;
  enabledByDefault?: boolean;
  note?: string;
}

export interface BoardLiveGridProps {
  runId: string | null;
  sources: BoardLiveSource[];
  concurrency: number;
  /** Optional filter — when provided only these ids render as live cards. */
  selectedIds?: Set<string>;
  className?: string;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function clampConcurrency(n: number): number {
  return Math.min(16, Math.max(1, Math.floor(n) || 1));
}

function statusMeta(status: BoardLiveStatus) {
  switch (status) {
    case "running":
      return {
        label: "Running",
        icon: Loader2,
        iconClass: "animate-spin text-[var(--amber)]",
        badge: "border-[var(--amber)]/40 bg-[var(--amber)]/10 text-[var(--amber)]",
      };
    case "success":
      return {
        label: "Success",
        icon: CheckCircle2,
        iconClass: "text-[var(--chartreuse)]",
        badge: "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]",
      };
    case "failed":
    case "error":
      return {
        label: "Error",
        icon: XCircle,
        iconClass: "text-[var(--coral)]",
        badge: "border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)]",
      };
    default:
      return {
        label: "Idle",
        icon: Globe,
        iconClass: "text-dim",
        badge: "border-[var(--line)] bg-white/[0.03] text-dim",
      };
  }
}

/* ------------------------------------------------------------------ *
 * BoardLiveCard — presentational per-board card
 * ------------------------------------------------------------------ */

export const BoardLiveCard = forwardRef<HTMLDivElement, BoardLiveCardProps>(
  (
    {
      id,
      name,
      category,
      boardType,
      url,
      status,
      found,
      matched,
      error,
      concurrency,
      workerId,
      screenshotUrl,
      cloudinaryUrl,
      message,
      className,
      ...props
    },
    ref
  ) => {
    const clamped = clampConcurrency(concurrency);
    const meta = statusMeta(status);
    const StatusIcon = meta.icon;
    const shotSrc = agentScreenshotUrl(screenshotUrl, cloudinaryUrl);
    const ratio = found > 0 ? Math.round((matched / found) * 100) : 0;

    return (
      <div
        ref={ref}
        data-testid="board-card"
        data-board-id={id}
        data-status={status}
        role="article"
        aria-label={`${name} board ${status} ${found} found ${matched} matched`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (url) window.open(url, "_blank", "noreferrer");
            else (e.currentTarget as HTMLElement).focus();
          }
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            const next = (e.currentTarget.nextElementSibling as HTMLElement | null) || (e.currentTarget.parentElement?.firstElementChild as HTMLElement | null);
            next?.focus();
          }
          if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            const prev = (e.currentTarget.previousElementSibling as HTMLElement | null) || (e.currentTarget.parentElement?.lastElementChild as HTMLElement | null);
            prev?.focus();
          }
        }}
        className={cn(
          "group relative flex flex-col overflow-hidden rounded-2xl border bg-[var(--ink-card)]/80 p-4 shadow-sm transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-[var(--chartreuse)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink-card)] focus-visible:border-[var(--chartreuse)]/50",
          status === "running" && "border-[var(--amber)]/30 shadow-[0_0_0_1px_color-mix(in_srgb,var(--amber)_15%,transparent)]",
          status === "success" && "border-[var(--chartreuse)]/25",
          status === "failed" || status === "error" ? "border-[var(--coral)]/30" : "border-[var(--line)]",
          status === "idle" && "opacity-80",
          className
        )}
        {...props}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold leading-none text-[var(--paper)]" title={name}>
                {name}
              </span>
              {workerId ? (
                <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-white/[0.06] px-1.5 font-mono text-[9px] font-bold text-dim">
                  W{workerId}
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-black/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-dim">
                <Layers className="h-3 w-3" />
                {boardType}
              </span>
              <span className="inline-flex items-center rounded-md bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-dim">
                {category}
              </span>
            </div>
          </div>

          <span
            data-testid="board-status"
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors duration-300",
              meta.badge
            )}
          >
            <StatusIcon className={cn("h-3 w-3", meta.iconClass)} />
            {meta.label}
          </span>
        </div>

        {/* Concurrency gauge 1-16 */}
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.16em] text-dim">
              <Zap className="h-3 w-3" /> Concurrency
            </span>
            <span className="font-mono text-[10px] font-bold text-dim">
              {clamped} / 16
            </span>
          </div>
          <div className="flex gap-[2px]" aria-label={`concurrency ${clamped} of 16`} data-testid="concurrency-gauge">
            {Array.from({ length: 16 }, (_, i) => {
              const active = i < clamped;
              const isWorker = workerId != null && i + 1 === workerId;
              return (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors duration-300",
                    active ? "bg-[var(--chartreuse)]/80" : "bg-white/[0.06]",
                    isWorker && active && "bg-[var(--amber)] ring-1 ring-[var(--amber)]/50",
                    status === "running" && active && "animate-pulse"
                  )}
                />
              );
            })}
          </div>
        </div>

        {/* Found / matched */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-[var(--line)] bg-black/20 p-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-dim">Found</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-[var(--paper)]" data-testid="board-found">
              {found}
            </p>
            <p className="text-[10px] text-dim">cards</p>
          </div>
          <div
            className={cn(
              "rounded-xl border p-2.5",
              matched > 0 ? "border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/5" : "border-[var(--line)] bg-black/20"
            )}
          >
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-dim">Matched</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-[var(--chartreuse)]" data-testid="board-matched">
              {matched}
            </p>
            <p className="text-[10px] text-dim">{ratio}% hit</p>
          </div>
        </div>

        {/* Matched ratio bar */}
        {found > 0 && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-[var(--chartreuse)] transition-all duration-500"
              style={{ width: `${Math.min(100, ratio)}%` }}
            />
          </div>
        )}

        {/* Screenshot thumb */}
        <div className="mt-3">
          <div className="mb-1 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.16em] text-dim">
            <Eye className="h-3 w-3" /> Proof
          </div>
          {shotSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shotSrc}
              alt={`${name} screenshot`}
              loading="lazy"
              className="h-20 w-full rounded-xl border border-[var(--line)] object-cover object-top"
              data-testid="board-screenshot"
            />
          ) : (
            <div
              data-testid="board-screenshot-placeholder"
              className="flex h-20 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--line)] bg-black/20 text-dim"
            >
              <ImageIcon className="h-4 w-4" />
              <span className="text-[11px]">No thumb yet</span>
            </div>
          )}
        </div>

        {/* Message / error */}
        {(message || error) && (
          <div className="mt-3 space-y-1">
            {message && (
              <p className="line-clamp-2 break-words text-[11px] leading-relaxed text-dim" title={message} data-testid="board-message">
                {message}
              </p>
            )}
            {error && (
              <p
                className="flex items-start gap-1 line-clamp-2 break-words rounded-lg border border-[var(--coral)]/20 bg-[var(--coral)]/5 px-2 py-1.5 text-[11px] leading-relaxed text-[var(--coral)]"
                data-testid="board-error"
              >
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="min-w-0">{error}</span>
              </p>
            )}
          </div>
        )}

        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 truncate font-mono text-[10px] text-[var(--sky)] hover:underline"
            title={url}
          >
            <Globe className="h-3 w-3 shrink-0" /> {new URL(url).hostname.replace(/^www\./, "")}
          </a>
        )}

        {/* Running pulse dot */}
        {status === "running" && (
          <span className="pointer-events-none absolute right-3 top-3 h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--amber)] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--amber)]" />
          </span>
        )}
      </div>
    );
  }
);
BoardLiveCard.displayName = "BoardLiveCard";

/* ------------------------------------------------------------------ *
 * BoardLiveGrid — SSE consumer, no remount per event
 * ------------------------------------------------------------------ */

export function BoardLiveGrid({ runId, sources, concurrency, selectedIds, className }: BoardLiveGridProps) {
  const { error: toastError } = useToast();
  const clampedConcurrency = clampConcurrency(concurrency);

  // Keep stable keys: only sources that are selected (or all if no filter) render.
  const displaySources = useMemo(() => {
    if (!selectedIds || selectedIds.size === 0) return sources;
    return sources.filter((s) => selectedIds.has(s.id));
  }, [sources, selectedIds]);

  const sourceById = useMemo(() => {
    const m = new Map<string, BoardLiveSource>();
    for (const s of sources) m.set(s.id, s);
    return m;
  }, [sources]);

  // Per-board live state — keyed by source id, stable across SSE events (no remount).
  const [live, setLive] = useState<Record<string, BoardLiveState>>({});

  // When sources change or runId resets, prime idle states without wiping running on same runId.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLive((prev) => {
      const next: Record<string, BoardLiveState> = { ...prev };
      let changed = false;
      for (const s of displaySources) {
        if (!next[s.id]) {
          next[s.id] = { status: "idle", found: 0, matched: 0, error: null, workerId: null, message: null };
          changed = true;
        }
      }
      // Prune ids no longer displayed (keep others for stability)
      for (const key of Object.keys(next)) {
        if (!displaySources.some((s) => s.id === key) && !sourceById.has(key)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [displaySources, sourceById]);

  // When a new runId appears, mark selected boards as running (flip idle→running).
  useEffect(() => {
    if (!runId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLive((prev) => {
      const next = { ...prev };
      for (const s of displaySources) {
        const cur = next[s.id];
        next[s.id] = {
          status: "running",
          found: cur?.found ?? 0,
          matched: cur?.matched ?? 0,
          error: null,
          workerId: cur?.workerId ?? null,
          message: `Starting ${s.name}…`,
          screenshotUrl: cur?.screenshotUrl ?? null,
          cloudinaryUrl: cur?.cloudinaryUrl ?? null,
        };
      }
      return next;
    });
  }, [runId, displaySources]);

  const applyBoardUpdate = useCallback(
    (raw: BoardUpdateEvent) => {
      setLive((prev) => reduceBoardUpdate(prev, raw, { sources, displaySources }));
    },
    [sources, displaySources]
  );

  // SSE subscription — single EventSource per runId, append state without remounting deck.
  useEffect(() => {
    if (!runId) return;

    let es: EventSource | null = null;
    let closed = false;

    try {
      es = new EventSource(`/api/crawl/stream?runId=${encodeURIComponent(runId)}`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to open live stream.");
      return;
    }

    const handleBoardUpdate = (e: MessageEvent) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        applyBoardUpdate(data);
      } catch (err) {
        toastError(err instanceof Error ? err.message : "Live update parse failed — using raw message.");
        applyBoardUpdate({ message: String((e as MessageEvent).data) });
      }
    };

    const handleLog = (e: MessageEvent) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        if (data.message && /\[Worker #\d+\]|yielded|Skipped|Parallel crawl/i.test(String(data.message))) {
          applyBoardUpdate(data);
        }
      } catch (err) {
        toastError(err instanceof Error ? err.message : "Log parse failed.");
      }
    };

    es.addEventListener("board_update", handleBoardUpdate as EventListener);
    es.addEventListener("log", handleLog as EventListener);
    es.addEventListener("done", () => {
      if (!closed) es?.close();
    });
    es.onerror = () => {
      // EventSource auto-reconnects; keep alive for live feel. Close only on explicit done.
    };

    return () => {
      closed = true;
      es?.close();
    };
  }, [runId, applyBoardUpdate, toastError]);

  if (displaySources.length === 0) {
    return (
      <div className={cn("rounded-2xl border border-dashed border-[var(--line)] bg-black/10 p-8 text-center", className)}>
        <Globe className="mx-auto h-8 w-8 text-dim" />
        <p className="mt-2 text-sm font-semibold text-[var(--paper)]">No boards in this view</p>
        <p className="mt-1 text-xs text-dim">Select a category or enable sources to see live cards.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)} data-testid="board-live-grid" data-run-id={runId ?? ""}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/10 px-2.5 py-1 font-bold uppercase tracking-wider text-[var(--chartreuse)]">
            <Radio className={cn("h-3 w-3", runId ? "animate-pulse" : "")} />
            {runId ? "Live" : "Idle"}
          </span>
          {runId && <span className="font-mono text-dim">run {runId.slice(0, 8)}</span>}
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.02] px-3 py-1 font-mono text-[11px] text-dim">
          <Zap className="h-3 w-3" /> {clampedConcurrency} workers
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {displaySources.map((s) => {
          const st = live[s.id] || { status: "idle" as const, found: 0, matched: 0, error: null, workerId: null, message: null };
          return (
            <BoardLiveCard
              key={s.id}
              id={s.id}
              name={s.name}
              category={s.category}
              boardType={s.type}
              url={s.url}
              status={st.status}
              found={st.found}
              matched={st.matched}
              error={st.error}
              concurrency={clampedConcurrency}
              workerId={st.workerId}
              screenshotUrl={st.screenshotUrl}
              cloudinaryUrl={st.cloudinaryUrl}
              message={st.message}
            />
          );
        })}
      </div>
    </div>
  );
}
