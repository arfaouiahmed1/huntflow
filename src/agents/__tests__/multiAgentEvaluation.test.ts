import { describe, expect, it } from "vitest";
import { streamMultiAgentApp } from "../multiAgentAppGraph";
import { testProfile } from "./fixtures";
import { evaluateMultiAgentContract } from "@/lib/agents/evaluation";
import { vi } from "vitest";

vi.mock("@/lib/agents/tools/multiAgentTools", () => ({
  executeCompanyIntelTool: vi.fn().mockResolvedValue({
    success: true,
    atsType: "generic",
    cultureKeywords: ["product"],
    research: { sources: [], news: [], facts: [] },
  }),
  executeRegionalNormsTool: vi.fn().mockResolvedValue({
    rules: { name: "United States", recommendedTemplate: "classic-ats" },
    meta: { searchPerformed: false, llmUsed: false },
  }),
  executePiiSanitizerTool: vi.fn().mockResolvedValue({
    hasRedactions: false,
    llmUsed: false,
    llmFindings: [],
    meta: { ssnHits: 0, dobHits: 0 },
  }),
  executeResumeCVTailorTool: vi.fn().mockResolvedValue({
    matchingSkills: ["React", "TypeScript"],
    missingSkills: ["GraphQL"],
    recommendedTemplate: "classic-ats",
    llmUsed: false,
    vaultHitsCount: 0,
    cultureKeywords: [],
  }),
  executeLetterTailorTool: vi.fn().mockResolvedValue({
    salutation: "Dear Hiring Manager,",
    closing: "Sincerely,",
    letterKind: "cover_letter",
    llmUsed: false,
    companyResearch: null,
    meta: { searchPerformed: false, sourcesCount: 0 },
  }),
  executeInterviewPrepTool: vi.fn().mockResolvedValue({
    focusTopics: ["React architecture"],
    llmUsed: false,
    meta: { searchPerformed: false, sourcesCount: 0 },
  }),
  executeSalaryIntelTool: vi.fn().mockResolvedValue({ estimatedRange: "$100k-$120k" }),
  executeOutreachEmailTool: vi.fn().mockResolvedValue({ suggestedSubject: "Senior Frontend Engineer" }),
  executeAtsAuditTool: vi.fn().mockResolvedValue({ overallScore: 82, keywordMatchRate: 80 }),
}));

vi.mock("@/lib/agents/executeApply", () => ({
  executeApply: vi.fn().mockResolvedValue({ status: "manual_required", fields: [], logs: [] }),
}));

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

const job = {
  id: "agent-evaluation-fixture",
  title: "Senior Frontend Engineer",
  company: "Acme",
  url: "https://acme.example.com/jobs/frontend",
  jobDescription:
    "Senior Frontend Engineer with React, TypeScript, Node.js, GraphQL, Tailwind CSS, and AWS experience. Remote-first team.",
};

describe("multi-agent deterministic evaluation", () => {
  it("records full preparation coverage and pauses at the supervised review gate", async () => {
    const events: { kind: string; node?: string }[] = [];
    const result = await streamMultiAgentApp(
      { job, profile: testProfile, targetRegion: "US", submit: true },
      (event) => events.push({ kind: event.kind, node: event.node }),
    );

    const evaluation = evaluateMultiAgentContract({
      expectedNodeIds: PREPARATORY_NODES,
      events,
      finalStatus: result.finalState.autoApplyStatus as string | undefined,
      requiredReviewNodeId: "autoApplyExecution",
    });

    expect(evaluation.passed).toBe(true);
    expect(evaluation.metrics).toMatchObject({
      nodeCoverage: 1,
      completionObserved: true,
      reviewGateObserved: true,
    });
    expect(result.finalState.autoApplyStatus).toBe("manual_required");
  });
});
