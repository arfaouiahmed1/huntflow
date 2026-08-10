"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Radar, RefreshCw, Loader2, WifiOff, BookmarkCheck, CheckCircle2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { JobApplication, EmployerReview } from "@/types";
import { useToast } from "@/components/ui/Toaster";
import { Button } from "@/components/ui/Button";
import { JobSwipeDeck } from "@/components/crawler/JobSwipeDeck";
import { EmployerReviewModal } from "@/components/crawler/EmployerReviewModal";
import JobDetailDrawer from "@/components/JobDetailDrawer";
import { dedupKey } from "@/lib/dedup";

const OFFLINE_HINT =
  "cd scrapling-agent && uv run uvicorn server:app --port 8001";

const DECISIONS_MAX = 500;

export default function JobsPage() {
  const {
    applications,
    profile,
    activeJobId,
    addApplication,
    triggerAutoApply,
    setActiveJobId,
  } = useApp();
  const { success, error } = useToast();

  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [crawling, setCrawling] = useState(false);
  const [offline, setOffline] = useState(false);
  const [checked, setChecked] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, string>>({});

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewJob, setReviewJob] = useState<JobApplication | null>(null);
  const [reviewData, setReviewData] = useState<EmployerReview | null>(null);

  /* Already-tracked keys come straight from AppContext applications. */
  const savedKeys = useMemo(
    () => new Set(applications.map((a) => dedupKey(a))),
    [applications]
  );
  const skipKeys = useMemo(() => new Set(Object.keys(decisions)), [decisions]);

  /* Persist one crawl decision (saved | skipped) — pruned to ~500 keys. */
  const recordDecision = useCallback(
    async (job: JobApplication, outcome: "saved" | "skipped") => {
      const key = dedupKey(job);
      const next = { ...decisions, [key]: outcome };
      const keys = Object.keys(next);
      if (keys.length > DECISIONS_MAX) {
        for (const k of keys.slice(0, keys.length - DECISIONS_MAX)) delete next[k];
      }
      setDecisions(next);
      try {
        await fetch("/api/data/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ crawl_decisions: JSON.stringify(next) }),
        });
      } catch {
        /* offline — local guard still applies for this session */
      }
    },
    [decisions]
  );

  const crawl = useCallback(
    async (limit = 20) => {
      setCrawling(true);
      setOffline(false);
      try {
        const keyword = profile.targetTitle?.trim().split(/\s+/)[0] || "developer";
        const res = await fetch("/api/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: "all", keyword, limit }),
        });
        const data = await res.json();
        if (!res.ok || data.offline) {
          setOffline(true);
          setJobs([]);
          return;
        }
        setJobs(data.jobs || []);
        if (data.count > 0) {
          success(`Crawler discovered ${data.count} fresh job(s) across the boards.`);
        }
      } catch {
        setOffline(true);
        setJobs([]);
      } finally {
        setCrawling(false);
      }
    },
    [profile.targetTitle, success]
  );

  /* Boot: ping the sidecar, then auto-crawl when online. */
  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        const health = await fetch("/api/agent/health", { cache: "no-store" });
        if (cancelled) return;
        if (!health.ok) {
          setOffline(true);
          setChecked(true);
          return;
        }
        await crawl(20);
        if (!cancelled) setChecked(true);
      } catch {
        if (!cancelled) {
          setOffline(true);
          setChecked(true);
        }
      }
    };
    const loadDecisions = async () => {
      try {
        const res = await fetch("/api/data", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const stored = data.settings?.crawl_decisions;
        if (stored) setDecisions(JSON.parse(stored) ?? {});
      } catch {
        /* decisions are optional */
      }
    };
    void loadDecisions();
    void boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Save a crawled job into the tracker (idempotent). */
  const saveJob = useCallback(
    (job: JobApplication): JobApplication => {
      const existing = applications.find((a) => dedupKey(a) === dedupKey(job));
      if (existing) return existing;
      return addApplication({
        title: job.title,
        company: job.company,
        location: job.location,
        salary: job.salary,
        url: job.url,
        status: "wishlist",
        jobDescription: job.jobDescription,
        matchScore: job.matchScore,
        fitCategory: job.fitCategory,
        skillsGap: job.skillsGap,
        notes: job.source ? `Crawled from ${job.source}` : undefined,
        autoApplyStatus: "idle",
        autoApplyLogs: [],
      });
    },
    [applications, addApplication]
  );

  const handleCrawlMore = useCallback(() => void crawl(20), [crawl]);

  const handleSave = useCallback(
    (job: JobApplication) => {
      const saved = saveJob(job);
      void recordDecision(saved, "saved");
      success(`Saved ${saved.title} to tracker.`);
    },
    [saveJob, recordDecision, success]
  );

  const handleAutoApply = useCallback(
    (job: JobApplication) => {
      const saved = saveJob(job);
      void recordDecision(saved, "saved");
      void triggerAutoApply(saved.id, { submit: false });
    },
    [saveJob, recordDecision, triggerAutoApply]
  );

  const handleTailor = useCallback(
    (job: JobApplication) => {
      const saved = saveJob(job);
      void recordDecision(saved, "saved");
      setActiveJobId(saved.id);
    },
    [saveJob, recordDecision, setActiveJobId]
  );

  const handleRunEmployerReview = useCallback(
    async (job: JobApplication) => {
      const saved = saveJob(job);
      void recordDecision(saved, "saved");
      setReviewJob(saved);
      if (saved.employerReview) {
        setReviewData(saved.employerReview);
        setReviewModalOpen(true);
        return;
      }
      try {
        const res = await fetch("/api/agent/employer-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: saved.id }),
        });
        const data = await res.json();
        if (res.ok && data.review) {
          setReviewData(data.review);
          setReviewModalOpen(true);
        } else {
          error(data.error || "Employer Review failed.");
        }
      } catch {
        error("Failed to run Employer Simulator.");
      }
    },
    [saveJob, recordDecision, error]
  );

  const handleReviewed = useCallback(
    (job: JobApplication) => {
      void recordDecision(job, "skipped");
    },
    [recordDecision]
  );

  /* Second guard: hide jobs already tracked or already decided on. */
  const visibleJobs = useMemo(
    () => jobs.filter((j) => !savedKeys.has(dedupKey(j)) && !skipKeys.has(dedupKey(j))),
    [jobs, savedKeys, skipKeys]
  );

  const trackedCount = jobs.filter((j) => savedKeys.has(dedupKey(j))).length;
  const skippedCount = jobs.filter((j) => skipKeys.has(dedupKey(j))).length;

  const retry = useCallback(async () => {
    setChecked(false);
    try {
      const health = await fetch("/api/agent/health", { cache: "no-store" });
      if (!health.ok) {
        setOffline(true);
        setChecked(true);
        return;
      }
      await crawl(20);
    } catch {
      setOffline(true);
    } finally {
      setChecked(true);
    }
  }, [crawl]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--paper)]">
            Job Finder
          </h1>
          <p className="text-xs text-dim mt-1">
            Live crawl of Remote, MENA, Europe, Global and HN Who-is-Hiring boards — scored against your profile before you save.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {trackedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-400">
              <BookmarkCheck className="h-3.5 w-3.5" /> {trackedCount} Tracked
            </span>
          )}
          {skippedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-[var(--line)] px-3 py-1 text-xs font-semibold text-dim">
              <CheckCircle2 className="h-3.5 w-3.5" /> {skippedCount} Skipped
            </span>
          )}
          <Button
            variant="outline"
            onClick={handleCrawlMore}
            loading={crawling}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Crawl More
          </Button>
        </div>
      </div>

      {/* Offline panel */}
      {offline ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--line)] bg-[#12141a]/60 p-12 text-center">
          <WifiOff className="h-12 w-12 text-coral mb-3" />
          <h3 className="text-lg font-bold text-[var(--paper)]">Scrapling agent offline</h3>
          <p className="text-xs text-dim max-w-md mt-1 mb-4">
            Start it from the repo root:
          </p>
          <code className="rounded-lg bg-black/40 border border-[var(--line)] px-3 py-2 font-mono text-xs text-[var(--chartreuse)]">
            {OFFLINE_HINT}
          </code>
          <Button onClick={retry} className="mt-6 flex items-center gap-2" loading={crawling}>
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      ) : !checked ? (
        <div className="flex items-center justify-center rounded-2xl border border-[var(--line)] bg-[#12141a]/60 p-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="mt-3 text-xs text-dim">Pinging the Scrapling engine and crawling boards…</p>
        </div>
      ) : (
        <JobSwipeDeck
          jobs={visibleJobs}
          onAutoApply={handleAutoApply}
          onTailor={handleTailor}
          onRunEmployerReview={handleRunEmployerReview}
          onCrawlMore={handleCrawlMore}
          onSave={handleSave}
          onReviewed={handleReviewed}
        />
      )}

      <JobDetailDrawer key={activeJobId ?? "closed"} jobId={activeJobId} onClose={() => setActiveJobId(null)} />
      <EmployerReviewModal
        open={reviewModalOpen}
        job={reviewJob}
        review={reviewData}
        onClose={() => setReviewModalOpen(false)}
        onTailor={(j) => setActiveJobId(j.id)}
      />
    </div>
  );
}
