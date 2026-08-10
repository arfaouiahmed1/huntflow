"use client";

import { useState, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus,
  LayoutGrid,
  Rows3,
  Search,
  Link2,
  Loader2,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  Briefcase,
  MapPin,
  ArrowUpDown,
  Globe,
  Sparkles,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { ApplicationStatus, LinkedInJob, EmployerReview, JobApplication } from "@/types";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toaster";
import JobCard from "@/components/JobCard";
import AddJobModal from "@/components/AddJobModal";
import JobDetailDrawer from "@/components/JobDetailDrawer";
import StatusBadge from "@/components/ui/StatusBadge";
import { JobSwipeDeck } from "@/components/crawler/JobSwipeDeck";
import { EmployerReviewModal } from "@/components/crawler/EmployerReviewModal";
import { palette } from "@/lib/theme";
import { buildBoardGuidance, COLUMN_HINTS } from "@/lib/boardGuidance";

const columns: { id: ApplicationStatus; label: string; accent: string; hint: string }[] = [
  { id: "wishlist", label: "Wishlist", accent: palette.sky, hint: COLUMN_HINTS.wishlist },
  { id: "applied", label: "Applied", accent: palette.violet, hint: COLUMN_HINTS.applied },
  { id: "interviewing", label: "Interviewing", accent: palette.amber, hint: COLUMN_HINTS.interviewing },
  { id: "offer", label: "Offer", accent: palette.chartreuse, hint: COLUMN_HINTS.offer },
  { id: "rejected", label: "Rejected", accent: palette.coral, hint: COLUMN_HINTS.rejected },
];

type SortKey = "newest" | "oldest" | "match" | "company" | "applied" | "followUp";

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "match", label: "Best match" },
  { id: "company", label: "Company A–Z" },
  { id: "applied", label: "Applied date" },
  { id: "followUp", label: "Follow-up due" },
];

