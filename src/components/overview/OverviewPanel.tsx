"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Sparkles, Building2, Loader2, AlertOctagon, Globe, RefreshCw, FileText } from "lucide-react";
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
function CompanyAnalysis({ review, onRerun, loading }: { review: EmployerReview; onRerun: () => void; loading: boolean }) {
  const likes = review.strengths;
  const dislikes = review.riskFactors;
  const intel = review.companyIntel;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-[var(--chartreuse)]">
          <Building2 className="h-4 w-4 text-[var(--chartreuse)]" /> Agentic Company Intelligence & History
        </h4>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[var(--chartreuse)]/10 border border-[var(--chartreuse)]/25 px-2.5 py-0.5 font-mono text-[11px] font-bold text-[var(--chartreuse)]">
            {review.acceptanceProbability}% Callback Odds
          </span>
          <Button variant="ghost" size="sm" onClick={onRerun} loading={loading} title="Re-run Live Agentic Company Check">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Company Background & History */}
      {intel?.history && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-[var(--paper)] flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-[var(--sky)]" /> Company Background & Market Stage
            </span>
            <span className="font-mono text-dim text-[10px]">
              {intel.stage || "Growth Stage"} • HQ: {intel.headquarters || "Global"}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-[var(--paper)]/85">{intel.history}</p>

          {/* Products & Tech Stack */}
          <div className="grid gap-2 pt-2 border-t border-white/5 sm:grid-cols-2">
            {intel.products && intel.products.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-dim mb-1">Key Products</p>
                <div className="flex flex-wrap gap-1">
                  {intel.products.map((p, idx) => (
                    <span key={idx} className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-dim">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {intel.cultureSignals && intel.cultureSignals.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-dim mb-1">Culture Signals</p>
                <div className="flex flex-wrap gap-1">
                  {intel.cultureSignals.map((c, idx) => (
                    <span key={idx} className="rounded-md bg-[var(--chartreuse)]/10 text-[var(--chartreuse)] px-2 py-0.5 text-[10px]">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {likes.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--chartreuse)]">
            <ThumbsUp className="h-3.5 w-3.5" /> What recruiters like about your profile
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
            <ThumbsDown className="h-3.5 w-3.5" /> Gaps & Potential Flags
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
            <Sparkles className="h-3.5 w-3.5" /> Strategic Application Plays
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
  const [showFullJd, setShowFullJd] = useState(false);

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
      success("Live company intelligence gathered.");
    } catch (e) {
      errToast(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const rawDescription = job.jobDescription || "";
  const cleanedDesc = rawDescription.replace(/<[^>]*>/g, "").trim();

  return (
    <div className="space-y-5">
      {/* Executive Role Summary */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-dim">
            <FileText className="h-4 w-4 text-[var(--sky)]" /> Executive Role Summary & Overview
          </h4>
          <button
            onClick={() => setShowFullJd(!showFullJd)}
            className="text-[11px] font-mono text-[var(--chartreuse)] hover:underline flex items-center gap-1 cursor-pointer"
          >
            {showFullJd ? "Show AI Summary" : "View Full Job Description"}
          </button>
        </div>

        {!showFullJd ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-white/[0.02] border border-white/5 p-3.5">
              <p className="text-xs leading-relaxed text-[var(--paper)]/90">
                {job.jobBrief?.summary || cleanedDesc.slice(0, 320) || "No job summary available."}
              </p>
            </div>

            {/* Quick distilled bullet points from brief if available */}
            {job.jobBrief && (
              <div className="grid gap-3 sm:grid-cols-2">
                {job.jobBrief.topRequirements.length > 0 && (
                  <div className="rounded-xl bg-black/20 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-dim mb-1.5">
                      Core Mission & Deliverables
                    </p>
                    <ul className="space-y-1 text-xs text-[var(--paper)]/85">
                      {job.jobBrief.topRequirements.slice(0, 3).map((req, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-[var(--chartreuse)] font-mono">•</span> {req}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {job.jobBrief.techStack.length > 0 && (
                  <div className="rounded-xl bg-black/20 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-dim mb-1.5">
                      Target Tech Stack
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {job.jobBrief.techStack.map((tech) => (
                        <span
                          key={tech}
                          className="rounded-md bg-[var(--sky)]/10 border border-[var(--sky)]/20 px-2 py-0.5 text-[11px] font-medium text-[var(--sky)]"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-xl bg-black/40 p-4 border border-[var(--line)]">
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--paper)]/85">
              {cleanedDesc || "No description text provided."}
            </pre>
          </div>
        )}
      </div>

      {/* Agentic Company Analysis */}
      {review ? (
        <CompanyAnalysis review={review} onRerun={runCompanyAnalysis} loading={loading} />
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--line)] p-6 text-center">
          <Building2 className="mx-auto mb-2 h-7 w-7 text-[var(--chartreuse)]" />
          <h4 className="font-display text-sm font-semibold">Agentic Company Intelligence & History</h4>
          <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-dim">
            Deploy the background research agent to analyze {job.company}&apos;s founding history, market stage, products, and recruiter acceptance odds.
          </p>
          <Button onClick={runCompanyAnalysis} loading={loading} variant="outline" className="mt-4">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Researching company…" : "Run Agentic Company Check"}
          </Button>
        </div>
      )}
    </div>
  );
}