import { describe, expect, it } from "vitest";
import { legitAtsTest } from "@/lib/agents/evaluation";
import { analyzeAts } from "@/lib/ats/analyze";

describe("legit ATS test — deterministic ground truth for ruthless judge", () => {
  it("scores a well-formed resume higher than a keyword-stuffed blob", () => {
    const goodResume = `SUMMARY\nSenior Frontend Engineer with 6 years React, TypeScript, Node.js\n\nSKILLS\nReact, TypeScript, Node.js, GraphQL, Tailwind CSS, AWS\n\nEXPERIENCE\nAcme — Senior Engineer 2022–2025\n- Led frontend platform team, shipped design system used by 12 teams\n- Built internal GraphQL API clients with TypeScript\n\nEDUCATION\nBSc Computer Science, TU Berlin 2019`;
    const badResume = `KEYWORDS KEYWORDS React React React TypeScript TypeScript Node Node Node`;
    const jd = "Senior Frontend Engineer with React, TypeScript, Node.js, GraphQL, Tailwind CSS, and AWS experience. Remote-first team.";
    const good = legitAtsTest(goodResume, jd);
    const bad = legitAtsTest(badResume, jd);
    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.passes.length).toBeGreaterThan(0);
    expect(good.keywordCoverage).toBeGreaterThan(0.3);
  });

  it("exposes core header failures when sections missing", () => {
    const noHeaders = "I did stuff. Very generic. No sections.";
    const report = analyzeAts(noHeaders);
    expect(report.checks.find(c => c.id === "sections")?.ok).toBe(false);
    const legit = legitAtsTest(noHeaders);
    expect(legit.failures.join(" ")).toMatch(/Standard section headers/i);
  });

  it("ruthless judge caps score at 2 when ATS is failing", () => {
    const badResume = "No headers, no keywords, just fluff.";
    const jd = "React TypeScript Node required";
    const ats = legitAtsTest(badResume, jd);
    expect(ats.score).toBeLessThan(60);
    // The judge prompt embeds this pre-analysis and instructs: cap at 2 when ATS <60
    // This test documents the contract: ats.score <60 → judge must explain CORE failure
    expect(ats.failures.length).toBeGreaterThan(0);
  });
});
