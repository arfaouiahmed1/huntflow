import { describe, it, expect } from "vitest";
import { auditPerFieldHallucination } from "../evaluation";
import { trackNodeUsage, getNodeBreakdowns } from "@/lib/llm/router";

describe("Per-Field Hallucination & Node Cost Tracking", () => {
  it("detects hallucinated matching skills with 0 false positives for valid subsets", () => {
    const profile = { skills: ["React", "TypeScript", "Next.js", "Docker"] };
    const job = { title: "Frontend Engineer", jobDescription: "React, TypeScript and AWS developer." };

    // Clean valid subset
    const cleanReport = auditPerFieldHallucination(
      {
        matchingSkills: ["React", "TypeScript"],
        salaryEstimate: "$120,000 - $150,000 USD",
        outreachSubject: "Frontend Engineer opportunity at Acme",
        interviewTopics: ["React performance", "TypeScript types"],
      },
      profile,
      job
    );

    expect(cleanReport.matchingSkillsHallucinated).toEqual([]);
    expect(cleanReport.overallHallucinationScore).toBe(0);
    expect(cleanReport.salaryRealistic).toBe(true);
    expect(cleanReport.outreachGrounded).toBe(true);

    // Hallucinated skill injected (Rust not in profile)
    const hallucinatedReport = auditPerFieldHallucination(
      {
        matchingSkills: ["React", "Rust", "Kubernetes"],
        salaryEstimate: "$120,000 - $150,000 USD",
        outreachSubject: "Frontend Engineer opportunity",
        interviewTopics: ["React performance"],
      },
      profile,
      job
    );

    expect(hallucinatedReport.matchingSkillsHallucinated).toContain("Rust");
    expect(hallucinatedReport.matchingSkillsHallucinated).toContain("Kubernetes");
    expect(hallucinatedReport.overallHallucinationScore).toBeGreaterThan(0);
  });

  it("tracks node usage and exposes breakdowns in router", () => {
    trackNodeUsage("companyIntel", { promptTokens: 120, completionTokens: 45, latencyMs: 340, provider: "gemini" });
    trackNodeUsage("resumeCVTailor", { promptTokens: 450, completionTokens: 180, latencyMs: 890, provider: "gemini" });

    const breakdowns = getNodeBreakdowns();
    expect(breakdowns.length).toBeGreaterThanOrEqual(2);

    const tailor = breakdowns.find((b) => b.nodeName === "resumeCVTailor");
    expect(tailor).toBeDefined();
    expect(tailor?.promptTokens).toBe(450);
    expect(tailor?.completionTokens).toBe(180);
    expect(tailor?.latencyMs).toBe(890);
  });
});
