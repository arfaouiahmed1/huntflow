"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LayoutGrid,
  CreditCard,
  Zap,
  Radio,
  FilterX,
  CheckCircle2,
  CircleAlert,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { JobApplication, EmployerReview } from "@/types";
import { useToast } from "@/components/ui/Toaster";
import { Button } from "@/components/ui/Button";
import { JobSwipeDeck } from "@/components/crawler/JobSwipeDeck";
import { JobMatrixView } from "@/components/crawler/JobMatrixView";
import { EmployerReviewModal } from "@/components/crawler/EmployerReviewModal";
import JobDetailDrawer from "@/components/JobDetailDrawer";
import CompanyDiscoveryModal from "@/components/crawler/CompanyDiscoveryModal";
import { dedupKey, collapseDuplicateJobs } from "@/lib/dedup";
import { BoardLiveGrid } from "@/components/crawler/BoardLiveCard";
import CrawlerDiscoveryControls from "@/components/crawler/CrawlerDiscoveryControls";
import type { ChannelKey } from "@/components/crawler/CrawlerChannelBar";
import type { CrawlerFacetFilters, CrawlerSourcePublic } from "@/lib/crawler/contracts";
import { persistNotification } from "@/lib/notificationsClient";
import { readJsonResponse } from "@/lib/errors";

interface CrawlSourceResult {
  id?: string;
  name?: string;
  source_id?: string;
  source_name?: string;
  status: "success" | "warning" | "failed" | "skipped";
  found?: number;
  matched?: number;
  error?: string;
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

interface CrawlApiResponse {
  success?: boolean;
  offline?: boolean;
  error?: string;
  runId?: string | null;
  count?: number;
  jobs?: JobApplication[];
  concurrency?: number;
  boardsCrawled?: number;
  sourceResults?: CrawlSourceResult[];
}
interface CrawlNotice {
  tone: "success" | "info" | "warning" | "error";
  title: string;
  detail: string;
}

const DECISIONS_MAX = 500;
export default function JobsPage() {
  const {
    applications,
    profile,
    addApplication,
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
  const [workerCount] = useState<number>(1);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [keyword, setKeyword] = useState(profile.targetTitle?.trim() || "developer");
  const [channel, setChannel] = useState<ChannelKey>("all");
  const [facets, setFacets] = useState<CrawlerFacetFilters>({});
  const [crawlLimit, setCrawlLimit] = useState(50);
  const [sources, setSources] = useState<CrawlerSourcePublic[]>([]);
  const [lastCrawl, setLastCrawl] = useState<CrawlSummary | null>(null);
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [crawlNotice, setCrawlNotice] = useState<CrawlNotice | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewJob, setReviewJob] = useState<JobApplication | null>(null);
  const [reviewData, setReviewData] = useState<EmployerReview | null>(null);
  const [discoveryModalOpen, setDiscoveryModalOpen] = useState(false);

  const savedKeys = useMemo(
    () => new Set(applications.map((a) => dedupKey(a))),
    [applications]
  );
  const skipKeys = useMemo(
    () => new Set(Object.entries(decisions).filter(([, v]) => v.startsWith("skipped")).map(([k]) => k)),
    [decisions]
  );

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

  const runCrawl = useCallback(async () => {
    const startedAt = new Date().toISOString();
    const searchTerm = keyword.trim() || "developer";
    setCrawling(true);
    setOffline(false);
    setLiveRunId(null);
    setCrawlNotice(null);
    try {
      const concurrency = cloudinarySettings.concurrency || 1;
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: channel === "without_whiteboards" ? "ats" : channel,
          keyword: searchTerm,
          filters: {
            ...facets,
            interviewStyle: channel === "without_whiteboards" ? "without_whiteboards" : undefined,
          },
          limit: crawlLimit,
          concurrency,
        }),
      });
      const data = await readJsonResponse<CrawlApiResponse>(res);
      if (!data) throw new Error(`Crawler returned an empty response (HTTP ${res.status}).`);
      if (!res.ok) throw new Error(data.error || `Crawl failed (HTTP ${res.status}).`);

      const sourceResults = data.sourceResults || [];
      const count = Number(data.count || 0);
      const failedSources = sourceResults.filter((source) => source.status === "failed" || source.status === "warning");
      setLastCrawl({
        runId: data.runId || null,
        startedAt,
        finishedAt: new Date().toISOString(),
        boardsCrawled: Number(data.boardsCrawled || 0),
        found: count,
        keyword: searchTerm,
        concurrency: Number(data.concurrency || concurrency),
        sources: sourceResults,
      });
      if (data.runId) setLiveRunId(data.runId);

