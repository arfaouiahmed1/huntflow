"use client";

import { DollarSign, FileCode2, Mail, Sparkles } from "lucide-react";
import { type AutoApplyResult } from "@/components/agent/useAutoApplyPipeline";

interface PreparationSummaryProps {
  result: AutoApplyResult | null;
}

export default function PreparationSummary({ result }: PreparationSummaryProps) {
  if (!result) return null;

  const matchingSkills = Array.from(new Set((result.matchingSkills ?? []).map((skill) => skill.trim()).filter(Boolean)));

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/5 p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-bold text-[var(--chartreuse)]">
          <Sparkles className="h-4 w-4" /> Preparation summary
        </span>
        {result.atsScore != null && (
          <span className="rounded-full bg-[var(--chartreuse)]/20 px-2.5 py-0.5 text-xs font-bold text-[var(--chartreuse)]">
            Fit estimate: {result.atsScore}%
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        {result.recommendedTemplate && (
          <div className="flex items-center gap-2 rounded-xl bg-black/20 p-2.5">
            <FileCode2 className="h-4 w-4 text-[var(--sky)]" />
            <div>
              <span className="block text-[10px] text-dim">Selected template</span>
              <span className="font-semibold text-[var(--paper)]">{result.recommendedTemplate}</span>
            </div>
          </div>
        )}
        {result.salaryEstimate && (
          <div className="flex items-center gap-2 rounded-xl bg-black/20 p-2.5">
            <DollarSign className="h-4 w-4 text-[var(--chartreuse)]" />
            <div>
              <span className="block text-[10px] text-dim">Salary intelligence</span>
              <span className="font-semibold text-[var(--paper)]">{result.salaryEstimate}</span>
            </div>
          </div>
        )}
      </div>
      {result.outreachSubject && (
        <div className="flex items-center gap-2 rounded-xl bg-black/20 p-2.5 text-xs">
          <Mail className="h-4 w-4 text-[var(--amber)]" />
          <div>
            <span className="block text-[10px] text-dim">Recruiter outreach subject</span>
            <span className="font-medium text-[var(--paper)]">{result.outreachSubject}</span>
          </div>
        </div>
      )}
      {matchingSkills.length > 0 && (
        <div>
          <span className="mb-1 block text-[10px] text-dim">Matched core skills</span>
          <div className="flex flex-wrap gap-1">
            {matchingSkills.map((skill) => (
              <span key={skill} className="rounded-md bg-[var(--chartreuse)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--chartreuse)]">
                ✓ {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
