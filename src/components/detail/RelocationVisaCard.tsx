"use client";

import { useState } from "react";
import { AlertTriangle, Globe2, Clock } from "lucide-react";
import { generateRelocationVisaDossier } from "@/lib/agents/visaDossier";
import { calculatePppCompensation } from "@/lib/agents/salaryPpp";
import { cn } from "@/lib/utils";

interface RelocationVisaCardProps {
  regionCode?: string;
  roleTitle?: string;
  salary?: string;
  className?: string;
}

export default function RelocationVisaCard({
  regionCode = "US",
  roleTitle = "Software Engineer",
  salary,
  className,
}: RelocationVisaCardProps) {
  const dossier = generateRelocationVisaDossier(regionCode, roleTitle, salary);
  const ppp = salary ? calculatePppCompensation(salary, regionCode) : null;
  const [activePathway, setActivePathway] = useState(0);

  const pathway = dossier.pathways[activePathway] || dossier.pathways[0];

  return (
    <div className={cn("space-y-6 rounded-[1.5rem] border border-[var(--line)] bg-[var(--ink-card)]/60 p-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div className="flex items-center gap-2.5">
          <Globe2 className="h-5 w-5 text-[var(--chartreuse)]" />
          <div>
            <h4 className="font-display text-sm font-semibold text-[var(--paper)]">
              Relocation &amp; Visa Intelligence — {dossier.countryName}
            </h4>
            <p className="text-xs text-dim">
              Immigration pathways, paperwork checklists, and employment law realities.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 px-3 py-1 font-mono text-[11px] font-bold text-[var(--chartreuse)]">
          {dossier.regionCode} Regional Dossier
        </span>
      </div>

      {ppp && (
        <div className="rounded-xl border border-[var(--amber)]/25 bg-[var(--amber)]/[0.04] p-4 text-xs leading-relaxed">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--amber)]">
            Purchasing Power &amp; Net Take-Home
          </p>
          <p className="mt-1.5 font-semibold text-[var(--paper)]">{ppp.formattedSummary}</p>
          <p className="mt-1 text-[11px] text-dim">
            Estimated effective tax rate: {(ppp.estimatedTaxRate * 100).toFixed(0)}% · PPP Factor: {ppp.pppConversionFactor}
          </p>
        </div>
      )}

      {/* Pathway Selection */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {dossier.pathways.map((p, idx) => (
            <button
              key={p.name}
              type="button"
              onClick={() => setActivePathway(idx)}
              className={cn(
                "rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer",
                activePathway === idx
                  ? "bg-[var(--chartreuse)]/10 text-[var(--chartreuse)] ring-1 ring-[var(--chartreuse)]/30"
                  : "bg-white/[0.02] text-dim hover:bg-white/[0.05] hover:text-[var(--paper)]"
              )}
            >
              {p.name}
            </button>
          ))}
        </div>

        {pathway && (
          <div className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[var(--paper)]">{pathway.eligibilitySummary}</span>
              <span className="flex items-center gap-1 font-mono text-[11px] text-dim">
                <Clock className="h-3.5 w-3.5 text-[var(--sky)]" /> {pathway.processingTimeEst}
              </span>
            </div>
            {pathway.salaryThreshold && (
              <p className="text-xs text-[var(--amber)] font-medium">
                Minimum Salary Threshold: {pathway.salaryThreshold}
              </p>
            )}
            <div className="space-y-1.5 pt-2">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-dim">Required Paperwork</p>
              <ul className="list-disc pl-4 space-y-1 text-xs text-dim">
                {pathway.requiredDocuments.map((doc, dIdx) => (
                  <li key={dIdx}>{doc}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Labor Law Highlights */}
      <div className="grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--ink-soft)]/40 p-4 sm:grid-cols-2 text-xs">
        <div>
          <span className="font-semibold text-[var(--paper)]">Standard Probation:</span>{" "}
          <span className="text-dim">{dossier.employmentLawHighlights.standardProbationMonths} Months</span>
        </div>
        <div>
          <span className="font-semibold text-[var(--paper)]">Statutory Annual Leave:</span>{" "}
          <span className="text-dim">{dossier.employmentLawHighlights.annualLeaveDaysMin} Days/year</span>
        </div>
        <div className="sm:col-span-2">
          <span className="font-semibold text-[var(--paper)]">Notice Period Norms:</span>{" "}
          <span className="text-dim">{dossier.employmentLawHighlights.noticePeriodNorms}</span>
        </div>
      </div>

      {/* Regulatory Disclaimers */}
      <div className="space-y-1.5 rounded-xl border border-[var(--coral)]/20 bg-[var(--coral)]/[0.03] p-4 text-[11px] leading-relaxed text-dim">
        <p className="flex items-center gap-1.5 font-bold uppercase tracking-[0.15em] text-[var(--coral)]">
          <AlertTriangle className="h-3.5 w-3.5" /> Honest Regulatory Disclaimers
        </p>
        {dossier.caveatsAndDisclaimers.map((c, i) => (
          <p key={i}>{c}</p>
        ))}
      </div>
    </div>
  );
}
