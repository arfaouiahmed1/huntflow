"use client";

import { useState, useMemo } from "react";
import { AlertCircle, CheckCircle2, Columns, Eye, Sparkles, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { analyzeAts } from "@/lib/ats/analyze";

interface PitchDiffEditorProps {
  originalPitch?: string;
  currentPitch: string;
  onChange: (value: string) => void;
  jobDescription?: string;
  customInstruction?: string;
  onCustomInstructionChange?: (instruction: string) => void;
  className?: string;
}

export default function PitchDiffEditor({
  originalPitch = "",
  currentPitch,
  onChange,
  jobDescription = "",
  customInstruction = "",
  onCustomInstructionChange,
  className,
}: PitchDiffEditorProps) {
  const [viewMode, setViewMode] = useState<"edit" | "diff">("edit");

  // Real-time client ATS parser feedback
  const atsFeedback = useMemo(() => {
    if (!currentPitch.trim()) return null;
    try {
      const report = analyzeAts(currentPitch, jobDescription);
      return {
        score: report.score,
        keywordsFound: report.keywords.filter((k) => k.inResume).length,
        totalKeywords: report.keywords.length,
        missingChecks: report.checks.filter((c) => !c.ok).map((c) => c.label),
      };
    } catch {
      return null;
    }
  }, [currentPitch, jobDescription]);

  return (
    <div className={cn("space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/50 p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-[var(--chartreuse)]" />
          <h4 className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-[var(--paper)]">
            Tailored Pitch &amp; Live ATS Pre-Check
          </h4>
        </div>
        <div className="flex gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.02] p-1">
          <button
            type="button"
            onClick={() => setViewMode("edit")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold cursor-pointer",
              viewMode === "edit" ? "bg-[var(--paper)] text-[var(--ink)]" : "text-dim hover:text-[var(--paper)]"
            )}
          >
            <Eye className="h-3 w-3" /> Edit Pitch
          </button>
          {originalPitch && (
            <button
              type="button"
              onClick={() => setViewMode("diff")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold cursor-pointer",
                viewMode === "diff" ? "bg-[var(--paper)] text-[var(--ink)]" : "text-dim hover:text-[var(--paper)]"
              )}
            >
              <Columns className="h-3 w-3" /> Diff vs Original
            </button>
          )}
        </div>
      </div>

      {viewMode === "edit" ? (
        <div className="space-y-3">
          <textarea
            rows={5}
            value={currentPitch}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Edit your tailored cover letter / application pitch..."
            className="w-full resize-y rounded-xl border border-line bg-white/[0.03] px-3.5 py-3 text-xs leading-relaxed text-paper outline-none placeholder:text-dim/70 focus:border-chartreuse/50"
          />

          {atsFeedback && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--violet)]/20 bg-[var(--violet)]/[0.04] px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-[var(--violet)]">Live ATS: {atsFeedback.score}%</span>
                <span className="text-dim">
                  · {atsFeedback.keywordsFound}/{atsFeedback.totalKeywords} JD keyword(s) matched
                </span>
              </div>
              {atsFeedback.score < 60 ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--amber)]">
                  <AlertCircle className="h-3.5 w-3.5" /> Score below 60 — add more JD keywords
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--chartreuse)]">
                  <CheckCircle2 className="h-3.5 w-3.5" /> ATS parser compliant
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-4 text-xs leading-relaxed">
            <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-dim">Original Baseline</p>
            <p className="text-dim whitespace-pre-wrap">{originalPitch || "No baseline available"}</p>
          </div>
          <div className="rounded-xl border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/[0.03] p-4 text-xs leading-relaxed">
            <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--chartreuse)]">Agent Tailored</p>
            <p className="text-[var(--paper)] whitespace-pre-wrap">{currentPitch}</p>
          </div>
        </div>
      )}

      {onCustomInstructionChange && (
        <div className="border-t border-[var(--line)] pt-3">
          <label className="block">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-dim">
              <Sparkles className="h-3 w-3 text-[var(--chartreuse)]" /> Conversational Steering (Optional)
            </span>
            <input
              type="text"
              value={customInstruction}
              onChange={(e) => onCustomInstructionChange(e.target.value)}
              placeholder="e.g. 'Focus on distributed systems and high-throughput AWS infrastructure'"
              className="mt-1.5 w-full rounded-lg border border-line bg-white/[0.03] px-3 py-1.5 text-xs text-paper outline-none placeholder:text-dim/70 focus:border-chartreuse/50"
            />
          </label>
        </div>
      )}
    </div>
  );
}