export default function TrackerPage() {
  const { applications, interviews, emails, activeJobId, setActiveJobId, searchLinkedInJobs, saveLinkedInJob, updateApplication, triggerAutoApply } = useApp();
  const { success, error } = useToast();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);
  const [view, setView] = useState<"board" | "table" | "deck">("board");
  const [showAdd, setShowAdd] = useState<boolean>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("add") === "1"
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ApplicationStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [minMatch, setMinMatch] = useState(0);
  const [hasUrlOnly, setHasUrlOnly] = useState(false);
  const [autoAppliedOnly, setAutoAppliedOnly] = useState(false);
  const [crawledOnly, setCrawledOnly] = useState(false);
  const [crawling, setCrawling] = useState(false);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewJob, setReviewJob] = useState<JobApplication | null>(null);
  const [reviewData, setReviewData] = useState<EmployerReview | null>(null);

  const [liOpen, setLiOpen] = useState(false);
  const [liKeywords, setLiKeywords] = useState("");
  const [liLocation, setLiLocation] = useState("");
  const [liSearching, setLiSearching] = useState(false);
  const [liResults, setLiResults] = useState<LinkedInJob[] | null>(null);
  const [liError, setLiError] = useState("");
  const liSavedUrls = useMemo(() => {
    return applications.filter((a) => a.url && a.url.includes("linkedin.com")).map((a) => a.url || "");
  }, [applications]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const open = params.get("open");
    if (open && applications.some((a) => a.id === open)) {
      setActiveJobId(open);
    }
    if (window.location.search) {
      window.history.replaceState({}, "", "/tracker");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCrawlWeb = async () => {
    setCrawling(true);
    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "all", limit: 8 }),
      });
      const data = await res.json();
      if (res.ok && data.jobs) {
        success(`Scrapling Crawler discovered ${data.count} jobs across Remote, MENA & EU boards!`);
        setView("deck");
      } else {
        error(data.error || "Crawl completed with zero new matches.");
      }
    } catch {
      error("Failed to connect to web crawler endpoint.");
    } finally {
      setCrawling(false);
    }
  };

  const handleRunEmployerReview = async (job: JobApplication) => {
    setReviewJob(job);
    if (job.employerReview) {
      setReviewData(job.employerReview);
      setReviewModalOpen(true);
      return;
    }
    try {
      const res = await fetch("/api/agent/employer-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });
      const data = await res.json();
      if (res.ok && data.review) {
        setReviewData(data.review);
        setReviewModalOpen(true);
        success(`Employer Simulator evaluated ${job.title} — Acceptance Odds: ${data.review.acceptanceProbability}%`);
      } else {
        error(data.error || "Employer Review failed.");
      }
    } catch {
      error("Failed to run Employer Simulator.");
    }
  };

  const runLinkedInSearch = async () => {
    if (!liKeywords.trim()) return;
    setLiSearching(true);
    setLiError("");
    setLiResults(null);
    const url =
      "https://www.linkedin.com/jobs/search/?" +
      `keywords=${encodeURIComponent(liKeywords.trim())}` +
      (liLocation.trim() ? `&location=${encodeURIComponent(liLocation.trim())}` : "");
    try {
      const jobs = await searchLinkedInJobs(url);
      setLiResults(jobs);
      if (!jobs.length) success("No jobs found — try other keywords.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Search failed.";
      setLiError(msg);
      error(msg);
    } finally {
      setLiSearching(false);
    }
  };

  const saveJob = (job: LinkedInJob) => {
    saveLinkedInJob(job);
    success(`Saved "${job.title}" to the tracker.`);
  };

  const filtered = useMemo(
    () =>
      applications.filter((a) => {
        const matchesQuery =
          !query ||
          a.title.toLowerCase().includes(query.toLowerCase()) ||
          a.company.toLowerCase().includes(query.toLowerCase());
        const matchesFilter = filter === "all" || a.status === filter;
        const matchesMatch = minMatch === 0 || (a.matchScore ?? 0) >= minMatch;
        const matchesUrl = !hasUrlOnly || Boolean(a.url);
        const matchesAuto = !autoAppliedOnly || a.autoApplyStatus === "applied";
        const matchesCrawled = !crawledOnly || Boolean(a.source);
        return matchesQuery && matchesFilter && matchesMatch && matchesUrl && matchesAuto && matchesCrawled;
      }),
    [applications, query, filter, minMatch, hasUrlOnly, autoAppliedOnly, crawledOnly]
  );

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sortKey) {
        case "newest":
          return (b.createdDate || "").localeCompare(a.createdDate || "");
        case "oldest":
          return (a.createdDate || "").localeCompare(b.createdDate || "");
        case "match":
          return (b.matchScore ?? -1) - (a.matchScore ?? -1);
        case "company":
          return a.company.localeCompare(b.company, undefined, { sensitivity: "base" });
        case "applied":
          return (b.appliedDate || "0000").localeCompare(a.appliedDate || "0000");
        case "followUp": {
          const ad = a.followUpDue || "9999-12-31";
          const bd = b.followUpDue || "9999-12-31";
          return ad.localeCompare(bd);
        }
        default:
          return 0;
      }
    });
    return arr;
  }, [filtered, sortKey]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: applications.length,
      crawled: applications.filter((a) => Boolean(a.source)).length,
    };
    for (const col of columns) c[col.id] = applications.filter((a) => a.status === col.id).length;
    return c;
  }, [applications]);

  const guidance = useMemo(
    () => buildBoardGuidance(applications, interviews, emails),
    [applications, interviews, emails]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--chartreuse)]">
            /applications
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--paper)]">
            Application Tracker
          </h1>
          <p className="mt-1 text-sm text-dim" suppressHydrationWarning>
            {mounted
              ? `${applications.length} opportunities · ${counts.applied + counts.interviewing + counts.offer} active pipelines${counts.crawled ? ` · ${counts.crawled} crawler-sourced` : ""}`
              : "…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCrawlWeb}
            disabled={crawling}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600/20 border border-purple-500/30 px-3.5 py-2.5 text-sm font-bold text-purple-300 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
          >
            {crawling ? <Loader2 className="h-4 w-4 animate-spin text-purple-400" /> : <Globe className="h-4 w-4 text-purple-400" />}
            {crawling ? "Crawling Web..." : "Scrapling Crawler"}
          </button>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--chartreuse)] px-4 py-2.5 text-sm font-bold text-ink shadow-[var(--glow)] transition-colors hover:bg-chartreuse-bright"
          >
            <Plus className="h-4 w-4" /> Track New Job
          </motion.button>
        </div>
      </div>

      {!mounted && (
        <div className="rounded-2xl border border-dashed border-[var(--line)]/50 p-10 text-center text-sm text-dim">
          Loading your applications…
        </div>
      )}
      {mounted && (
      <>
      {/* Coaching panel */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--chartreuse)]" />
          <h2 className="text-sm font-bold text-[var(--paper)]">Coaching</h2>
          <span className="text-[10px] text-dim">Deterministic insights from your live pipeline — updated as you move cards</span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {columns.map((col) => {
            const g = guidance[col.id];
            return (
              <div key={col.id} className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: col.accent }} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--paper)]">{col.label}</span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-dim">{g.summary}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* LinkedIn Jobs */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70">
        <button
          onClick={() => setLiOpen((o) => !o)}
          className="flex w-full items-center gap-3 px-5 py-4 text-left"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] bg-white/[0.03]">
            <Link2 className="h-4 w-4 text-linkedin" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-bold text-[var(--paper)]">LinkedIn Jobs</p>
            <p className="text-[11px] text-dim">
              {liResults ? `${liResults.length} results from the last search` : "Search offers with your LinkedIn session"}
            </p>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-dim transition-transform", liOpen && "rotate-180")} />
        </button>

        {liOpen && (
          <div className="border-t border-[var(--line)] px-5 py-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Briefcase className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
                <input
                  value={liKeywords}
                  onChange={(e) => setLiKeywords(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runLinkedInSearch()}
                  placeholder="Keywords — e.g. frontend engineer"
                  className="w-full rounded-xl border border-[var(--line)] bg-white/[0.03] py-2.5 pl-9 pr-3 text-sm text-[var(--paper)] outline-none transition-colors placeholder:text-dim focus:border-[var(--chartreuse)]/50"
                />
              </div>
              <div className="relative sm:w-56">
                <MapPin className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
                <input
                  value={liLocation}
                  onChange={(e) => setLiLocation(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runLinkedInSearch()}
                  placeholder="Location (optional)"
                  className="w-full rounded-xl border border-[var(--line)] bg-white/[0.03] py-2.5 pl-9 pr-3 text-sm text-[var(--paper)] outline-none transition-colors placeholder:text-dim focus:border-[var(--chartreuse)]/50"
                />
              </div>
              <button
                onClick={runLinkedInSearch}
                disabled={liSearching || !liKeywords.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--chartreuse)] px-4 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-chartreuse-bright disabled:opacity-40"
              >
                {liSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </button>
            </div>

            {liError && (
              <p className="mt-3 text-xs text-[var(--coral)]">
                {liError}{" "}
                <a href="/settings" className="underline underline-offset-2 hover:text-[var(--paper)]">
                  Open Settings
                </a>
              </p>
            )}

            {liResults && (
              <div className="mt-4 space-y-2">
                {liResults.map((job, i) => {
                  const saved = liSavedUrls.includes(job.url);
                  return (
                    <div
                      key={job.url + i}
                      className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white/[0.02] px-4 py-3 transition-colors hover:border-[var(--line)]/70"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[var(--paper)]">{job.title}</p>
                        <p className="truncate text-xs text-dim">
                          {job.company}
                          {job.location ? ` · ${job.location}` : ""}
                        </p>
                      </div>
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-semibold text-[var(--chartreuse)] hover:underline"
                      >
                        View
                      </a>
                      <button
                        onClick={() => saveJob(job)}
                        disabled={saved}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors",
                          saved
                            ? "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                            : "border-[var(--line)] text-dim hover:border-[var(--chartreuse)]/40 hover:text-[var(--chartreuse)]"
                        )}
                      >
                        {saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                        {saved ? "Tracked" : "Track"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or company…"
            className="w-56 rounded-xl border border-[var(--line)] bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-[var(--paper)] outline-none transition-colors placeholder:text-dim focus:border-[var(--chartreuse)]/50"
          />
        </div>
        <div className="relative">
          <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="appearance-none rounded-xl border border-[var(--line)] bg-[var(--ink-card)] py-2 pl-9 pr-8 text-sm font-semibold text-[var(--paper)] outline-none transition-colors focus:border-[var(--chartreuse)]/50"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              filter === "all" ? "bg-white/10 text-[var(--paper)]" : "text-dim hover:text-[var(--paper)]"
            )}
          >
            All{mounted ? ` · ${counts.all}` : ""}
          </button>
          {columns.map((col) => (
            <button
              key={col.id}
              onClick={() => setFilter(col.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                filter === col.id ? "bg-white/10 text-[var(--paper)]" : "text-dim hover:text-[var(--paper)]"
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: col.accent }} />
              {col.label}{mounted ? ` · ${counts[col.id]}` : ""}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={minMatch}
            onChange={(e) => setMinMatch(Number(e.target.value))}
            aria-label="Minimum match score"
            className="rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5 text-xs text-paper outline-none transition-colors focus:border-chartreuse/50"
          >
            <option value={0}>Any match</option>
            <option value={50}>Match ≥ 50%</option>
            <option value={60}>Match ≥ 60%</option>
            <option value={70}>Match ≥ 70%</option>
            <option value={80}>Match ≥ 80%</option>
          </select>
          <button
            onClick={() => setHasUrlOnly((v) => !v)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 font-semibold transition-colors",
              hasUrlOnly
                ? "border-chartreuse/40 bg-chartreuse/10 text-chartreuse"
                : "border-line text-dim hover:text-paper"
            )}
          >
            Has URL
          </button>
          <button
            onClick={() => setAutoAppliedOnly((v) => !v)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 font-semibold transition-colors",
              autoAppliedOnly
                ? "border-chartreuse/40 bg-chartreuse/10 text-chartreuse"
                : "border-line text-dim hover:text-paper"
            )}
          >
            Auto-applied
          </button>
          <button
            onClick={() => setCrawledOnly((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-semibold transition-colors",
              crawledOnly
                ? "border-[var(--sky)]/40 bg-[var(--sky)]/10 text-[var(--sky)]"
                : "border-line text-dim hover:text-paper"
            )}
            title="Show only crawler-sourced jobs (source tag set)"
          >
            <Globe className="h-3.5 w-3.5" />
            Crawled{counts.crawled > 0 ? ` · ${counts.crawled}` : ""}
          </button>
        </div>
        <div className="ml-auto flex rounded-xl border border-[var(--line)] p-1">
          <button
            onClick={() => setView("board")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              view === "board" ? "bg-[var(--chartreuse)] text-ink" : "text-dim hover:text-[var(--paper)]"
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Board
          </button>
          <button
            onClick={() => setView("table")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              view === "table" ? "bg-[var(--chartreuse)] text-ink" : "text-dim hover:text-[var(--paper)]"
            )}
          >
            <Rows3 className="h-3.5 w-3.5" /> Table
          </button>
          <button
            onClick={() => setView("deck")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              view === "deck" ? "bg-[var(--chartreuse)] text-ink" : "text-dim hover:text-[var(--paper)]"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" /> Spout Deck
          </button>
        </div>
      </div>

      {/* Board View */}
      {view === "board" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {columns.map((col) => {
            const jobs = sorted.filter((a) => a.status === col.id);
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragTarget(col.id);
                }}
                onDragLeave={() => setDragTarget((t) => (t === col.id ? null : t))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragTarget(null);
                  const id = e.dataTransfer.getData("application/job-id");
                  const job = applications.find((a) => a.id === id);
                  if (job && job.status !== col.id) {
                    updateApplication(id, { status: col.id });
                    success(`Moved to ${col.label}.`);
                  }
                }}
                className={cn(
                  "min-w-0 rounded-2xl transition-all",
                  dragTarget === col.id && "bg-white/[0.03] ring-1 ring-[var(--chartreuse)]/30"
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: col.accent }} />
                    <span className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--paper)]">{col.label}</span>
                  </div>
                  <motion.span
                    key={jobs.length}
                    initial={{ scale: 1.4, color: col.accent }}
                    animate={{ scale: 1, color: "var(--paper-dim)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className="font-mono text-[10px]"
                  >
                    {jobs.length}
                  </motion.span>
                </div>
                <p className="mb-3 px-0.5 text-[10px] leading-snug text-dim/70">{col.hint}</p>
                <div className="flex flex-col gap-3">
                  <AnimatePresence mode="popLayout">
                    {jobs.map((job, i) => (
                      <JobCard key={job.id} job={job} index={i} onOpen={(id) => setActiveJobId(id)} />
                    ))}
                  </AnimatePresence>
                  {jobs.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-[var(--line)]/50 p-6 text-center text-[11px] text-dim/50">
                      {filter === "all" ? "No opportunities" : `Nothing in ${col.label.toLowerCase()} yet`}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "table" ? (
        /* Table View */
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-white/[0.02] text-[10px] uppercase tracking-[0.18em] text-dim">
                <th
                  onClick={() => setSortKey(sortKey === "company" ? "newest" : "company")}
                  className={cn("cursor-pointer select-none px-4 py-3 font-semibold hover:text-[var(--paper)]", sortKey === "company" && "text-[var(--chartreuse)]")}
                >
                  <span className="inline-flex items-center gap-1">Position <ArrowUpDown className="h-3 w-3" /></span>
                </th>
                <th className="px-4 py-3 font-semibold">Location</th>
                <th className="px-4 py-3 font-semibold">Salary</th>
                <th
                  onClick={() => setSortKey(sortKey === "match" ? "newest" : "match")}
                  className={cn("cursor-pointer select-none px-4 py-3 font-semibold hover:text-[var(--paper)]", sortKey === "match" && "text-[var(--chartreuse)]")}
                >
                  <span className="inline-flex items-center gap-1">Match <ArrowUpDown className="h-3 w-3" /></span>
                </th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th
                  onClick={() => setSortKey(sortKey === "applied" ? "newest" : "applied")}
                  className={cn("cursor-pointer select-none px-4 py-3 font-semibold hover:text-[var(--paper)]", sortKey === "applied" && "text-[var(--chartreuse)]")}
                >
                  <span className="inline-flex items-center gap-1">Applied <ArrowUpDown className="h-3 w-3" /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((job) => (
                <tr
                  key={job.id}
                  onClick={() => setActiveJobId(job.id)}
                  className="cursor-pointer border-b border-[var(--line)]/50 transition-colors hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--paper)]">{job.title}</p>
                    <p className="text-xs text-dim">{job.company}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-dim">{job.location}</td>
                  <td className="px-4 py-3 font-mono text-xs text-dim">{job.salary || "—"}</td>
                  <td className="px-4 py-3">
                    {typeof job.matchScore === "number" ? (
                      <span className="font-mono text-sm font-bold text-[var(--chartreuse)]">{job.matchScore}%</span>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={job.status} size="sm" /></td>
                  <td className="px-4 py-3 text-xs text-dim">{job.appliedDate || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <div className="p-10 text-center">
              <Briefcase className="mx-auto h-8 w-8 text-dim" />
              <p className="mt-3 text-sm text-dim">
                No applications match these filters.
              </p>
              <button
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                  setMinMatch(0);
                  setHasUrlOnly(false);
                  setAutoAppliedOnly(false);
                  setCrawledOnly(false);
                }}
                className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-paper transition-colors hover:border-chartreuse/50 hover:text-chartreuse"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      ) : (
        <JobSwipeDeck
          jobs={sorted}
          onAutoApply={(j) => triggerAutoApply(j.id, { submit: false })}
          onTailor={(j) => setActiveJobId(j.id)}
          onRunEmployerReview={handleRunEmployerReview}
          onCrawlMore={handleCrawlWeb}
        />
      )}

      <AddJobModal open={showAdd} onClose={() => setShowAdd(false)} />
      <JobDetailDrawer key={activeJobId ?? "closed"} jobId={activeJobId} onClose={() => setActiveJobId(null)} />
      <EmployerReviewModal
        open={reviewModalOpen}
        job={reviewJob}
        review={reviewData}
        onClose={() => setReviewModalOpen(false)}
        onTailor={(j) => setActiveJobId(j.id)}
      />
      </>
      )}
    </div>
  );
}
