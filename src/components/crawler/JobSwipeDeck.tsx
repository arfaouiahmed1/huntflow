"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Zap,
  CheckCircle2,
  XCircle,
  Building,
  MapPin,
  DollarSign,
  Globe,
  Award,
  RefreshCw,
  FileCheck,
  Bookmark,
  ExternalLink,
  Tag,
  History,
  AlertTriangle,
  Bot,
  FileText,
  ImageIcon,
} from "lucide-react";
import { JobApplication, EmployerReview } from "@/types";
import { Button } from "@/components/ui/Button";
import { agentScreenshotUrl } from "@/lib/agentScreenshot";
import { displayJobCompany, displayJobTitle } from "@/lib/jobDisplay";

interface JobSwipeDeckProps {
  jobs: JobApplication[];
  onAutoApply: (job: JobApplication) => void;
  onTailor: (job: JobApplication) => void;
  onRunEmployerReview: (job: JobApplication) => void;
  onCrawlMore?: () => void;
  /** When provided, renders a "Save to tracker" action on each card. */
  onSave?: (job: JobApplication) => void;
  /** When provided, "Skip" records the decision before advancing. */
  onReviewed?: (job: JobApplication, reason?: string) => void;
}

const SKIP_REASONS = [
  { label: "Salary Low", key: "salary_low", icon: DollarSign },
  { label: "Stack Mismatch", key: "stack_mismatch", icon: Sparkles },
  { label: "On-site only", key: "onsite_only", icon: MapPin },
  { label: "Wrong Seniority", key: "seniority_mismatch", icon: Award },
];

