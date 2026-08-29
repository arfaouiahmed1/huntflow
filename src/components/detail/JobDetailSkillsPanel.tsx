"use client";

import { Zap } from "lucide-react";
import { scoreColor, cn } from "@/lib/utils";
import type { SkillsGapAnalysis } from "@/types";

interface JobDetailSkillsPanelProps {
  skillsGap?: SkillsGapAnalysis | null;
  className?: string;
}

export default function JobDetailSkillsPanel({ skillsGap, className }: JobDetailSkillsPanelProps) {
  return (
    <section data-testid="skills-panel" className={cn("rounded-2xl border border-[var(--line)] bg-black/15 p-5", className)}>
      <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-dim">
        <Zap className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> Skills gap
      </h3>
      {skillsGap ? (
        <>
          {skillsGap.matchingSkills?.length ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {skillsGap.matchingSkills.slice(0, 8).map((s) => (
                <span key={s} className="rounded-md border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/10 px-2 py-1 text-[11px] font-medium text-[var(--chartreuse)]">
                  {s}
                </span>
              ))}
            </div>
          ) : null}
          {skillsGap.missingSkills?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {skillsGap.missingSkills.slice(0, 8).map((s) => (
                <span key={s} className="rounded-md border border-[var(--coral)]/20 bg-[var(--coral)]/10 px-2 py-1 text-[11px] font-medium text-[var(--coral)]">
                  missing: {s}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-dim">No missing skills flagged</p>
          )}
          {typeof skillsGap.matchScore === "number" && (
            <p className="mt-3 font-mono text-[10px] text-dim">
              Match score <span className="font-bold" style={{ color: scoreColor(skillsGap.matchScore) }}>{skillsGap.matchScore}%</span>
              {skillsGap.fit ? ` · ${skillsGap.fit.replace(/_/g, " ")}` : ""}
            </p>
          )}
          {skillsGap.dealbreakers?.length ? (
            <ul className="mt-3 space-y-1">
              {skillsGap.dealbreakers.map((d) => (
                <li key={d} className="text-xs text-[var(--paper)]/90">FAIL · {d}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-dim">No skills analysis yet — run match analysis in Overview.</p>
      )}
    </section>
  );
}
