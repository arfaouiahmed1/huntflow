"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  Play,
  CheckCircle2,
  Loader2,
  Globe,
  FileCode2,
  DollarSign,
  Mail,
  Sparkles,
} from "lucide-react";
import { JobApplication } from "@/types";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { RegionCode } from "@/lib/agents/regionalNorms";
import { cn } from "@/lib/utils";

const statusConfig = {
  idle: { label: "Standby", color: "text-dim" },
  queued: { label: "Queued", color: "text-[var(--sky)]" },
  processing: { label: "Processing", color: "text-[var(--amber)]" },
  applied: { label: "Applied", color: "text-[var(--chartreuse)]" },
  failed: { label: "Failed", color: "text-[var(--coral)]" },
  manual_required: { label: "Manual Required", color: "text-[var(--amber)]" },
};

const REGIONS: { code: RegionCode; label: string; flag: string }[] = [
  { code: "US", label: "US & Canada", flag: "🇺🇸" },
  { code: "DE", label: "Germany (DACH)", flag: "🇩🇪" },
  { code: "FR", label: "France", flag: "🇫🇷" },
  { code: "TN", label: "Tunisia (MENA)", flag: "🇹🇳" },
  { code: "UK", label: "UK & Australia", flag: "🇬🇧" },
  { code: "ES", label: "Spain & LATAM", flag: "🇪🇸" },
  { code: "JP", label: "Japan", flag: "🇯🇵" },
  { code: "CH", label: "Switzerland", flag: "🇨🇭" },
  { code: "NL", label: "Netherlands & Nordics", flag: "🇳🇱" },
  { code: "UAE", label: "UAE & Gulf", flag: "🇦🇪" },
  { code: "INTL", label: "Global Remote", flag: "🌐" },
];

