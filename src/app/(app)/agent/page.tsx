"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronDown,
  Copy,
  Ellipsis,
  ExternalLink,
  Gauge,
  Loader2,
  MousePointerClick,
  Play,
  Radar,
  RefreshCw,
  WifiOff,
  XCircle,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toaster";
import Select from "@/components/ui/Select";
import AgentRunMonitor from "@/components/agent/AgentRunMonitor";
import MemoryFeed from "@/components/MemoryFeed";
import { cn } from "@/lib/utils";
import { displayJobCompany, displayJobTitle } from "@/lib/jobDisplay";
import { scoreColor } from "@/lib/utils";
import { RegionCode } from "@/lib/agents/regionalNorms";

type HealthState = "checking" | "online" | "offline";

const REGIONS: { code: RegionCode; label: string }[] = [
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "UK", label: "United Kingdom" },
  { code: "DE", label: "Germany (DACH)" },
  { code: "FR", label: "France" },
  { code: "NL", label: "Netherlands" },
  { code: "CH", label: "Switzerland" },
  { code: "TN", label: "Tunisia / North Africa" },
  { code: "EG", label: "Egypt" },
  { code: "AE", label: "UAE & Gulf (GCC)" },
  { code: "SA", label: "Saudi Arabia" },
  { code: "AU", label: "Australia" },
  { code: "SG", label: "Singapore" },
  { code: "IN", label: "India" },
  { code: "JP", label: "Japan" },
  { code: "BR", label: "Brazil" },
  { code: "MX", label: "Mexico" },
  { code: "NG", label: "Nigeria" },
  { code: "KE", label: "Kenya" },
  { code: "ZA", label: "South Africa" },
  { code: "ES", label: "Spain" },
  { code: "INTL", label: "Global Remote" },
];

const SIDECAR_COMMAND = "uv run uvicorn server:app --port 8001";

