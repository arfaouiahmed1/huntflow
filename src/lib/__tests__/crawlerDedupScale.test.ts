import { describe, expect, it } from "vitest";
import { collapseDuplicateJobs, areJobsDuplicates, normalizeUrl } from "@/lib/dedup";
import type { JobApplication } from "@/types";

describe("Crawler Deduplication & Scale Performance", () => {
  it("normalizes URLs and removes tracking parameters", () => {
    const raw = "https://jobs.lever.co/acme/12345/?utm_source=linkedin&ref=jobboard&utm_medium=cpc#apply";
    const norm = normalizeUrl(raw);
    expect(norm).toBe("https://jobs.lever.co/acme/12345");
  });

  it("collapses duplicate postings across multiple source feeds", () => {
    const jobs: JobApplication[] = [
      {
        id: "job_1",
        title: "Senior Full Stack Engineer",
        company: "Stripe, Inc.",
        location: "Remote",
        url: "https://stripe.com/jobs/1",
        source: "Greenhouse",
        jobDescription: "Short summary",
        status: "wishlist",
        createdDate: "2026-08-01T10:00:00Z",
      },
      {
        id: "job_2",
        title: "Sr. Full-Stack Developer",
        company: "Stripe LLC",
        location: "Remote, US",
        url: "https://remoteok.com/jobs/99",
        source: "RemoteOK",
        jobDescription: "Very detailed job description with extensive tech stack requirements.",
        salary: "$160,000 - $200,000",
        status: "wishlist",
        createdDate: "2026-08-02T10:00:00Z",
      },
      {
        id: "job_3",
        title: "Product Manager",
        company: "Stripe",
        location: "San Francisco, CA",
        url: "https://stripe.com/jobs/pm",
        source: "Greenhouse",
        jobDescription: "PM role",
        status: "wishlist",
        createdDate: "2026-08-01T10:00:00Z",
      },
    ];

    const collapsed = collapseDuplicateJobs(jobs);
    expect(collapsed).toHaveLength(2); // 2 unique roles

    const devJob = collapsed.find((j) => j.title.toLowerCase().includes("stack"));
    expect(devJob).toBeTruthy();
    expect(devJob?.source).toContain("Greenhouse");
    expect(devJob?.source).toContain("RemoteOK");
    expect(devJob?.sourcesCount).toBe(2);
    expect(devJob?.salary).toBe("$160,000 - $200,000");
    expect(devJob?.jobDescription).toContain("Very detailed job description");
  });

  it("processes 100,000 synthetic candidates without O(n2) quadratic explosion", () => {
    const totalCount = 100000;
    const companiesCount = 2000; // Average 50 jobs per company bucket
    const titles = [
      "Software Engineer",
      "Senior Software Engineer",
      "Staff Software Engineer",
      "Frontend Developer",
      "Backend Engineer",
      "DevOps Engineer",
      "Data Scientist",
      "Product Manager",
    ];

    const syntheticJobs: JobApplication[] = [];
    for (let i = 0; i < totalCount; i++) {
      const companyId = i % companiesCount;
      const titleId = i % titles.length;
      syntheticJobs.push({
        id: `synth_${i}`,
        title: `${titles[titleId]} ${i % 3 === 0 ? "Sr" : ""}`,
        company: `Company_${companyId} Inc.`,
        location: i % 2 === 0 ? "Remote" : "San Francisco, CA",
        url: `https://boards.greenhouse.io/company_${companyId}/jobs/${i % 1000}`,
        source: i % 2 === 0 ? "Greenhouse" : "Aggregator",
        jobDescription: `Job description for role ${i}`,
        status: "wishlist",
        createdDate: "2026-08-01T00:00:00Z",
      });
    }

    const startTs = performance.now();
    const result = collapseDuplicateJobs(syntheticJobs);
    const durationMs = performance.now() - startTs;

    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(totalCount); // duplicates were collapsed
    // Performance assertion: 100,000 items in bucketed dedup must finish comfortably under 5000ms
    expect(durationMs).toBeLessThan(5000);
  });
});
