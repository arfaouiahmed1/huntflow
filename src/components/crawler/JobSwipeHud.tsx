"use client";

import {
  Sparkles,
  DollarSign,
  Globe2,
  ShieldAlert,
} from "lucide-react";
import { JobApplication } from "@/types";
import { cn } from "@/lib/utils";

interface JobSwipeHudProps {
  job: JobApplication;
  viewTab: "summary" | "screenshot";
  onToggleTab: () => void;
}

export function JobSwipeHud({ job, viewTab, onToggleTab }: JobSwipeHudProps) {
  const matchScore = job.matchScore ?? 75;
  const salaryIntel = job.salaryIntel;
  const dealbreakers = job.skillsGap?.dealbreakers || [];
  const visaStatus =
    job.location?.toLowerCase().includes("remote")
      ? "Remote Worldwide"
      : job.location?.toLowerCase().includes("germany") || job.location?.toLowerCase().includes("berlin")
      ? "EU Blue Card Eligible"
      : job.location?.toLowerCase().includes("uk") || job.location?.toLowerCase().includes("london")
      ? "UK Skilled Worker"
      : "Sponsorship Feasible";

  // Score color ring
  const scoreColor =
    matchScore >= 80
      ? "text-[var(--chartreuse)] border-[var(--chartreuse)]"
      : matchScore >= 65
      ? "text-amber-400 border-amber-400"
      : "text-rose-400 border-rose-400";

  return (
    <div className="flex flex-col gap-2.5">
      {/* Top Floating HUD Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/90 px-4 py-2.5 backdrop-blur-xl shadow-lg">
        <div className="flex items-center gap-3">
          {/* Circular Score Ring */}
          <div className="relative flex items-center justify-center">
            <div className={cn("grid h-10 w-10 place-items-center rounded-full border-2 bg-black/40 font-mono text-xs font-black shadow-inner", scoreColor)}>
              {matchScore}%
            </div>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--chartreuse)] opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--chartreuse)]" />
            </span>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--paper)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
              <span>AI Match Intelligence</span>
            </div>
            <span className="text-[10px] text-dim">
              {matchScore >= 80 ? "Direct Fit Match" : "Tailored Profile Recommended"}
            </span>
          </div>
        </div>

        {/* PPP Salary & Visa Pill */}
        <div className="flex flex-wrap items-center gap-2">
          {salaryIntel && (
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              <DollarSign className="h-3.5 w-3.5" />
              <span>
                {salaryIntel.disclosedRange ||
                  `PPP Est: $${Math.round((salaryIntel.estimateLow || 110000) * 0.95).toLocaleString()}–$${Math.round((salaryIntel.estimateHigh || 145000) * 0.95).toLocaleString()}`}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-400">
            <Globe2 className="h-3.5 w-3.5" />
            <span>{visaStatus}</span>
          </div>

          {dealbreakers.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-400">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>{dealbreakers.length} Dealbreaker Alert</span>
            </div>
          )}
        </div>
      </div>

      {/* Keyboard Hotkey Guidance Bar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-2 text-[10px] text-dim">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-line bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-[var(--paper)]">←</kbd> Skip
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-line bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-[var(--paper)]">→</kbd> Save Wishlist
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-line bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-[var(--paper)]">↑</kbd> Run Auto-Apply
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-line bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-[var(--paper)]">↓</kbd> Details
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleTab}
          className="flex items-center gap-1 hover:text-[var(--paper)] transition-colors cursor-pointer"
        >
          <kbd className="rounded border border-line bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-[var(--paper)]">Space</kbd>
          <span>{viewTab === "summary" ? "Show Screenshot" : "Show Summary"}</span>
        </button>
      </div>
    </div>
  );
}
