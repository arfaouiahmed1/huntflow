"use client";

import { useState } from "react";
import { Check, Clock, Copy } from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import { OutreachSequencePlan, OutreachSequenceItem } from "@/lib/mail/outreachSequence";

export default function OutreachSequenceView({ plan }: { plan: OutreachSequencePlan }) {
  const { success } = useToast();
  const [copiedStage, setCopiedStage] = useState<string | null>(null);

  const copyStage = async (stage: OutreachSequenceItem) => {
    const fullText = `Subject: ${stage.subject}\n\n${stage.body}`;
    await navigator.clipboard.writeText(fullText);
    setCopiedStage(stage.stage);
    success(`Stage ${stage.delayDays === 0 ? "Day 0" : `Day ${stage.delayDays}`} copied.`);
    setTimeout(() => setCopiedStage(null), 1500);
  };

  const stageLabels: Record<string, string> = {
    day_0_connect: "Day 0: Initial Direct Connection",
    day_4_value_nudge: "Day 4: Technical Value-Add Nudge",
    day_10_proof_followup: "Day 10: Case Study & Proof Follow-Up",
  };

  return (
    <div className="space-y-6 rounded-[1.5rem] border border-[var(--line)] bg-[var(--ink-card)]/50 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div>
          <h4 className="font-display text-sm font-semibold text-[var(--paper)]">
            Multi-Stage Outreach Campaign ({plan.totalEstimatedDurationDays} Days)
          </h4>
          <p className="mt-0.5 text-xs text-dim">
            3 structured touchpoints for {plan.targetRole} @ {plan.targetCompany}
          </p>
        </div>
        <span className="rounded-full border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 px-3 py-1 font-mono text-[11px] font-bold text-[var(--chartreuse)]">
          {plan.stages.length} Stages Planned
        </span>
      </div>

      <div className="grid gap-6">
        {plan.stages.map((stage) => {
          const copied = copiedStage === stage.stage;
          return (
            <div key={stage.stage} className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[var(--amber)]" />
                  <span className="font-display text-xs font-bold text-[var(--paper)]">
                    {stageLabels[stage.stage] || stage.stage}
                  </span>
                  <span className="rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[10px] text-dim">
                    {stage.channel === "linkedin_inmail" ? "LinkedIn" : "Email"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyStage(stage)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.03] px-3 py-1 text-xs font-semibold text-dim hover:bg-white/[0.06] hover:text-[var(--paper)] cursor-pointer"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy Template"}
                </button>
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-[var(--ink-soft)]/50 p-4 space-y-2 text-xs">
                <p className="font-semibold text-[var(--paper)]">Subject: {stage.subject}</p>
                <p className="whitespace-pre-wrap leading-relaxed text-dim">{stage.body}</p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-dim">
                <span>Call to action: <strong className="text-[var(--paper)]">{stage.callToAction}</strong></span>
                <div className="flex flex-wrap gap-1">
                  {stage.personalizedHooks.map((h, i) => (
                    <span key={i} className="rounded-md border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/[0.05] px-2 py-0.5 text-[10px] text-[var(--chartreuse)]">
                      {h}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
