import { describe, expect, it } from "vitest";
import { evaluateMultiAgentContract } from "@/lib/agents/evaluation";

const PREPARATORY_NODES = [
  "companyIntel",
  "regionalNorms",
  "piiSanitizer",
  "salaryIntel",
  "resumeCVTailor",
  "letterTailor",
  "interviewPrep",
  "outreachEmail",
  "atsAudit",
] as const;

describe("evaluateMultiAgentContract", () => {
  it("passes a complete supervised preparation run and reports its metrics", () => {
    const result = evaluateMultiAgentContract({
      expectedNodeIds: PREPARATORY_NODES,
      events: [
        ...PREPARATORY_NODES.map((node) => ({ kind: "node_finish", node })),
        { kind: "interrupt", node: "autoApplyExecution" },
        { kind: "complete" },
      ],
      finalStatus: "manual_required",
      requiredReviewNodeId: "autoApplyExecution",
      requiredTerms: ["React", "TypeScript"],
      output: "React and TypeScript experience are highlighted.",
      forbiddenTerms: ["Kubernetes"],
    });

    expect(result.passed).toBe(true);
    expect(result.metrics.nodeCoverage).toBe(1);
    expect(result.metrics.reviewGateObserved).toBe(true);
    expect(result.metrics.completionObserved).toBe(true);
    expect(result.metrics.requiredTermCoverage).toBe(1);
    expect(result.failures).toEqual([]);
  });

  it("fails a run that bypasses review and introduces a known unsupported claim", () => {
    const result = evaluateMultiAgentContract({
      expectedNodeIds: PREPARATORY_NODES,
      events: [{ kind: "node_finish", node: "companyIntel" }, { kind: "complete" }],
      finalStatus: "applied",
      requiredReviewNodeId: "autoApplyExecution",
      forbiddenTerms: ["Kubernetes"],
      output: "I led Kubernetes infrastructure across 20 countries.",
    });

    expect(result.passed).toBe(false);
    expect(result.metrics.nodeCoverage).toBeCloseTo(1 / PREPARATORY_NODES.length);
    expect(result.metrics.reviewGateObserved).toBe(false);
    expect(result.metrics.forbiddenTermHits).toEqual(["Kubernetes"]);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        "Missing human-review interrupt at autoApplyExecution.",
        "Output contains forbidden fixture term(s): Kubernetes.",
      ]),
    );
  });
});
