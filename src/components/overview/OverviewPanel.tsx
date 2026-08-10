"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Sparkles, Building2, Loader2, AlertOctagon } from "lucide-react";
import { JobApplication, EmployerReview } from "@/types";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { toErrorMessage } from "@/lib/errors";

function summaryFrom(job: JobApplication): string {
  if (job.jobBrief?.summary) return job.jobBrief.summary;
  // Fallback: lead with the first meaningful line of the description.
  const cleaned = (job.jobDescription || "")
    .replace(/<[^>]*>/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ");
  return cleaned.slice(0, 240) || "No description on file for this role.";
}

/** Render the recruiter's "what they like" / "what they don't" sections. */
function CompanyAnalysis({ review }: { review: EmployerReview }) {
  const likes = review.strengths;
  const dislikes = review.riskFactors;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-dim">
          <Building2 className="h-4 w-4 text-[var(--chartreuse)]" /> Company Analysis
        </h4>
        <span className="rounded-full bg-white/5 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-dim">
          {review.acceptanceProbability}% odds
        </span>
      </div>

      {likes.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--chartreuse)]">
            <ThumbsUp className="h-3.5 w-3.5" /> What they like
          </p>
          <ul className="space-y-1.5">
            {likes.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-[var(--paper)]/90">
                <ThumbsUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--chartreuse)]" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dislikes.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--coral)]">
            <ThumbsDown className="h-3.5 w-3.5" /> What they don't like
          </p>
          <ul className="space-y-1.5">
            {dislikes.map((r, i) => (
              <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-[var(--paper)]/85">
                <ThumbsDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--coral)]" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {review.actionableFixes.length > 0 && (
        <div className="rounded-xl border border-[var(--chartreuse)]/25 bg-[var(--chartreuse)]/5 p-3.5">
          <p className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--chartreuse)]">
            <Sparkles className="h-3.5 w-3.5" /> How to sway them
          </p>
          <ul className="space-y-1">
            {review.actionableFixes.map((f, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed text-[var(--paper)]/85">
                <span className="font-mono text-[var(--chartreuse)]">{String(i + 1).padStart(2, "0")}</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function OverviewPanel({ job }: { job: JobApplication }) {
  const { updateApplication } = useApp();
  const { success, error: errToast } = useToast();
  const [loading, setLoading] = useState(false);

  const review = job.employerReview;

  const runCompanyAnalysis = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agent/employer-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Company analysis failed.");
      updateApplication(job.id, { employerReview: data.review });
      success("Company analysis complete.");
    } catch (e) {
      errToast(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* At-a-glance summary */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
        <h4 className="mb-2 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-dim">
          <Building2 className="h-4 w-4 text-[var(--sky)]" /> The Role in a Nutshell
        </h4>
        <p className="text-sm leading-relaxed text-[var(--paper)]/90">{summaryFrom(job)}</p>
      </div>

      {/* Company analysis */}
      {review ? (
        <CompanyAnalysis review={review} />
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--line)] p-6 text-center">
          <AlertOctagon className="mx-auto mb-2 h-7 w-7 text-[var(--amber)]" />
          <h4 className="font-display text-sm font-semibold">Company Analysis</h4>
          <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-dim">
            Run the employer-simulator agent to learn what this company likely likes about your profile and what raises a red flag.
          </p>
          <Button onClick={runCompanyAnalysis} loading={loading} variant="outline" className="mt-4">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Analyzing company…" : "Run Company Analysis"}
          </Button>
        </div>
      )}
    </div>
  );
}