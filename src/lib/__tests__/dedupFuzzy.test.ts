import { describe, it, expect } from "vitest";
import {
  normalizeCompanyName,
  tokenizeTitle,
  jaccardSimilarity,
  areJobsDuplicates,
  collapseDuplicateJobs,
} from "../dedup";
import { JobApplication } from "@/types";

describe("Fuzzy Jaccard & Multi-Source Deduplication Engine", () => {
  it("normalizes company names stripping corporate suffixes", () => {
    expect(normalizeCompanyName("Stripe, Inc.")).toBe(normalizeCompanyName("Stripe LLC"));
    expect(normalizeCompanyName("Vercel Inc.")).toBe(normalizeCompanyName("Vercel"));
    expect(normalizeCompanyName("Datadog Technologies")).toBe(normalizeCompanyName("Datadog"));
  });

  it("tokenizes job titles with senior/engineer synonym expansion", () => {
    const setA = tokenizeTitle("Sr. Frontend Dev");
    const setB = tokenizeTitle("Senior Frontend Engineer");

    expect(setA.has("senior")).toBe(true);
    expect(setA.has("engineer")).toBe(true);
    expect(jaccardSimilarity(setA, setB)).toBeGreaterThanOrEqual(0.8);
  });

  it("detects duplicates across varied titles from the same company", () => {
    const jobA: Partial<JobApplication> = {
      company: "Stripe, Inc.",
      title: "Sr. Frontend Developer - React",
      url: "https://boards.greenhouse.io/stripe/jobs/101",
    };

    const jobB: Partial<JobApplication> = {
      company: "Stripe",
      title: "Senior Frontend Engineer (React)",
      url: "https://remoteok.com/jobs/stripe-frontend",
    };

    const result = areJobsDuplicates(jobA, jobB);
    expect(result.isDuplicate).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("collapses duplicate job postings and aggregates multi-source badges", () => {
    const rawJobs: JobApplication[] = [
      {
        id: "job-1",
        title: "Senior Full Stack Engineer",
        company: "Vercel Inc.",
        location: "Remote",
        source: "Greenhouse (Vercel)",
        status: "wishlist",
        jobDescription: "Short summary",
        createdDate: new Date().toISOString(),
      },
      {
        id: "job-2",
        title: "Sr. Full Stack Dev",
        company: "Vercel",
        location: "Remote",
        source: "RemoteOK",
        status: "wishlist",
        salary: "$180k - $220k",
        jobDescription: "Detailed description with full requirements and Next.js stack details.",
        createdDate: new Date().toISOString(),
      },
    ];

    const collapsed = collapseDuplicateJobs(rawJobs);
    expect(collapsed.length).toBe(1);
    expect(collapsed[0].source).toContain("Greenhouse (Vercel)");
    expect(collapsed[0].source).toContain("RemoteOK");
    expect(collapsed[0].salary).toBe("$180k - $220k");
    expect(collapsed[0].jobDescription).toContain("Detailed description");
  });
});
