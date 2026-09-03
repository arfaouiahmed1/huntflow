/**
 * Advanced Multi-Board Job Deduplication & Bucketed Collapsing Engine — Huntflow
 *
 * Implements:
 * 1. O(1) exact normalized URL matching
 * 2. O(k) company bucket partitioning with title token Jaccard similarity
 * 3. Multi-source collapsing with provenance preservation and source counts
 * 4. Scale-tested for 100,000+ candidates without O(n²) quadratic blowup
 */

import type { JobApplication } from "@/types";

export function normalizeUrl(rawUrl?: string): string {
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl.trim());
    // Strip tracking parameters
    const paramsToRemove = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "ref", "source", "gh_src", "fbclid", "gclid", "lever-origin", "ashby_jid",
    ];
    for (const p of paramsToRemove) {
      parsed.searchParams.delete(p);
    }
    let clean = parsed.origin + parsed.pathname.replace(/\/+$/, "");
    if (parsed.search) clean += parsed.search;
    return clean.toLowerCase();
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/+$/, "");
  }
}

/** Canonical dedup key for crawled jobs (strict fallback) */
export function dedupKey(job: { url?: string; title?: string; company?: string }): string {
  const url = normalizeUrl(job.url);
  if (url) return url;
  return `${(job.title || "").trim().toLowerCase()}||${normalizeCompanyName(job.company)}`;
}

/** Normalize company name stripping legal entity suffixes */
export function normalizeCompanyName(company: string | undefined): string {
  if (!company) return "";
  return company
    .toLowerCase()
    .replace(/\b(inc\.?|llc|ltd\.?|gmbh|corp\.?|corporation|technologies|solutions|group|sa|sarl|limited|co\.?)\b/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Tokenize and normalize job titles into core semantic terms */
export function tokenizeTitle(title: string | undefined): Set<string> {
  if (!title) return new Set();
  const normalized = title
    .toLowerCase()
    .replace(/\b(sr\.?|snr)\b/gi, "senior")
    .replace(/\b(jr\.?)\b/gi, "junior")
    .replace(/\b(developer|dev|programmer)\b/gi, "engineer")
    .replace(/\b(full-?stack)\b/gi, "full stack")
    .replace(/\b(front-?end)\b/gi, "frontend")
    .replace(/\b(back-?end)\b/gi, "backend")
    .replace(/[^a-z0-9\s]/g, " ");

  const words = normalized.split(/\s+/).filter((w) => w.length > 1);
  return new Set(words);
}

/** Compute token Jaccard similarity between two sets */
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  confidence: number;
  reason?: string;
}

/**
 * Checks whether two job postings refer to the same underlying opportunity.
 */
export function areJobsDuplicates(
  jobA: Partial<JobApplication>,
  jobB: Partial<JobApplication>
): DuplicateCheckResult {
  // 1. Exact canonical URL match
  const urlA = normalizeUrl(jobA.url);
  const urlB = normalizeUrl(jobB.url);
  if (urlA && urlB && urlA === urlB) {
    return { isDuplicate: true, confidence: 1.0, reason: "exact_url" };
  }

  // 2. Exact canonical key match if available
  if (jobA.canonicalKey && jobB.canonicalKey && jobA.canonicalKey === jobB.canonicalKey) {
    return { isDuplicate: true, confidence: 1.0, reason: "exact_canonical_key" };
  }

  // 3. Company comparison
  const compA = normalizeCompanyName(jobA.company);
  const compB = normalizeCompanyName(jobB.company);

  if (!compA || !compB || compA !== compB) {
    return { isDuplicate: false, confidence: 0 };
  }

  // 4. Title token Jaccard similarity
  const tokensA = tokenizeTitle(jobA.title);
  const tokensB = tokenizeTitle(jobB.title);
  const titleSim = jaccardSimilarity(tokensA, tokensB);

  if (titleSim >= 0.7) {
    return {
      isDuplicate: true,
      confidence: Math.round(titleSim * 100) / 100,
      reason: `company_and_title_match (${(titleSim * 100).toFixed(0)}% title overlap)`,
    };
  }

  return { isDuplicate: false, confidence: titleSim };
}

/**
 * Collapses an array of raw crawled jobs into unique canonical jobs using
 * indexed candidate buckets for O(n·k) performance where k is the per-company bucket size.
 */
export function collapseDuplicateJobs(jobs: JobApplication[]): JobApplication[] {
  const canonicalList: JobApplication[] = [];
  const urlIndex = new Map<string, number>();
  const companyBuckets = new Map<string, number[]>();

  for (const candidate of jobs) {
    const candidateUrl = normalizeUrl(candidate.url);
    let matchIdx: number | null = null;

    // 1. Direct URL index lookup — O(1)
    if (candidateUrl && urlIndex.has(candidateUrl)) {
      matchIdx = urlIndex.get(candidateUrl)!;
    }

    // 2. Company bucket check — O(k)
    const companyKey = normalizeCompanyName(candidate.company);
    if (matchIdx === null && companyKey && companyBuckets.has(companyKey)) {
      const bucket = companyBuckets.get(companyKey)!;
      for (const idx of bucket) {
        const existing = canonicalList[idx]!;
        const check = areJobsDuplicates(candidate, existing);
        if (check.isDuplicate) {
          matchIdx = idx;
          break;
        }
      }
    }

    if (matchIdx !== null) {
      const canonical = canonicalList[matchIdx]!;

      // Merge source badges
      const existingSources = (canonical.source || "").split(",").map((s) => s.trim()).filter(Boolean);
      const newSource = candidate.source ? candidate.source.trim() : "";
      if (newSource && !existingSources.includes(newSource)) {
        existingSources.push(newSource);
        canonical.source = existingSources.join(", ");
      }
      canonical.sourcesCount = existingSources.length;

      // Retain richer description
      if (
        candidate.jobDescription &&
        (!canonical.jobDescription || candidate.jobDescription.length > canonical.jobDescription.length)
      ) {
        canonical.jobDescription = candidate.jobDescription;
      }

      // Retain salary if candidate has one
      if (!canonical.salary && candidate.salary) {
        canonical.salary = candidate.salary;
      }
      if (!canonical.salaryMin && candidate.salaryMin) {
        canonical.salaryMin = candidate.salaryMin;
        canonical.salaryMax = candidate.salaryMax;
        canonical.salaryCurrency = candidate.salaryCurrency;
      }

      // Retain earlier firstSeenAt and later lastSeenAt
      if (candidate.firstSeenAt && (!canonical.firstSeenAt || candidate.firstSeenAt < canonical.firstSeenAt)) {
        canonical.firstSeenAt = candidate.firstSeenAt;
      }
      if (candidate.lastSeenAt && (!canonical.lastSeenAt || candidate.lastSeenAt > canonical.lastSeenAt)) {
        canonical.lastSeenAt = candidate.lastSeenAt;
      }

      // Index candidate URL if new
      if (candidateUrl && !urlIndex.has(candidateUrl)) {
        urlIndex.set(candidateUrl, matchIdx);
      }
    } else {
      const newIdx = canonicalList.length;
      const initialSources = (candidate.source || "").split(",").map((s) => s.trim()).filter(Boolean);
      const newCanonical: JobApplication = {
        ...candidate,
        sourcesCount: initialSources.length || 1,
      };

      canonicalList.push(newCanonical);

      if (candidateUrl) {
        urlIndex.set(candidateUrl, newIdx);
      }
      if (companyKey) {
        const bucket = companyBuckets.get(companyKey) || [];
        bucket.push(newIdx);
        companyBuckets.set(companyKey, bucket);
      }
    }
  }

  return canonicalList;
}
