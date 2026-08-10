"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Award, ShieldAlert, Sparkles, CheckCircle2, FileText, ArrowRight } from "lucide-react";
import { JobApplication, EmployerReview } from "@/types";
import { Button } from "@/components/ui/Button";

interface EmployerReviewModalProps {
  open: boolean;
  job: JobApplication | null;
  review: EmployerReview | null;
  onClose: () => void;
  onTailor: (job: JobApplication) => void;
}

export function EmployerReviewModal({ open, job, review, onClose, onTailor }: EmployerReviewModalProps) {
  if (!open || !job || !review) return null;

  const scoreColor =
    review.acceptanceProbability >= 80
      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
      : review.acceptanceProbability >= 55
      ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
      : "text-rose-400 border-rose-500/30 bg-rose-500/10";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--line)] bg-[#12141a] p-6 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-[var(--line)] pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-dim uppercase tracking-wider">
                <FileText className="h-3.5 w-3.5 text-accent" /> Employer Simulator Review
              </div>
              <h2 className="text-xl font-bold text-[var(--paper)] mt-1">
                {job.title} <span className="text-dim font-normal">at {job.company}</span>
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-dim hover:bg-white/10 hover:text-[var(--paper)] transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scores Overview */}
          <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className={`flex flex-col items-center justify-center rounded-xl border p-4 text-center ${scoreColor}`}>
              <span className="text-4xl font-extrabold tracking-tight">{review.acceptanceProbability}%</span>
              <span className="text-xs font-medium uppercase tracking-wider mt-1 opacity-90">
                Estimated Acceptance Odds
              </span>
              <span className="mt-2 rounded-full bg-black/30 px-2.5 py-0.5 text-[11px] font-semibold">
                Verdict: {review.verdict.replace("_", " ").toUpperCase()}
              </span>
            </div>

            <div className="flex flex-col items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-center text-blue-400">
              <span className="text-4xl font-extrabold tracking-tight">{review.atsPassScore}%</span>
              <span className="text-xs font-medium uppercase tracking-wider mt-1 opacity-90">
                ATS Screen Pass Score
              </span>
              <span className="mt-2 text-[11px] text-blue-300">Keyword & Format Match</span>
            </div>
          </div>

          {/* Details Tabs */}
          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
            {/* Strengths */}
            <div>
              <h4 className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wide mb-2">
                <Award className="h-4 w-4" /> Recruiter Highlights & Strengths
              </h4>
              <ul className="space-y-1.5 text-sm text-[var(--paper)]/90">
                {review.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-lg bg-white/5 p-2 text-xs">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Risk Factors */}
            <div>
              <h4 className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wide mb-2">
                <ShieldAlert className="h-4 w-4" /> ATS Red Flags & Risk Factors
              </h4>
              <ul className="space-y-1.5 text-sm text-[var(--paper)]/90">
                {review.riskFactors.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-lg bg-white/5 p-2 text-xs">
                    <span className="text-amber-400 font-bold shrink-0">!</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Actionable Fixes */}
            <div>
              <h4 className="flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-wide mb-2">
                <Sparkles className="h-4 w-4" /> Step-by-Step Document Fixes (+15-30% Boost)
              </h4>
              <ul className="space-y-1.5 text-sm text-[var(--paper)]/90">
                {review.actionableFixes.map((fix, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-lg bg-accent/10 border border-accent/20 p-2 text-xs text-purple-200">
                    <ArrowRight className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                    <span>{fix}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="mt-6 flex items-center justify-between border-t border-[var(--line)] pt-4">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              onClick={() => {
                onClose();
                onTailor(job);
              }}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white"
            >
              <Sparkles className="h-4 w-4" /> Tailor Papers to Maximize Odds
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
