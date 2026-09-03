/**
 * HUNTFLOW Crawler — Universal Domain Types and Contracts.
 *
 * Single source of truth for the v2 crawler network across Next.js and Scrapling sidecar.
 */

export const CRAWLER_CHANNELS = [
  "ats",
  "aggregator",
  "regional",
  "community",
  "directory",
] as const;

export type CrawlerChannel = (typeof CRAWLER_CHANNELS)[number];

export const CRAWLER_REGIONS = [
  "global",
  "americas",
  "europe",
  "mena",
  "africa",
  "apac",
] as const;

export type CrawlerRegion = (typeof CRAWLER_REGIONS)[number];

export const SOURCE_AUTH_MODES = [
  "none",
  "optional_key",
  "required_key",
  "user_session",
] as const;

export type SourceAuthMode = (typeof SOURCE_AUTH_MODES)[number];

export const SOURCE_CRAWL_POLICIES = [
  "automatic",
  "manual_only",
  "disabled",
] as const;

export type SourceCrawlPolicy = (typeof SOURCE_CRAWL_POLICIES)[number];

export const SOURCE_CAPABILITIES = [
  "search",
  "location_filter",
  "pagination",
  "structured_salary",
  "structured_remote",
  "rss_feed",
  "rate_limit_headers",
  "etag_caching",
] as const;

export type SourceCapability = (typeof SOURCE_CAPABILITIES)[number];

export type ConnectorId =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "smartrecruiters"
  | "personio"
  | "recruitee"
  | "workable"
  | "teamtailor"
  | "workday"
  | "bamboohr"
  | "arbeitnow"
  | "jobicy"
  | "remotive"
  | "himalayas"
  | "reliefweb"
  | "themuse"
  | "adzuna"
  | "jooble"
  | "findwork"
  | "usajobs"
  | "html_static"
  | "html_stealth"
  | "html_posts"
  | "directory_careerpanels"
  | "directory_jobboardsearch"
  | (string & {});

export interface SourceAttribution {
  name: string;
  url: string;
  licenseNotice?: string;
  termsUrl?: string;
}

export interface SourceDefinition {
  id: string;
  name: string;
  channel: CrawlerChannel;
  connector: ConnectorId;
  regions: CrawlerRegion[];
  countryCodes?: string[];
  languages?: string[];
  capabilities: SourceCapability[];
  authMode: SourceAuthMode;
  crawlPolicy: SourceCrawlPolicy;
  cadenceMinutes: number;
  perDomainRps: number;
  termsUrl: string;
  attribution: SourceAttribution;
  config?: Record<string, unknown>;
  enabledByDefault?: boolean;
  description?: string;
}

export interface SourceRegistryV2 {
  schemaVersion: 2;
  sources: SourceDefinition[];
}

export type SourceHealthStatus =
  | "healthy"
  | "degraded"
  | "unconfigured"
  | "manual_only"
  | "disabled"
  | "circuit_open";

export interface SourceSyncState {
  sourceId: string;
  cursor?: string | null;
  etag?: string | null;
  lastModified?: string | null;
  contentHash?: string | null;
  lastSuccessAt?: string | null;
  lastAttemptAt?: string | null;
  nextRunAt?: string | null;
  consecutiveFailures: number;
  circuitOpenUntil?: string | null;
  healthStatus?: SourceHealthStatus;
}

export interface CrawlerSourcePublic {
  id: string;
  name: string;
  channel: CrawlerChannel;
  connector: string;
  regions: CrawlerRegion[];
  countryCodes?: string[];
  languages?: string[];
  capabilities: SourceCapability[];
  authMode: SourceAuthMode;
  crawlPolicy: SourceCrawlPolicy;
  cadenceMinutes: number;
  perDomainRps: number;
  termsUrl: string;
  attribution: SourceAttribution;
  enabled: boolean;
  health: SourceHealthStatus;
  lastSuccessAt?: string | null;
  description?: string;
}

export type WorkMode = "remote" | "hybrid" | "onsite";
export type EmploymentType = "full_time" | "part_time" | "contract" | "internship";
export type SeniorityLevel =
  | "intern"
  | "junior"
  | "mid"
  | "senior"
  | "staff"
  | "lead"
  | "principal";
export type VisaSignal = "explicit" | "likely" | "unknown";

export interface CrawlerFacetFilters {
  regions?: CrawlerRegion[];
  countryCodes?: string[];
  workModes?: WorkMode[];
  employmentTypes?: EmploymentType[];
  seniorities?: SeniorityLevel[];
  techTags?: string[];
  languages?: string[];
  salaryMin?: number;
  salaryCurrency?: string;
  visaSignals?: VisaSignal[];
  postedWithinDays?: number;
  interviewStyle?: "without_whiteboards" | "all";
}

export interface CrawlerRunRequest {
  channel?: CrawlerChannel | "all";
  query?: string;
  filters?: CrawlerFacetFilters;
  sourceIds?: string[];
  limit?: number;
  saveSearchId?: string;
}

export interface CrawlerRunError {
  sourceId: string;
  error: string;
  recoverable: boolean;
}

export interface CrawlerRunSummary {
  runId: string;
  channel: CrawlerChannel | "all";
  status: "pending" | "running" | "completed" | "partial" | "failed";
  startedAt: string;
  finishedAt?: string;
  plannedSources: number;
  fetchedCount: number;
  acceptedCount: number;
  duplicateCount: number;
  errors?: CrawlerRunError[];
}

export interface JobSourceEdge {
  jobId?: string;
  sourceId: string;
  externalId: string;
  sourceUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
  missingSuccessfulSyncs?: number;
  closedAt?: string | null;
}

export interface CanonicalJobCandidate {
  id: string;
  canonicalKey: string;
  title: string;
  company: string;
  companyKey: string;
  location: string;
  locationKey: string;
  url: string;
  description: string;
  sourceId: string;
  externalId: string;
  postedAt?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  closedAt?: string | null;
  seniority?: SeniorityLevel | null;
  workMode?: WorkMode | null;
  employmentType?: EmploymentType | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  visaSignal?: VisaSignal | null;
  techTags: string[];
  sourceConfidence: number;
  score?: number;
  rankingBreakdown?: Record<string, number>;
  sourcesCount?: number;
  sourceEdges?: JobSourceEdge[];
}

export interface SavedSearchRecord {
  id: string;
  name: string;
  channel: CrawlerChannel | "all";
  queryJson: string;
  cadenceMinutes: number;
  enabled: boolean;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnrichmentSourceRecord {
  id: string;
  repo: string;
  commitSha: string;
  license: string;
  purpose: string;
  enabled: boolean;
  checkedAt: string;
}

export interface EnrichmentItemRecord {
  sourceId: string;
  itemKey: string;
  payloadJson: string;
  provenance: string;
  updatedAt: string;
}
