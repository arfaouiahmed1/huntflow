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
import { getStoredWorkspacePrefs, sendDesktopNotification } from "@/lib/workspacePrefs";
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
  queued?: number;
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
interface InboxCounts {
  new: number;
  seen: number;
  saved: number;
  dismissed: number;
  total: number;
  pending: number;
}
export default function JobsPage() {
  const {
    profile,
    triggerAutoApplyBatch,
    triggerMatchBatch,
    cloudinarySettings,
    refreshData,
  } = useApp();
  const { success, error, warn } = useToast();

  // Defaults from Settings → Workspace → Defaults & display (localStorage; server falls back to deck).
  const [viewMode, setViewMode] = useState<"deck" | "matrix">(() => getStoredWorkspacePrefs().jobsView);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  // Discovery Inbox: unreviewed crawler queue. Crawling only enqueues;
  // swipe-right promotes into the tracker, swipe-left dismisses the inbox row.
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [inboxCounts, setInboxCounts] = useState<InboxCounts>({ new: 0, seen: 0, saved: 0, dismissed: 0, total: 0, pending: 0 });
  const [inboxLoading, setInboxLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [offline, setOffline] = useState(false);
  const [checked, setChecked] = useState(false);
  const [workerCount] = useState<number>(1);
  const [keyword, setKeyword] = useState(profile.targetTitle?.trim() || "developer");
  const [channel, setChannel] = useState<ChannelKey>("all");
  const [facets, setFacets] = useState<CrawlerFacetFilters>({});
  const [crawlLimit, setCrawlLimit] = useState(() => getStoredWorkspacePrefs().crawlLimit);
  const [sources, setSources] = useState<CrawlerSourcePublic[]>([]);
  const [lastCrawl, setLastCrawl] = useState<CrawlSummary | null>(null);
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [crawlNotice, setCrawlNotice] = useState<CrawlNotice | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewJob, setReviewJob] = useState<JobApplication | null>(null);
  const [reviewData, setReviewData] = useState<EmployerReview | null>(null);
  const [discoveryModalOpen, setDiscoveryModalOpen] = useState(false);

  const fetchInbox = useCallback(async () => {
    setInboxLoading(true);
    try {
      const res = await fetch("/api/discovery/inbox?status=pending&limit=200", { cache: "no-store" });
      const data = await readJsonResponse<{ success?: boolean; jobs?: JobApplication[]; counts?: InboxCounts; error?: string }>(res);
      if (res.ok && data?.success) {
        setJobs(collapseDuplicateJobs(data.jobs || []));
        if (data.counts) setInboxCounts(data.counts);
      } else if (!res.ok) {
        warn(data?.error || `Inbox load failed (HTTP ${res.status}).`);
      }
    } catch (err) {
      warn(err instanceof Error ? err.message : "Failed to load Discovery Inbox.");
    } finally {
      setInboxLoading(false);
    }
  }, [warn]);

  const queueKey = useCallback((job: JobApplication) => job.canonicalKey || dedupKey(job), []);

  const decideInbox = useCallback(
    async (job: JobApplication, outcome: "saved" | "dismissed", reason?: string) => {
      const canonicalKey = queueKey(job);
      if (!canonicalKey) return null;
      try {
        const res = await fetch("/api/discovery/decide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ canonicalKey, outcome, reason }),
        });
        const data = await readJsonResponse<{ success?: boolean; job?: JobApplication; counts?: InboxCounts; error?: string }>(res);
        if (!res.ok || !data?.success) throw new Error(data?.error || `Decision failed (HTTP ${res.status}).`);
        setJobs((prev) => prev.filter((j) => queueKey(j) !== canonicalKey));
        if (data.counts) setInboxCounts(data.counts);
        return data;
      } catch (err) {
        error(err instanceof Error ? err.message : "Failed to record decision.");
        return null;
      }
    },
    [queueKey, error]
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
        const message = data.error || "Start the local crawler agent and retry discovery.";
        setCrawlNotice({ tone: "error", title: "Crawler agent unavailable", detail: message });
        error(message);
        return;
      }

      setOffline(false);
      await fetchInbox();
      if (count > 0) {
        const queued = Number(data.queued ?? count);
        setCrawlNotice({
          tone: "success",
          title: `Discovery complete — ${queued} role${queued === 1 ? "" : "s"} queued in the inbox`,
          detail: `Searched ${data.boardsCrawled || 0} enabled sources for “${searchTerm}”. Swipe right to save keepers to Your Applications.`,
        });
        success(`Queued ${queued} fresh job opportunit${queued === 1 ? "y" : "ies"} in the Discovery Inbox.`);
        void persistNotification({
          title: "Crawl complete",
          message: `Found ${count} fresh roles for "${searchTerm}"`,
          kind: "success",
          link: "/jobs",
        });
        // OS-level ping only when enabled in Settings → Workspace (never prompts from here).
        void sendDesktopNotification("HUNTFLOW crawl complete", `Found ${count} fresh roles for "${searchTerm}"`);
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
    } finally {
      setCrawling(false);
    }
  }, [channel, facets, keyword, crawlLimit, cloudinarySettings.concurrency, success, error, warn, refreshData, fetchInbox]);

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
        if (data.success) {
          await fetchInbox();
          success(`Ingested roles directly from ${name} into the Discovery Inbox!`);
          void refreshData();
        }
      } catch (err) {
        error(err instanceof Error ? err.message : "Failed to ingest company roles");
      }
    },
    [success, error, refreshData, fetchInbox]
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
    const loadInbox = async () => {
      await fetchInbox();
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
    void loadInbox();
    void loadSources();
    void boot();
    return () => {
      cancelled = true;
    };
  }, [fetchInbox]);

  // Promote an inbox card into the tracker (wishlist) via the decide API.
  // Returns the promoted tracker job, or null when the decision failed.
  const promoteInbox = useCallback(
    async (job: JobApplication): Promise<JobApplication | null> => {
      const data = await decideInbox(job, "saved");
      return data?.job ?? null;
    },
    [decideInbox]
  );

  const handleSave = useCallback(
    (job: JobApplication) => {
      void (async () => {
        const data = await decideInbox(job, "saved");
        if (!data) return;
        const saved = data.job ?? job;
        success(`Saved ${saved.title} to Your Applications.`);
        void persistNotification({ title: "Saved to tracker", message: `${saved.title} @ ${saved.company} — saved to wishlist`, kind: "success", link: "/tracker" });
        void refreshData();
      })();
    },
    [decideInbox, success, refreshData]
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
        } else {
          error(data.error || "Failed to generate employer review");
        }
      } catch (err) {
        error(err instanceof Error ? err.message : "Failed to run Employer Simulator.");
      }
    },
    [profile, error]
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
      void (async () => {
        const data = await decideInbox(job, "dismissed", reason ?? "generic");
        if (!data) return;
        if (reason && reason !== "generic") {
          warn(`Dismissed: learned preference "${reason.replace("_", " ")}" for future filter tuning.`);
        }
        void refreshData();
      })();
    },
    [decideInbox, warn, refreshData]
  );

  const handleBatchSave = useCallback(
    (selected: JobApplication[]) => {
      void (async () => {
        let savedCount = 0;
        for (const j of selected) {
          const data = await decideInbox(j, "saved");
          if (data) savedCount++;
        }
        success(`Saved ${savedCount} job(s) to Your Applications.`);
        void refreshData();
      })();
    },
    [decideInbox, success, refreshData]
  );

  const handleBatchAutoApply = useCallback(
    async (selected: JobApplication[]) => {
      const ids: string[] = [];
      for (const j of selected) {
        const promoted = await promoteInbox(j);
        if (promoted) ids.push(promoted.id);
      }
      if (ids.length === 0) {
        warn("Nothing to auto-apply — inbox decisions failed.");
        return;
      }
      success(`Dispatched parallel auto-apply workers for ${ids.length} roles…`);
      await triggerAutoApplyBatch(ids, { submit: false });
      void refreshData();
    },
    [promoteInbox, triggerAutoApplyBatch, success, warn, refreshData]
  );

  const handleBatchMatch = useCallback(
    async (selected: JobApplication[]) => {
      const ids: string[] = [];
      for (const j of selected) {
        const promoted = await promoteInbox(j);
        if (promoted) ids.push(promoted.id);
      }
      if (ids.length === 0) {
        warn("Nothing to analyze — inbox decisions failed.");
        return;
      }
      success(`Running parallel AI ATS match analysis on ${ids.length} jobs…`);
      await triggerMatchBatch(ids);
      void refreshData();
    },
    [promoteInbox, triggerMatchBatch, success, warn, refreshData]
  );
  /* Inbox rows are server-filtered to pending (new/seen); facets narrow client-side. */
  const visibleJobs = useMemo(() => {
    return jobs.filter((j: JobApplication) => {
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
  }, [jobs, facets]);

  const hasZeroFilterResult = jobs.length > 0 && visibleJobs.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--paper)]">
            Discovery Inbox
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-dim">
            Unreviewed crawler discoveries — swipe right to save keepers to Your Applications, left to dismiss. Crawling only queues here; it never touches your tracker. Saved roles appear in /tracker.
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
            {jobs.length} roles are waiting in the inbox, but active region, seniority, visa, or salary filters filtered them out.
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
            Discovery Inbox ({visibleJobs.length})
          </h2>
          <span className="font-mono text-[11px] text-dim">
            {inboxCounts.pending} pending · {inboxCounts.saved} saved · {inboxCounts.dismissed} dismissed
          </span>
          {jobs.length > visibleJobs.length && (
            <span className="text-xs text-dim">
              ({jobs.length - visibleJobs.length} hidden by filters)
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
      {visibleJobs.length === 0 && !hasZeroFilterResult && !crawling && !inboxLoading && (
        <section
          data-testid="crawl-empty-state"
          className="rounded-3xl border border-dashed border-[var(--line)] bg-white/[0.015] p-8 text-center"
        >
          <FilterX className="mx-auto h-8 w-8 text-dim" />
          <h3 className="mt-3 text-sm font-semibold text-[var(--paper)]">Inbox zero — no unreviewed discoveries</h3>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-dim">
            Run Discovery above to queue fresh roles, or enable the worker for continuous background crawling. Swipe right to save keepers to Your Applications — HUNTFLOW never invents postings.
          </p>
        </section>
      )}

      {visibleJobs.length > 0 && viewMode === "deck" && (
        <JobSwipeDeck
          jobs={visibleJobs}
          onSave={handleSave}
          onAutoApply={async (job) => {
            const promoted = await promoteInbox(job);
            if (promoted) await triggerAutoApplyBatch([promoted.id], { submit: false });
          }}
          onTailor={(job) => {
            void promoteInbox(job);
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
            const promoted = await promoteInbox(job);
            if (promoted) await triggerAutoApplyBatch([promoted.id], { submit: false });
          }}
          onTailor={(job) => {
            void promoteInbox(job);
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
          void decideInbox(job, "saved");
        }}
      />
    </div>
  );
}
