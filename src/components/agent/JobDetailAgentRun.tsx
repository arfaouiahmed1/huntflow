"use client";

import { useState } from "react";
import { Globe, ShieldAlert } from "lucide-react";
import { JobApplication } from "@/types";
import AgentRunMonitor from "@/components/agent/AgentRunMonitor";
import { RegionCode } from "@/lib/agents/regionalNorms";

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

export default function JobDetailAgentRun({ job }: { job: JobApplication }) {
  const [region, setRegion] = useState<RegionCode>("US");
  const [submitAfterReview, setSubmitAfterReview] = useState(false);

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-end gap-4 rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4 text-xs">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={submitAfterReview}
            onChange={(event) => setSubmitAfterReview(event.target.checked)}
            className="rounded border-[var(--line)] accent-[var(--chartreuse)]"
          />
          <div>
            <span className="font-medium text-[var(--paper)]">Allow submission after review</span>
            <p className="text-[10px] text-dim">Every run still pauses for your explicit approval.</p>
          </div>
        </label>
        <label className="ml-auto flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-dim">Region norms</span>
          <select
            value={region}
            onChange={(event) => setRegion(event.target.value as RegionCode)}
            className="rounded-lg border border-[var(--line)] bg-black/40 px-2 py-1.5 text-xs text-[var(--paper)] outline-none focus:border-[var(--chartreuse)]/60"
          >
            {REGIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
          </select>
        </label>
      </section>
      {submitAfterReview && (
        <p className="flex items-center gap-2 rounded-lg border border-[var(--amber)]/25 bg-[var(--amber)]/[0.05] px-3 py-2 text-[11px] text-dim">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-[var(--amber)]" /> Submission remains disabled until the review acknowledgement is checked.
        </p>
      )}
      <AgentRunMonitor job={job} region={region} submit={submitAfterReview} />
    </div>
  );
}
