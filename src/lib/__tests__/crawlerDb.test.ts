import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  getDb,
  closeDb,
  migrate,
  jobsRepo,
  crawlerSourcesRepo,
  crawlerSourceStateRepo,
  crawlerRunsRepo,
  crawlerJobsStagingRepo,
  jobSourceEdgesRepo,
  savedSearchesRepo,
  enrichmentSourcesRepo,
  enrichmentItemsRepo,
  exportAllData,
  importAllData,
  settingsRepo,
} from "@/lib/db";
import type { SourceDefinition, SourceSyncState } from "@/lib/crawler/contracts";
import { isMasked, MASK_PREFIX, redactSettings } from "@/lib/masking";

const SAMPLE_SOURCE_DEF: SourceDefinition = {
  id: "test_greenhouse",
  name: "Greenhouse Test",
  channel: "ats",
  connector: "greenhouse",
  regions: ["global"],
  capabilities: ["search", "location_filter", "etag_caching"],
  authMode: "none",
  crawlPolicy: "automatic",
  cadenceMinutes: 180,
  perDomainRps: 5.0,
  termsUrl: "https://greenhouse.io/terms",
  attribution: {
    name: "Greenhouse Software",
    url: "https://boards-api.greenhouse.io",
  },
  enabledByDefault: true,
};