export default function AgentPage() {
  const { applications, triggerAutoApply } = useApp();
  const { success, error: errToast, warn } = useToast();
  const [health, setHealth] = useState<HealthState>("checking");
  const [targetId, setTargetId] = useState<string>("");
  const [region, setRegion] = useState<RegionCode>("US");
  const [submitMode, setSubmitMode] = useState<"review" | "submit">("review");
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  const autoApplied = applications.filter((a) => a.autoApplyStatus === "applied").length;
  const queued = applications.filter(
    (a) => a.autoApplyStatus === "queued" || a.autoApplyStatus === "processing"
  ).length;
  const awaitingUrl = applications.filter((a) => !a.url).length;

  const runnable = useMemo(
    () =>
      applications
        .filter((a) => a.url && a.autoApplyStatus !== "applied")
        .sort((a, b) => {
          const rank = (s?: string) =>
            s === "failed" || s === "manual_required" ? 0 : s === "queued" || s === "processing" ? 1 : 2;
          return rank(a.autoApplyStatus) - rank(b.autoApplyStatus);
        }),
    [applications]
  );

  const appliedJobs = useMemo(
    () => applications.filter((a) => a.autoApplyStatus === "applied"),
    [applications]
  );

  const effectiveTargetId = targetId || runnable[0]?.id || "";

  useEffect(() => {
    if (!overflowOpen) return;
    const onClick = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) setOverflowOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [overflowOpen]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/agent/health", { signal: controller.signal })
      .then((r) => setHealth(r.ok ? "online" : "offline"))
      .catch(() => setHealth("offline"));
    return () => controller.abort();
  }, []);

  const checkHealth = () => {
    setHealth("checking");
    fetch("/api/agent/health")
      .then((r) => setHealth(r.ok ? "online" : "offline"))
      .catch(() => setHealth("offline"));
  };

  const target = applications.find((a) => a.id === effectiveTargetId) ?? null;

  const queueAllReady = async () => {
    if (batchRunning) return;
    if (runnable.length === 0) {
      warn("No ready targets with a posting URL.");
      return;
    }
    setBatchRunning(true);
    try {
      for (const job of runnable) {
        try {
          await triggerAutoApply(job.id, { submit: false });
        } catch {}
      }
      success(`Queued ${runnable.length} supervised review run(s).`);
    } finally {
      setBatchRunning(false);
      setOverflowOpen(false);
    }
  };

  const copySidecarCommand = async () => {
    try {
      await navigator.clipboard.writeText(SIDECAR_COMMAND);
      success("Sidecar start command copied.");
    } catch {
      errToast("Clipboard copy failed.");
    }
    setOverflowOpen(false);
  };

  const stats = [
    { label: "Verified submits", value: autoApplied, icon: CheckCircle2, color: "var(--chartreuse)" },
    { label: "In queue", value: queued, icon: Gauge, color: "var(--amber)" },
    { label: "Awaiting URL", value: awaitingUrl, icon: Radar, color: "var(--sky)" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--chartreuse)]">/agent</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--paper)]">
            Auto-Apply Command Center
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-dim">
            One supervised pipeline per role. Every decision, step, and browser action stays visible.
          </p>
        </div>
        <button
          type="button"
          onClick={checkHealth}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors",
            health === "online"
              ? "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
              : health === "checking"
              ? "border-[var(--line)] text-dim"
              : "border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)]"
          )}
        >
          {health === "online" ? (
            <>
              <Activity className="h-3.5 w-3.5" /> Scrapling agent online
            </>
          ) : health === "checking" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Probing port 8001…
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5" /> Agent offline — retry
            </>
          )}
        </button>
      </div>

      {/* Dispatch strip */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Target</span>
            <Select
              value={effectiveTargetId}
              onChange={(v) => setTargetId(v)}
              options={[
                ...(runnable.length === 0 && appliedJobs.length === 0 ? [{ value: "", label: "No applications yet", disabled: true } as const] : []),
                ...runnable.map((job) => ({ value: job.id, label: `${displayJobTitle(job)} — ${displayJobCompany(job)}` })),
                ...appliedJobs.map((job) => ({ value: job.id, label: `${displayJobTitle(job)} — applied`, disabled: true })),
              ]}
              placeholder="Select target…"
              ariaLabel="Target"
              className="w-full"
            />
          </label>

          <label className="flex min-w-[150px] flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Region norms</span>
            <Select
              value={region}
              onChange={(v) => setRegion(v as RegionCode)}
              options={REGIONS.map((r) => ({ value: r.code, label: r.label }))}
              ariaLabel="Region norms"
              className="w-full"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Dispatch</span>
            <div className="flex items-center rounded-lg border border-[var(--line)] bg-black/40 p-0.5">
              <button
                type="button"
                onClick={() => setSubmitMode("review")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all",
                  submitMode === "review"
                    ? "bg-[var(--chartreuse)] text-neutral-950"
                    : "text-dim hover:text-[var(--paper)]"
                )}
              >
                <MousePointerClick className="h-3.5 w-3.5" /> Review
              </button>
              <button
                type="button"
                onClick={() => setSubmitMode("submit")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all",
                  submitMode === "submit"
                    ? "bg-[var(--coral)] text-white"
                    : "text-dim hover:text-[var(--paper)]"
                )}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Submit after gate
              </button>
            </div>
          </div>

          <div className="relative ml-auto self-end" ref={overflowRef}>
            <button
              type="button"
              aria-label="More agent actions"
              onClick={() => setOverflowOpen((v) => !v)}
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-[var(--line)] text-dim transition-colors hover:border-white/20 hover:text-[var(--paper)]"
            >
              <Ellipsis className="h-4 w-4" />
            </button>
            {overflowOpen && (
              <div className="absolute right-0 top-full z-40 mt-1.5 w-60 space-y-0.5 rounded-xl border border-[var(--line)] bg-[var(--ink-soft)]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                <button
                  type="button"
                  disabled={batchRunning || runnable.length === 0}
                  onClick={queueAllReady}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[var(--paper)] transition-colors hover:bg-white/[0.05] disabled:opacity-50"
                >
                  {batchRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Review all ready ({runnable.length})
                </button>
                <button
                  type="button"
                  onClick={copySidecarCommand}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[var(--paper)] transition-colors hover:bg-white/[0.05]"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy sidecar start command
                </button>
                <button
                  type="button"
                  onClick={() => {
                    checkHealth();
                    setOverflowOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[var(--paper)] transition-colors hover:bg-white/[0.05]"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Re-check agent health
                </button>
                <a
                  href="https://github.com/arfaouiahmed1/huntflow/blob/main/docs/AGENT-OPERATIONS.md"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setOverflowOpen(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[var(--paper)] transition-colors hover:bg-white/[0.05]"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Agent operations guide
                </a>
              </div>
            )}
          </div>
        </div>
        {submitMode === "submit" && (
          <p className="mt-3 rounded-lg border border-[var(--coral)]/25 bg-[var(--coral)]/5 px-3 py-2 text-[11px] leading-relaxed text-dim">
            Submission still pauses at the human review gate — nothing is sent until you approve there.
          </p>
        )}
      </section>

      {/* Run view — reasoning timeline + steps + collapsible console */}
      {target ? (
        <AgentRunMonitor
          key={target.id}
          job={target}
          submit={submitMode === "submit"}
          region={region}
        />
      ) : (
        <section className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--ink-card)]/40 p-12 text-center">
          <Bot className="mx-auto h-8 w-8 text-dim" />
          <p className="mt-3 text-sm text-dim">
            Add an application with a job URL to arm the supervised pipeline.
          </p>
        </section>
      )}

      {/* Compact stats */}
      <div className="flex flex-wrap gap-2">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <span
            key={label}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--ink-card)]/70 px-3.5 py-1.5 text-xs"
          >
            <Icon className="h-3.5 w-3.5" style={{ color }} />
            <span className="font-mono font-bold tabular-nums text-[var(--paper)]">{String(value).padStart(2, "0")}</span>
            <span className="text-dim">{label}</span>
          </span>
        ))}
      </div>

      {/* Shared memory — collapsed by default */}
      <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
        <button
          type="button"
          onClick={() => setMemoryOpen((v) => !v)}
          className="flex w-full cursor-pointer items-center justify-between bg-[var(--ink-card)]/70 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
        >
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-dim">
            Shared agent memory
          </span>
          <ChevronDown className={cn("h-4 w-4 text-dim transition-transform", memoryOpen && "rotate-180")} />
        </button>
        {memoryOpen && (
          <div className="border-t border-[var(--line)] p-4">
            <MemoryFeed />
          </div>
        )}
      </div>

      {/* Queue */}
      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-[var(--paper)]">Application queue</h2>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-white/[0.02] text-[10px] uppercase tracking-[0.18em] text-dim">
                <th className="px-4 py-3 font-semibold">Opportunity</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Fit</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {[...runnable, ...appliedJobs].slice(0, 20).map((job) => (
                <tr
                  key={job.id}
                  className={cn(
                    "border-b border-[var(--line)]/50 transition-colors hover:bg-white/[0.02]",
                    effectiveTargetId === job.id && "bg-[var(--chartreuse)]/[0.04]"
                  )}
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--paper)]">{displayJobTitle(job)}</p>
                    <p className="text-xs text-dim">{displayJobCompany(job)}</p>
                  </td>
                  <td className="px-4 py-3">
                    {job.autoApplyStatus === "applied" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--chartreuse)]">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Applied
                      </span>
                    ) : job.autoApplyStatus === "failed" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--coral)]">
                        <XCircle className="h-3.5 w-3.5" /> Failed
                      </span>
                    ) : job.autoApplyStatus === "manual_required" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--amber)]">
                        <MousePointerClick className="h-3.5 w-3.5" /> Finish in browser
                      </span>
                    ) : (
                      <StatusBadge status={job.status} size="sm" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {typeof job.matchScore === "number" ? (
                      <span className="font-mono text-xs font-bold" style={{ color: scoreColor(job.matchScore) }}>
                        {job.matchScore}%
                      </span>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {job.autoApplyStatus === "applied" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-dim">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Done
                      </span>
                    ) : !job.url ? (
                      <span className="text-xs text-dim">No URL</span>
                    ) : (
                      <Button
                        size="sm"
                        variant={effectiveTargetId === job.id ? "primary" : "outline"}
                        onClick={() => setTargetId(job.id)}
                      >
                        <Play className="h-3.5 w-3.5" /> {effectiveTargetId === job.id ? "In run view" : "Select"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {applications.length === 0 && (
            <div className="p-10 text-center">
              <Bot className="mx-auto h-8 w-8 text-dim" />
              <p className="mt-3 text-sm text-dim">Queue is empty — add applications with a job URL to arm the agent.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
