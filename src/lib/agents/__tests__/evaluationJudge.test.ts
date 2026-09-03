import { describe, expect, it } from "vitest";
import { buildAgentJudgePrompt, parseAgentJudgeVerdict } from "@/lib/agents/evaluation";

describe("LLM judge evaluation contract", () => {
  it("requires grounded, quote-level evidence in the judge prompt", () => {
    const prompt = buildAgentJudgePrompt({
      profileFacts: ["Built React and TypeScript interfaces."],
      jobFacts: ["Role requires React and TypeScript."],
      candidateOutput: "I built React and TypeScript interfaces.",
    });

    expect(prompt.system).toContain("Do not use outside knowledge");
    expect(prompt.user).toContain("Built React and TypeScript interfaces.");
    expect(prompt.user).toContain("quote-level evidence");
  });

  it("rejects an invalid judge payload instead of silently accepting it", () => {
    expect(() => parseAgentJudgeVerdict({ score: 5, rationale: "Fine" })).toThrow(
      "Agent judge verdict must include evidence",
    );
  });

  it("accepts a bounded evidence-backed verdict", () => {
    expect(
      parseAgentJudgeVerdict({
        score: 4,
        rationale: "The output stays grounded in the supplied profile.",
        evidence: [
          {
            outputQuote: "React and TypeScript interfaces",
            sourceQuote: "Built React and TypeScript interfaces.",
          },
        ],
      }),
    ).toEqual({
      score: 4,
      rationale: "The output stays grounded in the supplied profile.",
      evidence: [
        {
          outputQuote: "React and TypeScript interfaces",
          sourceQuote: "Built React and TypeScript interfaces.",
        },
      ],
    });
  });
});
