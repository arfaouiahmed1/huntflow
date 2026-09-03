"use client";

import { useState } from "react";
import { Globe, ShieldAlert } from "lucide-react";
import { JobApplication } from "@/types";
import AgentRunMonitor from "@/components/agent/AgentRunMonitor";
import Select from "@/components/ui/Select";
import Checkbox from "@/components/ui/Checkbox";
import { RegionCode } from "@/lib/agents/regionalNorms";

const REGIONS: { code: RegionCode; label: string }[] = [
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "UK", label: "United Kingdom" },
  { code: "DE", label: "Germany (DACH)" },
  { code: "FR", label: "France" },
  { code: "NL", label: "Netherlands" },
  { code: "CH", label: "Switzerland" },
  { code: "TN", label: "Tunisia" },
  { code: "EG", label: "Egypt" },
  { code: "AE", label: "UAE / GCC" },
  { code: "AU", label: "Australia" },
  { code: "SG", label: "Singapore" },
  { code: "IN", label: "India" },
  { code: "JP", label: "Japan" },
  { code: "BR", label: "Brazil" },
  { code: "MX", label: "Mexico" },
  { code: "NG", label: "Nigeria" },
  { code: "ZA", label: "South Africa" },
  { code: "INTL", label: "Global Remote" },
];

export default function JobDetailAgentRun({ job }: { job: JobApplication }) {
  const [region, setRegion] = useState<RegionCode>("US");
  const [submitAfterReview, setSubmitAfterReview] = useState(false);

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end gap-6 rounded-[1.5rem] border border-[var(--line)] bg-white/[0.02] p-6">
        <Checkbox
          checked={submitAfterReview}
          onChange={setSubmitAfterReview}
          label="Allow submission after review"
          description="Every run still pauses for your explicit approval — no silent auto-submit."
          className="flex-1 min-w-[260px]"
        />
        <label className="ml-auto flex items-center gap-3">
          <Globe className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-dim">Region norms</span>
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
        <p className="flex items-center gap-2 rounded-xl border border-[var(--amber)]/25 bg-[var(--amber)]/[0.05] px-4 py-3 text-xs leading-relaxed text-dim">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-[var(--amber)]" /> Submission remains disabled until the review acknowledgement is checked.
        </p>
      )}
      <AgentRunMonitor job={job} region={region} submit={submitAfterReview} />
    </div>
  );
}
