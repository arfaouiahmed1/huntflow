"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  Lightbulb,
  FileSearch,
  Quote,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { ApplicationStatus, LinkedInJob, EmployerReview, JobApplication, SkillsGapAnalysis } from "@/types";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toaster";
import JobCard from "@/components/JobCard";
import AddJobModal from "@/components/AddJobModal";
import StatusBadge from "@/components/ui/StatusBadge";
import { JobSwipeDeck } from "@/components/crawler/JobSwipeDeck";
import { EmployerReviewModal } from "@/components/crawler/EmployerReviewModal";
import { palette } from "@/lib/theme";
import { buildBoardGuidance, COLUMN_HINTS } from "@/lib/boardGuidance";
import { matchFallback } from "@/lib/prompts/generationPrompts";

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
  const { applications, profile, interviews, emails, searchLinkedInJobs, saveLinkedInJob, addApplication, updateApplication, triggerAutoApply } = useApp();
  const router = useRouter();
  const openJob = (id: string) => router.push(`/jobs/${id}`);
  const { success, error } = useToast();
  // AppProvider has deterministic server defaults, so the tracker can render
  // useful pipeline content before client-side persistence reconciliation.
  const mounted = true;
  const [view, setView] = useState<"board" | "table" | "deck">("board");
  const [showAdd, setShowAdd] = useState(false);
  const [coachingOpen, setCoachingOpen] = useState(false);
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

  const MAX_ITERATIONS = 3;
  const [explainJobId, setExplainJobId] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainStream, setExplainStream] = useState("");
  const [explainAnalysis, setExplainAnalysis] = useState<SkillsGapAnalysis | null>(null);
  const [explainHits, setExplainHits] = useState<{ docName: string; chunkIndex: number; text: string; score: number; model: string }[]>([]);
  const [explainIter, setExplainIter] = useState(0);
  const [explainError, setExplainError] = useState("");
  const [explainBudget, setExplainBudget] = useState({ maxPrompt: 10000, maxOutput: 2000 });

  const handleExplainFit = async (job: JobApplication) => {
    if (explainLoading) return;
    if (explainIter >= MAX_ITERATIONS) {
      setExplainError(`MAX_ITERATIONS guard hit (${MAX_ITERATIONS}) — using offline fallback.`);
      const fb = matchFallback(job, profile);
      setExplainAnalysis(fb);
      setExplainStream(`[offline fallback — MAX_ITERATIONS guard]\nFit: ${fb.fit}\nScore: ${fb.matchScore}%\nStrengths: ${fb.strengths.slice(0, 2).join(" | ")}\nVault: no citation (guard)`);
      fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "insight", content: `Explain fit guard hit for ${job.title} @ ${job.company} — fallback used`, jobId: job.id, source: "tracker-explain", importance: 2 }) }).catch((err) => {
        error(err instanceof Error ? err.message : "Failed to log explain guard to memory.");
      });
      return;
    }
    setExplainJobId(job.id);
    setExplainLoading(true);
    setExplainError("");
    setExplainAnalysis(null);
    setExplainStream("");
    setExplainHits([]);
    setExplainIter((n) => n + 1);

    let analysis: SkillsGapAnalysis | null = null;
    let source: string = "live_llm";
    let vaultTopHits: { docName: string; chunkIndex: number; text: string; score: number; model: string }[] = [];
    let budget = { maxPrompt: 10000, maxOutput: 2000 };
    try {
      const res = await fetch("/api/tracker/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || data?.error || `explain failed ${res.status}`);
      const payload = data.analysis as SkillsGapAnalysis | undefined;
      if (!payload || typeof payload.matchScore !== "number") throw new Error("Invalid analysis payload");
      analysis = payload;
      source = (payload as unknown as { source?: string })?.source ?? data.source ?? "live_llm";
      vaultTopHits = (data.vaultHits ?? []) as typeof vaultTopHits;
      budget = data.budget ?? budget;
      setExplainHits(vaultTopHits);
      setExplainBudget(budget);
      if (source === "heuristic_fallback") {
        setExplainError("Offline — using deterministic matchFallback (heuristic_fallback).");
      }
    } catch (err) {
      analysis = matchFallback(job, profile);
      source = "heuristic_fallback";
      vaultTopHits = [];
      setExplainHits([]);
      setExplainError(`Offline — using deterministic matchFallback (heuristic_fallback).${err instanceof Error ? ` ${err.message.slice(0, 80)}` : ""}`);
    }

    if (analysis) {
      setExplainAnalysis(analysis);
      updateApplication(job.id, { matchScore: analysis.matchScore, skillsGap: analysis });
      const cites = vaultTopHits.length ? vaultTopHits.map((h) => `${h.docName}#${h.chunkIndex} [${h.model} · ${(h.score * 100).toFixed(0)}%]`).join(" · ") : "no vault hits (upload evidence to cite)";
      const budgetNote = `budget ${budget.maxPrompt}/${budget.maxOutput} (match_analysis 10k/2k)`;
      const fullText = [
        `Fit: ${analysis.fit ?? "medium"} · Score ${analysis.matchScore}% · source:${source} · ${budgetNote}`,
        analysis.dealbreakers?.length ? `Dealbreakers: ${analysis.dealbreakers.join("; ")}` : "No hard constraints flagged.",
        `Strengths: ${analysis.strengths.slice(0, 2).join(" | ")}`,
        `Missing: ${analysis.missingSkills.slice(0, 3).join(", ") || "none flagged"}`,
        `Vault cites (${vaultTopHits.length}): ${cites}`,
        analysis.recommendations[0] ? `Next: ${analysis.recommendations[0]}` : "",
      ].filter(Boolean).join("\n\n");

      let idx = 0;
      const streamStep = () => {
        if (idx >= fullText.length) {
          fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "insight", content: `Explain fit ${job.title} @ ${job.company}: ${analysis!.fit} ${analysis!.matchScore}% — ${analysis!.strengths[0]?.slice(0, 120) ?? ""} [cites ${vaultTopHits.length}]`, jobId: job.id, source: "tracker-explain", importance: 2 }) }).catch((err) => {
            error(err instanceof Error ? err.message : "Failed to log explain fit to memory.");
          });
          return;
        }
        const chunk = fullText.slice(idx, idx + 8);
        idx += 8;
        setExplainStream((prev) => prev + chunk);
        window.setTimeout(streamStep, 18);
      };
      streamStep();
    }
    setExplainLoading(false);
  };

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
    const openAddTimer = params.get("add") === "1"
      ? window.setTimeout(() => setShowAdd(true), 0)
      : undefined;
    const open = params.get("open");
    if (open && applications.some((a) => a.id === open)) {
      openJob(open);
    }
    if (window.location.search) {
      window.history.replaceState({}, "", "/tracker");
    }
    return () => {
      if (openAddTimer !== undefined) window.clearTimeout(openAddTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCrawlWeb = async () => {
    if (crawling) return;
    setCrawling(true);
    try {
      const concurrency = 4;
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "all", limit: 8, concurrency }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.jobs) && data.jobs.length > 0) {
        let addedCount = 0;
        const existingKeys = new Set(
          applications.map((a) => `${(a.company || "").toLowerCase().trim()}:::${(a.title || "").toLowerCase().trim()}`)
        );

        for (const job of data.jobs) {
          const key = `${(job.company || "").toLowerCase().trim()}:::${(job.title || "").toLowerCase().trim()}`;
          if (existingKeys.has(key)) continue;
          existingKeys.add(key);

          addApplication({
            title: job.title || "Discovered Opportunity",
            company: job.company || "Unknown Company",
            location: job.location || "Remote",
            salary: job.salary,
            url: job.url,
            status: "wishlist",
            jobDescription: job.jobDescription || "",
            matchScore: job.matchScore,
            fitCategory: job.fitCategory,
            skillsGap: job.skillsGap,
            source: job.source || "Scrapling Crawler",
            hiringPost: job.hiringPost,
            screenshotUrl: job.screenshotUrl,
            cloudinaryUrl: job.cloudinaryUrl,
            notes: job.source ? `Discovered via ${job.source}` : "Discovered via Scrapling Crawler",
            autoApplyStatus: "idle",
            autoApplyLogs: [],
          });
          addedCount++;
        }

        if (addedCount > 0) {
          success(
            `Scrapling Crawler added ${addedCount} fresh opportunit${addedCount === 1 ? "y" : "ies"} to your Wishlist!`
          );
          setView("deck");
        } else {
          success("Crawl complete — all discovered roles are already tracked in your pipeline.");
        }
      } else if (data.offline) {
        error("Crawler engine is offline. Run 'npm run dev:scrapling' to start the local sidecar.");
        } else {
        error(data.error || "Crawl completed with zero new matches.");
      }
    } catch (err) {
      error(err instanceof Error ? err.message : "Failed to connect to web crawler endpoint.");
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
    } catch (err) {
      error(err instanceof Error ? err.message : "Failed to run Employer Simulator.");
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
            onClick={() => router.push("/jobs")}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--sky)]/30 bg-[var(--sky)]/10 px-3.5 py-2.5 text-sm font-bold text-[var(--sky)] transition-colors hover:bg-[var(--sky)]/15"
          >
            <Globe className="h-4 w-4" />
            Crawler console
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
        <button
          type="button"
          onClick={() => setCoachingOpen((open) => !open)}
          className="flex w-full items-center gap-3 text-left"
          aria-expanded={coachingOpen}
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/[0.05]">
            <Sparkles className="h-4 w-4 text-[var(--chartreuse)]" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-bold text-[var(--paper)]">Pipeline guidance</span>
            <span className="block text-[10px] text-dim">Deterministic next-step prompts from the current board · no LLM call</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 text-dim transition-transform", coachingOpen && "rotate-180")} />
        </button>
        {coachingOpen && (
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[var(--line)] pt-4 md:grid-cols-2 xl:grid-cols-5">
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
        )}
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
            <Sparkles className="h-3.5 w-3.5" /> Review Deck
          </button>
        </div>
      </div>

      <section data-testid="explain-fit-panel" className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/[0.06]">
              <Lightbulb className="h-4 w-4 text-[var(--chartreuse)]" />
            </span>
            <div>
              <p className="text-sm font-bold text-[var(--paper)]">Explain fit — inline assist</p>
              <p className="text-[11px] text-dim">LLM assist with vault cite · {explainBudget.maxPrompt}/{explainBudget.maxOutput} tokens · iter {explainIter}/{MAX_ITERATIONS}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label="Pick job to explain"
              value={explainJobId ?? ""}
              onChange={(e) => setExplainJobId(e.target.value || null)}
              className="max-w-[220px] rounded-xl border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-xs font-semibold text-[var(--paper)] outline-none focus:border-[var(--chartreuse)]/50"
            >
              <option value="">Select a role…</option>
              {applications.map((j) => (
                <option key={j.id} value={j.id}>{j.title} @ {j.company}</option>
              ))}
            </select>
            <button
              data-testid="explain-fit-button"
              onClick={() => {
                const job = applications.find((a) => a.id === explainJobId) ?? sorted[0] ?? applications[0];
                if (job) handleExplainFit(job);
              }}
              disabled={explainLoading || (!explainJobId && !sorted[0] && !applications[0])}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--chartreuse)] px-4 py-2 text-xs font-bold text-ink shadow-[var(--glow)] hover:bg-chartreuse-bright disabled:opacity-40"
            >
              {explainLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSearch className="h-3.5 w-3.5" />}
              Explain fit
            </button>
          </div>
        </div>
        {(explainStream || explainLoading || explainError || explainHits.length > 0) && (
          <div className="mt-4 rounded-xl border border-[var(--line)] bg-black/15 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Quote className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-dim">Streaming citation</span>
              {explainAnalysis && <span className="ml-auto rounded-full border border-[var(--line)] bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-dim">{explainAnalysis.source ?? "heuristic_fallback"}</span>}
            </div>
            <pre data-testid="explain-stream" className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--paper)]/90">{explainStream || (explainLoading ? "…" : "")}</pre>
            {explainHits.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {explainHits.map((h) => (
                  <span key={`${h.docName}-${h.chunkIndex}`} className="inline-flex items-center gap-1 rounded-full border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/10 px-2 py-1 text-[10px] font-semibold text-[var(--chartreuse)]">
                    <Quote className="h-3 w-3" />{h.docName}#{h.chunkIndex} · {(h.score * 100).toFixed(0)}% · {h.model}
                  </span>
                ))}
              </div>
            )}
            {explainHits.length > 0 && explainAnalysis && (
              <div className="mt-3 space-y-1.5">
                {explainHits.map((h) => (
                  <div key={`txt-${h.docName}-${h.chunkIndex}`} className="rounded-lg border border-[var(--line)] bg-white/[0.02] px-3 py-2">
                    <p className="font-mono text-[10px] font-bold text-dim">{h.docName}#{h.chunkIndex} [{h.model}]</p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--paper)]/85 line-clamp-3">{h.text.slice(0, 320)}</p>
                  </div>
                ))}
              </div>
            )}
            {explainError && <p className="mt-2 text-xs text-[var(--amber)]">{explainError}</p>}
            {explainAnalysis && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-[var(--line)] bg-white/[0.02] p-2.5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">Fit</p>
                  <p className="mt-1 text-xs font-bold text-[var(--paper)]">{explainAnalysis.fit ?? "medium"} · {explainAnalysis.matchScore}%</p>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-white/[0.02] p-2.5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">Budget</p>
                  <p className="mt-1 font-mono text-xs text-dim">{explainBudget.maxPrompt}/{explainBudget.maxOutput} (10k/2k)</p>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-white/[0.02] p-2.5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">Iter</p>
                  <p className="mt-1 font-mono text-xs text-dim">{explainIter} / {MAX_ITERATIONS}</p>
                </div>
              </div>
            )}
          </div>
        )}
        {!applications.length && <p className="mt-3 text-xs text-dim">Add a job to run Explain fit.</p>}
      </section>

      {/* Board View */}
      {view === "board" ? (
        <div className="flex gap-4 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory xl:grid xl:grid-cols-5 xl:overflow-x-visible no-scrollbar">
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
                  "w-[85vw] sm:w-[320px] shrink-0 snap-center xl:w-auto min-w-0 rounded-2xl transition-all",
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
                      <div key={job.id} className="space-y-1.5">
                        <JobCard job={job} index={i} onOpen={(id) => openJob(id)} />
                        <button
                          onClick={() => { setExplainJobId(job.id); handleExplainFit(job); }}
                          disabled={explainLoading}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-white/[0.02] px-2.5 py-1.5 text-[11px] font-semibold text-dim hover:border-[var(--chartreuse)]/30 hover:text-[var(--chartreuse)] disabled:opacity-40"
                          data-testid={`explain-fit-inline-${job.id}`}
                        >
                          <FileSearch className="h-3 w-3" /> Explain fit
                        </button>
                      </div>
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
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-white/[0.02] text-[10px] uppercase tracking-[0.18em] text-dim">
                <th
                  onClick={() => setSortKey(sortKey === "company" ? "newest" : "company")}
                  className={cn("cursor-pointer select-none px-4 py-3 font-semibold hover:text-[var(--paper)]", sortKey === "company" && "text-[var(--chartreuse)]")}
                >
                  <span className="inline-flex items-center gap-1">Position <ArrowUpDown className="h-3 w-3" /></span>
                </th>
                <th className="px-4 py-3 font-semibold">Fit · Verdict</th>
                <th className="px-4 py-3 font-semibold">Salary intel</th>
                <th className="px-4 py-3 font-semibold">Evidence</th>
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
                <th className="px-4 py-3 font-semibold">Explain</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((job) => (
                <tr
                  key={job.id}
                  onClick={() => openJob(job.id)}
                  className="cursor-pointer border-b border-[var(--line)]/50 transition-colors hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--paper)]">{job.title}</p>
                    <p className="text-xs text-dim">{job.company}</p>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {job.skipReason && (
                        <span className="rounded-full border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-1.5 py-0.5 text-[10px] font-bold text-[var(--coral)]">{job.skipReason.replace(/_/g, " ")}</span>
                      )}
                      {job.jobBrief?.summary && (
                        <span className="rounded-full border border-[var(--line)] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-dim">brief</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1">
                      {job.fitCategory ? (
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 text-[10px] font-bold",
                            job.fitCategory === "direct_fit"
                              ? "border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                              : "border-[var(--violet)]/30 bg-[var(--violet)]/10 text-[var(--violet)]"
                          )}
                        >
                          {job.fitCategory.replace(/_/g, " ")}
                        </span>
                      ) : (
                        <span className="rounded-full border border-[var(--line)] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-dim">—</span>
                      )}
                      {job.employerReview?.verdict ? (
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 text-[10px] font-bold",
                            job.employerReview.verdict === "interview_likely"
                              ? "border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                              : job.employerReview.verdict === "possible_callback"
                              ? "border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]"
                              : "border-[var(--coral)]/30 bg-[var(--coral)]/10 text-[var(--coral)]"
                          )}
                        >
                          {job.employerReview.verdict.replace(/_/g, " ")}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {job.salaryIntel?.disclosedRange ? (
                      <span className="rounded-full border border-[var(--sky)]/30 bg-[var(--sky)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--sky)]">{job.salaryIntel.disclosedRange}</span>
                    ) : job.salaryIntel ? (
                      <span className="rounded-full border border-[var(--amber)]/30 bg-[var(--amber)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--amber)]">
                        Est {job.salaryIntel.estimateLow ?? "?"}–{job.salaryIntel.estimateHigh ?? "?"}
                      </span>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap items-center gap-1">
                      {job.skillsGap && (
                        <span className="rounded-full border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/5 px-1.5 py-0.5 text-[10px] text-[var(--chartreuse)]">
                          gap {job.skillsGap.missingSkills?.length ?? 0} missing
                        </span>
                      )}
                      {job.multiAgentOutputs && Object.keys(job.multiAgentOutputs).length > 0 && (
                        <span className="rounded-full border border-[var(--sky)]/20 bg-[var(--sky)]/5 px-1.5 py-0.5 text-[10px] text-[var(--sky)]">
                          {Object.keys(job.multiAgentOutputs).length} chips
                        </span>
                      )}
                      {(job.screenshotUrl || job.cloudinaryUrl) && (
                        <span className="rounded-full border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/5 px-1.5 py-0.5 text-[10px] text-[var(--chartreuse)]">proof</span>
                      )}
                      {!!job.autoApplyLogs?.length && (
                        <span className="rounded-full border border-[var(--line)] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-dim">{job.autoApplyLogs.length} logs</span>
                      )}
                    </span>
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
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); setExplainJobId(job.id); handleExplainFit(job); }}
                      disabled={explainLoading}
                      data-testid={`explain-fit-row-${job.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-white/[0.02] px-2.5 py-1 text-[11px] font-semibold text-dim hover:border-[var(--chartreuse)]/30 hover:text-[var(--chartreuse)] disabled:opacity-40"
                    >
                      <FileSearch className="h-3 w-3" /> Explain fit
                    </button>
                  </td>
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
          onTailor={(j) => openJob(j.id)}
          onRunEmployerReview={handleRunEmployerReview}
          onCrawlMore={handleCrawlWeb}
          onSave={(j) => {
            updateApplication(j.id, { status: "wishlist" });
            success(`Saved "${j.title}" to wishlist.`);
          }}
          onReviewed={(j, reason) => {
            if (reason) {
              updateApplication(j.id, { skipReason: reason, status: "rejected" });
              success(`Marked as skipped: ${reason.replace(/_/g, " ")}.`);
            }
          }}
        />
      )}

      <AddJobModal open={showAdd} onClose={() => setShowAdd(false)} />
      <EmployerReviewModal
        open={reviewModalOpen}
        job={reviewJob}
        review={reviewData}
        onClose={() => setReviewModalOpen(false)}
        onTailor={(j) => openJob(j.id)}
      />
      </>
      )}
    </div>
  );
}
