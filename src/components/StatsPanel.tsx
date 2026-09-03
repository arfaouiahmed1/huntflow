"use client";

import { useApp } from "@/context/AppContext";
import { BarChart3, TrendingUp, Clock3, CalendarCheck, Building2, Mail, Users } from "lucide-react";

export default function StatsPanel() {
  const { stats } = useApp();

  // Hide empty state entirely when no stats yet (DB empty or fetch failed) — no placeholder pile-up
  if (!stats) return null;
  const hasFunnel = stats.funnel.length > 0;
  const hasWeekly = stats.weekly.length > 0 && stats.weekly.some((w) => w.applied > 0 || w.interviews > 0);
  const hasTop = stats.topCompanies.length > 0;

  // If truly empty (no funnel, no top, no counts), hide rather than show zeroes
  if (!hasFunnel && !hasTop && stats.openPositions === 0 && stats.contactCount === 0) return null;

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5" data-testid="stats-panel">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">
          <BarChart3 className="h-4 w-4 text-[var(--chartreuse)]" /> Pipeline Analytics
        </p>
        <span className="font-mono text-[10px] text-dim">GET /api/data/stats · SQLite</span>
      </div>

      {hasFunnel && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {stats.funnel.map((f) => (
            <div key={f.status} className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">{f.status}</p>
              <p className="mt-1 font-mono text-xl font-bold text-[var(--paper)]">{f.count}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-dim"><TrendingUp className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> Response rate</p>
          <p className="mt-1 font-mono text-lg font-bold text-[var(--paper)]">{stats.responseRate.rate}%</p>
          <p className="text-[10px] text-dim">{stats.responseRate.replied}/{stats.responseRate.sent} replied</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-dim"><Clock3 className="h-3.5 w-3.5 text-[var(--amber)]" /> Overdue follow-ups</p>
          <p className="mt-1 font-mono text-lg font-bold text-[var(--amber)]">{stats.overdueFollowUps}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-dim"><CalendarCheck className="h-3.5 w-3.5 text-[var(--sky)]" /> Upcoming interviews</p>
          <p className="mt-1 font-mono text-lg font-bold text-[var(--sky)]">{stats.upcomingInterviews}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-dim"><Building2 className="h-3.5 w-3.5 text-[var(--paper)]" /> Open positions</p>
          <p className="mt-1 font-mono text-lg font-bold text-[var(--paper)]">{stats.openPositions}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {hasTop && (
          <div className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">Top companies</p>
            <div className="mt-2 space-y-1.5">
              {stats.topCompanies.map((c) => (
                <div key={c.company} className="flex items-center justify-between text-xs">
                  <span className="truncate font-semibold text-[var(--paper)]">{c.company}</span>
                  <span className="font-mono text-[11px] text-dim">{c.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {hasWeekly && (
          <div className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">Weekly activity (last 8w)</p>
            <div className="mt-2 flex items-end gap-1">
              {stats.weekly.map((w) => {
                const max = Math.max(1, ...stats.weekly.map((x) => Math.max(x.applied, x.interviews)));
                return (
                  <div key={w.week} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full gap-0.5 items-end justify-center" style={{ height: 32 }}>
                      <span className="w-1.5 rounded-full bg-[var(--chartreuse)]/70" style={{ height: `${(w.applied / max) * 32}px` }} title={`${w.applied} applied`} />
                      <span className="w-1.5 rounded-full bg-[var(--sky)]/70" style={{ height: `${(w.interviews / max) * 32}px` }} title={`${w.interviews} interviews`} />
                    </div>
                    <span className="font-mono text-[8px] text-dim">{w.week.slice(5)}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-1 flex items-center gap-3 text-[9px] text-dim"><span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[var(--chartreuse)]" /> applied</span><span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[var(--sky)]" /> interviews</span></p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-dim">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.02] px-2.5 py-1"><Users className="h-3 w-3" /> {stats.contactCount} contacts</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.02] px-2.5 py-1"><Mail className="h-3 w-3" /> {stats.responseRate.sent} sent</span>
      </div>
    </section>
  );
}
