"use client";
import Select from "@/components/ui/Select";

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
  Download,
  Search,
  Filter,
  Globe,
  Tag,
  CheckCircle2,
  FileCheck,
  ShieldCheck,
  Award,
} from "lucide-react";
import { JobApplication, EmployerReview } from "@/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { agentScreenshotUrl } from "@/lib/agentScreenshot";
import { displayJobCompany, displayJobTitle } from "@/lib/jobDisplay";
import { useToast } from "@/components/ui/Toaster";

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
  onRunEmployerReview,
  onReviewed,
  onBatchSave,
  onBatchAutoApply,
  onBatchMatch,
}: JobMatrixViewProps) {
  const { success } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterScore, setFilterScore] = useState<number>(0);
  const [filterDirectFitOnly, setFilterDirectFitOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(jobs[0]?.id || null);
  const [activeShot, setActiveShot] = useState<{ src: string; title: string; company: string } | null>(null);

  const filteredJobs = jobs.filter((j) => {
    if (filterDirectFitOnly && (j.matchScore ?? 0) < 75) return false;
    if (filterScore > 0 && (j.matchScore ?? 0) < filterScore) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const title = displayJobTitle(j).toLowerCase();
      const company = displayJobCompany(j).toLowerCase();
      const location = (j.location || "").toLowerCase();
      if (!title.includes(q) && !company.includes(q) && !location.includes(q)) return false;
    }
    return true;
  });

  const inspectedJob = jobs.find((j) => j.id === activeJobId) || filteredJobs[0] || null;

  const allSelected = filteredJobs.length > 0 && selectedIds.size === filteredJobs.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredJobs.map((j) => j.id)));
    }
  };

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
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
    success(`Saved ${selectedJobs.length} jobs to Wishlist!`);
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

  const exportCsv = () => {
    const listToExport = selectedJobs.length > 0 ? selectedJobs : filteredJobs;
    if (listToExport.length === 0) return;

    const headers = ["Company", "Title", "Location", "Salary", "MatchScore", "Source", "URL", "Status"];
    const rows = listToExport.map((j) => [
      `"${(displayJobCompany(j) || "").replace(/"/g, '""')}"`,
      `"${(displayJobTitle(j) || "").replace(/"/g, '""')}"`,
      `"${(j.location || "").replace(/"/g, '""')}"`,
      `"${(j.salary || "").replace(/"/g, '""')}"`,
      j.matchScore || 0,
      `"${(j.source || "").replace(/"/g, '""')}"`,
      `"${(j.url || "").replace(/"/g, '""')}"`,
      `"${(j.status || "wishlist").replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `huntflow_jobs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    success(`Exported ${listToExport.length} jobs to CSV!`);
  };

  return (
    <div className="space-y-4">
      {/* Action Toolbar & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[#12141a]/90 p-3.5 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-black/40 px-3 py-1.5 text-xs font-semibold text-[var(--paper)] hover:bg-white/5 transition-all cursor-pointer"
          >
            {allSelected ? (
              <CheckSquare className="h-4 w-4 text-[var(--chartreuse)]" />
            ) : (
              <Square className="h-4 w-4 text-dim" />
            )}
            {selectedIds.size > 0 ? `${selectedIds.size} Selected` : "Select All"}
          </button>

          {/* Search Input */}
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-dim" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search role, company..."
              className="rounded-xl border border-[var(--line)] bg-black/30 pl-8 pr-3 py-1.5 text-xs text-[var(--paper)] outline-none focus:border-[var(--chartreuse)]/50 placeholder:text-dim w-44 sm:w-56"
            />
          </div>

          {/* Direct Fit Filter Toggle */}
          <button
            onClick={() => setFilterDirectFitOnly(!filterDirectFitOnly)}
            className={cn(
              "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              filterDirectFitOnly
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                : "border-[var(--line)] text-dim hover:text-[var(--paper)]"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Direct Fit (≥75%)
          </button>

          {/* Min Score Filter */}
          <div className="flex items-center gap-1.5 text-xs text-dim">
            <Select
              value={String(filterScore) as "0" | "60" | "70" | "80" | "90"}
              onChange={(v) => setFilterScore(Number(v))}
              options={[
                { value: "0", label: "All Match Scores" },
                { value: "60", label: "≥ 60% Match" },
                { value: "70", label: "≥ 70% Match" },
                { value: "80", label: "≥ 80% Match" },
                { value: "90", label: "≥ 90% Match" },
              ]}
              ariaLabel="Min Match Score"
              className="w-36"
            />
          </div>
        </div>

        {/* Batch Operations & CSV Export */}
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBatchSave}
                className="border-sky-500/40 text-sky-300 hover:bg-sky-500/10"
              >
                <Bookmark className="h-3.5 w-3.5 text-sky-400" /> Save ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBatchMatch}
                disabled={batchBusy}
                className="border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
              >
                <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Re-Match
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
                Run Agents ({selectedIds.size})
              </Button>
            </>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={exportCsv}
            className="border-[var(--line)] bg-white/[0.03] hover:bg-white/[0.06] text-xs"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Full-Width Split Grid (Left: High-Density Table; Right: Sticky Live Inspection) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT COLUMN: High-Density Table */}
        <div className={cn("space-y-2.5", inspectedJob ? "lg:col-span-8" : "lg:col-span-12")}>
          <div className="rounded-2xl border border-[var(--line)] bg-[#12141a]/95 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--line)] bg-white/[0.02] text-[10px] font-bold uppercase tracking-wider text-dim">
                  <tr>
                    <th className="px-3 py-3 w-10 text-center">
                      <button onClick={toggleSelectAll} className="cursor-pointer">
                        {allSelected ? <CheckSquare className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> : <Square className="h-3.5 w-3.5" />}
                      </button>
                    </th>
                    <th className="px-3 py-3">Role & Company</th>
                    <th className="px-3 py-3">Location</th>
                    <th className="px-3 py-3">Salary / PPP</th>
                    <th className="px-3 py-3 text-center">Match</th>
                    <th className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]/60">
                  {filteredJobs.map((job) => {
                    const isSelected = selectedIds.has(job.id);
                    const isActive = inspectedJob?.id === job.id;
                    const isDirectFit = (job.matchScore ?? 0) >= 75;
                    const shotSrc = agentScreenshotUrl(job.screenshotUrl, job.cloudinaryUrl);

                    return (
                      <tr
                        key={job.id}
                        onClick={() => setActiveJobId(job.id)}
                        className={cn(
                          "group transition-colors cursor-pointer",
                          isActive
                            ? "bg-[var(--chartreuse)]/5 text-[var(--paper)]"
                            : isSelected
                            ? "bg-white/[0.04]"
                            : "hover:bg-white/[0.02]"
                        )}
                      >
                        <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button onClick={(e) => toggleSelect(job.id, e)} className="cursor-pointer">
                            {isSelected ? (
                              <CheckSquare className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
                            ) : (
                              <Square className="h-3.5 w-3.5 text-dim group-hover:text-white" />
                            )}
                          </button>
                        </td>

                        <td className="px-3 py-3">
                          <div className="font-bold text-[var(--paper)] group-hover:text-[var(--chartreuse)] transition-colors">
                            {displayJobTitle(job)}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-dim">
                            <span className="flex items-center gap-1 font-medium text-white/80">
                              <Building className="h-3 w-3 text-dim" /> {displayJobCompany(job)}
                            </span>
                            {job.source && (
                              <span className="rounded bg-white/5 px-1.5 py-0.2 font-mono text-[9px]">
                                {job.source}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-3 text-dim whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-dim" />
                            <span>{job.location || "Remote"}</span>
                          </div>
                        </td>

                        <td className="px-3 py-3 text-dim whitespace-nowrap">
                          <span className="font-mono text-emerald-400">
                            {job.salary || (job.salaryIntel?.disclosedRange ? job.salaryIntel.disclosedRange : "Est. $120k+")}
                          </span>
                        </td>

                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold border",
                              isDirectFit
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                                : "border-purple-500/40 bg-purple-500/10 text-purple-400"
                            )}
                          >
                            {job.matchScore ?? 75}%
                          </span>
                        </td>

                        <td className="px-3 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {shotSrc && (
                              <button
                                onClick={() =>
                                  setActiveShot({
                                    src: shotSrc,
                                    title: job.title,
                                    company: job.company,
                                  })
                                }
                                className="p-1 rounded text-dim hover:text-sky-400 cursor-pointer"
                                title="Visual Proof"
                              >
                                <Camera className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => onSave(job)}
                              className="p-1 rounded text-dim hover:text-sky-400 cursor-pointer"
                              title="Save to Wishlist"
                            >
                              <Bookmark className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => onAutoApply(job)}
                              className="p-1 rounded text-dim hover:text-[var(--chartreuse)] cursor-pointer"
                              title="Run Agent"
                            >
                              <Zap className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Sticky Live Inspection Panel */}
        {inspectedJob && (
          <div className="lg:col-span-4 space-y-3 sticky top-4 self-start">
            <div className="rounded-2xl border border-[var(--line)] bg-[#12141a]/95 p-5 shadow-xl backdrop-blur space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-dim">
                  Live Role Inspection
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-bold border",
                    (inspectedJob.matchScore ?? 0) >= 75
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                      : "border-purple-500/40 bg-purple-500/10 text-purple-400"
                  )}
                >
                  {inspectedJob.matchScore ?? 75}% Match
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-[var(--paper)]">
                  {displayJobTitle(inspectedJob)}
                </h3>
                <p className="text-xs text-dim flex items-center gap-1.5 mt-1">
                  <Building className="h-3.5 w-3.5 text-accent" /> {displayJobCompany(inspectedJob)} · {inspectedJob.location || "Remote"}
                </p>
              </div>

              {/* Description Snippet */}
              <div className="rounded-xl border border-[var(--line)] bg-black/40 p-3 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-dim">Highlights</span>
                <p className="text-xs text-white/80 leading-relaxed line-clamp-4">
                  {inspectedJob.jobDescription || "No full job description extracted."}
                </p>
              </div>

              {/* Skills Tags */}
              {inspectedJob.skillsGap?.matchingSkills && inspectedJob.skillsGap.matchingSkills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {inspectedJob.skillsGap.matchingSkills.map((t: string) => (
                    <span key={t} className="rounded-md border border-[var(--line)] bg-white/[0.03] px-2 py-0.5 text-[10px] text-dim">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {/* Action Buttons */}
              <div className="pt-2 border-t border-[var(--line)] flex flex-col gap-2">
                <Button
                  size="sm"
                  onClick={() => onAutoApply(inspectedJob)}
                  className="w-full justify-center bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md"
                >
                  <Zap className="h-3.5 w-3.5" /> Launch 11-Node Agent Pipeline
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSave(inspectedJob)}
                    className="justify-center border-sky-500/40 text-sky-300 hover:bg-sky-500/10"
                  >
                    <Bookmark className="h-3.5 w-3.5" /> Save Role
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onTailor(inspectedJob)}
                    className="justify-center border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Tailor CV
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox for Screenshot Zoom */}
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
                className="rounded-lg p-1 text-dim hover:bg-white/10 hover:text-[var(--paper)] cursor-pointer"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeShot.src} alt="Snapshot Proof" className="max-h-[80vh] w-auto rounded-lg object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
