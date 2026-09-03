import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sanitizeJobDescription } from "@/lib/security/jdSanitizer";
import { evaluateAdaptiveRouting } from "@/lib/agents/routing";
import { getRecommendedTemplate } from "@/lib/pdf/resumeTemplates";
import { auditPerFieldHallucination } from "@/lib/agents/evaluation";
import { generateTieredInterviewPrep } from "@/lib/agents/interviewTiers";
import { generateOutreachSequence } from "@/lib/mail/outreachSequence";
import { RegionCode } from "@/lib/agents/regionalNorms";

interface Archetype {
  id: string;
  region: string;
  title: string;
  company: string;
  salary: string;
  expectedTemplate: string;
  keywords: string[];
  adversarialPayload?: string;
}

describe("25-Archetype Synthetic Benchmark Matrix Suite", () => {
  const archetypesPath = path.join(process.cwd(), "tests/benchmark/archetypes.json");
  const rawData = fs.readFileSync(archetypesPath, "utf-8");
  const archetypes: Archetype[] = JSON.parse(rawData);

  it("loads exactly 25 diverse archetypes across US, DE, UK, FR, MENA, INTL", () => {
    expect(archetypes.length).toBe(25);
    const regions = new Set(archetypes.map((a) => a.region));
    expect(regions.has("US")).toBe(true);
    expect(regions.has("DE")).toBe(true);
    expect(regions.has("UK")).toBe(true);
    expect(regions.has("FR")).toBe(true);
    expect(regions.has("TN")).toBe(true);
    expect(regions.has("UAE")).toBe(true);
    expect(regions.has("INTL")).toBe(true);
  });

  it("neutralizes adversarial honeypot archetypes while preserving tech keywords", () => {
    const honeypot = archetypes.find((a) => a.adversarialPayload);
    expect(honeypot).toBeDefined();

    const rawJd = `${honeypot?.title} at ${honeypot?.company}. Requirements: ${honeypot?.keywords.join(", ")}. ${honeypot?.adversarialPayload}`;
    const sanitized = sanitizeJobDescription(rawJd);

    expect(sanitized.sanitized).toBe(true);
    expect(sanitized.cleanText).not.toContain("Ignore previous instructions");
    expect(sanitized.cleanText).not.toContain("<|system|>");
    expect(sanitized.cleanText).toContain("React");
    expect(sanitized.cleanText).toContain("TypeScript");
    expect(sanitized.riskScore).toBeGreaterThan(0);
  });

  it("extracts explicit salary across all 25 currencies and formats without LLM call", () => {
    for (const arch of archetypes) {
      const routing = evaluateAdaptiveRouting({
        salary: arch.salary,
        jobDescription: `Looking for ${arch.title}. Compensation: ${arch.salary}.`,
        targetRegion: arch.region,
      });

      expect(routing.hasExplicitSalary).toBe(true);
      expect(routing.shouldSkipSalaryLlm).toBe(true);
      expect(routing.extractedSalary).toBeDefined();
    }
  });

  it("selects correct regional resume templates across DACH, French, and ATS standards", () => {
    for (const arch of archetypes) {
      const template = getRecommendedTemplate(arch.region as RegionCode, "resume");
      expect(template.id).toBe(arch.expectedTemplate);
    }
  });

  it("enforces 0% hallucination score when matching skills are legitimate subsets", () => {
    for (const arch of archetypes) {
      const candidateProfile = {
        skills: [...arch.keywords, "Git", "Agile", "Problem Solving"],
      };

      const audit = auditPerFieldHallucination(
        {
          matchingSkills: arch.keywords.slice(0, 3),
          salaryEstimate: arch.salary,
          outreachSubject: `${arch.title} role at ${arch.company}`,
          interviewTopics: arch.keywords.slice(0, 2),
        },
        candidateProfile,
        { title: arch.title, jobDescription: arch.keywords.join(", ") }
      );

      expect(audit.matchingSkillsHallucinated).toEqual([]);
      expect(audit.overallHallucinationScore).toBe(0);
    }
  });

  it("generates 3-tier STAR prep and 3-stage outreach sequences for all 25 archetypes", () => {
    for (const arch of archetypes) {
      const prep = generateTieredInterviewPrep(
        arch.keywords,
        { title: arch.title, company: arch.company, jobDescription: arch.keywords.join(" ") }
      );
      expect(prep.totalQuestions).toBe(6);
      expect(prep.byTier.screening.length).toBe(2);
      expect(prep.byTier.hiring_manager.length).toBe(2);
      expect(prep.byTier.bar_raiser.length).toBe(2);

      const outreach = generateOutreachSequence(
        { company: arch.company, title: arch.title, jobDescription: arch.keywords.join(" ") },
        { name: "Benchmark Candidate", topSkills: arch.keywords }
      );
      expect(outreach.stages.length).toBe(3);
      expect(outreach.stages[0].delayDays).toBe(0);
      expect(outreach.stages[1].delayDays).toBe(4);
      expect(outreach.stages[2].delayDays).toBe(10);
    }
  });
});
