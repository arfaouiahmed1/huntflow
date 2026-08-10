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
} from "lucide-react";
import { JobApplication, EmployerReview } from "@/types";
import { Button } from "@/components/ui/Button";

interface JobSwipeDeckProps {
  jobs: JobApplication[];
  onAutoApply: (job: JobApplication) => void;
  onTailor: (job: JobApplication) => void;
  onRunEmployerReview: (job: JobApplication) => void;
  onCrawlMore?: () => void;
}

export function JobSwipeDeck({
  jobs,
  onAutoApply,
  onTailor,
  onRunEmployerReview,
  onCrawlMore,
}: JobSwipeDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!jobs || jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--line)] bg-[#12141a]/60 p-12 text-center">
        <Globe className="h-12 w-12 text-accent animate-pulse mb-3" />
        <h3 className="text-lg font-bold text-[var(--paper)]">No Crawled Jobs in Deck</h3>
        <p className="text-xs text-dim max-w-md mt-1 mb-4">
          Launch a Scrapling crawl to fetch tailored job postings across Remote, MENA/Tunisia, Qatar, Europe, and Global tech boards.
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
    if (currentIndex < jobs.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  };

  const fitCategory = job.fitCategory || (job.matchScore && job.matchScore >= 75 ? "direct_fit" : "tailored_fit");
  const isDirectFit = fitCategory === "direct_fit";

  const review: EmployerReview | undefined = job.employerReview;

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      {/* Deck Controls Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-xs font-semibold uppercase tracking-wider text-dim">
            Spout Spotlight Deck ({currentIndex + 1} of {jobs.length})
          </span>
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
          {/* Fit Category Banner */}
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-5">
            <div className="flex items-center gap-3">
              {isDirectFit ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Direct Fit Job
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/15 px-3 py-1 text-xs font-bold text-purple-400 border border-purple-500/30">
                  <Sparkles className="h-3.5 w-3.5" /> Tailor to Fit Job
                </span>
              )}
              {job.matchScore && (
                <span className="text-xs font-semibold text-dim">
                  Match Score: <strong className="text-[var(--paper)]">{job.matchScore}%</strong>
                </span>
              )}
            </div>

            {/* Acceptance Probability Meter Badge */}
            {review ? (
              <button
                onClick={() => onRunEmployerReview(job)}
                className="flex items-center gap-2 rounded-xl bg-black/40 border border-[var(--line)] px-3 py-1.5 hover:bg-white/5 transition-all"
              >
                <Award className="h-4 w-4 text-amber-400" />
                <div className="text-left">
                  <div className="text-[10px] uppercase font-bold text-dim">Acceptance Probability</div>
                  <div className="text-xs font-extrabold text-amber-400">{review.acceptanceProbability}%</div>
                </div>
              </button>
            ) : (
              <button
                onClick={() => onRunEmployerReview(job)}
                className="flex items-center gap-1.5 text-xs text-accent hover:underline font-semibold"
              >
                <FileCheck className="h-4 w-4" /> Simulate Acceptance Odds
              </button>
            )}
          </div>

          {/* Job Info Header */}
          <div className="my-6">
            <h2 className="text-2xl font-black text-[var(--paper)] tracking-tight">{job.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-dim">
              <span className="flex items-center gap-1.5 font-medium text-[var(--paper)]/90">
                <Building className="h-4 w-4 text-accent" /> {job.company}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-dim" /> {job.location || "Remote / Flexible"}
              </span>
              {job.salary && (
                <span className="flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4 text-emerald-400" /> {job.salary}
                </span>
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
          {job.skillsGap?.matchingSkills && (
            <div className="mb-6">
              <span className="text-[11px] font-bold text-dim uppercase tracking-wider block mb-2">Matching Tech Stack</span>
              <div className="flex flex-wrap gap-1.5">
                {job.skillsGap.matchingSkills.slice(0, 6).map((skill, i) => (
                  <span key={i} className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                disabled={currentIndex === 0}
                className="flex items-center gap-1 text-xs text-dim hover:text-[var(--paper)] disabled:opacity-30"
              >
                <XCircle className="h-4 w-4" /> Skip
              </button>
            </div>

            <div className="flex items-center gap-3">
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
                <Zap className="h-4 w-4" /> Instant Auto-Apply
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
