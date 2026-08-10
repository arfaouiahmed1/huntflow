"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, Coins, Loader2, TriangleAlert, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

interface UsageRecent {
  id: number;
  agent: string;
  kind: string;
  provider?: string;
  model?: string;
  status: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  costEst: number;
  error?: string;
  ts?: string;
}

interface UsageData {
  totals: { calls: number; tokens: number; errors: number; avgLatencyMs: number };
  totalCost: number;
  byProvider: Record<string, { calls: number; tokens: number; cost: number }>;
  recent: UsageRecent[];
}

export default function UsagePanel() {
  const [data, setData] = useState<UsageData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => !cancelled && setData(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--chartreuse)]" />
        <p className="text-xs text-dim">Reading the AI usage ledger…</p>
      </div>
    );
  }

  const provs = Object.entries(data.byProvider).sort((a, b) => b[1].cost - a[1].cost);

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">
          <BrainCircuit className="h-4 w-4 text-[var(--chartreuse)]" /> Brain Activity
        </p>
        <span className="font-mono text-[10px] text-dim">usage ledger</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--line)]/60 bg-white/[0.02] p-3">
          <p className="font-mono text-xl font-bold text-[var(--paper)]">{data.totals.calls}</p>
          <p className="mt-0.5 text-[10px] text-dim">calls</p>
        </div>
        <div className="rounded-xl border border-[var(--line)]/60 bg-white/[0.02] p-3">
          <p className="font-mono text-xl font-bold text-[var(--paper)]">{data.totals.tokens.toLocaleString()}</p>
          <p className="mt-0.5 text-[10px] text-dim">tokens</p>
        </div>
        <div className="rounded-xl border border-[var(--line)]/60 bg-white/[0.02] p-3">
          <p className="flex items-center gap-1 font-mono text-xl font-bold text-[var(--chartreuse)]">
            <Coins className="h-3.5 w-3.5" /> ${data.totalCost.toFixed(4)}
          </p>
          <p className="mt-0.5 text-[10px] text-dim">est. spend</p>
        </div>
        <div className="rounded-xl border border-[var(--line)]/60 bg-white/[0.02] p-3">
          <p className="flex items-center gap-1 font-mono text-xl font-bold text-[var(--amber)]">
            <Timer className="h-3.5 w-3.5" /> {data.totals.avgLatencyMs}ms
          </p>
          <p className="mt-0.5 text-[10px] text-dim">avg latency{data.totals.errors > 0 && ` · ${data.totals.errors} errors`}</p>
        </div>
      </div>

      {provs.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {provs.map(([id, p]) => (
            <div key={id} className="flex items-center gap-2 text-[11px]">
              <span className="w-24 truncate font-mono text-dim">{id}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <span
                  className="block h-full rounded-full bg-[var(--chartreuse)]/80"
                  style={{ width: `${Math.max(4, (p.calls / data.totals.calls) * 100)}%` }}
                />
              </span>
              <span className="w-20 text-right font-mono text-dim">
                {p.calls}c · ${p.cost.toFixed(4)}
              </span>
            </div>
          ))}
        </div>
      )}

      {data.recent.length > 0 && (
        <div className="mt-4 space-y-1">
          {data.recent.slice(0, 5).map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="flex min-w-0 items-center gap-1.5 text-dim">
                {e.status !== "ok" && <TriangleAlert className="h-3 w-3 shrink-0 text-[var(--coral)]" />}
                <span className="truncate font-mono">
                  {e.agent} · {e.provider ?? "?"}/{e.model ?? "?"}
                </span>
              </span>
              <span className={cn("shrink-0 font-mono", e.status !== "ok" ? "text-[var(--coral)]" : "text-dim/80")}>
                {e.promptTokens + e.completionTokens} tok · {e.latencyMs}ms · ${e.costEst.toFixed(4)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