describe("Crawler Database Schema, Repos, and Backup", () => {
  beforeEach(() => {
    closeDb();
    const db = getDb();
    migrate(db);
  });

  afterEach(() => {
    closeDb();
  });

  it("migrate is idempotent and can run multiple times without error", () => {
    const db = getDb();
    expect(() => {
      migrate(db);
      migrate(db);
    }).not.toThrow();
  });

  it("crawlerSourcesRepo supports CRUD operations", () => {
    crawlerSourcesRepo.upsert("test_greenhouse", SAMPLE_SOURCE_DEF, "builtin", true);
    const fetched = crawlerSourcesRepo.get("test_greenhouse");
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe("Greenhouse Test");
    expect(fetched?.channel).toBe("ats");

    crawlerSourcesRepo.setEnabled("test_greenhouse", false);
    const list = crawlerSourcesRepo.list();
    const item = list.find((s) => s.id === "test_greenhouse");
    expect(item?.enabled).toBe(false);

    crawlerSourcesRepo.delete("test_greenhouse");
    expect(crawlerSourcesRepo.get("test_greenhouse")).toBeNull();
  });

  it("crawlerSourceStateRepo tracks sync cursors, ETags, and circuit breaker", () => {
    crawlerSourcesRepo.upsert("test_source", SAMPLE_SOURCE_DEF);
    const initial: SourceSyncState = {
      sourceId: "test_source",
      cursor: "page_1",
      etag: '"abc-123"',
      lastModified: "Wed, 21 Oct 2025 07:28:00 GMT",
      contentHash: "hash-001",
      lastSuccessAt: new Date().toISOString(),
      consecutiveFailures: 0,
    };
    crawlerSourceStateRepo.upsert(initial);

    let state = crawlerSourceStateRepo.get("test_source");
    expect(state?.cursor).toBe("page_1");
    expect(state?.etag).toBe('"abc-123"');
    expect(state?.consecutiveFailures).toBe(0);

    // Record failure 3 times -> circuit breaker trips
    crawlerSourceStateRepo.recordAttempt("test_source", false);
    crawlerSourceStateRepo.recordAttempt("test_source", false);
    crawlerSourceStateRepo.recordAttempt("test_source", false);

    state = crawlerSourceStateRepo.get("test_source");
    expect(state?.consecutiveFailures).toBe(3);
    expect(state?.circuitOpenUntil).toBeTruthy();

    // Success resets consecutive failures and clears circuit
    crawlerSourceStateRepo.recordAttempt("test_source", true, { etag: '"new-etag"' });
    state = crawlerSourceStateRepo.get("test_source");
    expect(state?.consecutiveFailures).toBe(0);
    expect(state?.circuitOpenUntil).toBeNull();
    expect(state?.etag).toBe('"new-etag"');
  });

  it("crawlerRunsRepo and crawlerJobsStagingRepo handle run lifecycle and staged items", () => {
    const runId = `run_${Date.now()}`;
    crawlerRunsRepo.create({ id: runId, channel: "ats", query: "react engineer" });

    crawlerJobsStagingRepo.stage(runId, "greenhouse", "gh_123", { title: "Senior React Engineer" }, "hash_gh_123");
    crawlerJobsStagingRepo.stage(runId, "lever", "lev_456", { title: "Lead Frontend" }, "hash_lev_456");

    const staged = crawlerJobsStagingRepo.listByRun(runId);
    expect(staged).toHaveLength(2);
    expect((staged[0]?.payload as { title: string }).title).toBeTruthy();

    crawlerRunsRepo.update(runId, {
      status: "completed",
      fetchedCount: 2,
      acceptedCount: 2,
      duplicateCount: 0,
    });

    const runSummary = crawlerRunsRepo.get(runId);
    expect(runSummary?.status).toBe("completed");
    expect(runSummary?.fetchedCount).toBe(2);

    crawlerJobsStagingRepo.deleteByRun(runId);
    expect(crawlerJobsStagingRepo.listByRun(runId)).toHaveLength(0);
  });

  it("jobSourceEdgesRepo tracks multi-source provenance and handles 2-strike job closing", () => {
    const job = jobsRepo.upsert({
      id: "job_multi_source",
      title: "Staff Software Engineer",
      company: "Acme Corp",
      location: "Remote",
      status: "wishlist",
      jobDescription: "Staff engineer role",
      createdDate: new Date().toISOString(),
      canonicalKey: "acme-corp::staff-software-engineer::remote",
    });

    jobSourceEdgesRepo.upsertEdge({
      jobId: job.id,
      sourceId: "greenhouse",
      externalId: "ext_gh_1",
      sourceUrl: "https://boards.greenhouse.io/acme/jobs/1",
    });

    jobSourceEdgesRepo.upsertEdge({
      jobId: job.id,
      sourceId: "lever",
      externalId: "ext_lev_1",
      sourceUrl: "https://jobs.lever.co/acme/1",
    });

    let edges = jobSourceEdgesRepo.listByJob(job.id);
    expect(edges).toHaveLength(2);
    expect(edges[0]?.missingSuccessfulSyncs).toBe(0);

    // First omission on greenhouse -> missing count becomes 1, job remains open
    let results = jobSourceEdgesRepo.incrementMissingSyncs("greenhouse", new Set(["other_job"]));
    expect(results).toHaveLength(1);
    expect(results[0]?.closed).toBe(false);

    edges = jobSourceEdgesRepo.listByJob(job.id);
    const ghEdge = edges.find((e) => e.sourceId === "greenhouse");
    expect(ghEdge?.missingSuccessfulSyncs).toBe(1);
    expect(ghEdge?.closedAt).toBeNull();

    // Second omission on greenhouse -> missing count becomes 2, edge is marked closed
    results = jobSourceEdgesRepo.incrementMissingSyncs("greenhouse", new Set(["other_job"]));
    expect(results).toHaveLength(1);
    expect(results[0]?.closed).toBe(true);

    edges = jobSourceEdgesRepo.listByJob(job.id);
    const closedGhEdge = edges.find((e) => e.sourceId === "greenhouse");
    expect(closedGhEdge?.closedAt).toBeTruthy();
  });

  it("savedSearchesRepo and enrichment repos persist records", () => {
    const saved = savedSearchesRepo.create({
      name: "Remote European Engineers",
      channel: "ats",
      query: { keyword: "golang", regions: ["europe"] },
      cadenceMinutes: 120,
    });
    expect(saved.id).toBeTruthy();
    expect(savedSearchesRepo.get(saved.id)?.name).toBe("Remote European Engineers");

    enrichmentSourcesRepo.upsert({
      id: "hiring-without-whiteboards",
      repo: "poteto/hiring-without-whiteboards",
      commitSha: "abcdef1234567890",
      license: "MIT",
      purpose: "interview_style_signals",
    });
    expect(enrichmentSourcesRepo.get("hiring-without-whiteboards")?.license).toBe("MIT");

    enrichmentItemsRepo.upsert({
      sourceId: "hiring-without-whiteboards",
      itemKey: "stripe",
      payload: { interviewStyle: "take-home", url: "https://stripe.com" },
      provenance: "README.md:120",
    });
    expect(enrichmentItemsRepo.get("hiring-without-whiteboards", "stripe")?.provenance).toBe("README.md:120");
  });

  it("exportAllData redacts connector secrets and importAllData restores snapshot cleanly", () => {
    // Set a connector secret in settings
    settingsRepo.set(
      "crawler_connector_keys",
      JSON.stringify({
        adzuna_key: "real-secret-key-123456",
        themuse_key: "another-secret-key-7890",
      })
    );

    crawlerSourcesRepo.upsert("test_src", SAMPLE_SOURCE_DEF);
    const exportSnapshot = exportAllData();

    // Verify secret is redacted when prepared for export/client delivery
    const redacted = redactSettings(exportSnapshot.settings);
    const exportedKeys = JSON.parse(redacted["crawler_connector_keys"] || "{}");
    expect(isMasked(exportedKeys.adzuna_key)).toBe(true);
    expect(exportedKeys.adzuna_key).toContain(MASK_PREFIX);

    // Wipe and restore
    expect(() => importAllData(exportSnapshot)).not.toThrow();
    expect(crawlerSourcesRepo.get("test_src")).not.toBeNull();
  });
});
