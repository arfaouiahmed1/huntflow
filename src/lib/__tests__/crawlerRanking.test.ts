import { describe, expect, it } from "vitest";
import { rankCandidate, type RankingProfile } from "@/lib/crawler/ranking";
import type { CanonicalJobCandidate } from "@/lib/crawler/contracts";

describe("Crawler Multi-Component Candidate Ranking", () => {
  const baseCandidate: CanonicalJobCandidate = {
    id: "cand_1",
    canonicalKey: "stripe::staff-software-engineer::remote",
    title: "Staff Software Engineer",
    company: "Stripe",
    companyKey: "stripe",
    location: "Remote",
    locationKey: "remote",
    url: "https://stripe.com/jobs/1",
    description: "Build scalable payments API with TypeScript and Go.",
    sourceId: "greenhouse",
    externalId: "1",
    firstSeenAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    lastSeenAt: new Date().toISOString(),
    seniority: "staff",
    workMode: "remote",
    employmentType: "full_time",
    salaryMin: 180000,
    salaryMax: 220000,
    salaryCurrency: "USD",
    visaSignal: "explicit",
    techTags: ["TypeScript", "Go", "PostgreSQL", "AWS"],
    sourceConfidence: 1.0,
  };

  it("calculates high score for a strong matching profile", () => {
    const profile: RankingProfile = {
      targetTitle: "Staff Engineer",
      skills: ["TypeScript", "Go", "PostgreSQL"],
      preferredWorkModes: ["remote"],
      minSalary: 170000,
      requiresVisa: true,
    };

    const ranked = rankCandidate(baseCandidate, profile);
    expect(ranked.score).toBeGreaterThan(80);
    expect(ranked.rankingBreakdown.skillOverlap).toBeGreaterThanOrEqual(25);
    expect(ranked.rankingBreakdown.titleMatch).toBeGreaterThan(15);
    expect(ranked.rankingBreakdown.visaFit).toBe(10);
    expect(ranked.rankingBreakdown.salaryFit).toBe(10);
    expect(ranked.rankingBreakdown.workModeFit).toBe(5);
  });

  it("penalizes mismatching work mode and missing visa signal when required", () => {
    const onsiteNoVisaCand: CanonicalJobCandidate = {
      ...baseCandidate,
      workMode: "onsite",
      visaSignal: "unknown",
      techTags: ["Java", "Spring"],
      salaryMin: 80000,
      salaryMax: 100000,
    };

    const profile: RankingProfile = {
      targetTitle: "TypeScript Engineer",
      skills: ["TypeScript", "React"],
      preferredWorkModes: ["remote"],
      minSalary: 150000,
      requiresVisa: true,
    };

    const ranked = rankCandidate(onsiteNoVisaCand, profile);
    expect(ranked.score).toBeLessThan(50);
    expect(ranked.rankingBreakdown.visaFit).toBe(2);
    expect(ranked.rankingBreakdown.workModeFit).toBe(3);
    expect(ranked.rankingBreakdown.salaryFit).toBe(3);
  });

  it("score stays bounded between 0 and 100", () => {
    const ranked = rankCandidate(baseCandidate);
    expect(ranked.score).toBeGreaterThanOrEqual(0);
    expect(ranked.score).toBeLessThanOrEqual(100);
  });
});
