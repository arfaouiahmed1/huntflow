"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Cpu,
  ShieldCheck,
  Radar,
  Terminal,
  Zap,
  Gauge,
  Send,
  Search,
  ArrowDown,
  Scale,
  FileSignature,
  MousePointerClick,
  BadgeCheck,
  Workflow,
  WifiOff,
  Activity,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { palette, tint } from "@/lib/theme";
import StatusBadge from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toaster";
import AgentLiveConsole from "@/components/AgentLiveConsole";
import MemoryFeed from "@/components/MemoryFeed";
import { cn } from "@/lib/utils";

type HealthState = "checking" | "online" | "offline";

const PIPELINE = [
  { key: "companyIntel", label: "1. Intel & ATS", icon: Search, desc: "ATS vendor detection & culture research" },
  { key: "regionalNorms", label: "2. Regional Rules", icon: Scale, desc: "Global standards & layout constraints" },
  { key: "piiSanitizer", label: "3. PII Guard", icon: ShieldCheck, desc: "Scrub sensitive fields & GDPR compliance" },
  { key: "resumeCVTailor", label: "4. Resume Tailor", icon: FileSignature, desc: "STAR bullet tailoring & LaTeX compilation" },
  { key: "letterTailor", label: "5. Letter Tailor", icon: FileSignature, desc: "Cover / Motivation letter drafting" },
  { key: "interviewPrep", label: "6. STAR Prep", icon: Radar, desc: "Behavioral flashcards & technical prep" },
  { key: "salaryIntel", label: "7. Salary Intel", icon: Gauge, desc: "Regional compensation & negotiation range" },
  { key: "outreachEmail", label: "8. Recruiter Outreach", icon: Send, desc: "Draft cold LinkedIn & follow-up notes" },
  { key: "atsAudit", label: "9. ATS Audit", icon: BadgeCheck, desc: "Simulated parsing & keyword density check" },
  { key: "autoApplyExecution", label: "10. Scrapling Driver", icon: MousePointerClick, desc: "Live form prefill & browser automation" },
  { key: "orchestratorGate", label: "11. Quality Gate", icon: BadgeCheck, desc: "Terminal verification & proof logging" },
] as const;

