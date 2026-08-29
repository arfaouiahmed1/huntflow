"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Loader2,
  WifiOff,
  LayoutGrid,
  CreditCard,
  Zap,
  Radio,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { JobApplication, EmployerReview } from "@/types";
import { useToast } from "@/components/ui/Toaster";
import { Button } from "@/components/ui/Button";
import { JobSwipeDeck } from "@/components/crawler/JobSwipeDeck";
import { JobMatrixView } from "@/components/crawler/JobMatrixView";
import { EmployerReviewModal } from "@/components/crawler/EmployerReviewModal";
import JobDetailDrawer from "@/components/JobDetailDrawer";
import { dedupKey } from "@/lib/dedup";
import AgentLiveConsole from "@/components/AgentLiveConsole";
import { BoardLiveGrid } from "@/components/crawler/BoardLiveCard";
import CrawlerDiscoveryControls from "@/components/crawler/CrawlerDiscoveryControls";
import { applySourceFilters, DEFAULT_FILTER_SELECTION, parseSourceCatalog, type SourceFilterSelection } from "@/lib/sourceTaxonomy";

interface CrawlerSource {
  id: string;
  name: string;
  category: string;
  type: "static" | "stealth" | "posts";
  url: string;
  sourceType?: string;
  markets?: string[];
  experience?: string;
  workMode?: string;
  enabledByDefault: boolean;
  note?: string;
}

interface CrawlSourceResult {
  id: string;
  name: string;
  category: string;
  status: "success" | "failed";
  found: number;
  matched: number;
  error?: string | null;
}

interface CrawlSummary {
  runId: string | null;
  startedAt: string;
  finishedAt: string;
  boardsCrawled: number;
  found: number;
  keyword: string;
  concurrency: number;
  sources: CrawlSourceResult[];
}

const OFFLINE_HINT =
  "cd scrapling-agent && uv run uvicorn server:app --port 8001";

const DECISIONS_MAX = 500;

