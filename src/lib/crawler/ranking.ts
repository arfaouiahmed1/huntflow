/**
 * HUNTFLOW Crawler — Multi-Component Candidate Ranking Engine.
 *
 * Computes deterministic 0-100 scores with explainable component breakdown:
 * - Skill overlap (0-30 pts)
 * - Title match (0-25 pts)
 * - Freshness decay (0-15 pts)
 * - Salary / PPP fit (0-10 pts)
 * - Visa evidence (0-10 pts)
 * - Work-mode fit (0-5 pts)
 * - Source health & confidence (0-5 pts)
 */

import type { CanonicalJobCandidate } from "./contracts";

export interface RankingProfile {
  targetTitle?: string;
  skills?: string[];
  preferredWorkModes?: string[];
  minSalary?: number;
  currency?: string;
  requiresVisa?: boolean;
}

export interface RankedResult {
  score: number;
  rankingBreakdown: {
    skillOverlap: number;
    titleMatch: number;
    freshness: number;
    salaryFit: number;
    visaFit: number;
    workModeFit: number;
    sourceConfidence: number;
  };
}

export function rankCandidate(candidate: CanonicalJobCandidate, profile: RankingProfile = {}): RankedResult {
  let skillScore = 0;
  if (profile.skills && profile.skills.length > 0 && candidate.techTags && candidate.techTags.length > 0) {
    const userSkills = new Set(profile.skills.map((s) => s.toLowerCase()));
    let matches = 0;
    for (const t of candidate.techTags) {
      if (userSkills.has(t.toLowerCase())) matches++;
    }
    const ratio = matches / Math.max(1, Math.min(profile.skills.length, 10));
    skillScore = Math.min(30, Math.round(ratio * 30));
  } else if (candidate.techTags && candidate.techTags.length > 0) {
    skillScore = Math.min(15, candidate.techTags.length * 3);
  }

  let titleScore = 0;
  if (profile.targetTitle) {
    const titleWords = profile.targetTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const candTitle = candidate.title.toLowerCase();
    let matches = 0;
    for (const w of titleWords) {
      if (candTitle.includes(w)) matches++;
    }
    const ratio = matches / Math.max(1, titleWords.length);
    titleScore = Math.round(ratio * 25);
  } else {
    titleScore = 15;
  }

  let freshnessScore = 10;
  const dateStr = candidate.postedAt || candidate.firstSeenAt;
  if (dateStr) {
    const ageDays = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 2) freshnessScore = 15;
    else if (ageDays <= 7) freshnessScore = 12;
    else if (ageDays <= 14) freshnessScore = 9;
    else if (ageDays <= 30) freshnessScore = 6;
    else freshnessScore = 3;
  }

  let salaryScore = 5;
  if (profile.minSalary && candidate.salaryMin) {
    if (candidate.salaryMin >= profile.minSalary) salaryScore = 10;
    else if (candidate.salaryMax && candidate.salaryMax >= profile.minSalary) salaryScore = 8;
    else salaryScore = 3;
  } else if (candidate.salaryMin || candidate.salaryMax) {
    salaryScore = 8;
  }

  let visaScore = 5;
  if (profile.requiresVisa) {
    if (candidate.visaSignal === "explicit") visaScore = 10;
    else if (candidate.visaSignal === "likely") visaScore = 7;
    else visaScore = 2;
  } else if (candidate.visaSignal === "explicit") {
    visaScore = 10;
  }

  let workModeScore = 3;
  if (profile.preferredWorkModes && candidate.workMode) {
    if (profile.preferredWorkModes.includes(candidate.workMode)) workModeScore = 5;
  } else if (candidate.workMode === "remote") {
    workModeScore = 5;
  }

  const sourceConfidenceScore = Math.min(5, Math.round((candidate.sourceConfidence || 0.8) * 5));

  const totalScore = Math.min(
    100,
    skillScore + titleScore + freshnessScore + salaryScore + visaScore + workModeScore + sourceConfidenceScore
  );

  return {
    score: totalScore,
    rankingBreakdown: {
      skillOverlap: skillScore,
      titleMatch: titleScore,
      freshness: freshnessScore,
      salaryFit: salaryScore,
      visaFit: visaScore,
      workModeFit: workModeScore,
      sourceConfidence: sourceConfidenceScore,
    },
  };
}
