"use client";

import { useState } from "react";
import { Bot, CheckCircle2, Ellipsis, Globe, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { RegionCode } from "@/lib/agents/regionalNorms";
import { cn } from "@/lib/utils";

const REGIONS: { code: RegionCode; label: string }[] = [
  { code: "US", label: "US & Canada" },
  { code: "DE", label: "Germany (DACH)" },
  { code: "FR", label: "France" },
  { code: "TN", label: "Tunisia (MENA)" },
  { code: "UK", label: "UK & Australia" },
  { code: "ES", label: "Spain & LATAM" },
  { code: "JP", label: "Japan" },
  { code: "CH", label: "Switzerland" },
  { code: "NL", label: "Netherlands & Nordics" },
  { code: "UAE", label: "UAE & Gulf" },
  { code: "INTL", label: "Global Remote" },
];

const QUICK_ACTIONS = [
  { id: "companyIntel", label: "Company Intel" },
  { id: "resumeCVTailor", label: "Tailor Resume" },
  { id: "letterTailor", label: "Tailor Letter" },
  { id: "interviewPrep", label: "Interview Prep" },
  { id: "salaryIntel", label: "Salary Intel" },
  { id: "outreachEmail", label: "Outreach Email" },
  { id: "atsAudit", label: "ATS Audit Only" },
];

interface AutoApplyRunControlsProps {
  applicationStatus?: string;
  onRun: () => void;
  onRunPartial: (step: string) => void;
  onSubmitChange: (value: boolean) => void;
  onTargetRegionChange: (region: RegionCode) => void;
  running: boolean;
  runningStep: string | null;
  status: { label: string; color: string };
  submit: boolean;
  targetRegion: RegionCode;
}

export default function AutoApplyRunControls({
  applicationStatus,
  onRun,
  onRunPartial,
  onSubmitChange,
  onTargetRegionChange,
  running,
  runningStep,
  status,
  submit,
  targetRegion,
}: AutoApplyRunControlsProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const busy = running || Boolean(runningStep);

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "relative grid h-10 w-10 place-items-center rounded-xl border",
              applicationStatus === "applied"
                ? "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10"
                : "border-[var(--line)] bg-white/[0.03]"
            )}
          >
            {running ? (
              <Loader2 className="h-5 w-5 animate-spin text-[var(--amber)]" />
            ) : applicationStatus === "applied" ? (
              <CheckCircle2 className="h-5 w-5 text-[var(--chartreuse)]" />
            ) : (
              <Bot className="h-5 w-5 text-[var(--chartreuse)]" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--paper)]">Supervised application workflow</p>
            <p className={cn("text-xs font-medium", status.color)}>{status.label}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={onRun} loading={running} disabled={busy}>
            {running ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Preparing evidence…</>
            ) : (
              <><Play className="h-4 w-4" /> Run supervised pipeline</>
            )}
          </Button>
          <div className="relative">
            <button
              type="button"
              aria-label="Quick agent actions"
              disabled={busy}
              onClick={() => setOverflowOpen((value) => !value)}
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-[var(--line)] text-dim transition-colors hover:border-white/20 hover:text-[var(--paper)] disabled:opacity-50"
            >
              <Ellipsis className="h-4 w-4" />
            </button>
            {overflowOpen && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-52 space-y-0.5 rounded-xl border border-[var(--line)] bg-[var(--ink-soft)]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                <p className="px-2 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-wider text-dim">Run single stage</p>
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setOverflowOpen(false);
                      onRunPartial(action.id);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-[var(--paper)] transition-colors hover:bg-white/[0.05] disabled:opacity-50"
                  >
                    {runningStep === action.id ? (
                      <Loader2 className="h-3 w-3 animate-spin text-[var(--chartreuse)]" />
                    ) : (
                      <Play className="h-3 w-3 text-dim" />
                    )}
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4 text-xs">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={submit}
            onChange={(event) => onSubmitChange(event.target.checked)}
            className="rounded border-[var(--line)] accent-[var(--chartreuse)]"
          />
          <div>
            <span className="font-medium text-[var(--paper)]">Allow submission after review</span>
            <p className="text-dim text-[10px]">Unchecked keeps every run in prepare-only mode</p>
          </div>
        </label>
        <label className="ml-auto flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-dim">Region norms</span>
          <select
            value={targetRegion}
            onChange={(event) => onTargetRegionChange(event.target.value as RegionCode)}
            className="rounded-lg border border-[var(--line)] bg-black/40 px-2 py-1.5 text-xs text-[var(--paper)] outline-none focus:border-[var(--chartreuse)]/60"
          >
            {REGIONS.map((region) => (
              <option key={region.code} value={region.code}>{region.label}</option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}
