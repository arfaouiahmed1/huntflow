import { describe, it, expect } from "vitest";
import { matchFallback, scoreFit, parseSalaryText, titleFamiliesOverlap } from "@/lib/prompts/generationPrompts";
import { cleanSkillsGap } from "@/lib/llm/sanitize";
import { UserProfile, JobApplication } from "@/types";

const baseProfile: UserProfile = {
  name: "Jane Dev",
  email: "jane@dev.io",
  phone: "555-0100",
  location: "Berlin",
  summary: "Full-stack engineer with 6 years shipping React, TypeScript and Node products.",
  headline: "Senior Frontend Engineer",
  targetTitle: "Senior Frontend Engineer",
  skills: ["React", "TypeScript", "Node.js", "GraphQL", "Tailwind CSS", "AWS", "Docker"],
  experience: [
    {
      id: "e1",
      company: "Acme",
      role: "Senior Engineer",
      duration: "2022-2025",
      bulletPoints: ["Led the frontend platform team", "Built the internal design system"],
    },
    {
      id: "e2",
      company: "Globex",
      role: "Engineer",
      duration: "2019-2022",
      bulletPoints: ["Shipped the checkout flow", "Introduced typed API clients"],
    },
  ],
  education: [{ id: "edu1", degree: "BSc Computer Science", school: "TU Berlin", year: "2019" }],
  github: "github.com/janedev",
};

function makeJob(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: "fit-1",
    title: "Senior Frontend Engineer",
    company: "Stripe",
    location: "Remote",
    salary: "",
    status: "wishlist",
    jobDescription:
      "We are hiring a Senior Frontend Engineer. React, TypeScript and GraphQL are core. AWS and Docker are a plus.",
    createdDate: "2026-08-01",
    ...overrides,
  };
}

describe("parseSalaryText", () => {
  it("parses k-ranges", () => {
    expect(parseSalaryText("$120k - $150k")).toEqual({ min: 120000, max: 150000 });
  });
  it("parses full ranges", () => {
    expect(parseSalaryText("$120,000 - $150,000")).toEqual({ min: 120000, max: 150000 });
  });
  it("returns null for non-numeric or empty text", () => {
    expect(parseSalaryText("Competitive salary")).toBeNull();
    expect(parseSalaryText("")).toBeNull();
    expect(parseSalaryText(undefined)).toBeNull();
    expect(parseSalaryText(null)).toBeNull();
  });
  it("widens a single figure into a range", () => {
    const r = parseSalaryText("$140,000");
    expect(r).not.toBeNull();
    expect(r!.min).toBe(140000);
    expect(r!.max).toBeGreaterThan(r!.min);
  });
});

describe("titleFamiliesOverlap", () => {
  it("matches on shared role nouns", () => {
    expect(titleFamiliesOverlap("Lead Frontend Developer", "Senior Frontend Engineer")).toBe(true);
    expect(titleFamiliesOverlap("Backend Engineer", "Backend Developer")).toBe(true);
    expect(titleFamiliesOverlap("Frontend Developer", "Frontend Developer")).toBe(true);
  });
  it("does not match unrelated families", () => {
    expect(titleFamiliesOverlap("Product Manager", "Senior Frontend Engineer")).toBe(false);
    expect(titleFamiliesOverlap("Sales Director", "Frontend Engineer")).toBe(false);
    expect(titleFamiliesOverlap("Backend Engineer", "Frontend Developer")).toBe(false);
  });
});

describe("scoreFit — dealbreakers", () => {
  it("marks skip when the posting requires work authorization and the profile needs sponsorship", () => {
    const job = makeJob({
      jobDescription:
        "Must be authorized to work in the US. React and TypeScript. Sponsorship is not available.",
    });
    const profile = { ...baseProfile, workPermitStatus: "sponsorship_required" as const };
    const { fit, dealbreakers } = scoreFit(job, profile, ["React", "TypeScript"]);
    expect(fit).toBe("skip");
    expect(dealbreakers.some((d) => /work authorization|sponsorship/i.test(d))).toBe(true);
  });

  it("marks skip when the posting requires a clearance the profile lacks", () => {
    const job = makeJob({ jobDescription: "Active security clearance required. React and TypeScript." });
    const { fit, dealbreakers } = scoreFit(job, baseProfile, ["React", "TypeScript"]);
    expect(fit).toBe("skip");
    expect(dealbreakers.some((d) => /clearance/i.test(d))).toBe(true);
  });

  it("marks skip when the posting is on-site only and the profile prefers remote", () => {
    const job = makeJob({
      jobDescription: "This is an on-site role in New York. React and TypeScript required.",
    });
    const profile = { ...baseProfile, preferredWorkMode: "remote" as const };
    const { fit, dealbreakers } = scoreFit(job, profile, ["React", "TypeScript"]);
    expect(fit).toBe("skip");
    expect(dealbreakers.some((d) => /on-site/i.test(d))).toBe(true);
  });

  it("marks skip when the stated salary is below the profile minimum", () => {
    const job = makeJob({ salary: "$100,000 - $120,000" });
    const profile = { ...baseProfile, desiredSalary: "$150,000" };
    const { fit, dealbreakers } = scoreFit(job, profile, ["React", "TypeScript"]);
    expect(fit).toBe("skip");
    expect(dealbreakers.some((d) => /below your minimum/i.test(d))).toBe(true);
  });

  it("does not flag salary when the posting meets the minimum", () => {
    const job = makeJob({ salary: "$160,000 - $180,000" });
    const profile = { ...baseProfile, desiredSalary: "$150,000" };
    const { fit, dealbreakers } = scoreFit(job, profile, ["React", "TypeScript"]);
    expect(fit).not.toBe("skip");
    expect(dealbreakers.length).toBe(0);
  });
});

