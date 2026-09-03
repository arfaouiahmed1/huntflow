import { describe, expect, it } from "vitest";
import {
  extractSeniority,
  extractWorkMode,
  extractEmploymentType,
  extractSalary,
  extractVisaSignal,
  extractTechTags,
  extractLanguages,
  buildCanonicalKey,
  normalizeJobCandidate,
} from "@/lib/crawler/normalizer";

describe("Crawler Field Normalization Pipeline", () => {
  it("extracts seniority accurately across different title formats", () => {
    expect(extractSeniority("Principal Software Engineer")).toBe("principal");
    expect(extractSeniority("Staff Frontend Architect")).toBe("staff");
    expect(extractSeniority("Lead Go Developer")).toBe("lead");
    expect(extractSeniority("Senior Full Stack Engineer")).toBe("senior");
    expect(extractSeniority("Sr. Backend Developer")).toBe("senior");
    expect(extractSeniority("Junior React Developer")).toBe("junior");
    expect(extractSeniority("Software Engineering Intern")).toBe("intern");
    expect(extractSeniority("Backend Engineer")).toBe("mid");
  });

  it("extracts work mode accurately from location and title text", () => {
    expect(extractWorkMode("Remote, US", "Software Engineer")).toBe("remote");
    expect(extractWorkMode("Anywhere in the World", "Developer")).toBe("remote");
    expect(extractWorkMode("New York, NY", "Hybrid React Developer")).toBe("hybrid");
    expect(extractWorkMode("San Francisco, CA", "Software Engineer")).toBe("onsite");
  });

  it("extracts employment type accurately", () => {
    expect(extractEmploymentType("Full-time Staff Engineer")).toBe("full_time");
    expect(extractEmploymentType("Contract Go Developer (6 months)")).toBe("contract");
    expect(extractEmploymentType("Part-time Technical Writer")).toBe("part_time");
    expect(extractEmploymentType("Summer 2026 Engineering Internship")).toBe("internship");
  });

  it("extracts salary ranges and currencies without an LLM", () => {
    expect(extractSalary("$140,000 - $180,000 USD")).toEqual({ min: 140000, max: 180000, currency: "USD" });
    expect(extractSalary("€80k - €110k")).toEqual({ min: 80000, max: 110000, currency: "EUR" });
    expect(extractSalary("£75,000 / year")).toEqual({ min: 75000, max: null, currency: "GBP" });
    expect(extractSalary("Competitive compensation")).toEqual({ min: null, max: null, currency: null });
  });

  it("extracts visa sponsorship signals", () => {
    expect(extractVisaSignal("We offer full visa sponsorship and relocation assistance.")).toBe("explicit");
    expect(extractVisaSignal("Applicants must be authorized to work in the US without sponsorship.")).toBe("unknown");
    expect(extractVisaSignal("Great benefits and 401k match.")).toBe("unknown");
  });

  it("extracts technology tags and programming languages", () => {
    const text = "We are looking for a Senior Engineer with TypeScript, React, Next.js, Node.js, and PostgreSQL experience on AWS.";
    const tags = extractTechTags(text);
    expect(tags).toContain("TypeScript");
    expect(tags).toContain("React");
    expect(tags).toContain("Next.js");
    expect(tags).toContain("PostgreSQL");
    expect(tags).toContain("AWS");

    const languages = extractLanguages("Fluent in English and French is required for our Paris/Montreal team.");
    expect(languages).toContain("English");
    expect(languages).toContain("French");
  });

  it("builds consistent canonical keys across slight variations", () => {
    const key1 = buildCanonicalKey("Stripe, Inc.", "Senior Software Engineer", "Remote, US");
    const key2 = buildCanonicalKey("Stripe LLC", "Sr. Software Developer", "Remote");
    expect(key1.split("::")[0]).toBe("stripe");
    expect(key2.split("::")[0]).toBe("stripe");
  });

  it("normalizes complete job candidate record", () => {
    const norm = normalizeJobCandidate({
      title: "Senior Backend Engineer (Go/Kubernetes)",
      company: "Acme Cloud Technologies LLC",
      location: "Remote - Worldwide",
      description: "<p>Build distributed backends. We provide visa sponsorship. Salary: $160k - $200k USD</p>",
      sourceConnector: "greenhouse",
    });

    expect(norm.seniority).toBe("senior");
    expect(norm.workMode).toBe("remote");
    expect(norm.visaSignal).toBe("explicit");
    expect(norm.salaryMin).toBe(160000);
    expect(norm.salaryMax).toBe(200000);
    expect(norm.salaryCurrency).toBe("USD");
    expect(norm.techTags).toContain("Go");
    expect(norm.techTags).toContain("Kubernetes");
    expect(norm.sourceConfidence).toBe(1.0);
  });
});