      if (data.offline) {
        setOffline(true);
        setJobs([]);
        const message = data.error || "Start the local crawler agent and retry discovery.";
        setCrawlNotice({ tone: "error", title: "Crawler agent unavailable", detail: message });
        error(message);
        return;
      }

      setOffline(false);
      setJobs(collapseDuplicateJobs(data.jobs || []));
      if (count > 0) {
        setCrawlNotice({
          tone: "success",
          title: `Discovery complete — ${count} role${count === 1 ? "" : "s"} found`,
          detail: `Searched ${data.boardsCrawled || 0} enabled sources for “${searchTerm}”.`,
        });
        success(`Discovered and ranked ${count} fresh job opportunity(ies).`);
        void persistNotification({
          title: "Crawl complete",
          message: `Found ${count} fresh roles for "${searchTerm}"`,
          kind: "success",
          link: "/jobs",
        });
      } else {
        const sourceNames = failedSources
          .slice(0, 3)
          .map((source) => source.name || source.source_name || source.id || source.source_id || "source")
          .join(", ");
        const detail = failedSources.length
          ? `${failedSources.length} source${failedSources.length === 1 ? "" : "s"} reported an error${failedSources.length === 1 ? "" : "s"}${sourceNames ? `: ${sourceNames}` : ""}.`
          : `No enabled source returned a role matching “${searchTerm}”.`;
        setCrawlNotice({ tone: failedSources.length ? "warning" : "info", title: "Discovery finished with no matches", detail });
        warn(detail);
      }
      void refreshData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Crawl failed — agent offline.";
      setCrawlNotice({ tone: "error", title: "Discovery failed", detail: message });
      error(message);
      setOffline(true);
      setJobs([]);
    } finally {
      setCrawling(false);
    }
  }, [channel, facets, keyword, crawlLimit, cloudinarySettings.concurrency, success, error, warn, refreshData]);

  const handleToggleSource = useCallback(async (id: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/crawl/sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        setSources((prev: CrawlerSourcePublic[]) => prev.map((s: CrawlerSourcePublic) => (s.id === id ? { ...s, enabled } : s)));
      }
    } catch (err) {
      console.warn("Toggle source failed", err);
    }
  }, []);

  const handleSaveSearch = useCallback(async () => {
    try {
      const res = await fetch("/api/data/saved_searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${keyword} (${channel})`,
          channel,
          query: { keyword, facets },
          cadenceMinutes: 180,
        }),
      });
      if (res.ok) {
        success("Saved search registered! The crawler will monitor this query automatically.");
      }
    } catch {
      warn("Saved search registered locally.");
    }
  }, [keyword, channel, facets, success, warn]);

  const handleIngestCompany = useCallback(
    async (token: string, provider: string, name: string) => {
      try {
        const res = await fetch("/api/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "ats",
            targetBoards: [{ provider, token, companyName: name }],
            limit: 50,
          }),
        });
        const data = await res.json();
        if (data.success && data.jobs) {
          const unique = collapseDuplicateJobs(data.jobs);
          setJobs((prev: JobApplication[]) => collapseDuplicateJobs([...prev, ...unique]));
          success(`Ingested ${unique.length} roles directly from ${name}!`);
          void refreshData();
        }
      } catch (err) {
        error(err instanceof Error ? err.message : "Failed to ingest company roles");
      }
    },
    [success, error, refreshData]
  );

  /* Boot checks health and loads sources */
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
        // ignore
      }
    };
    const loadSources = async () => {
      try {
        const res = await fetch("/api/crawl/sources", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setSources(data.sources || []);
      } catch {
        // ignore
      }
    };
    void loadDecisions();
    void loadSources();
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

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
      void persistNotification({ title: "Saved to tracker", message: `${saved.title} @ ${saved.company} — saved to wishlist`, kind: "success", link: "/tracker" });
    },
    [saveJob, recordDecision, success]
  );

  const handleRunEmployerReview = useCallback(
    async (job: JobApplication) => {
      setReviewJob(job);
      setReviewModalOpen(true);
      try {
        const res = await fetch("/api/agent/employer-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: job.title,
            company: job.company,
            jobDescription: job.jobDescription,
            url: job.url,
            userSkills: profile.skills,
            userSummary: profile.summary || profile.targetTitle,
            jobId: job.id,
          }),
        });
        const data = await res.json();
        if (res.ok && data.success && data.review) {
          setReviewData(data.review);
          const current = applications.find((a) => a.id === job.id);
          if (current) {
            const updated = { ...current, employerReview: data.review };
            void recordDecision(updated, "saved");
          }
        } else {
          error(data.error || "Failed to generate employer review");
        }
      } catch (err) {
        error(err instanceof Error ? err.message : "Failed to run Employer Simulator.");
      }
    },
    [profile, applications, recordDecision, error]
  );

  const handleOpenEmployerReview = useCallback(
    (job: JobApplication) => {
      setReviewJob(job);
      if (job.employerReview) {
        setReviewData(job.employerReview);
        setReviewModalOpen(true);
      } else {
        void handleRunEmployerReview(job);
      }
    },
    [handleRunEmployerReview]
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

  /* Guard: filter jobs against savedKeys, skipKeys, and active facets */
  const visibleJobs = useMemo(() => {
    return jobs.filter((j: JobApplication) => {
      if (savedKeys.has(dedupKey(j)) || skipKeys.has(dedupKey(j))) return false;
      if (facets.workModes && facets.workModes.length > 0 && j.workMode && !facets.workModes.includes(j.workMode)) {
        return false;
      }
      if (facets.seniorities && facets.seniorities.length > 0 && j.seniority && !facets.seniorities.includes(j.seniority)) {
        return false;
      }
      if (facets.salaryMin && j.salaryMax && j.salaryMax < facets.salaryMin) {
        return false;
      }
      if (facets.visaSignals?.includes("explicit") && j.visaSignal !== "explicit") {
        return false;
      }
      if (facets.techTags && facets.techTags.length > 0) {
        const jobTags = new Set((j.techTags || []).map((t: string) => t.toLowerCase()));
        const hasOverlap = facets.techTags.some((t: string) => jobTags.has(t.toLowerCase()));
        if (!hasOverlap && (j.techTags?.length ?? 0) > 0) return false;
      }
      return true;
    });
  }, [jobs, savedKeys, skipKeys, facets]);

  const hasZeroFilterResult = jobs.length > 0 && visibleJobs.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--chartreuse)]">Global Crawler Network</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--paper)]">
            Discovery Control
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-dim">
            Demand-driven global source network across public ATS feeds, aggregators, regional portals, and curated companies.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold ${offline ? "border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)]" : "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"}`}>
            <Radio className={`h-3.5 w-3.5 ${crawling ? "animate-pulse" : ""}`} />
            {!checked ? "Checking agent" : offline ? "Agent offline" : crawling ? "Crawl running" : "Network ready"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.02] px-3 py-1.5 font-mono text-[11px] text-dim">
            <Zap className="h-3.5 w-3.5" /> {workerCount} workers max
          </span>
        </div>
      </div>

      <CrawlerDiscoveryControls
        keyword={keyword}
        onKeywordChange={setKeyword}
        channel={channel}
        onChannelChange={setChannel}
        facets={facets}
        onFacetsChange={setFacets}
        onClearFacets={() => setFacets({})}
        crawlLimit={crawlLimit}
        onCrawlLimitChange={setCrawlLimit}
        sources={sources}
        onToggleSource={handleToggleSource}
        onStart={() => void runCrawl()}
        onSaveSearch={() => void handleSaveSearch()}
        crawling={crawling}
        checked={checked}
        offline={offline}
        onOpenCompanyDiscovery={() => setDiscoveryModalOpen(true)}
      />
      {crawlNotice && (
        <section
          role="status"
          aria-live="polite"
          data-testid="crawl-feedback"
          className={`rounded-2xl border p-4 ${crawlNotice.tone === "success"
            ? "border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/[0.06]"
            : crawlNotice.tone === "error"
              ? "border-[var(--coral)]/30 bg-[var(--coral)]/[0.06]"
              : "border-[var(--amber)]/30 bg-[var(--amber)]/[0.06]"}`}
        >
          <div className="flex items-start gap-3">
            {crawlNotice.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--chartreuse)]" />
            ) : (
              <CircleAlert className={`mt-0.5 h-4 w-4 shrink-0 ${crawlNotice.tone === "error" ? "text-[var(--coral)]" : "text-[var(--amber)]"}`} />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--paper)]">{crawlNotice.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-dim">{crawlNotice.detail}</p>
              {lastCrawl && (
                <p className="mt-2 font-mono text-[10px] text-dim">
                  Last run: {lastCrawl.keyword} · {lastCrawl.boardsCrawled} sources · {lastCrawl.found} roles · {lastCrawl.concurrency} worker{lastCrawl.concurrency === 1 ? "" : "s"}
                </p>
              )}
              {lastCrawl?.sources.some((source) => source.status === "failed" || source.status === "warning") && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {lastCrawl.sources
                    .filter((source) => source.status === "failed" || source.status === "warning")
                    .slice(0, 4)
                    .map((source) => (
                      <span key={source.id || source.source_id || source.name || source.source_name} className="rounded-full border border-[var(--coral)]/20 bg-[var(--coral)]/10 px-2 py-0.5 text-[10px] text-[var(--coral)]">
                        {source.name || source.source_name || source.id || source.source_id || "Source"}
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {crawling && (
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/40 p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--chartreuse)]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--paper)]">Live crawler telemetry</span>
            <span className="font-mono text-[10px] text-dim">run {liveRunId ?? lastCrawl?.runId ?? "active"}</span>
          </div>
          <BoardLiveGrid
            runId={liveRunId ?? lastCrawl?.runId ?? null}
            sources={sources.map((s: CrawlerSourcePublic) => ({ id: s.id, name: s.name, category: s.channel, type: "static" as const, url: s.attribution?.url || "", enabledByDefault: s.enabled }))}
            concurrency={workerCount}
            selectedIds={new Set(sources.filter((s: CrawlerSourcePublic) => s.enabled).map((s: CrawlerSourcePublic) => s.id))}
          />
        </section>
      )}

      {/* Zero filter state */}
      {hasZeroFilterResult && (
        <div className="p-8 rounded-3xl border border-[var(--line)] bg-white/[0.015] text-center space-y-3">
          <FilterX className="h-8 w-8 text-amber-400 mx-auto" />
          <h3 className="text-sm font-semibold text-white">No postings match current active filters</h3>
          <p className="text-xs text-[var(--paper-dim)] max-w-md mx-auto">
            {jobs.length} roles were found by the crawl, but active region, seniority, visa, or salary filters filtered them out.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFacets({})}
            className="text-xs border-[var(--line)] text-[var(--paper)] hover:text-white"
          >
            Clear active filters
          </Button>
        </div>
      )}

      {/* Main Jobs Workspace */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-[var(--paper)]">
            Crawl Results ({visibleJobs.length})
          </h2>
          {jobs.length > visibleJobs.length && (
            <span className="text-xs text-dim">
              ({jobs.length - visibleJobs.length} hidden by decisions/filters)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-[var(--line)] bg-white/[0.02] p-0.5">
            <button
              onClick={() => setViewMode("deck")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                viewMode === "deck"
                  ? "bg-[var(--chartreuse)] text-black"
                  : "text-dim hover:text-white"
              }`}
            >
              <CreditCard className="h-3.5 w-3.5" />
              <span>Deck</span>
            </button>
            <button
              onClick={() => setViewMode("matrix")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                viewMode === "matrix"
                  ? "bg-[var(--chartreuse)] text-black"
                  : "text-dim hover:text-white"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Matrix</span>
            </button>
          </div>
        </div>
      </div>

      {visibleJobs.length > 0 && viewMode === "deck" && (
        <JobSwipeDeck
          jobs={visibleJobs}
          onSave={handleSave}
          onAutoApply={async (job) => {
            const saved = saveJob(job);
            void recordDecision(saved, "saved");
            await triggerAutoApplyBatch([saved.id], { submit: false });
          }}
          onTailor={(job) => {
            const saved = saveJob(job);
            void recordDecision(saved, "saved");
          }}
          onReviewed={(job: JobApplication, reason?: string) => handleReviewed(job, reason)}
          onRunEmployerReview={handleOpenEmployerReview}
        />
      )}

      {visibleJobs.length > 0 && viewMode === "matrix" && (
        <JobMatrixView
          jobs={visibleJobs}
          onSave={handleSave}
          onAutoApply={async (job) => {
            const saved = saveJob(job);
            void recordDecision(saved, "saved");
            await triggerAutoApplyBatch([saved.id], { submit: false });
          }}
          onTailor={(job) => {
            const saved = saveJob(job);
            void recordDecision(saved, "saved");
          }}
          onBatchSave={handleBatchSave}
          onBatchAutoApply={handleBatchAutoApply}
          onBatchMatch={handleBatchMatch}
        />
      )}

      <CompanyDiscoveryModal
        isOpen={discoveryModalOpen}
        onClose={() => setDiscoveryModalOpen(false)}
        onIngestCompany={handleIngestCompany}
      />

      <JobDetailDrawer
        jobId={activeJobId}
        onClose={() => setActiveJobId(null)}
      />

      <EmployerReviewModal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        job={reviewJob}
        review={reviewData}
        onTailor={(job) => {
          saveJob(job);
        }}
      />
    </div>
  );
}
