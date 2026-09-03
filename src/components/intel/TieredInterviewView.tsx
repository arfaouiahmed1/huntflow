"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { TieredInterviewPrepResult, InterviewStageTier } from "@/lib/agents/interviewTiers";

export default function TieredInterviewView({ prep }: { prep: TieredInterviewPrepResult }) {
  const [activeTier, setActiveTier] = useState<InterviewStageTier>("screening");
  const questions = prep.byTier[activeTier] || [];

  const tierLabels: Record<InterviewStageTier, { label: string; desc: string }> = {
    screening: { label: "Screening", desc: "Recruiter & culture alignment" },
    hiring_manager: { label: "Hiring Manager", desc: "Technical depth & architecture" },
    bar_raiser: { label: "Bar-Raiser", desc: "Scale, edge cases & trade-offs" },
  };

  return (
    <div className="space-y-6 rounded-[1.5rem] border border-[var(--line)] bg-[var(--ink-card)]/50 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div>
          <h4 className="font-display text-sm font-semibold text-[var(--paper)]">Multi-Tier STAR Interview Preparation</h4>
          <p className="mt-0.5 text-xs text-dim">Structured across 3 distinct interview rounds with tailored STAR guides and probes.</p>
        </div>
        <span className="rounded-full border border-[var(--violet)]/30 bg-[var(--violet)]/10 px-3 py-1 font-mono text-[11px] font-bold text-[var(--violet)]">
          {prep.totalQuestions} Questions · {prep.vaultAnchorsCount} Vault Anchors
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["screening", "hiring_manager", "bar_raiser"] as InterviewStageTier[]).map((tier) => {
          const active = activeTier === tier;
          const count = prep.byTier[tier]?.length ?? 0;
          return (
            <button
              key={tier}
              type="button"
              onClick={() => setActiveTier(tier)}
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors cursor-pointer",
                active
                  ? "bg-[var(--chartreuse)]/10 text-[var(--chartreuse)] ring-1 ring-[var(--chartreuse)]/30"
                  : "bg-white/[0.02] text-dim hover:bg-white/[0.05] hover:text-[var(--paper)]"
              )}
            >
              <span>{tierLabels[tier].label}</span>
              <span className="rounded-full bg-black/40 px-2 py-0.5 font-mono text-[10px] text-dim">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {questions.map((q, idx) => (
          <div key={q.id || idx} className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--violet)]">
                  Topic: {q.topic}
                </span>
                <p className="text-sm font-semibold leading-relaxed text-[var(--paper)]">{q.question}</p>
              </div>
              {q.vaultAnchor && (
                <span className="shrink-0 rounded-full border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 px-2.5 py-1 text-[10px] font-mono text-[var(--chartreuse)]">
                  ⚓ {q.vaultAnchor}
                </span>
              )}
            </div>

            <div className="rounded-xl border border-[var(--line)] bg-[var(--ink-soft)]/50 p-4 space-y-2 text-xs">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-dim">STAR Answering Strategy</p>
              <div className="grid gap-2 sm:grid-cols-2 text-[11px] leading-relaxed">
                <div><span className="font-semibold text-[var(--paper)]">Situation:</span> <span className="text-dim">{q.starGuidance.situation}</span></div>
                <div><span className="font-semibold text-[var(--paper)]">Task:</span> <span className="text-dim">{q.starGuidance.task}</span></div>
                <div><span className="font-semibold text-[var(--paper)]">Action:</span> <span className="text-dim">{q.starGuidance.action}</span></div>
                <div><span className="font-semibold text-[var(--paper)]">Result:</span> <span className="text-dim">{q.starGuidance.result}</span></div>
              </div>
            </div>

            {q.followUpProbes.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-dim">Expected Follow-Up Probes</p>
                <ul className="list-disc pl-4 space-y-1 text-dim text-[11px]">
                  {q.followUpProbes.map((probe, pIdx) => (
                    <li key={pIdx}>{probe}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