export default function AgentPage() {
  const { applications, triggerAutoApply, llmSettings } = useApp();
  const { success, error: errToast, warn, celebrate } = useToast();
  const [runningId, setRunningId] = useState<string | null>(null);
  const [submit, setSubmit] = useState(false);
  const [minMatch, setMinMatch] = useState(60);
  const [health, setHealth] = useState<HealthState>("checking");
  const [step, setStep] = useState<number>(-1);

  const autoApplied = applications.filter((a) => a.autoApplyStatus === "applied");
  const queued = applications.filter((a) => a.autoApplyStatus === "queued" || a.autoApplyStatus === "processing");
  const ready = applications.filter((a) => !a.autoApplyStatus || a.autoApplyStatus === "idle" || a.autoApplyStatus === "failed" || a.autoApplyStatus === "manual_required");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/agent/health", { signal: controller.signal })
      .then((r) => setHealth(r.ok ? "online" : "offline"))
      .catch(() => setHealth("offline"));
    return () => controller.abort();
  }, []);

  const run = async (id: string) => {
    if (runningId) return;
    setRunningId(id);
    setStep(0);
    try {
      const result = await triggerAutoApply(id, { submit, minMatch });
      if (result.status === "applied") {
        success(`Application submitted for ${applications.find((a) => a.id === id)?.title}.`);
        celebrate();
      } else if (result.status === "skipped") {
        warn(`Match gate: ${result.matchScore}% < ${minMatch}% — pipeline held fire.`);
      } else if (result.status === "manual_required") {
        warn("Form filled — paused before submit. Finish it in the browser.");
      }
    } catch (e) {
      errToast(e instanceof Error ? e.message : "Pipeline failed.");
    } finally {
      setRunningId(null);
      setStep(-1);
    }
  };

  const queueAll = async () => {
    for (const job of applications.filter((a) => a.url && a.autoApplyStatus !== "applied")) {
      await run(job.id);
    }
  };

  const stats = [
    { label: "Auto-Applied", value: autoApplied.length, color: palette.chartreuse, icon: CheckCircle2 },
    { label: "In Queue", value: queued.length, color: palette.amber, icon: Gauge },
    { label: "Awaiting URL", value: applications.filter((a) => !a.url).length, color: palette.sky, icon: Radar },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--chartreuse)]">/agent</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--paper)]">Auto-Apply Command Center</h1>
          <p className="mt-1 text-sm text-dim">
            A LangGraph pipeline drives Scrapling to analyze, fill, submit, and verify — your hands stay clean.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold",
              health === "online"
                ? "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                : health === "checking"
                ? "border-[var(--line)] text-dim"
                : "border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)]"
            )}
          >
            {health === "online" ? (
              <><Activity className="h-3.5 w-3.5" /> Scrapling agent online</>
            ) : health === "checking" ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Probing port 8001…</>
            ) : (
              <><WifiOff className="h-3.5 w-3.5" /> Agent offline — start it</>
            )}
          </span>
          <Button onClick={queueAll} disabled={queued.length > 0 || runningId !== null}>
            <Zap className="h-4 w-4" /> Run All Pipelines
          </Button>
        </div>
      </div>

      {/* Live activity — what the agent is doing right now */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
        <AgentLiveConsole />
      </section>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
            <Icon className="h-5 w-5" style={{ color }} />
            <p className="mt-3 font-mono text-3xl font-bold tabular-nums" style={{ color }}>
              {String(value).padStart(2, "0")}
            </p>
            <p className="mt-1 text-xs text-dim">{label}</p>
          </div>
        ))}
      </div>

      {/* LangGraph pipeline */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
        <p className="mb-5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">
          <Workflow className="h-4 w-4 text-[var(--chartreuse)]" /> LangGraph State Machine — {runningId ? "running" : "armed"}
        </p>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          {PIPELINE.map(({ key, label, icon: Icon, desc }, i) => (
            <div key={key} className="flex flex-1 items-center gap-2">
              <motion.div
                animate={
                  runningId
                    ? step === i
                      ? { scale: 1.06, borderColor: "var(--chartreuse)", boxShadow: `0 0 24px ${tint(palette.chartreuse, 0.25)}` }
                      : step > i
                      ? { opacity: 1 }
                      : { opacity: 0.5 }
                    : {}
                }
                className={cn(
                  "flex w-full flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors",
                  runningId && step === i
                    ? "border-[var(--chartreuse)]/60 bg-[var(--chartreuse)]/10"
                    : runningId && step > i
                    ? "border-[var(--chartreuse)]/25 bg-[var(--chartreuse)]/5"
                    : "border-[var(--line)] bg-white/[0.02]"
                )}
              >
                {runningId && step === i ? (
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--chartreuse)]" />
                ) : runningId && step > i ? (
                  <CheckCircle2 className="h-5 w-5 text-[var(--chartreuse)]" />
                ) : (
                  <Icon className="h-5 w-5 text-dim" />
                )}
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">0{i + 1}</p>
                  <p className="text-xs font-bold text-[var(--paper)]">{label}</p>
                  <p className="mt-0.5 text-[10px] leading-tight text-dim">{desc}</p>
                </div>
              </motion.div>
              {i < PIPELINE.length - 1 && <ArrowDown className="mx-auto h-4 w-4 shrink-0 text-dim md:rotate-[-90deg]" />}
            </div>
          ))}
        </div>
      </div>

      {/* Dispatch config */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">Dispatch Mode</p>
          <div className="space-y-2.5">
            <button
              onClick={() => setSubmit(false)}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border p-3.5 text-left transition-colors",
                !submit ? "border-[var(--sky)]/40 bg-[var(--sky)]/10" : "border-[var(--line)] hover:border-[var(--line)]/60"
              )}
            >
              <div>
                <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--paper)]">
                  <MousePointerClick className="h-3.5 w-3.5 text-[var(--sky)]" /> Review mode
                </p>
                <p className="mt-0.5 text-[10px] text-dim">Agent fills everything; you click submit in the browser.</p>
              </div>
              {!submit && <CheckCircle2 className="h-4 w-4 text-[var(--sky)]" />}
            </button>
            <button
              onClick={() => setSubmit(true)}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border p-3.5 text-left transition-colors",
                submit ? "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10" : "border-[var(--line)] hover:border-[var(--line)]/60"
              )}
            >
              <div>
                <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--paper)]">
                  <Send className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> Full auto-submit
                </p>
                <p className="mt-0.5 text-[10px] text-dim">Irreversible — the agent actually sends your application.</p>
              </div>
              {submit && <CheckCircle2 className="h-4 w-4 text-[var(--chartreuse)]" />}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">Match Gate</p>
            <span className="font-mono text-lg font-bold text-[var(--amber)]">{minMatch}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minMatch}
            onChange={(e) => setMinMatch(Number(e.target.value))}
            className="mt-3 w-full"
          />
          <div className="mt-2 flex justify-between font-mono text-[10px] text-dim">
            <span>spray & pray</span>
            <span>elite only</span>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-dim">
            Below the gate the Decide node marks the run skipped — your reputation is never spent on weak fits.
          </p>
          <p className="mt-2 text-[10px] leading-relaxed text-dim">
            LLM engine: <span className="font-mono font-bold text-[var(--chartreuse)]">{llmSettings?.providerId || "gemini"}</span>
            {llmSettings?.model && ` · ${llmSettings.model}`}
          </p>
        </div>
      </div>

      {/* Capabilities */}
      <div className="grid gap-4 md:grid-cols-2">
        {[
          { icon: Radar, title: "DOM Schema Detection", desc: "Scrapling inspects each application form and maps fields to your profile automatically." },
          { icon: ShieldCheck, title: "Bot Detection Evasion", desc: "Human-like input simulation and randomized behavior keeps submissions natural." },
          { icon: Terminal, title: "Live Execution Logs", desc: "Watch every step — navigation, field injection, and confirmation — in real time." },
          { icon: Cpu, title: "AI Document Injection", desc: "Attaches the tailored resume, cover letter, and pitch for each specific role." },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex gap-4 rounded-2xl border border-[var(--line)] bg-white/[0.02] p-5">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10">
              <Icon className="h-5 w-5 text-[var(--chartreuse)]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--paper)]">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-dim">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Queue */}
      <div>
        <h2 className="mb-4 font-display text-sm font-semibold text-[var(--paper)]">Application Queue</h2>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-white/[0.02] text-[10px] uppercase tracking-[0.18em] text-dim">
                <th className="px-4 py-3 font-semibold">Opportunity</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Match</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((job) => (
                <tr key={job.id} className="border-b border-[var(--line)]/50 transition-colors hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--paper)]">{job.title}</p>
                    <p className="text-xs text-dim">{job.company}</p>
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
                      <span className={cn("font-mono text-xs font-bold", job.matchScore >= minMatch ? "text-[var(--chartreuse)]" : "text-[var(--amber)]")}>
                        {job.matchScore}%
                      </span>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant={job.autoApplyStatus === "applied" ? "outline" : "primary"}
                      onClick={() => run(job.id)}
                      loading={runningId === job.id}
                      disabled={runningId !== null || !job.url || job.autoApplyStatus === "applied"}
                    >
                      {runningId === job.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : job.autoApplyStatus === "applied" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      {!job.url ? "No URL" : runningId === job.id ? "Applying…" : job.autoApplyStatus === "applied" ? "Applied" : submit ? "Auto-Apply" : "Run Agent"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {applications.length === 0 && (
            <div className="p-10 text-center">
              <Bot className="mx-auto h-8 w-8 text-dim" />
              <p className="mt-3 text-sm text-dim">
                Queue is empty — add applications with a job URL to arm the agent.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Shared memory — what the agents remember between runs */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MemoryFeed />
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">
            <Workflow className="h-4 w-4 text-[var(--chartreuse)]" /> Context Pipeline
          </p>
          <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-dim">
            <li className="flex gap-2"><span className="text-[var(--chartreuse)]">1.</span> Profile + pipeline snapshot (jobs, statuses, follow-ups)</li>
            <li className="flex gap-2"><span className="text-[var(--chartreuse)]">2.</span> Recent email + interview activity</li>
            <li className="flex gap-2"><span className="text-[var(--chartreuse)]">3.</span> Shared memory — every remembered note and outcome</li>
            <li className="flex gap-2"><span className="text-[var(--chartreuse)]">4.</span> Token-budgeted to the model, truncated tail-first</li>
          </ul>
          <p className="mt-3 rounded-lg border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/5 p-2.5 text-[10px] text-[var(--chartreuse)]/90">
            Phase 4 wires this into the orchestrator agent and the chat assistant.
          </p>
        </div>
      </div>

      {/* Agent status pulse */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-3 rounded-2xl border border-[var(--chartreuse)]/25 bg-[var(--chartreuse)]/5 p-4"
      >
        <Bot className="h-5 w-5 text-[var(--chartreuse)]" />
        <p className="text-xs text-[var(--chartreuse)]">
          {health === "online"
            ? `Scrapling agent detected — real form filling is live. ${ready.length} targets awaiting dispatch.`
            : "Scrapling agent not detected — runs fall back to guided simulation. Start it with: uv run uvicorn server:app --port 8001"}
        </p>
      </motion.div>
    </div>
  );
}
