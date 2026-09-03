export interface LiveCanarySource {
  id: string;
  name?: string;
  type: string;
  enabledByDefault: boolean;
}

export interface LiveCanaryJob {
  title?: unknown;
  company?: unknown;
  url?: unknown;
  jobDescription?: unknown;
}

export interface LiveCanaryResponse {
  jobs?: LiveCanaryJob[];
  source_results?: Array<{
    id?: unknown;
    status?: unknown;
    found?: unknown;
    matched?: unknown;
    error?: unknown;
  }>;
}

export interface LiveCanaryResult {
  passed: boolean;
  metrics: {
    sourceId: string;
    latencyMs: number;
    sourceStatus: string;
    cardsReturned: number;
    validCards: number;
  };
  failures: string[];
}

/** Prefer a user-selected source; otherwise select an enabled source, favouring static boards. */
export function selectLiveCanarySource<T extends LiveCanarySource>(
  sources: readonly T[],
  requestedId?: string,
): T | undefined {
  if (requestedId) return sources.find((source) => source.id === requestedId);
  const enabledSources = sources.filter((source) => source.enabledByDefault);
  return enabledSources.find((source) => source.type === "static") ?? enabledSources[0];
}

function isStructuredCard(job: LiveCanaryJob): boolean {
  return isNonEmptyString(job.title) && isHttpUrl(job.url) && isNonEmptyString(job.jobDescription);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpUrl(value: unknown): value is string {
  return isNonEmptyString(value) && /^https?:\/\/\S+$/i.test(value);
}

/** Score an external crawler response without normalizing or fabricating failures. */
export function scoreLiveCrawlerCanary(input: {
  sourceId: string;
  latencyMs: number;
  response: LiveCanaryResponse;
}): LiveCanaryResult {
  const jobs = Array.isArray(input.response.jobs) ? input.response.jobs : [];
  const sourceResult = input.response.source_results?.find((result) => result.id === input.sourceId);
  const sourceStatus = typeof sourceResult?.status === "string" ? sourceResult.status : "missing";
  const validCards = jobs.filter(isStructuredCard).length;
  const failures: string[] = [];
  if (sourceStatus !== "success") failures.push(`Source ${input.sourceId} did not succeed (${sourceStatus}).`);
  if (jobs.length === 0) failures.push("Crawler returned zero cards.");
  if (validCards !== jobs.length) {
    failures.push(`${jobs.length - validCards} returned card(s) were missing title, URL, or description.`);
  }

  return {
    passed: failures.length === 0,
    metrics: {
      sourceId: input.sourceId,
      latencyMs: Math.max(0, Math.round(input.latencyMs)),
      sourceStatus,
      cardsReturned: jobs.length,
      validCards,
    },
    failures,
  };
}
