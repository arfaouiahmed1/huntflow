import { describe, it, expect, beforeEach } from "vitest";
import {
  recordCareerOutcome,
  listCareerOutcomes,
  deriveCareerPatternInsights,
  formatEpisodicContextForRole,
  resetCareerOutcomesForTest,
} from "../episodicMemory";

describe("Episodic Career Memory", () => {
  beforeEach(() => {
    resetCareerOutcomesForTest();
  });

  it("records and lists career outcomes FIFO with limit", () => {
    recordCareerOutcome({
      company: "Stripe",
      role: "Staff Frontend Engineer",
      stage: "technical",
      keyStrengthsUsed: ["React", "TypeScript", "System Design"],
      keyGapsIdentified: ["GraphQL federation"],
      feedbackNotes: "Passed architecture, missed deep schema design",
      date: "2026-08-15",
    });

    recordCareerOutcome({
      company: "Vercel",
      role: "Senior Framework Engineer",
      stage: "offer",
      keyStrengthsUsed: ["Next.js", "React 19", "Performance"],
      keyGapsIdentified: [],
      feedbackNotes: "Strong open-source alignment",
      date: "2026-08-28",
    });

    const list = listCareerOutcomes(10);
    expect(list.length).toBe(2);
    expect(list[0].company).toBe("Vercel");
    expect(list[0].stage).toBe("offer");
    expect(list[1].company).toBe("Stripe");
  });

  it("derives pattern insights from positive and negative stage history", () => {
    recordCareerOutcome({
      company: "Stripe",
      role: "Staff Engineer",
      stage: "technical",
      keyStrengthsUsed: ["React", "TypeScript"],
      keyGapsIdentified: ["Kubernetes"],
      date: "2026-07-01",
    });

    recordCareerOutcome({
      company: "Datadog",
      role: "Senior Engineer",
      stage: "offer",
      keyStrengthsUsed: ["React", "TypeScript"],
      keyGapsIdentified: [],
      date: "2026-07-20",
    });

    recordCareerOutcome({
      company: "Meta",
      role: "Production Engineer",
      stage: "rejected",
      keyStrengthsUsed: [],
      keyGapsIdentified: ["Kubernetes"],
      date: "2026-08-01",
    });

    const outcomes = listCareerOutcomes();
    const insights = deriveCareerPatternInsights(outcomes);

    expect(insights.length).toBeGreaterThan(0);
    const skillInsight = insights.find((i) => i.category === "skill_fit");
    expect(skillInsight).toBeDefined();
    expect(skillInsight?.pattern).toContain("React");

    const gapInsight = insights.find((i) => i.category === "interview_technique");
    expect(gapInsight).toBeDefined();
    expect(gapInsight?.pattern).toContain("Kubernetes");
  });

  it("formats episodic context block for relevant target roles", () => {
    recordCareerOutcome({
      company: "Acme",
      role: "Senior React Engineer",
      stage: "offer",
      keyStrengthsUsed: ["React", "TypeScript", "Tailwind CSS"],
      keyGapsIdentified: [],
      feedbackNotes: "Great cultural fit",
      date: "2026-08-10",
    });

    const context = formatEpisodicContextForRole({
      company: "Acme",
      title: "Lead Frontend Engineer",
      jobDescription: "Looking for a Lead Frontend Engineer with React and TypeScript.",
    });

    expect(context).toContain("=== EPISODIC CAREER LEARNINGS ===");
    expect(context).toContain("Acme (Senior React Engineer) -> OFFER");
    expect(context).toContain("React, TypeScript");
  });
});
