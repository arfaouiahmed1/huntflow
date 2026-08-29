"use client";

import { useState } from "react";
import { Globe, ShieldAlert } from "lucide-react";
import { JobApplication } from "@/types";
import AgentRunMonitor from "@/components/agent/AgentRunMonitor";
import Select from "@/components/ui/Select";
import Checkbox from "@/components/ui/Checkbox";
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
        <Checkbox
          checked={submitAfterReview}
          onChange={setSubmitAfterReview}
          label="Allow submission after review"
          description="Every run still pauses for your explicit approval."
          className="flex-1 min-w-[220px]"
        />
        <label className="ml-auto flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-dim">Region norms</span>
          <Select
            value={region}
            onChange={(v) => setRegion(v as RegionCode)}
            options={REGIONS.map((r) => ({ value: r.code, label: r.label }))}
            ariaLabel="Region norms"
            className="w-44"
          />
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