export function JobSwipeDeck({
  jobs,
  onAutoApply,
  onTailor,
  onRunEmployerReview,
  onCrawlMore,
  onSave,
  onReviewed,
}: JobSwipeDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewTab, setViewTab] = useState<"summary" | "screenshot">("summary");
  const [showSkipMenu, setShowSkipMenu] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!jobs || jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--line)] bg-[#12141a]/60 p-12 text-center">
        <Globe className="h-12 w-12 text-accent animate-pulse mb-3" />
        <h3 className="text-lg font-bold text-[var(--paper)]">No roles loaded yet</h3>
        <p className="text-xs text-dim max-w-md mt-1 mb-4">
          Use the controls above to choose your sources and start an explicit crawl. Results will appear here for review.
        </p>
        {onCrawlMore && (
          <Button onClick={onCrawlMore} className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Crawl Web Jobs Now
          </Button>
        )}
      </div>
    );
  }

  const job = jobs[Math.min(currentIndex, jobs.length - 1)];

  const handleNext = () => {
    setShowSkipMenu(false);
    setViewTab("summary");
    if (currentIndex < jobs.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handlePrev = () => {
    setShowSkipMenu(false);
    setViewTab("summary");
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  };

  const handleSkipWithReason = (reason?: string) => {
    if (onReviewed) onReviewed(job, reason);
    setShowSkipMenu(false);
    if (currentIndex < jobs.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  };

  const fitCategory = job.fitCategory || (job.matchScore && job.matchScore >= 75 ? "direct_fit" : "tailored_fit");
  const isDirectFit = fitCategory === "direct_fit";
  const review: EmployerReview | undefined = job.employerReview;

  const shotSrc = agentScreenshotUrl(job.screenshotUrl, job.cloudinaryUrl);
  const salaryIntel = job.salaryIntel;
  const salaryLabel = salaryIntel?.disclosedRange
    ? `Disclosed: ${salaryIntel.disclosedRange}`
    : salaryIntel
    ? `Est. ${salaryIntel.estimateLow?.toLocaleString?.() ?? "?"}–${salaryIntel.estimateHigh?.toLocaleString?.() ?? "?"} · ${salaryIntel.basis}`
    : null;

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      {/* Deck Controls Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-xs font-semibold uppercase tracking-wider text-dim">
            Spotlight Deck ({currentIndex + 1} of {jobs.length})
          </span>
          {job.source && (
            <span className="rounded-md border border-[var(--line)] bg-black/40 px-2 py-0.5 font-mono text-[10px] text-dim">
              {job.source}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-[#12141a] text-dim hover:text-[var(--paper)] disabled:opacity-40 transition-all"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={handleNext}
            disabled={currentIndex === jobs.length - 1}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-[#12141a] text-dim hover:text-[var(--paper)] disabled:opacity-40 transition-all"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Spotlight Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={job.id}
          initial={{ opacity: 0, x: 50, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -50, scale: 0.98 }}
          transition={{ duration: 0.25 }}
          className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[#12141a] p-8 shadow-2xl backdrop-blur-xl"
        >
          {/* Top Bar with Fit & Tab Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-5">
            <div className="flex items-center gap-3">
              {isDirectFit ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 px-3 py-1 text-xs font-bold text-[var(--chartreuse)]">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Direct Fit Job
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--violet)]/30 bg-[var(--violet)]/10 px-3 py-1 text-xs font-bold text-[var(--violet)]">
                  <Sparkles className="h-3.5 w-3.5" /> Tailor to Fit Job
                </span>
              )}
              {job.matchScore && (
                <span className="text-xs font-semibold text-dim">
                  Match Score: <strong className="text-[var(--paper)]">{job.matchScore}%</strong>
                </span>
              )}
            </div>

            {/* View Switcher: Summary vs Visual Screenshot */}
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-[var(--line)] bg-black/40 p-0.5">
                <button
                  onClick={() => setViewTab("summary")}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                    viewTab === "summary"
                      ? "bg-[var(--line)] text-[var(--paper)]"
                      : "text-dim hover:text-[var(--paper)]"
                  }`}
                >
                  Summary
                </button>
                <button
                  onClick={() => setViewTab("screenshot")}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                    viewTab === "screenshot"
                      ? "bg-[var(--line)] text-[var(--chartreuse)]"
                      : "text-dim hover:text-[var(--paper)]"
                  }`}
                >
                  <Globe className="h-3 w-3" />
                  Visual Proof
                  {job.cloudinaryUrl && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--chartreuse)]" />
                  )}
                </button>
              </div>

              {review ? (
                <button
                  onClick={() => onRunEmployerReview(job)}
                  className="flex items-center gap-2 rounded-xl bg-black/40 border border-[var(--line)] px-3 py-1.5 hover:bg-white/5 transition-all"
                >
                  <Award className="h-4 w-4 text-amber-400" />
                  <div className="text-left">
                    <div className="text-[10px] uppercase font-bold text-dim">Acceptance</div>
                    <div className="text-xs font-extrabold text-amber-400">{review.acceptanceProbability}%</div>
                  </div>
                </button>
              ) : (
                <button
                  onClick={() => onRunEmployerReview(job)}
                  className="flex items-center gap-1.5 text-xs text-accent hover:underline font-semibold"
                >
                  <FileCheck className="h-4 w-4" /> Simulate Odds
                </button>
              )}
            </div>
          </div>

          {/* Body: Summary Tab vs Screenshot Tab */}
          {viewTab === "summary" ? (
            <>
              {/* Job Info Header */}
              <div className="my-6">
                <h2 className="text-2xl font-black text-[var(--paper)] tracking-tight">{displayJobTitle(job)}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-dim">
                  <span className="flex items-center gap-1.5 font-medium text-[var(--paper)]/90">
                    <Building className="h-4 w-4 text-accent" /> {displayJobCompany(job)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-dim" /> {job.location || "Remote / Flexible"}
                  </span>
                  {job.salary && (
                    <span className="flex items-center gap-1.5">
                      <DollarSign className="h-4 w-4 text-emerald-400" /> {job.salary}
                    </span>
                  )}
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-[var(--sky)] hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Open original posting
                    </a>
                  )}
                </div>
              </div>

              {/* Description Excerpt */}
              <div className="my-6 rounded-2xl bg-black/30 p-5 border border-[var(--line)]/50">
                <h4 className="text-xs font-bold uppercase tracking-wider text-dim mb-2">Job Description Highlights</h4>
                <p className="text-xs leading-relaxed text-[var(--paper)]/80 line-clamp-4">
                  {job.jobDescription || "No detailed description extracted."}
                </p>
              </div>

              {/* Key Skill Tags */}
              <div className="mb-4 flex flex-wrap gap-1.5">
                {review?.verdict ? (
                  <span
                    data-testid="deck-employer-verdict"
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                      review.verdict === "interview_likely"
                        ? "border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                        : review.verdict === "possible_callback"
                        ? "border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]"
                        : "border-[var(--coral)]/30 bg-[var(--coral)]/10 text-[var(--coral)]"
                    }`}
                  >
                    <Award className="h-3 w-3" /> {review.verdict.replace(/_/g, " ")} · {review.acceptanceProbability}%
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.03] px-2.5 py-1 text-[11px] text-dim">
                    <Award className="h-3 w-3" /> no verdict
                  </span>
                )}
                <span
                  data-testid="deck-fit-category"
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                    isDirectFit
                      ? "border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                      : "border-[var(--violet)]/30 bg-[var(--violet)]/10 text-[var(--violet)]"
                  }`}
                >
                  <Tag className="h-3 w-3" /> {fitCategory.replace(/_/g, " ")}
                </span>
                {salaryLabel ? (
                  <span
                    data-testid="deck-salary-intel"
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                      salaryIntel?.disclosedRange
                        ? "border-[var(--sky)]/30 bg-[var(--sky)]/10 text-[var(--sky)]"
                        : "border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]"
                    }`}
                  >
                    <DollarSign className="h-3 w-3" /> {salaryLabel}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.03] px-2.5 py-1 text-[11px] text-dim">
                    <DollarSign className="h-3 w-3" /> salary n/a
                  </span>
                )}
                {job.skipReason && (
                  <span
                    data-testid="deck-skip-reason"
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-2.5 py-1 text-[11px] font-bold text-[var(--coral)]"
                  >
                    <AlertTriangle className="h-3 w-3" /> skip: {job.skipReason.replace(/_/g, " ")}
                  </span>
                )}
              </div>

              {job.jobBrief?.summary && (
                <div data-testid="deck-job-brief" className="mb-4 rounded-xl border border-[var(--line)] bg-white/[0.03] p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-dim">
                    <FileText className="h-3 w-3" /> Role brief
                  </p>
                  <p className="text-xs leading-relaxed text-[var(--paper)]/80">{job.jobBrief.summary}</p>
                  {job.jobBrief.techStack?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {job.jobBrief.techStack.slice(0, 5).map((t) => (
                        <span key={t} className="rounded-md border border-[var(--line)] bg-black/20 px-1.5 py-0.5 text-[10px] text-dim">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              {job.skillsGap && (
                <div data-testid="deck-skills-gap" className="mb-4 rounded-xl border border-[var(--line)] bg-white/[0.03] p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-dim">
                    <Zap className="h-3 w-3 text-[var(--chartreuse)]" /> Skills gap
                  </p>
                  {job.skillsGap.matchingSkills?.length ? (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {job.skillsGap.matchingSkills.slice(0, 5).map((skill, i) => (
                        <span key={i} className="rounded-md border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--chartreuse)]">
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {job.skillsGap.missingSkills?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {job.skillsGap.missingSkills.slice(0, 5).map((skill, i) => (
                        <span key={i} className="rounded-md border border-[var(--coral)]/20 bg-[var(--coral)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--coral)]">
                          missing: {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-dim">No missing skills flagged</p>
                  )}
                </div>
              )}

              {job.multiAgentOutputs && Object.keys(job.multiAgentOutputs).length > 0 && (
                <div data-testid="deck-multi-agent" className="mb-4 rounded-xl border border-[var(--line)] bg-white/[0.03] p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-dim">
                    <Bot className="h-3 w-3 text-[var(--sky)]" /> Multi-agent chips
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {typeof job.multiAgentOutputs.atsScore === "number" && (
                      <span className="rounded-full border border-[var(--violet)]/30 bg-[var(--violet)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--violet)]">ATS {job.multiAgentOutputs.atsScore}</span>
                    )}
                    {job.multiAgentOutputs.recommendedTemplate && (
                      <span className="rounded-full border border-[var(--sky)]/30 bg-[var(--sky)]/10 px-2 py-0.5 text-[11px] text-[var(--sky)]">{job.multiAgentOutputs.recommendedTemplate}</span>
                    )}
                    {(job.multiAgentOutputs.matchingSkills || []).slice(0, 3).map((s) => (
                      <span key={s} className="rounded-full border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/10 px-2 py-0.5 text-[11px] text-[var(--chartreuse)]">{s}</span>
                    ))}
                    {job.multiAgentOutputs.salaryEstimate && (
                      <span className="rounded-full border border-[var(--amber)]/30 bg-[var(--amber)]/10 px-2 py-0.5 text-[11px] text-[var(--amber)]">{job.multiAgentOutputs.salaryEstimate}</span>
                    )}
                  </div>
                </div>
              )}

              {shotSrc && (
                <div data-testid="deck-screenshot-proof" className="mb-4 overflow-hidden rounded-xl border border-[var(--line)] bg-black/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shotSrc} alt="Proof" className="max-h-28 w-full object-cover object-top" />
                  <div className="flex items-center gap-1.5 border-t border-[var(--line)] px-3 py-1.5 text-[10px] font-semibold text-dim">
                    <ImageIcon className="h-3 w-3 text-[var(--chartreuse)]" /> Visual Proof
                    {job.cloudinaryUrl && <span className="h-1.5 w-1.5 rounded-full bg-[var(--chartreuse)]" />}
                  </div>
                </div>
              )}

              {job.autoApplyLogs?.length ? (
                <div data-testid="deck-logs-timeline" className="mb-4 rounded-xl border border-[var(--line)] bg-white/[0.03] p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-dim">
                    <History className="h-3 w-3 text-[var(--amber)]" /> Timeline · {job.autoApplyLogs.length} events
                  </p>
                  <ol className="relative border-l border-[var(--line)] pl-4">
                    {job.autoApplyLogs.slice(-4).map((log, idx) => (
                      <li key={`${log.timestamp}-${idx}`} className="relative pb-2 last:pb-0">
                        <span
                          className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border border-[var(--line)] ${
                            log.type === "success"
                              ? "bg-[var(--chartreuse)]"
                              : log.type === "warning"
                              ? "bg-[var(--amber)]"
                              : log.type === "error"
                              ? "bg-[var(--coral)]"
                              : "bg-[var(--sky)]"
                          }`}
                        />
                        <p className="text-[11px] leading-snug text-[var(--paper)]/85">{log.message}</p>
                        <p className="font-mono text-[10px] text-dim">{new Date(log.timestamp).toLocaleString()}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </>
          ) : (
            <div className="my-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--paper)]">Live Scraped View</h3>
                  <p className="text-xs text-dim">Visual snapshot of posting on original board</p>
                </div>
                {job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-[var(--chartreuse)] hover:underline font-mono"
                  >
                    Open Source URL →
                  </a>
                )}
              </div>

              {shotSrc ? (
                <div
                  onClick={() => setLightboxOpen(true)}
                  className="group relative cursor-pointer overflow-hidden rounded-2xl border border-[var(--line)] bg-black/50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={shotSrc}
                    alt={`${job.company} listing snapshot`}
                    className="max-h-[320px] w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="rounded-xl border border-white/20 bg-black/80 px-3 py-1.5 text-xs font-bold text-white shadow-xl">
                      🔍 Click to Zoom Full Image
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-black/20 p-10 text-center">
                  <Globe className="h-8 w-8 text-dim mb-2" />
                  <p className="text-xs text-dim">No screenshot captured for this card.</p>
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 text-xs text-[var(--chartreuse)] hover:underline"
                    >
                      Visit job page directly →
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Active Learning Skip Reasons Panel */}
          {showSkipMenu && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="my-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-amber-400">
                  🧠 Active Learning: Why are you skipping this role?
                </p>
                <button
                  onClick={() => handleSkipWithReason("generic")}
                  className="text-[11px] text-dim hover:text-[var(--paper)]"
                >
                  Just Skip (No Reason)
                </button>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {SKIP_REASONS.map((r) => {
                  const Icon = r.icon;
                  return (
                    <button
                      key={r.key}
                      onClick={() => handleSkipWithReason(r.key)}
                      className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[#12141a] px-3 py-1.5 text-xs text-[var(--paper)] hover:border-amber-400 hover:text-amber-300 transition-all"
                    >
                      <Icon className="h-3.5 w-3.5 text-amber-400" />
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSkipMenu(!showSkipMenu)}
                className="flex items-center gap-1.5 text-xs text-dim hover:text-[var(--paper)] transition-colors"
              >
                <XCircle className="h-4 w-4 text-coral-400" /> Skip with Reason
              </button>
            </div>

            <div className="flex items-center gap-3">
              {onSave && (
                <Button
                  variant="outline"
                  onClick={() => onSave(job)}
                  className="flex items-center gap-2 text-xs border-sky-500/40 text-sky-300 hover:bg-sky-500/10"
                >
                  <Bookmark className="h-4 w-4 text-sky-400" /> Save to Tracker
                </Button>
              )}

              {!isDirectFit && (
                <Button
                  variant="outline"
                  onClick={() => onTailor(job)}
                  className="flex items-center gap-2 text-xs border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
                >
                  <Sparkles className="h-4 w-4 text-purple-400" /> Tailor Profile to Fit
                </Button>
              )}

              <Button
                onClick={() => onAutoApply(job)}
                className="flex items-center gap-2 text-xs bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg"
              >
                <Zap className="h-4 w-4" /> Review with Agent
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Lightbox for Screenshot Zoom */}
      {lightboxOpen && shotSrc && (
        <div
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] max-w-5xl overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--ink-card)] p-3"
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-2 mb-2 text-xs">
              <span className="font-bold text-[var(--paper)]">
                📸 {job.company} — {job.title}
              </span>
              <button
                onClick={() => setLightboxOpen(false)}
                className="rounded-lg p-1 text-dim hover:bg-white/10 hover:text-[var(--paper)]"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shotSrc} alt="Full Screenshot" className="max-h-[80vh] w-auto rounded-lg object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
