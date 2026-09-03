"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileCheck2,
  Radar,
  Send,
  ShieldCheck,
  Target,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import StatusBadge from "@/components/ui/StatusBadge";
import UsagePanel from "@/components/UsagePanel";
import StatsPanel from "@/components/StatsPanel";
import { cn, scoreColor } from "@/lib/utils";
import { displayJobCompany, displayJobTitle } from "@/lib/jobDisplay";

interface AgentRun {
  run_id: string;
  label: string;
  kind: string;
  status: string;
  events: number;
  started: string;
}

interface AgentPulse {
  online: boolean | null;
  active: AgentRun[];
  latest: AgentRun | null;
}

export default function DashboardPage() {
  const { applications, emails } = useApp();
  const [agent, setAgent] = useState<AgentPulse>({ online: null, active: [], latest: null });

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch("/api/agent/activity?since=0", { cache: "no-store" });
        if (!response.ok) throw new Error(`Agent activity ${response.status}`);
        const payload = await response.json();
        if (!cancelled) {
          setAgent({
            online: true,
            active: payload.active_runs || [],
            latest: payload.runs?.[0] || null,
          });
        }
      } catch {
        if (!cancelled) {
          setAgent({ online: false, active: [], latest: null });
        }
      }
    };
    void poll();
    const timer = setInterval(poll, 5_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const counts = useMemo(() => ({
    wishlist: applications.filter((job) => job.status === "wishlist").length,
    applied: applications.filter((job) => job.status === "applied").length,
    interviews: applications.filter((job) => job.status === "interviewing").length,
    verifiedAgent: applications.filter((job) => job.autoApplyStatus === "applied").length,
    needsReview: applications.filter((job) => job.autoApplyStatus === "manual_required" || job.autoApplyStatus === "failed").length,
  }), [applications]);

  const scored = applications.filter((job) => typeof job.matchScore === "number");
  const bestMatches = [...scored]
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
    .slice(0, 4);
  const recent = [...applications]
    .sort((a, b) => (b.createdDate || "").localeCompare(a.createdDate || ""))
    .slice(0, 5);
  const attention = applications
    .filter((job) => job.autoApplyStatus === "failed" || job.autoApplyStatus === "manual_required" || (!job.url && job.status === "wishlist"))
    .slice(0, 4);

  const stages = [
    {
      label: "Discover",
      value: applications.length ? `${applications.length} tracked` : "No roles yet",
      detail: "Run selected job boards and inspect source evidence.",
      href: "/jobs",
      action: "Open discovery",
      icon: Radar,
      color: "var(--sky)",
    },
    {
      label: "Review",
      value: `${counts.wishlist} shortlisted`,
      detail: "Keep, skip, score, and compare before preparing documents.",
      href: "/tracker",
      action: "Review pipeline",
      icon: Target,
      color: "var(--amber)",
    },
    {
      label: "Prepare",
      value: `${applications.filter((job) => job.documents && Object.keys(job.documents).length > 0).length} document sets`,
      detail: "Tailor ATS documents from the evidence in your profile vault.",
      href: "/resume",
      action: "Open document studio",
      icon: FileCheck2,
      color: "var(--violet)",
    },
    {
      label: "Supervise",
      value: agent.active.length ? `${agent.active.length} active run${agent.active.length === 1 ? "" : "s"}` : `${counts.needsReview} need review`,
      detail: "Watch fields, clicks, screenshots, and confirmed outcomes.",
      href: "/agent",
      action: "Open agent control",
      icon: Bot,
      color: "var(--chartreuse)",
    },
  ];

  const sent = emails.filter((email) => email.direction === "sent").length;
  const received = emails.filter((email) => email.direction === "received").length;

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--ink-card)] p-7 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-[var(--chartreuse)]/8 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--chartreuse)]">
              <ShieldCheck className="h-4 w-4" /> Supervised job search
            </div>
            <h1 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight text-[var(--paper)] sm:text-4xl">Job search command deck</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-dim">One clear flow: discover roles, review the evidence, prepare truthful documents, and supervise every browser action.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/jobs" className="inline-flex items-center gap-2 rounded-xl bg-[var(--chartreuse)] px-4 py-2.5 text-sm font-bold text-[var(--ink)]"><Radar className="h-4 w-4" /> Find jobs</Link>
            <Link href="/agent" className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-semibold text-[var(--paper)] hover:bg-white/[0.03]"><Activity className="h-4 w-4" /> Watch agent</Link>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-[var(--paper)]">Your workflow</h2>
          <p className="mt-0.5 text-[11px] text-dim">Each stage has one purpose and one place to control it.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stages.map(({ label, value, detail, href, action, icon: Icon, color }, index) => (
            <Link key={label} href={href} className="group rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5 transition-colors hover:border-white/20">
              <div className="flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--line)] bg-white/[0.03]"><Icon className="h-4 w-4" style={{ color }} /></span>
                <span className="font-mono text-[10px] text-dim">0{index + 1}</span>
              </div>
              <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">{label}</p>
              <p className="mt-1 text-lg font-bold text-[var(--paper)]">{value}</p>
              <p className="mt-2 min-h-10 text-xs leading-relaxed text-dim">{detail}</p>
              <p className="mt-4 flex items-center gap-1 text-[11px] font-semibold" style={{ color }}>{action} <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" /></p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--paper)]"><Activity className="h-4 w-4 text-[var(--chartreuse)]" /> Live operations</h2>
              <p className="mt-1 text-[11px] text-dim">The same telemetry and history available in Auto-Apply.</p>
            </div>
            <span className={cn("rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold", agent.online === true ? "border-[var(--chartreuse)]/35 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]" : agent.online === false ? "border-[var(--coral)]/35 bg-[var(--coral)]/10 text-[var(--coral)]" : "border-[var(--line)] text-dim")}>
              {agent.online === null ? "checking" : agent.online ? "agent online" : "agent offline"}
            </span>
          </div>
          <div className="mt-4 rounded-xl border border-[var(--line)] bg-black/15 p-4">
            {agent.active.length > 0 ? (
              <div className="space-y-2">
                {agent.active.map((run) => (
                  <div key={run.run_id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-xs font-semibold text-[var(--paper)]">{run.label || run.kind}</p><p className="font-mono text-[10px] text-dim">{run.events} recorded events</p></div>
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--chartreuse)]" />
                  </div>
                ))}
              </div>
            ) : agent.latest ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-xs font-semibold text-[var(--paper)]">Last: {agent.latest.label || agent.latest.kind}</p><p className="font-mono text-[10px] text-dim">{agent.latest.started} · {agent.latest.events} events</p></div>
                <span className="rounded-full border border-[var(--line)] px-2 py-0.5 font-mono text-[9px] uppercase text-dim">{agent.latest.status}</span>
              </div>
            ) : <p className="text-xs text-dim">No recorded agent activity yet.</p>}
          </div>
          <Link href="/agent" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[var(--chartreuse)]">Open logs, screenshots, and run history <ArrowRight className="h-3 w-3" /></Link>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--paper)]"><CircleAlert className="h-4 w-4 text-[var(--amber)]" /> Needs attention</h2>
          <div className="mt-4 space-y-2">
            {attention.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--line)] p-5 text-center"><CheckCircle2 className="mx-auto h-5 w-5 text-[var(--chartreuse)]" /><p className="mt-2 text-xs text-dim">No failed or paused runs need review.</p></div>
            ) : attention.map((job) => (
              <Link key={job.id} href={job.autoApplyStatus ? "/agent" : "/tracker"} className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-black/10 p-3 hover:bg-white/[0.03]">
                <CircleAlert className="h-4 w-4 shrink-0 text-[var(--amber)]" />
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[var(--paper)]">{displayJobTitle(job)}</p><p className="truncate text-[10px] text-dim">{displayJobCompany(job)} · {job.autoApplyStatus === "failed" ? "run failed" : job.autoApplyStatus === "manual_required" ? "manual verification" : "missing URL"}</p></div>
                <ArrowRight className="h-3.5 w-3.5 text-dim" />
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--paper)]"><Target className="h-4 w-4 text-[var(--sky)]" /> Best matches</h2><Link href="/tracker" className="text-[11px] text-dim hover:text-[var(--paper)]">View tracker →</Link></div>
          <div className="space-y-2">
            {bestMatches.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--line)] p-7 text-center text-xs text-dim">Score tracked jobs to surface your strongest targets.</div> : bestMatches.map((job) => (
              <Link key={job.id} href="/tracker" className="flex items-center gap-4 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-4 hover:border-white/20">
                <span className="font-mono text-sm font-bold" style={{ color: scoreColor(job.matchScore || 0) }}>{job.matchScore}%</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[var(--paper)]">{displayJobTitle(job)}</p><p className="truncate text-xs text-dim">{displayJobCompany(job)} · {job.location}</p></div>
                <StatusBadge status={job.status} size="sm" />
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--paper)]"><Clock3 className="h-4 w-4 text-[var(--amber)]" /> Recent roles</h2>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-2">
            {recent.length === 0 ? <p className="p-6 text-center text-xs text-dim">No roles tracked yet.</p> : recent.map((job) => (
              <Link key={job.id} href="/tracker" className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/[0.03]">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-white/[0.03] text-xs font-bold text-dim">{displayJobCompany(job).charAt(0).toUpperCase()}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[var(--paper)]">{displayJobTitle(job)}</p><p className="truncate text-[10px] text-dim">{displayJobCompany(job)}</p></div>
                <span className="font-mono text-[9px] text-dim">{job.createdDate?.slice(5, 10)}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Applications sent", value: counts.applied, icon: Send, color: "var(--violet)" },
          { label: "Interviews", value: counts.interviews, icon: BriefcaseBusiness, color: "var(--amber)" },
          { label: "Verified agent submits", value: counts.verifiedAgent, icon: CheckCircle2, color: "var(--chartreuse)" },
          { label: "Outreach replies", value: received, icon: Activity, color: "var(--sky)", note: `${sent} sent` },
        ].map(({ label, value, icon: Icon, color, note }) => (
          <div key={label} className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-dim">{label}</span><Icon className="h-4 w-4" style={{ color }} /></div><p className="mt-2 font-mono text-2xl font-bold" style={{ color }}>{value}</p>{note && <p className="mt-0.5 text-[10px] text-dim">{note}</p>}</div>
        ))}
      </section>

      <StatsPanel />
      <UsagePanel />
    </div>
  );
}
