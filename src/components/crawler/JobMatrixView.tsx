"use client";

import { useState } from "react";
import {
  Bookmark,
  Building,
  DollarSign,
  Loader2,
  MapPin,
  Sparkles,
  Zap,
  XCircle,
  Camera,
  CheckSquare,
  Square,
  ExternalLink,
} from "lucide-react";
import { JobApplication } from "@/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { agentScreenshotUrl } from "@/lib/agentScreenshot";
import { displayJobCompany, displayJobTitle } from "@/lib/jobDisplay";

interface JobMatrixViewProps {
  jobs: JobApplication[];
  onSave: (job: JobApplication) => void;
  onAutoApply: (job: JobApplication) => void;
  onTailor: (job: JobApplication) => void;
  onRunEmployerReview?: (job: JobApplication) => void;
  onReviewed: (job: JobApplication, reason?: string) => void;
  onBatchSave: (jobs: JobApplication[]) => void;
  onBatchAutoApply: (jobs: JobApplication[]) => Promise<void>;
  onBatchMatch: (jobs: JobApplication[]) => Promise<void>;
}

export function JobMatrixView({
  jobs,
  onSave,
  onAutoApply,
  onTailor,
  onReviewed,
  onBatchSave,
  onBatchAutoApply,
  onBatchMatch,
}: JobMatrixViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterScore, setFilterScore] = useState<number>(0);
  const [filterDirectFitOnly, setFilterDirectFitOnly] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [activeShot, setActiveShot] = useState<{ src: string; title: string; company: string } | null>(null);

  const filteredJobs = jobs.filter((j) => {
    if (filterDirectFitOnly && (j.matchScore ?? 0) < 75) return false;
    if (filterScore > 0 && (j.matchScore ?? 0) < filterScore) return false;
    return true;
  });

  const allSelected = filteredJobs.length > 0 && selectedIds.size === filteredJobs.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredJobs.map((j) => j.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectedJobs = jobs.filter((j) => selectedIds.has(j.id));

  const handleBatchSave = () => {
    if (selectedJobs.length === 0) return;
    onBatchSave(selectedJobs);
    setSelectedIds(new Set());
  };

  const handleBatchApply = async () => {
    if (selectedJobs.length === 0) return;
    setBatchBusy(true);
    try {
      await onBatchAutoApply(selectedJobs);
      setSelectedIds(new Set());
    } finally {
      setBatchBusy(false);
    }
  };

  const handleBatchMatch = async () => {
    if (selectedJobs.length === 0) return;
    setBatchBusy(true);
    try {
      await onBatchMatch(selectedJobs);
    } finally {
      setBatchBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Action Toolbar & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[#12141a]/90 p-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-black/40 px-3 py-1.5 text-xs font-semibold text-[var(--paper)] hover:bg-white/5 transition-all"
          >
            {allSelected ? (
              <CheckSquare className="h-4 w-4 text-[var(--chartreuse)]" />
            ) : (
              <Square className="h-4 w-4 text-dim" />
            )}
            {selectedIds.size > 0 ? `${selectedIds.size} Selected` : "Select All"}
          </button>

          {/* Direct Fit Filter Toggle */}
          <button
            onClick={() => setFilterDirectFitOnly(!filterDirectFitOnly)}
            className={cn(
              "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all",
              filterDirectFitOnly
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                : "border-[var(--line)] text-dim hover:text-[var(--paper)]"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Direct Fit (≥75%)
          </button>

          {/* Min Score Filter */}
          <div className="flex items-center gap-2 text-xs text-dim">
            <span>Min Fit:</span>
            <select
              value={filterScore}
              onChange={(e) => setFilterScore(Number(e.target.value))}
              className="rounded-lg border border-[var(--line)] bg-black/60 px-2 py-1 font-mono text-xs text-[var(--paper)]"
            >
              <option value="0">All Scores</option>
              <option value="60">≥ 60% Match</option>
              <option value="70">≥ 70% Match</option>
              <option value="80">≥ 80% Match</option>
              <option value="90">≥ 90% Match</option>
            </select>
          </div>
        </div>

        {/* Batch Operations */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleBatchSave}
              className="border-sky-500/40 text-sky-300 hover:bg-sky-500/10"
            >
              <Bookmark className="h-3.5 w-3.5 text-sky-400" /> Save {selectedIds.size} Jobs
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBatchMatch}
              disabled={batchBusy}
              className="border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
            >
              <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Re-Match Selected
            </Button>
            <Button
              size="sm"
              onClick={handleBatchApply}
              disabled={batchBusy}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white"
            >
              {batchBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              Queue Review ({selectedIds.size})
            </Button>
          </div>
        )}
      </div>

      {/* High-Density Card Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredJobs.map((job) => {
          const isSelected = selectedIds.has(job.id);
          const isDirectFit = (job.matchScore ?? 0) >= 75;
          const shotSrc = agentScreenshotUrl(job.screenshotUrl, job.cloudinaryUrl);

          return (
            <div
              key={job.id}
              className={cn(
                "group relative flex flex-col justify-between rounded-2xl border bg-[#12141a]/95 p-5 shadow-lg transition-all hover:border-[var(--chartreuse)]/50",
                isSelected
                  ? "border-[var(--chartreuse)] bg-[#12141a] ring-1 ring-[var(--chartreuse)]/30"
                  : "border-[var(--line)]"
              )}
            >
              {/* Card Top: Checkbox, Match Badge & Visual Proof Icon */}
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleSelect(job.id)}
                      className="text-dim hover:text-[var(--paper)] transition-colors"
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-[var(--chartreuse)]" />
                      ) : (
                        <Square className="h-4 w-4 text-dim" />
                      )}
                    </button>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[10px] font-bold border",
                        isDirectFit
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                          : "border-purple-500/40 bg-purple-500/10 text-purple-400"
                      )}
                    >
                      {job.matchScore ? `${job.matchScore}% Match` : "Crawled"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {shotSrc && (
                      <button
                        onClick={() =>
                          setActiveShot({
                            src: shotSrc,
                            title: job.title,
                            company: job.company,
                          })
                        }
                        title="View Live Web Snapshot"
                        className="flex items-center gap-1 rounded-md border border-[var(--sky)]/30 bg-[var(--sky)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--sky)] hover:bg-[var(--sky)]/20 transition-all"
                      >
                        <Camera className="h-3 w-3" /> Proof
                      </button>
                    )}
                    {job.source && (
                      <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-dim">
                        {job.source}
                      </span>
                    )}
                  </div>
                </div>

                {/* Role & Company Header */}
                <div className="mt-3">
                  <h3 className="line-clamp-2 text-base font-bold text-[var(--paper)] transition-colors group-hover:text-[var(--chartreuse)]">
                    {displayJobTitle(job)}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim">
                    <span className="flex min-w-0 items-center gap-1 font-semibold text-[var(--paper)]/80">
                      <Building className="h-3.5 w-3.5 text-accent" /> {displayJobCompany(job)}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-dim" /> {job.location || "Remote"}
                    </span>
                  </div>
                  {job.salary && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-400">
                      <DollarSign className="h-3.5 w-3.5" /> {job.salary}
                    </p>
                  )}
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--sky)] hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Original posting
                    </a>
                  )}
                </div>

                {/* Inline Screenshot Thumbnail Preview */}
                {shotSrc && (
                  <div
                    onClick={() =>
                      setActiveShot({
                        src: shotSrc,
                        title: job.title,
                        company: job.company,
                      })
                    }
                    className="mt-3 group/img relative cursor-pointer overflow-hidden rounded-xl border border-[var(--line)] bg-black/40"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={shotSrc}
                      alt={`${job.company} screenshot`}
                      className="h-28 w-full object-cover object-top transition-transform duration-300 group-hover/img:scale-105"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/img:opacity-100">
                      <span className="rounded-md bg-black/80 px-2 py-1 text-[10px] font-semibold text-white">
                        🔍 Full Proof View
                      </span>
                    </div>
                  </div>
                )}

                {/* Description Excerpt */}
                <p className="mt-3 text-xs leading-relaxed text-dim line-clamp-3">
                  {job.jobDescription || "No detailed description extracted."}
                </p>

                {/* Skill Chips */}
                {job.skillsGap?.matchingSkills && job.skillsGap.matchingSkills.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {job.skillsGap.matchingSkills.slice(0, 4).map((s, i) => (
                      <span
                        key={i}
                        className="rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300 font-medium"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom Card Actions */}
              <div className="mt-5 flex items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
                <button
                  onClick={() => onReviewed(job, "skip")}
                  className="text-xs text-dim hover:text-coral-400 transition-colors"
                >
                  <XCircle className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onSave(job)}
                    className="h-8 px-2 text-xs text-sky-400 hover:bg-sky-500/10"
                  >
                    <Bookmark className="h-3.5 w-3.5" />
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onTailor(job)}
                    className="h-8 px-2.5 text-xs border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
                  >
                    <Sparkles className="h-3 w-3 mr-1" /> Tailor
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => onAutoApply(job)}
                    className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    <Zap className="h-3 w-3 mr-1" /> Review
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Full Lightbox for Live Screenshot */}
      {activeShot && (
        <div
          onClick={() => setActiveShot(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] max-w-5xl overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--ink-card)] p-3"
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-2 mb-2 text-xs">
              <span className="font-bold text-[var(--paper)]">
                📸 {activeShot.company} — {activeShot.title}
              </span>
              <button
                onClick={() => setActiveShot(null)}
                className="rounded-lg p-1 text-dim hover:bg-white/10 hover:text-[var(--paper)]"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeShot.src}
              alt="Visual Proof"
              className="max-h-[80vh] w-auto rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