export default function JobsPage() {
  const {
    applications,
    profile,
    addApplication,
    triggerAutoApply,
    triggerAutoApplyBatch,
    triggerMatchBatch,
    cloudinarySettings,
    refreshData,
  } = useApp();
  const { success, error, warn } = useToast();

  const [viewMode, setViewMode] = useState<"deck" | "matrix">("deck");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [crawling, setCrawling] = useState(false);
  const [offline, setOffline] = useState(false);
  const [checked, setChecked] = useState(false);
  const [workerCount, setWorkerCount] = useState<number>(1);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [keyword, setKeyword] = useState(profile.targetTitle?.trim() || "developer");
  const [crawlLimit, setCrawlLimit] = useState(30);
  const [sources, setSources] = useState<CrawlerSource[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [filterSelection, setFilterSelection] = useState<SourceFilterSelection>(DEFAULT_FILTER_SELECTION);
  const [lastCrawl, setLastCrawl] = useState<CrawlSummary | null>(null);
  const [liveRunId, setLiveRunId] = useState<string | null>(null);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewJob, setReviewJob] = useState<JobApplication | null>(null);
  const [reviewData, setReviewData] = useState<EmployerReview | null>(null);

  /* Already-tracked keys come straight from AppContext applications. */
  const savedKeys = useMemo(
    () => new Set(applications.map((a) => dedupKey(a))),
    [applications]
  );
  const skipKeys = useMemo(
    () => new Set(Object.entries(decisions).filter(([, v]) => v.startsWith("skipped")).map(([k]) => k)),
    [decisions]
  );

  /* Persist one crawl decision (saved | skipped:reason) — pruned to ~500 keys. */
  const recordDecision = useCallback(
    async (job: JobApplication, outcome: "saved" | "skipped", reason?: string) => {
      const key = dedupKey(job);
      const val = reason ? `${outcome}:${reason}` : outcome;
      const next = { ...decisions, [key]: val };
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
      } catch (err) {
        warn(err instanceof Error ? err.message : "Failed to sync crawl decisions — working offline.");
      }
    },
    [decisions, warn]
  );

  const crawl = useCallback(
    async (limit = crawlLimit) => {
      const sourceIds = [...selectedSourceIds];
      if (sources.length > 0 && sourceIds.length === 0) {
        warn("Select at least one crawler source before starting a run.");
        return;
      }
      const startedAt = new Date().toISOString();
      setCrawling(true);
      setOffline(false);
      setLiveRunId(null);
      try {
        const concurrency = cloudinarySettings.concurrency || 1;
        const res = await fetch("/api/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: "all", keyword: keyword.trim() || "developer", limit, concurrency, sourceIds }),
        });
        const data = await res.json();
        if (!res.ok || data.offline) {
          setOffline(true);
          setJobs([]);
          return;
        }
        setJobs(data.jobs || []);
        if (data.concurrency) setWorkerCount(data.concurrency);
        if (data.runId) setLiveRunId(data.runId);
        setLastCrawl({
          runId: data.runId || null,
          startedAt,
          finishedAt: new Date().toISOString(),
          boardsCrawled: data.boardsCrawled || 0,
          found: data.count || 0,
          keyword: keyword.trim() || "developer",
          concurrency: data.concurrency || concurrency,
          sources: data.sourceResults || [],
        });
        if (data.count > 0) {
          success(`Parallel crawler fetched ${data.count} fresh job(s) using ${data.concurrency || 1} concurrent workers.`);
        }
        // Server persisted wishlist stubs; rehydrate so sidebar + tracker update live.
        void refreshData();
      } catch (err) {
        error(err instanceof Error ? err.message : "Crawl failed — agent offline. Start the sidecar.");
        setOffline(true);
        setJobs([]);
      } finally {
        setCrawling(false);
      }
    },
    [crawlLimit, selectedSourceIds, sources.length, warn, error, cloudinarySettings.concurrency, keyword, success, refreshData]
  );

  /* Boot only checks health and restores controls. Crawls are always explicit. */
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
        if (!cancelled) setChecked(true);
      } catch (err) {
        if (!cancelled) {
          error(err instanceof Error ? err.message : "Health check failed — agent offline.");
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
      } catch (err) {
        warn(err instanceof Error ? err.message : "Failed to restore crawl decisions.");
      }
    };
    const loadSources = async () => {
      try {
        const res = await fetch("/api/agent/sources", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const nextSources = (data.sources || []) as CrawlerSource[];
        if (cancelled) return;
        setSources(nextSources);
        setSelectedSourceIds(new Set(nextSources.filter((source) => source.enabledByDefault).map((source) => source.id)));
      } catch (err) {
        warn(err instanceof Error ? err.message : "Failed to load crawler sources — agent offline.");
      }
    };
    void loadDecisions();
    void loadSources();
    void boot();
    return () => {
      cancelled = true;
    };
  }, [error, warn]);

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
        source: job.source,
        hiringPost: job.hiringPost,
        screenshotUrl: job.screenshotUrl,
        cloudinaryUrl: job.cloudinaryUrl,
        notes: job.source ? `Crawled from ${job.source}` : undefined,
        autoApplyStatus: "idle",
        autoApplyLogs: [],
      });
    },
    [applications, addApplication]
  );

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
      } catch (err) {
        error(err instanceof Error ? err.message : "Failed to run Employer Simulator.");
      }
    },
    [saveJob, recordDecision, error]
  );

  const handleReviewed = useCallback(
    (job: JobApplication, reason?: string) => {
      void recordDecision(job, "skipped", reason);
      if (reason && reason !== "generic") {
        warn(`Skipped: learned preference "${reason.replace("_", " ")}" for future filter tuning.`);
      }
    },
    [recordDecision, warn]
  );

  /* Batch Operations */
  const handleBatchSave = useCallback(
    (selected: JobApplication[]) => {
      for (const j of selected) {
        const saved = saveJob(j);
        void recordDecision(saved, "saved");
      }
      success(`Saved ${selected.length} job(s) to pipeline tracker.`);
    },
    [saveJob, recordDecision, success]
  );

  const handleBatchAutoApply = useCallback(
    async (selected: JobApplication[]) => {
      const savedJobs = selected.map((j) => {
        const s = saveJob(j);
        void recordDecision(s, "saved");
        return s;
      });
      const ids = savedJobs.map((j) => j.id);
      success(`Dispatched parallel auto-apply workers for ${ids.length} roles…`);
      await triggerAutoApplyBatch(ids, { submit: false });
    },
    [saveJob, recordDecision, triggerAutoApplyBatch, success]
  );

  const handleBatchMatch = useCallback(
    async (selected: JobApplication[]) => {
      const savedJobs = selected.map((j) => saveJob(j));
      const ids = savedJobs.map((j) => j.id);
      success(`Running parallel AI ATS match analysis on ${ids.length} jobs…`);
      await triggerMatchBatch(ids);
    },
    [saveJob, triggerMatchBatch, success]
  );

  /* Guard: hide jobs already tracked or decided on */
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
      if (!health.ok) throw new Error(`health ${health.status}`);
      const vaultRes = await fetch("/api/vault", { cache: "no-store" });
      if (!vaultRes.ok) throw new Error(`vault ${vaultRes.status}`);
      try {
        const llmRes = await fetch("/api/llm/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(7000),
        });
        const body = await llmRes.json().catch(() => ({})) as { error?: unknown };
        const msg = typeof body.error === "string" ? body.error : "";
        const isMissingKeys = msg.includes("No API keys") || msg.includes("no API key");
        if (!llmRes.ok && !isMissingKeys) throw new Error(`llm ${llmRes.status}`);
      } catch (e) {
        const m = e instanceof Error ? e.message : "";
        if (m.startsWith("llm ")) throw e;
        if (m) warn(m);
      }
      setOffline(false);
    } catch (err) {
      error(err instanceof Error ? err.message : "Retry probe failed — agent still offline.");
      setOffline(true);
    } finally {
      setChecked(true);
    }
  }, [error, warn]);

  const visibleSources = useMemo(() => {
    const parsed = parseSourceCatalog({ sources });
    const catalog = parsed.sources.length
      ? parsed.sources
      : sources.map((s) => ({
          id: s.id,
          name: s.name,
          sourceType: (s.sourceType as never) ?? "general",
          markets: (s.markets as never) ?? ["global"],
          experience: (s.experience as never) ?? "all",
          workMode: (s.workMode as never) ?? "all",
          enabledByDefault: s.enabledByDefault,
        }));
    const ids = new Set(applySourceFilters(catalog as never, filterSelection).map((x) => x.id));
    return sources.filter((s) => ids.has(s.id));
  }, [sources, filterSelection]);

  const toggleSource = (sourceId: string) => {
    setSelectedSourceIds((current) => {
      const next = new Set(current);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--chartreuse)]">Discover → inspect → decide</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--paper)]">
            Discovery Control
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-dim">
            Choose exactly which boards run, watch every source outcome, then review the evidence before anything enters your tracker.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold ${offline ? "border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)]" : "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"}`}>
            <Radio className={`h-3.5 w-3.5 ${crawling ? "animate-pulse" : ""}`} />
            {!checked ? "Checking agent" : offline ? "Agent offline" : crawling ? "Crawl running" : "Agent ready"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.02] px-3 py-1.5 font-mono text-[11px] text-dim">
            <Zap className="h-3.5 w-3.5" /> {workerCount} workers max
          </span>
        </div>
      </div>

      <CrawlerDiscoveryControls
        keyword={keyword}
        onKeywordChange={setKeyword}
        crawlLimit={crawlLimit}
        onCrawlLimitChange={setCrawlLimit}
        selection={filterSelection}
        onSelectionChange={setFilterSelection}
        sources={sources}
        selectedIds={selectedSourceIds}
        onToggleSource={toggleSource}
        onStart={() => void crawl()}
        crawling={crawling}
        checked={checked}
        offline={offline}
      />

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/40 p-5">
        <BoardLiveGrid
          runId={liveRunId ?? lastCrawl?.runId ?? null}
          sources={visibleSources}
          concurrency={workerCount}
          selectedIds={selectedSourceIds}
        />
      </section>

      {lastCrawl && (
        <section className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Last run outcome</p>
              <p className="mt-1 text-sm font-semibold text-[var(--paper)]">{lastCrawl.found} reviewable roles from {lastCrawl.boardsCrawled} sources</p>
              <p className="mt-1 font-mono text-[10px] text-dim">{lastCrawl.keyword} · {lastCrawl.concurrency} workers · run {lastCrawl.runId || "unavailable"}</p>
            </div>
            <span className="text-[11px] text-dim">Finished {new Date(lastCrawl.finishedAt).toLocaleTimeString()}</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lastCrawl.sources.map((source) => (
              <div key={source.id} className="rounded-xl border border-[var(--line)] bg-black/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-[var(--paper)]">{source.name}</span>
                  <span className={source.status === "success" ? "text-[var(--chartreuse)]" : "text-[var(--coral)]"}>{source.status === "success" ? "✓" : "!"}</span>
                </div>
                <p className="mt-1 font-mono text-[10px] text-dim">{source.found} cards · {source.matched} matched</p>
                {source.error && <p className="mt-1 line-clamp-2 text-[10px] text-[var(--coral)]">{source.error}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
        <AgentLiveConsole title="Crawler telemetry and proof" />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--paper)]">Discovered roles</h2>
          <p className="mt-0.5 text-[11px] text-dim">{visibleJobs.length} ready to review · {trackedCount} tracked · {skippedCount} skipped</p>
        </div>
        <div className="flex rounded-xl border border-[var(--line)] bg-[var(--ink)] p-0.5">
          <button onClick={() => setViewMode("deck")} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${viewMode === "deck" ? "bg-white/[0.06] text-[var(--paper)]" : "text-dim"}`}><CreditCard className="h-3.5 w-3.5" /> Deck</button>
          <button onClick={() => setViewMode("matrix")} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${viewMode === "matrix" ? "bg-white/[0.06] text-[var(--paper)]" : "text-dim"}`}><LayoutGrid className="h-3.5 w-3.5" /> Grid</button>
        </div>
      </div>

      {/* Offline panel */}
      {offline ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--line)] bg-[#12141a]/60 p-12 text-center">
          <WifiOff className="h-12 w-12 text-coral mb-3" />
          <h3 className="text-lg font-bold text-[var(--paper)]">Scrapling agent offline</h3>
          <p className="text-xs text-dim max-w-md mt-1 mb-4">
            Start the parallel sidecar from the repo root:
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
          <p className="mt-3 text-xs text-dim">Pinging the parallel Scrapling engine and sweeping boards…</p>
        </div>
      ) : viewMode === "deck" ? (
        <JobSwipeDeck
          jobs={visibleJobs}
          onAutoApply={handleAutoApply}
          onTailor={handleTailor}
          onRunEmployerReview={handleRunEmployerReview}
          onSave={handleSave}
          onReviewed={handleReviewed}
        />
      ) : (
        <JobMatrixView
          jobs={visibleJobs}
          onSave={handleSave}
          onAutoApply={handleAutoApply}
          onTailor={handleTailor}
          onRunEmployerReview={handleRunEmployerReview}
          onReviewed={handleReviewed}
          onBatchSave={handleBatchSave}
          onBatchAutoApply={handleBatchAutoApply}
          onBatchMatch={handleBatchMatch}
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