export default function AutoApplyPanel({ job }: { job: JobApplication }) {
  const { profile } = useApp();
  const { success, error: errToast, warn, celebrate } = useToast();
  const [running, setRunning] = useState(false);
  const [runningStep, setRunningStep] = useState<string | null>(null);
  const [targetRegion, setTargetRegion] = useState<RegionCode>("US");
  const [submit, setSubmit] = useState(false);
  const [minMatch, setMinMatch] = useState(60);
  const [multiAgentResult, setMultiAgentResult] = useState<{
    atsScore?: number;
    recommendedTemplate?: string;
    matchingSkills?: string[];
    missingSkills?: string[];
    salaryEstimate?: string;
    outreachSubject?: string;
  } | null>(null);

  const status = statusConfig[job.autoApplyStatus || "idle"];

  const runMultiAgentPipeline = async () => {
    if (running || runningStep) return;
    setRunning(true);
    try {
      const res = await fetch("/api/agent/multi-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          profile,
          targetRegion,
          submit,
          minMatch,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Multi-agent run failed");

      setMultiAgentResult(data);

      if (data.status === "applied") {
        success(`Multi-agent pipeline complete! Application submitted via Scrapling.`);
        celebrate();
      } else if (data.status === "skipped") {
        warn(`Match gate held fire (${data.atsScore}% < ${minMatch}% threshold).`);
      } else {
        warn("Multi-agent run completed. Form prefilled for manual review.");
      }
    } catch (e) {
      errToast(e instanceof Error ? e.message : "Multi-agent execution failed.");
    } finally {
      setRunning(false);
    }
  };

  const runPartialStep = async (step: string) => {
    if (running || runningStep) return;
    setRunningStep(step);
    try {
      const res = await fetch("/api/agent/partial-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          profile,
          targetRegion,
          stopAfter: step,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed to run up to ${step}`);

      const data = json.data;
      setMultiAgentResult(data);
      success(`Successfully ran pipeline up to ${step}.`);
    } catch (e) {
      errToast(e instanceof Error ? e.message : `Execution up to ${step} failed.`);
    } finally {
      setRunningStep(null);
    }
  };

  const QUICK_ACTIONS = [
    { id: "companyIntel", label: "Company Intel", icon: "🔍" },
    { id: "resumeCVTailor", label: "Tailor Resume", icon: "📄" },
    { id: "letterTailor", label: "Tailor Letter", icon: "✉️" },
    { id: "interviewPrep", label: "Interview Prep", icon: "🎯" },
    { id: "salaryIntel", label: "Salary Intel", icon: "💰" },
    { id: "outreachEmail", label: "Outreach Email", icon: "📩" },
    { id: "atsAudit", label: "ATS Audit Only", icon: "🔎" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "relative grid h-10 w-10 place-items-center rounded-xl border",
              job.autoApplyStatus === "applied"
                ? "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10"
                : "border-[var(--line)] bg-white/[0.03]"
            )}
          >
            {running ? (
              <Loader2 className="h-5 w-5 animate-spin text-[var(--amber)]" />
            ) : job.autoApplyStatus === "applied" ? (
              <CheckCircle2 className="h-5 w-5 text-[var(--chartreuse)]" />
            ) : (
              <Bot className="h-5 w-5 text-[var(--chartreuse)]" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--paper)]">Master 11-Agent Pipeline</p>
            <p className={cn("text-xs font-medium", status.color)}>{status.label}</p>
          </div>
        </div>

        <Button onClick={runMultiAgentPipeline} loading={running} disabled={running || !!runningStep}>
          {running ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Executing 11 Agents…</>
          ) : (
            <><Play className="h-4 w-4" /> Run 11-Agent Engine</>
          )}
        </Button>
      </div>

      {/* Target Region Controls */}
      <div className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-dim">
          <Globe className="h-4 w-4 text-[var(--chartreuse)]" /> Select Application Region Norms
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {REGIONS.map((r) => (
            <button
              key={r.code}
              type="button"
              onClick={() => setTargetRegion(r.code)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all",
                targetRegion === r.code
                  ? "border-[var(--chartreuse)] bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                  : "border-[var(--line)] bg-white/[0.02] text-dim hover:text-[var(--paper)]"
              )}
            >
              <span>{r.flag}</span>
              <span className="truncate">{r.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Quick Agent Actions */}
      <div className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-dim">
          <Bot className="h-4 w-4 text-[var(--chartreuse)]" /> Quick Agent Actions
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={running || !!runningStep}
              onClick={() => runPartialStep(action.id)}
              className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white/[0.02] px-3 py-2 text-xs font-medium text-dim hover:text-[var(--paper)] hover:border-[var(--chartreuse)]/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {runningStep === action.id ? (
                <Loader2 className="h-3 w-3 animate-spin text-[var(--chartreuse)]" />
              ) : (
                <span>{action.icon}</span>
              )}
              <span className="truncate">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4 text-xs">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={submit}
            onChange={(e) => setSubmit(e.target.checked)}
            className="rounded border-[var(--line)] accent-[var(--chartreuse)]"
          />
          <div>
            <span className="font-medium text-[var(--paper)]">Auto-Submit Form</span>
            <p className="text-dim text-[10px]">Unchecked runs in prefill/human review mode</p>
          </div>
        </label>

        <div>
          <div className="flex justify-between text-[10px] text-dim mb-1">
            <span>Minimum ATS Match Gate</span>
            <span className="font-semibold text-[var(--chartreuse)]">{minMatch}%</span>
          </div>
          <input
            type="range"
            min="40"
            max="90"
            value={minMatch}
            onChange={(e) => setMinMatch(Number(e.target.value))}
            className="w-full accent-[var(--chartreuse)]"
          />
        </div>
      </div>

      {/* Multi-Agent Output Cards */}
      {multiAgentResult && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/5 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-bold text-[var(--chartreuse)]">
              <Sparkles className="h-4 w-4" /> 11-Agent Execution Summary
            </span>
            {multiAgentResult.atsScore != null && (
              <span className="rounded-full bg-[var(--chartreuse)]/20 px-2.5 py-0.5 text-xs font-bold text-[var(--chartreuse)]">
                ATS Score: {multiAgentResult.atsScore}%
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            {multiAgentResult.recommendedTemplate && (
              <div className="flex items-center gap-2 rounded-xl bg-black/20 p-2.5">
                <FileCode2 className="h-4 w-4 text-[var(--sky)]" />
                <div>
                  <span className="text-[10px] text-dim block">Selected Template</span>
                  <span className="font-semibold text-[var(--paper)]">{multiAgentResult.recommendedTemplate}</span>
                </div>
              </div>
            )}

            {multiAgentResult.salaryEstimate && (
              <div className="flex items-center gap-2 rounded-xl bg-black/20 p-2.5">
                <DollarSign className="h-4 w-4 text-[var(--chartreuse)]" />
                <div>
                  <span className="text-[10px] text-dim block">Salary Intelligence</span>
                  <span className="font-semibold text-[var(--paper)]">{multiAgentResult.salaryEstimate}</span>
                </div>
              </div>
            )}
          </div>

          {multiAgentResult.outreachSubject && (
            <div className="flex items-center gap-2 rounded-xl bg-black/20 p-2.5 text-xs">
              <Mail className="h-4 w-4 text-[var(--amber)]" />
              <div>
                <span className="text-[10px] text-dim block">Recruiter Outreach Subject</span>
                <span className="font-medium text-[var(--paper)]">{multiAgentResult.outreachSubject}</span>
              </div>
            </div>
          )}

          {multiAgentResult.matchingSkills && multiAgentResult.matchingSkills.length > 0 && (
            <div>
              <span className="text-[10px] text-dim block mb-1">Matched Core Skills</span>
              <div className="flex flex-wrap gap-1">
                {multiAgentResult.matchingSkills.map((s) => (
                  <span key={s} className="rounded-md bg-[var(--chartreuse)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--chartreuse)]">
                    ✓ {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