describe("scoreFit — ratings", () => {
  it("rates high when all must-haves and 2+ nice-to-haves are met", () => {
    const job = makeJob();
    const profile = { ...baseProfile, desiredSalary: "$140,000" };
    const jobWithSalary = { ...job, salary: "$150,000 - $170,000" };
    const { fit } = scoreFit(jobWithSalary, profile, ["React", "TypeScript", "GraphQL"]);
    expect(fit).toBe("high");
  });

  it("rates medium when most (but not all) must-haves are met", () => {
    // Title family matches but only one core skill → medium (most must-haves).
    const job = makeJob({ title: "Backend Engineer" });
    const profile = { ...baseProfile, targetTitle: "Backend Developer" };
    const { fit } = scoreFit(job, profile, ["React"]);
    expect(fit).toBe("medium");
  });

  it("rates low when there is no skill overlap and the title family differs", () => {
    const job = makeJob({ title: "Sales Director" });
    const { fit } = scoreFit(job, baseProfile, []);
    expect(fit).toBe("low");
  });
});

describe("matchFallback — integrated fit fields", () => {
  it("returns fit + dealbreakers on the analysis shape", () => {
    const profile = { ...baseProfile, workPermitStatus: "sponsorship_required" as const };
    const analysis = matchFallback(
      makeJob({
        jobDescription: "Must be authorized to work in the US. React, TypeScript, GraphQL.",
      }),
      profile
    );
    expect(analysis.matchScore).toBeGreaterThanOrEqual(38);
    expect(analysis.fit).toBe("skip");
    expect(analysis.dealbreakers?.length).toBeGreaterThan(0);
    expect(analysis.recommendations.some((r) => /dealbreaker|blocking|authorization|sponsorship/i.test(r))).toBe(true);
  });

  it("is deterministic and offline (no fetch, no LLM)", () => {
    const a = matchFallback(makeJob(), baseProfile);
    const b = matchFallback(makeJob(), baseProfile);
    expect(a).toEqual(b);
  });

  it("keeps the backward-compatible matchScore range (38-97)", () => {
    const low = matchFallback(makeJob({ jobDescription: "Python, Java, Go." }), baseProfile);
    const high = matchFallback(makeJob(), baseProfile);
    expect(low.matchScore).toBeGreaterThanOrEqual(38);
    expect(high.matchScore).toBeLessThanOrEqual(97);
  });
});

describe("cleanSkillsGap — carries fit + dealbreakers", () => {
  it("preserves a valid fit and dealbreakers from a model response", () => {
    const out = cleanSkillsGap({
      matchScore: 88,
      matchingSkills: ["React"],
      missingSkills: [],
      strengths: ["x"],
      recommendations: ["y"],
      fit: "high",
      dealbreakers: [],
    });
    expect(out).not.toBeNull();
    expect(out!.fit).toBe("high");
    expect(out!.dealbreakers).toEqual([]);
  });

  it("clamps an invalid fit value and caps dealbreakers", () => {
    const out = cleanSkillsGap({
      matchScore: 60,
      matchingSkills: ["React"],
      strengths: [],
      recommendations: [],
      fit: "PERFECT",
      dealbreakers: Array.from({ length: 20 }, (_, i) => `d${i}`),
    });
    expect(out).not.toBeNull();
    expect(out!.fit).toBe("medium");
    expect(out!.dealbreakers).toHaveLength(8);
  });

  it("leaves fit/dealbreakers absent when the model omits them", () => {
    const out = cleanSkillsGap({ matchScore: 70, matchingSkills: ["React"], strengths: [], recommendations: [] });
    expect(out!.fit).toBeUndefined();
    expect(out!.dealbreakers).toEqual([]);
  });
});
