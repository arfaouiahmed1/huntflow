"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  BrainCircuit,
  Sparkles,
  RefreshCw,
  DollarSign,
  AlertOctagon,
  HelpCircle,
  Wifi,
  ListChecks,
  Gem,
  MessageCircleQuestion,
} from "lucide-react";
import { JobApplication } from "@/types";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { toErrorMessage } from "@/lib/errors";

export default function IntelligencePanel({ job }: { job: JobApplication }) {
  const { generateJobBrief, generateSalaryIntel } = useApp();
  const { error: errToast } = useToast();
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [loadingSalary, setLoadingSalary] = useState(false);

  const runBrief = async () => {
    setLoadingBrief(true);
    try {
      await generateJobBrief(job.id);
    } catch (e) {
      errToast(toErrorMessage(e));
    } finally {
      setLoadingBrief(false);
    }
  };

  const runSalary = async () => {
    setLoadingSalary(true);
    try {
      await generateSalaryIntel(job.id);
    } catch (e) {
      errToast(toErrorMessage(e));
    } finally {
      setLoadingSalary(false);
    }
  };

  const brief = job.jobBrief;
  const salary = job.salaryIntel;

  return (
    <div className="space-y-6">
      {/* Job brief */}
      <section>
        {!brief ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] p-6 text-center">
            <BrainCircuit className="mx-auto mb-2 h-7 w-7 text-[var(--sky)]" />
            <h3 className="font-display text-sm font-semibold">Job Intelligence Brief</h3>
            <p className="mx-auto mt-1 max-w-xs text-xs text-dim">
              AI distill: what this role really is, red flags, and questions to ask.
            </p>
            <Button onClick={runBrief} loading={loadingBrief} className="mt-4">
              <Sparkles className="h-4 w-4" /> Generate Brief
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-dim">
                <BrainCircuit className="h-4 w-4 text-[var(--sky)]" /> Intelligence Brief
              </h3>
              <Button variant="ghost" size="sm" onClick={runBrief} loading={loadingBrief}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>

            <p className="text-sm leading-relaxed text-[var(--paper)]/90">{brief.summary}</p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-dim">
                  <Wifi className="h-3.5 w-3.5 text-[var(--sky)]" /> Tech Stack
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {brief.techStack.map((t) => (
                    <span key={t} className="rounded-full border border-[var(--sky)]/25 bg-[var(--sky)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--sky)]">
                      {t}
                    </span>
                  ))}
                  {brief.techStack.length === 0 && <span className="text-xs text-dim">Not named in posting</span>}
                </div>
              </div>
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-dim">
                  <ListChecks className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> Top Requirements
                </p>
                <ol className="space-y-1">
                  {brief.topRequirements.map((r, i) => (
                    <li key={i} className="flex gap-2 text-xs text-[var(--paper)]/85">
                      <span className="font-mono text-[var(--chartreuse)]">{String(i + 1).padStart(2, "0")}</span>
                      {r}
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {brief.redFlags.length > 0 && (
              <div className="mt-4 rounded-xl border border-[var(--coral)]/25 bg-[var(--coral)]/5 p-3.5">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--coral)]">
                  <AlertOctagon className="h-3.5 w-3.5" /> Red Flags
                </p>
                <ul className="space-y-1">
                  {brief.redFlags.map((f, i) => (
                    <li key={i} className="flex gap-2 text-xs text-[var(--coral)]/90">
                      <span className="font-mono">•</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-dim">
                <MessageCircleQuestion className="h-3.5 w-3.5 text-[var(--amber)]" /> Questions To Ask
              </p>
              <ul className="space-y-1.5">
                {brief.questionsToAsk.map((q, i) => (
                  <li key={i} className="flex gap-2 text-xs text-[var(--paper)]/85">
                    <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--amber)]" /> {q}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* Salary intel */}
      <section>
        {!salary ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] p-6 text-center">
            <DollarSign className="mx-auto mb-2 h-7 w-7 text-[var(--chartreuse)]" />
            <h3 className="font-display text-sm font-semibold">Salary Intelligence</h3>
            <p className="mx-auto mt-1 max-w-xs text-xs text-dim">
              Market estimate for this role based on seniority, location, and posting.
            </p>
            <Button onClick={runSalary} loading={loadingSalary} variant="outline" className="mt-4">
              <Gem className="h-4 w-4" /> Estimate Salary
            </Button>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-[var(--chartreuse)]/25 bg-gradient-to-br from-[var(--chartreuse)]/10 to-transparent p-5"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-dim">
                <Gem className="h-4 w-4 text-[var(--chartreuse)]" /> Salary Estimate
              </h3>
              <Button variant="ghost" size="sm" onClick={runSalary} loading={loadingSalary}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>

            <p className="font-mono text-3xl font-bold text-[var(--chartreuse)]">
              ${salary.estimateLow.toLocaleString()} <span className="text-dim">—</span> ${salary.estimateHigh.toLocaleString()}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-dim">
                {salary.basis === "posting" ? "from posting" : salary.basis === "market" ? "market estimate" : "hybrid"}
              </span>
              {salary.disclosedRange && (
                <span className="text-[11px] text-dim">Disclosed: <span className="text-[var(--paper)]">{salary.disclosedRange}</span></span>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white/[0.03] p-3">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-dim">Factors</p>
                <ul className="space-y-1">
                  {salary.factors.map((f, i) => (
                    <li key={i} className="flex gap-1.5 text-xs text-[var(--paper)]/85">
                      <span className="text-[var(--chartreuse)]">+</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-3">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-dim">Negotiation Plays</p>
                <ul className="space-y-1">
                  {salary.negotiationTips.map((t, i) => (
                    <li key={i} className="flex gap-1.5 text-xs text-[var(--paper)]/85">
                      <span className="font-mono text-[var(--chartreuse)]">{i + 1}.</span> {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </section>
    </div>
  );
}
