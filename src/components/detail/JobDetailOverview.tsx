"use client";

import { useState } from "react";
import { FileText, AlertTriangle, Wifi, Building2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/ui/Toaster";
import type { JobApplication } from "@/types";
import JobDetailSalaryPanel from "@/components/detail/JobDetailSalaryPanel";
import { sanitizeJobDescription } from "@/lib/security/jdSanitizer";
interface JobDetailOverviewProps {
  job: JobApplication;
}

export default function JobDetailOverview({ job }: JobDetailOverviewProps) {
  const { generateJobBrief, generateSalaryIntel } = useApp();
  const { success, error } = useToast();
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [loadingSalary, setLoadingSalary] = useState(false);

  const brief = job.jobBrief;
  const salaryIntel = job.salaryIntel;
  const companyResearch = job.multiAgentOutputs?.companyResearch;
  const cleanedDescription = sanitizeJobDescription(job.jobDescription || "").cleanText.trim();

  const runBrief = async () => {
    setLoadingBrief(true);
    try {
      await generateJobBrief(job.id);
      success("Posting-grounded role brief updated.");
    } catch (err) {
      error(err instanceof Error ? err.message : "Brief generation failed.");
    } finally {
      setLoadingBrief(false);
    }
  };

  const runSalary = async () => {
    setLoadingSalary(true);
    try {
      await generateSalaryIntel(job.id);
      success("Estimate updated.");
    } catch (err) {
      error(err instanceof Error ? err.message : "Estimate failed.");
    } finally {
      setLoadingSalary(false);
    }
  };

  return (
    <div className="space-y-8">
      <section data-testid="job-brief-panel" className="rounded-2xl border border-[var(--line)] bg-black/15 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-dim">
            <FileText className="h-4 w-4 text-[var(--sky)]" /> Role brief
          </h3>
          <Button variant="outline" size="sm" onClick={runBrief} loading={loadingBrief}>
            {brief ? "Refresh brief" : "Generate brief"}
          </Button>
        </div>
        {brief ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm leading-relaxed text-[var(--paper)]/90">{brief.summary}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-dim">
                  <Wifi className="h-3.5 w-3.5 text-[var(--sky)]" /> Named technology
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {brief.techStack.length > 0 ? (
                    brief.techStack.map((technology) => (
                      <span key={technology} className="rounded-md border border-[var(--sky)]/20 bg-[var(--sky)]/[0.06] px-2 py-1 text-[10px] text-[var(--sky)]">
                        {technology}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-dim">No explicit stack captured.</span>
                  )}
                </div>
              </div>
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-dim">
                  <AlertTriangle className="h-3.5 w-3.5 text-[var(--coral)]" /> Potential constraints
                </p>
                {brief.redFlags.length > 0 ? (
                  <ul className="space-y-1 text-xs text-[var(--paper)]/85">
                    {brief.redFlags.map((flag) => (
                      <li key={flag}>• {flag}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-dim">No red flags recorded.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-[var(--line)] p-4 text-center text-xs text-dim">
            No generated brief yet. The original description below remains the source of truth.
          </p>
        )}
        <div className="mt-4 border-t border-[var(--line)] pt-3">
          <button type="button" onClick={() => setShowFullDescription((v) => !v)} className="cursor-pointer text-[10px] font-semibold text-[var(--chartreuse)] hover:underline">
            {showFullDescription ? "Hide full posting description" : "Show full posting description"}
          </button>
          {showFullDescription && (
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[var(--paper)]/80">{cleanedDescription || "No job description was captured."}</p>
          )}
        </div>
      </section>

      <JobDetailSalaryPanel salary={job.salary} salaryIntel={salaryIntel} onGenerate={runSalary} loading={loadingSalary} />

      <section data-testid="company-research-panel" className="rounded-2xl border border-[var(--line)] bg-black/15 p-5">
        <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-dim">
          <Building2 className="h-4 w-4 text-[var(--sky)]" /> Company research
        </h3>
        {companyResearch && companyResearch.sources.length > 0 ? (
          <div className="mt-3 space-y-3">
            {companyResearch.summary && <p className="text-xs leading-relaxed text-[var(--paper)]/90">{companyResearch.summary}</p>}
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/[0.05] px-2 py-1 font-mono text-[9px] uppercase text-[var(--chartreuse)]">
                {companyResearch.status} · {companyResearch.sources.length} sources
              </span>
              {companyResearch.sources.slice(0, 8).map((source) => (
                <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--line)] px-2 py-1 font-mono text-[9px] text-dim hover:text-[var(--paper)]">
                  [{source.id}] {source.publisher}
                </a>
              ))}
            </div>
            {companyResearch.facts.length > 0 && (
              <dl className="grid gap-2 sm:grid-cols-2">
                {companyResearch.facts.slice(0, 6).map((fact) => (
                  <div key={fact.label} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                    <dt className="text-[10px] uppercase tracking-wider text-dim">{fact.label}</dt>
                    <dd className="mt-0.5 text-xs text-[var(--paper)]/90">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-[var(--line)] p-4 text-center text-xs text-dim">No external sources collected yet.</p>
        )}
      </section>
    </div>
  );
}
