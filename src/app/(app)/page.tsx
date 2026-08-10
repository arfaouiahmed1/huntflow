"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Crosshair,
  ArrowUpRight,
  Bot,
  Target,
  Layers,
  FileText,
  Clock,
  TrendingUp,
  Flame,
  Briefcase,
  Send,
  BrainCircuit,
  Sparkles,
  TrendingDown,
  Check,
  Reply,
  CalendarCheck,
  Trophy,
  Timer,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/ui/Toaster";
import { toErrorMessage } from "@/lib/errors";
import { scoreColor, cn } from "@/lib/utils";
import { palette, tint } from "@/lib/theme";
import StatusBadge from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import UsagePanel from "@/components/UsagePanel";

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function StatCard({
  label,
  value,
  color,
  icon: Icon,
  total,
}: {
  label: string;
  value: number;
  color: string;
  icon: typeof Flame;
  total: number;
}) {
  const animated = useCountUp(value);
  return (
    <div className="card group relative overflow-hidden p-5">
      <div
        className="absolute inset-x-0 top-0 h-px opacity-60 transition-opacity group-hover:opacity-100"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" style={{ color }} />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">{label}</span>
      </div>
      <p className="mt-3 font-mono text-3xl font-bold tabular-nums" style={{ color }}>
        {String(animated).padStart(2, "0")}
      </p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.05]">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${total ? (value / total) * 100 : 0}%` }}
          transition={{ duration: 0.8, delay: 0.2 }}
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { applications, emails, profile, generateGlobalInsights, insights, loadingInsights } = useApp();
  const { error: errToast } = useToast();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  const counts = {
    wishlist: applications.filter((a) => a.status === "wishlist").length,
    applied: applications.filter((a) => a.status === "applied").length,
    interviewing: applications.filter((a) => a.status === "interviewing").length,
    offer: applications.filter((a) => a.status === "offer").length,
    rejected: applications.filter((a) => a.status === "rejected").length,
    autoApplied: applications.filter((a) => a.autoApplyStatus === "applied").length,
  };

  const sentEmails = emails.filter((e) => e.direction === "sent");
  const receivedEmails = emails.filter((e) => e.direction === "received");
  const everApplied = counts.applied + counts.interviewing + counts.offer + counts.rejected;

  const replyRate = sentEmails.length ? Math.round((receivedEmails.length / sentEmails.length) * 100) : 0;
  const interviewRate = everApplied ? Math.round(((counts.interviewing + counts.offer) / everApplied) * 100) : 0;
  const offerRate = everApplied ? Math.round((counts.offer / everApplied) * 100) : 0;

  const avgReplyDays = useMemo(() => {
    const delays: number[] = [];
    for (const r of receivedEmails) {
      const prior = sentEmails
        .filter((e) => e.jobId && e.jobId === r.jobId && e.sentAt < r.sentAt)
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
      if (prior) delays.push(new Date(r.sentAt).getTime() - new Date(prior.sentAt).getTime());
    }
    return delays.length ? delays.reduce((s, d) => s + d, 0) / delays.length / 86400000 : null;
  }, [receivedEmails, sentEmails]);

  const kpis = [
    {
      label: "Reply rate",
      value: `${replyRate}%`,
      sub: `${receivedEmails.length} replies · ${sentEmails.length} sent`,
      color: "var(--chartreuse)",
      icon: Reply,
    },
    {
      label: "Interview rate",
      value: `${interviewRate}%`,
      sub: `${everApplied} applications in flight`,
      color: "var(--amber)",
      icon: CalendarCheck,
    },
    {
      label: "Offer rate",
      value: `${offerRate}%`,
      sub: `${counts.offer} offers secured`,
      color: palette.sky,
      icon: Trophy,
    },
    {
      label: "Avg time to reply",
      value: avgReplyDays !== null ? `${avgReplyDays.toFixed(1)}d` : "—",
      sub: avgReplyDays !== null ? "sent → first reply" : "send an email to start tracking",
      color: "var(--violet)",
      icon: Timer,
    },
  ];

  const withScore = applications.filter((a) => typeof a.matchScore === "number");
  const avgScore = withScore.length
    ? Math.round(withScore.reduce((s, a) => s + (a.matchScore || 0), 0) / withScore.length)
    : 0;

  const cards = [
    { label: "Wishlist", value: counts.wishlist, color: palette.sky, icon: Flame },
    { label: "Applied", value: counts.applied, color: palette.violet, icon: Send },
    { label: "Interviewing", value: counts.interviewing, color: palette.amber, icon: TrendingUp },
    { label: "Offers", value: counts.offer, color: palette.chartreuse, icon: Briefcase },
  ];

  const topMatches = [...applications]
    .filter((a) => typeof a.matchScore === "number")
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
    .slice(0, 3);

  const recentActivity = [...applications]
    .sort((a, b) => (b.createdDate || "").localeCompare(a.createdDate || ""))
    .slice(0, 5);

  const onboarding = [
    {
      icon: Crosshair,
      done: counts.wishlist > 0,
      title: "Track a job",
      desc: "Paste a URL or add details manually in the tracker.",
      href: "/tracker",
      cta: "Track a job",
    },
    {
      icon: FileText,
      done: applications.some((a) => a.documents && Object.keys(a.documents).length > 0),
      title: "Tailor your documents",
      desc: "Open any job and let the AI rewrite your CV & cover letter.",
      href: "/tracker",
      cta: "Open tracker",
    },
    {
      icon: Bot,
      done: counts.autoApplied > 0 || counts.applied > 0,
      title: "Deploy the agent",
      desc: "Match-check and auto-apply from the agent command center.",
      href: "/agent",
      cta: "Dispatch agent",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-gradient-to-br from-[var(--ink-card)] via-[var(--ink)] to-[var(--ink)] p-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(color-mix(in srgb, var(--paper) 40%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--paper) 40%, transparent) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <motion.div
          animate={{ y: [0, -14, 0], x: [0, 6, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[var(--chartreuse)]/10 blur-3xl"
        />
        <motion.div
          animate={{ y: [0, 12, 0], x: [0, -8, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute -bottom-32 right-40 h-64 w-64 rounded-full bg-[var(--sky)]/10 blur-3xl"
        />

        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse-dot rounded-full bg-[var(--chartreuse)]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--chartreuse)]">
              Command deck online
            </span>
          </div>
          <h1 className="mt-4 max-w-xl font-display text-3xl font-bold leading-tight tracking-tight text-[var(--paper)] sm:text-4xl" suppressHydrationWarning>
            Good hunting, <span className="laser-text">{mounted ? (profile.name.split(" ")[0] || "operator") : "operator"}</span>.
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-dim" suppressHydrationWarning>
            {mounted ? applications.length : 0} opportunities tracked · {mounted ? counts.autoApplied : 0} auto-applied by the Scrapling agent · average match{" "}
            <span className="font-mono font-bold" style={{ color: scoreColor(avgScore) }}>{mounted ? avgScore : 0}%</span>.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={applications.length ? "/tracker" : "/tracker?add=1"}
              className="group inline-flex items-center gap-2 rounded-xl bg-chartreuse px-5 py-3 text-sm font-bold text-ink shadow-[var(--glow)] transition-all hover:bg-chartreuse-bright hover:shadow-[var(--glow-strong)] active:scale-[0.97]"
            >
              <Crosshair className="h-4 w-4 transition-transform group-hover:rotate-90" /> {applications.length ? "Track a new job" : "Track your first job"}
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              href="/agent"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-5 py-3 text-sm font-semibold text-[var(--paper)] transition-colors hover:border-[var(--chartreuse)]/40 hover:bg-white/[0.03]"
            >
              <Bot className="h-4 w-4 text-[var(--chartreuse)]" /> Dispatch Agent
            </Link>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <StatCard key={card.label} {...card} total={applications.length} />
        ))}
      </div>

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, sub, color, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">{label}</p>
              <Icon className="h-4 w-4" style={{ color }} />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums" style={{ color }} suppressHydrationWarning>
              {mounted ? value : "0%"}
            </p>
            <p className="mt-1 text-[11px] text-dim" suppressHydrationWarning>
              {mounted ? sub : "..."}
            </p>
          </div>
        ))}
      </div>

      {/* Needs attention */}
      <NeedsAttentionRow />

      {/* Brain activity — AI usage ledger */}
      <UsagePanel />

      {/* Onboarding — first-run path */}
      {applications.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="rounded-3xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-8"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--chartreuse)]">
            System ready — awaiting first target
          </p>
          <h2 className="mt-3 max-w-xl font-display text-xl font-bold tracking-tight text-[var(--paper)]">
            Three steps between you and your next role.
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {onboarding.map(({ icon: Icon, done, title, desc, href, cta }, i) => (
              <Link key={title} href={href} className="group">
                <div
                  className="card relative h-full p-5"
                  style={{ animationDelay: `${0.2 + i * 0.08}s` }}
                >
                  <div className="flex items-start justify-between">
                    <div
                      className={cn(
                        "grid h-10 w-10 place-items-center rounded-xl border transition-colors",
                        done
                          ? "border-[var(--chartreuse)]/50 bg-[var(--chartreuse)]/15"
                          : "border-[var(--line)] bg-white/[0.03] group-hover:border-[var(--chartreuse)]/40"
                      )}
                    >
                      {done ? (
                        <Check className="h-5 w-5 text-[var(--chartreuse)]" />
                      ) : (
                        <Icon className="h-5 w-5 text-[var(--chartreuse)]" />
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-dim">{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <h3 className="mt-4 font-display text-sm font-semibold text-[var(--paper)]">
                    {done ? <span className="text-[var(--chartreuse)]">✓</span> : ""} {title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-dim">{desc}</p>
                  <p className="mt-4 text-[11px] font-bold text-[var(--chartreuse)] opacity-0 transition-opacity group-hover:opacity-100">
                    {cta} →
                  </p>
                </div>
              </Link>
            ))}
          </div>
          <p className="mt-6 text-xs leading-relaxed text-dim">
            Tip: open the <span className="font-mono text-[var(--chartreuse)]">LinkedIn Jobs</span> panel on the tracker page to pull offers straight from your LinkedIn session.
          </p>
        </motion.div>
      ) : (
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* Top matches */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-[var(--paper)]">
              <Target className="h-4 w-4 text-[var(--chartreuse)]" /> Best-Fit Targets
            </h2>
            <Link href="/tracker" className="text-xs text-dim transition-colors hover:text-[var(--chartreuse)]">
              View all →
            </Link>
          </div>
          <div className="space-y-3">
            {topMatches.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[var(--line)] p-8 text-center text-sm text-dim">
                Run match analysis on a job to see best-fit targets here.
              </div>
            )}
            {topMatches.map((job) => (
              <Link key={job.id} href="/tracker">
                <motion.div
                  whileHover={{ x: 4 }}
                  className="flex items-center gap-4 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-4 transition-colors hover:border-[var(--chartreuse)]/40"
                >
                  <div className="font-mono text-sm font-bold" style={{ color: scoreColor(job.matchScore || 0) }}>
                    {job.matchScore}%
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--paper)]">{job.title}</p>
                    <p className="truncate text-xs text-dim">{job.company} · {job.location}</p>
                  </div>
                  <StatusBadge status={job.status} size="sm" />
                </motion.div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-[var(--paper)]">
              <Clock className="h-4 w-4 text-[var(--amber)]" /> Recent Additions
            </h2>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-2">
            {recentActivity.map((job) => (
              <Link key={job.id} href="/tracker">
                <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.03]">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-white/[0.03] font-mono text-[10px] text-dim">
                    {job.company.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-[var(--paper)]">{job.title}</p>
                    <p className="truncate text-[10px] text-dim">{job.company} · {job.location}</p>
                  </div>
                  <span className="font-mono text-[10px] text-dim">{job.createdDate?.slice(5)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* Quick modules */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: FileText, title: "Tailored Documents", desc: "CV, cover letters & motivation letters rewritten by Gemini for each role.", href: "/tracker" },
          { icon: Layers, title: "STAR Interview Prep", desc: "Flip flashcards engineered from each job description.", href: "/tracker" },
          { icon: Bot, title: "Auto-Apply Agent", desc: "Let Scrapling fill and submit applications while you sleep.", href: "/agent" },
        ].map(({ icon: Icon, title, desc, href }) => (
          <Link key={title} href={href}>
            <motion.div
              whileHover={{ y: -3 }}
              className="group rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5 transition-colors hover:border-[var(--chartreuse)]/40"
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10">
                <Icon className="h-5 w-5 text-[var(--chartreuse)]" />
              </div>
              <h3 className="mt-4 font-display text-sm font-semibold text-[var(--paper)]">{title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-dim">{desc}</p>
            </motion.div>
          </Link>
        ))}
      </div>

      {/* Analytics */}
      <AnalyticsRow />

      {/* AI Intelligence */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-[var(--paper)]">
            <BrainCircuit className="h-4 w-4 text-[var(--violet)]" /> Command Intelligence
          </h2>
          {!insights && (
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await generateGlobalInsights();
                } catch (e) {
                  errToast(toErrorMessage(e));
                }
              }}
              loading={loadingInsights}
            >
              <Sparkles className="h-3.5 w-3.5" /> {loadingInsights ? "Synthesizing…" : "Generate Insights"}
            </Button>
          )}
        </div>

        {!insights && !loadingInsights && (
          <div className="rounded-2xl border border-dashed border-[var(--line)] p-8 text-center">
            <BrainCircuit className="mx-auto mb-3 h-8 w-8 text-[var(--violet)]" />
            <h3 className="font-display text-sm font-semibold">The war-room analysis</h3>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-dim">
              Cross-role recommendations, a skill roadmap to fill your gaps, and a full pipeline report — synthesized from every application you track.
            </p>
          </div>
        )}

        {insights && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Recommendations */}
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
                <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--chartreuse)]">
                  <Target className="h-3.5 w-3.5" /> Next Moves
                </p>
                <ul className="space-y-2.5">
                  {insights.recommendations.map((r, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[var(--chartreuse)]/15 font-mono text-[10px] font-bold text-[var(--chartreuse)]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-[var(--paper)]">
                          {r.title}
                          {typeof r.matchProbability === "number" && (
                            <span className="ml-2 font-mono text-[10px] text-[var(--chartreuse)]">{r.matchProbability}% fit</span>
                          )}
                        </p>
                        {r.companyArchetype && <p className="mt-0.5 text-[11px] text-dim">{r.companyArchetype}</p>}
                        <p className="mt-0.5 text-[11px] leading-relaxed text-dim">{r.why}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Skill roadmap */}
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
                <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--sky)]">
                  <TrendingUp className="h-3.5 w-3.5" /> Skill Roadmap
                </p>
                <div className="space-y-2.5">
                  {insights.roadmap.map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-wider text-dim">
                        {item.priority}
                      </span>
                      <span className="rounded-full border border-[var(--sky)]/25 bg-[var(--sky)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--sky)]">
                        {item.skill}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-[11px] text-dim" title={item.why}>{item.why}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Pipeline report */}
            <div className="rounded-2xl border border-[var(--chartreuse)]/25 bg-gradient-to-br from-[var(--chartreuse)]/10 to-transparent p-5">
              <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--chartreuse)]">
                <TrendingDown className="h-3.5 w-3.5" /> Pipeline Report
              </p>
              <p className="text-sm leading-relaxed text-[var(--paper)]/90">{insights.report.headline}</p>
              {insights.report.highlights.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {insights.report.highlights.map((h, i) => (
                    <li key={i} className="flex gap-2 text-xs text-[var(--chartreuse)]">
                      <span className="font-mono">✓</span> {h}
                    </li>
                  ))}
                </ul>
              )}
              {insights.report.risks.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {insights.report.risks.map((r, i) => (
                    <li key={i} className="flex gap-2 text-xs text-[var(--amber)]">
                      <span className="font-mono">⚠</span> {r}
                    </li>
                  ))}
                </ul>
              )}
              {insights.report.actions.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {insights.report.actions.map((a, i) => (
                    <li key={i} className="flex gap-2 text-xs text-[var(--paper)]/85">
                      <span className="font-mono">→</span> {a}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 * Needs attention — overdue follow-ups, upcoming interviews, recent replies
 * ---------------------------------------------------------------------- */

function NeedsAttentionRow() {
  const { applications, interviews, emails, contacts } = useApp();
  const [now, setNow] = useState<number>(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setNow(Date.now());
      setMounted(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted) return null;

  const today = new Date(now).toISOString().slice(0, 10);
  const in3 = new Date(now + 3 * 86400000).toISOString().slice(0, 10);
  const in7 = new Date(now + 7 * 86400000).toISOString();

  const overdueFollowUps = applications
    .filter((a) => a.followUpDue && a.followUpDue <= today && a.status !== "offer" && a.status !== "rejected")
    .sort((a, b) => (a.followUpDue || "").localeCompare(b.followUpDue || ""));

  const soonFollowUps = applications
    .filter((a) => a.followUpDue && a.followUpDue > today && a.followUpDue <= in3)
    .sort((a, b) => (a.followUpDue || "").localeCompare(b.followUpDue || ""));

  const upcomingInterviews = interviews
    .filter((i) => i.status === "scheduled" && i.scheduledAt <= in7 && i.scheduledAt >= new Date().toISOString())
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .slice(0, 3);

  const unreadReplies = emails.filter((e) => e.direction === "received" && !e.read);
  const recentReplies = emails.filter((e) => e.direction === "received").slice(0, 3);
  const totalAttention = overdueFollowUps.length + soonFollowUps.length + upcomingInterviews.length + unreadReplies.length;

  if (totalAttention === 0) return null;

  return (
    <div className="rounded-2xl border border-[var(--amber)]/25 bg-[var(--ink-card)]/70 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-[var(--paper)]">
          <Flame className="h-4 w-4 text-[var(--amber)]" /> Needs Attention
          <span className="rounded-full border border-[var(--amber)]/40 bg-[var(--amber)]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--amber)]">
            {totalAttention}
          </span>
        </h2>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {/* Follow-ups */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
            Follow-ups {overdueFollowUps.length > 0 && <span className="text-[var(--coral)]">— {overdueFollowUps.length} overdue</span>}
          </p>
          <div className="space-y-2">
            {overdueFollowUps.slice(0, 3).map((j) => (
              <Link key={j.id} href={`/tracker?open=${j.id}`} className="block rounded-xl border border-[var(--coral)]/25 bg-[var(--coral)]/5 px-3 py-2.5 transition-colors hover:border-[var(--coral)]/50">
                <p className="truncate text-xs font-semibold text-[var(--paper)]">{j.company}</p>
                <p className="mt-0.5 flex items-center justify-between text-[10px] text-dim">
                  <span className="truncate">{j.title}</span>
                  <span className="ml-2 shrink-0 font-mono text-[var(--coral)]">{j.followUpDue?.slice(5)}</span>
                </p>
              </Link>
            ))}
            {soonFollowUps.slice(0, 2).map((j) => (
              <Link key={j.id} href={`/tracker?open=${j.id}`} className="block rounded-xl border border-[var(--line)] bg-white/[0.02] px-3 py-2.5 transition-colors hover:border-[var(--amber)]/50">
                <p className="truncate text-xs font-semibold text-[var(--paper)]">{j.company}</p>
                <p className="mt-0.5 flex items-center justify-between text-[10px] text-dim">
                  <span className="truncate">{j.title}</span>
                  <span className="ml-2 shrink-0 font-mono text-[var(--amber)]">{j.followUpDue?.slice(5)}</span>
                </p>
              </Link>
            ))}
            {overdueFollowUps.length + soonFollowUps.length === 0 && (
              <p className="rounded-xl border border-dashed border-[var(--line)] px-3 py-4 text-center text-[11px] text-dim">
                All follow-ups handled.
              </p>
            )}
          </div>
        </div>

        {/* Interviews */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Interviews this week</p>
          <div className="space-y-2">
            {upcomingInterviews.map((i) => {
              const job = applications.find((j) => j.id === i.jobId);
              return (
                <Link key={i.id} href="/interviews" className="block rounded-xl border border-[var(--chartreuse)]/25 bg-[var(--chartreuse)]/5 px-3 py-2.5 transition-colors hover:border-[var(--chartreuse)]/50">
                  <p className="truncate text-xs font-semibold text-[var(--paper)]">{i.title}</p>
                  <p className="mt-0.5 flex items-center justify-between text-[10px] text-dim">
                    <span className="truncate">{job?.company || "—"}</span>
                    <span className="ml-2 shrink-0 font-mono text-[var(--chartreuse)]">
                      {new Date(i.scheduledAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {new Date(i.scheduledAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </p>
                </Link>
              );
            })}
            {upcomingInterviews.length === 0 && (
              <p className="rounded-xl border border-dashed border-[var(--line)] px-3 py-4 text-center text-[11px] text-dim">
                No interviews in the next 7 days.
              </p>
            )}
          </div>
        </div>

        {/* Replies */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
            Replies {unreadReplies.length > 0 && <span className="text-[var(--sky)]">— {unreadReplies.length} new</span>}
          </p>
          <div className="space-y-2">
            {recentReplies.map((e) => {
              const job = applications.find((j) => j.id === e.jobId);
              const c = contacts.find((x) => x.id === e.contactId);
              return (
                <Link key={e.id} href="/outreach" className="block rounded-xl border border-[var(--line)] bg-white/[0.02] px-3 py-2.5 transition-colors hover:border-[var(--sky)]/50">
                  <p className="truncate text-xs font-semibold text-[var(--paper)]">{e.subject}</p>
                  <p className="mt-0.5 flex items-center justify-between text-[10px] text-dim">
                    <span className="truncate">{c?.name || job?.company || "Inbox"}</span>
                    <span className="ml-2 shrink-0 font-mono text-[var(--sky)]">{new Date(e.sentAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  </p>
                </Link>
              );
            })}
            {recentReplies.length === 0 && (
              <p className="rounded-xl border border-dashed border-[var(--line)] px-3 py-4 text-center text-[11px] text-dim">
                Sync your inbox to surface replies here.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 * Analytics — funnel, weekly velocity, response rate
 * ---------------------------------------------------------------------- */

function AnalyticsRow() {
  const { stats, contacts } = useApp();

  const order: { key: string; label: string; color: string }[] = [
    { key: "wishlist", label: "Wishlist", color: palette.sky },
    { key: "applied", label: "Applied", color: palette.violet },
    { key: "interviewing", label: "Interviewing", color: palette.amber },
    { key: "offer", label: "Offer", color: palette.chartreuse },
  ];

  const funnelTotal = stats ? order.reduce((s, o) => s + (stats.funnel.find((f) => f.status === o.key)?.count ?? 0), 0) : 0;
  const maxWeek = stats ? Math.max(1, ...stats.weekly.map((w) => w.applied)) : 1;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      {/* Funnel */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
        <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">Pipeline funnel</p>
        <div className="flex h-10 w-full overflow-hidden rounded-xl border border-[var(--line)]/60">
          {order.map(({ key, label, color }) => {
            const count = stats?.funnel.find((f) => f.status === key)?.count ?? 0;
            if (!count) return null;
            return (
              <motion.div
                key={key}
                initial={{ width: 0 }}
                animate={{ width: `${funnelTotal ? (count / funnelTotal) * 100 : 0}%` }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="flex items-center justify-center gap-1 overflow-hidden"
                style={{ background: tint(color, 0.15), borderRight: "1px solid var(--line)" }}
                title={`${label}: ${count}`}
              >
                <span className="hidden font-mono text-[11px] font-bold sm:block" style={{ color }}>{count}</span>
              </motion.div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          {order.map(({ key, label, color }) => (
            <span key={key} className="flex items-center gap-1.5 text-[10px] text-dim">
              <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
              {label} <span className="font-mono text-[var(--paper)]">{stats?.funnel.find((f) => f.status === key)?.count ?? 0}</span>
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--line)]/50 pt-2.5 text-[10px] text-dim">
          {(() => {
            const conv = (from: string, to: string) => {
              const f = stats?.funnel.find((x) => x.status === from)?.count ?? 0;
              const t = stats?.funnel.find((x) => x.status === to)?.count ?? 0;
              return f > 0 ? `${Math.round((t / f) * 100)}%` : "—";
            };
            return (
              <>
                <span>wishlist → applied <span className="font-mono font-bold text-[var(--chartreuse)]">{conv("wishlist", "applied")}</span></span>
                <span>applied → interviewing <span className="font-mono font-bold text-[var(--chartreuse)]">{conv("applied", "interviewing")}</span></span>
                <span>interviewing → offer <span className="font-mono font-bold text-[var(--chartreuse)]">{conv("interviewing", "offer")}</span></span>
              </>
            );
          })()}
        </div>
      </div>

      <div className="space-y-4">
        {/* Weekly velocity */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">
            Applications / week <span className="ml-1 text-[var(--chartreuse)]">(8 wks)</span>
          </p>
          <div className="flex h-20 items-end gap-1.5">
            {stats?.weekly.map((w) => (
              <motion.div
                key={w.week}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(w.applied > 0 ? 12 : 3, (w.applied / maxWeek) * 100)}%` }}
                transition={{ duration: 0.5 }}
                className="flex-1 rounded-t-md"
                style={{ background: w.applied > 0 ? `linear-gradient(180deg, ${palette.chartreuse}, ${tint(palette.chartreuse, 0.25)})` : tint(palette.paper, 0.06) }}
                title={`${w.week}: ${w.applied} applied`}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[9px] text-dim/70">
            <span>{stats?.weekly[0]?.week?.slice(5)}</span>
            <span>{stats?.weekly[stats.weekly.length - 1]?.week?.slice(5)}</span>
          </div>
        </div>

        {/* Response + network */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-4">
            <p className="font-mono text-xl font-bold text-[var(--chartreuse)]">{stats?.responseRate.rate ?? 0}%</p>
            <p className="mt-0.5 text-[10px] text-dim">reply rate</p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-4">
            <p className="font-mono text-xl font-bold text-[var(--sky)]">{stats?.contactCount ?? contacts.length}</p>
            <p className="mt-0.5 text-[10px] text-dim">contacts</p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-4">
            <p className="font-mono text-xl font-bold text-[var(--amber)]">{stats?.upcomingInterviews ?? 0}</p>
            <p className="mt-0.5 text-[10px] text-dim">interviews</p>
          </div>
        </div>
      </div>
    </div>
  );
}
