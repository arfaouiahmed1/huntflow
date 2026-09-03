import { describe, it, expect } from "vitest";
import { generateTieredInterviewPrep } from "../interviewTiers";

describe("Tiered Interview Prep Engine", () => {
  const job = {
    title: "Senior Backend Engineer",
    company: "Stripe",
    jobDescription: "High ownership remote-first team building scalable distributed payments systems.",
  };

  it("produces questions for all 3 tiers with 2 probes each", () => {
    const result = generateTieredInterviewPrep(["Distributed Systems", "PostgreSQL", "Kafka"], job);

    expect(result.totalQuestions).toBe(6);
    expect(result.byTier.screening.length).toBe(2);
    expect(result.byTier.hiring_manager.length).toBe(2);
    expect(result.byTier.bar_raiser.length).toBe(2);

    for (const q of result.byTier.screening) {
      expect(q.tier).toBe("screening");
      expect(q.followUpProbes.length).toBe(2);
      expect(q.starGuidance.situation).toBeDefined();
      expect(q.starGuidance.action).toBeDefined();
    }
    for (const q of result.byTier.bar_raiser) {
      expect(q.tier).toBe("bar_raiser");
      expect(q.followUpProbes.length).toBe(2);
    }
  });

  it("attaches vault evidence anchors when excerpts are provided", () => {
    const excerpts = [
      { docName: "resume_master.pdf", chunkIndex: 2, text: "Scaled distributed systems and payment processing at scale." },
      { docName: "projects.md", chunkIndex: 0, text: "Optimized PostgreSQL query performance." },
    ];

    const result = generateTieredInterviewPrep(["distributed systems", "PostgreSQL"], job, excerpts);

    expect(result.vaultAnchorsCount).toBeGreaterThan(0);
    const anchored = result.byTier.screening.find((q) => q.vaultAnchor);
    expect(anchored?.vaultAnchor).toContain("#");
  });

  it("extracts culture keywords from job description", () => {
    const result = generateTieredInterviewPrep(["API Design"], job);
    expect(result.cultureKeywords).toContain("remote-first");
    expect(result.cultureKeywords).toContain("high ownership");
  });
});
