"use client";

import { DollarSign, Gem } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { SalaryIntel } from "@/types";

interface JobDetailSalaryPanelProps {
  salary?: string;
  salaryIntel?: SalaryIntel | null;
  onGenerate?: () => void;
  loading?: boolean;
}

export default function JobDetailSalaryPanel({ salary, salaryIntel, onGenerate, loading }: JobDetailSalaryPanelProps) {
  return (
    <section data-testid="salary-panel" className="rounded-2xl border border-[var(--line)] bg-black/15 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-dim">
          <DollarSign className="h-4 w-4 text-[var(--chartreuse)]" /> Compensation
        </h3>
        {onGenerate && (
          <Button variant="outline" size="sm" onClick={onGenerate} loading={loading}>
            <Gem className="h-3.5 w-3.5" /> {salaryIntel ? "Refresh estimate" : "Estimate market range"}
          </Button>
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/[0.035] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--chartreuse)]">From posting</p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--paper)]/90">{salary || "No compensation disclosed."}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-dim">Generated estimate</p>
          {salaryIntel ? (
            <>
              <p className="mt-2 font-mono text-base font-bold text-[var(--paper)]">
                ${salaryIntel.estimateLow.toLocaleString()}–${salaryIntel.estimateHigh.toLocaleString()}
              </p>
              <p className="mt-1 text-[10px] text-dim">Basis: {salaryIntel.basis}. Treat as an estimate, not a disclosed offer range.</p>
            </>
          ) : (
            <p className="mt-2 text-xs text-dim">Not generated.</p>
          )}
        </div>
      </div>
    </section>
  );
}
