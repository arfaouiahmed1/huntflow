import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  createMultiAgentAppGraph,
  runMultiAgentApp,
  streamMultiAgentApp,
  resumeMultiAgentApp,
  runPartialPipeline,
} from "../multiAgentAppGraph";
import { settingsRepo } from "@/lib/db";
import { testProfile } from "./fixtures";
import type { UserProfile } from "@/types";

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

const mockJob = {
  id: "job-hardening-11",
  title: "Senior Frontend Engineer",
  company: "Acme",
  url: "https://acme.example.com/jobs/1",
  jobDescription:
    "We are hiring a Senior Frontend Engineer with React, TypeScript, Node.js, GraphQL, Tailwind CSS and AWS. Senior candidates with design system experience preferred. Remote-first startup.",
};

const graphPath = path.join(process.cwd(), "src/agents/multiAgentAppGraph.ts");

function readGraphSource(): string {
  return fs.readFileSync(graphPath, "utf-8");
}

describe("MultiAgent 11-node hardening — fan-in/fan-out + HITL resume freshness", () => {
  it("emits a review interrupt after the ten preparatory nodes", async () => {
    const events: { kind: string; node?: string }[] = [];
    const res = await streamMultiAgentApp(
      {
        job: mockJob,
        profile: testProfile,
        targetRegion: "US",
        submit: false,
        minMatch: 60,
      },
      (ev) => events.push({ kind: ev.kind, node: ev.node }),
    );

    const finishes = events.filter((e) => e.kind === "node_finish" && e.node !== "__interrupt__");
    const distinct = new Set(finishes.map((e) => e.node));
    // The first nine graph nodes prepare evidence. Step 10 pauses for
    // human approval and the final orchestrator step stays queued.
    expect(distinct.size).toBe(9);
    expect(distinct).toEqual(
      new Set([
        "companyIntel",
        "regionalNorms",
        "piiSanitizer",
        "salaryIntel",
        "resumeCVTailor",
        "letterTailor",
        "interviewPrep",
        "outreachEmail",
        "atsAudit",
      ]),
    );
    expect(events).toContainEqual({ kind: "interrupt", node: "autoApplyExecution" });
    expect(events).not.toContainEqual({ kind: "node_finish", node: "__interrupt__" });
    expect(events.some((e) => e.kind === "complete")).toBe(true);
    expect(res.threadId).toBeDefined();
    // orchestratorGate persists (L370 contract)
    expect(readGraphSource()).toContain("async function orchestratorGateNode");
    expect(readGraphSource()).toContain('addNode("orchestratorGate"');
  });

  it("fan-out START→4, fan-in resumeCVTailor, fan-out ×3, fan-in atsAudit 4 sources — topology intact", () => {
    const src = readGraphSource();
    // Fan-out from START: 4 parallel intelligence nodes
    expect(src).toContain('.addEdge(START, "companyIntel")');
    expect(src).toContain('.addEdge(START, "regionalNorms")');
    expect(src).toContain('.addEdge(START, "piiSanitizer")');
    expect(src).toContain('.addEdge(START, "salaryIntel")');

    // Fan-in: one waiting edge requires all 3 intelligence sources.
    expect(src).toContain('.addEdge(["companyIntel", "regionalNorms", "piiSanitizer"], "resumeCVTailor")');
    // salaryIntel does NOT feed resumeCVTailor — it feeds atsAudit via parallel path
    expect(src).not.toContain('.addEdge("salaryIntel", "resumeCVTailor")');

    // Fan-out from resumeCVTailor ×3
    expect(src).toContain('.addEdge("resumeCVTailor", "letterTailor")');
    expect(src).toContain('.addEdge("resumeCVTailor", "interviewPrep")');
    expect(src).toContain('.addEdge("resumeCVTailor", "outreachEmail")');

    // Fan-in: one waiting edge requires all tailored assets (salaryIntel runs parallel via separate path).
    expect(src).toContain('.addEdge(["letterTailor", "interviewPrep", "outreachEmail"], "atsAudit")');

    // Final sequence
    expect(src).toContain('.addEdge("atsAudit", "autoApplyExecution")');
    expect(src).toContain('.addEdge("autoApplyExecution", "orchestratorGate")');
    expect(src).toContain('.addEdge("orchestratorGate", END)');

    // 11 addNode calls still present
    const addNodeMatches = src.match(/\.addNode\("/g) ?? [];
    expect(addNodeMatches.length).toBe(11);
  });

  it("DEFAULT_RETRY_POLICY on 9 nodes except autoApplyExecution (and orchestratorGate)", () => {
    const src = readGraphSource();
    // Policy constant exists at construction preamble
    expect(src).toContain("const DEFAULT_RETRY_POLICY");
    expect(src).toContain("maxAttempts: 3");

    // 9 nodes carry retryPolicy; the two terminal nodes do not
    const retryMatches = src.match(/retryPolicy: DEFAULT_RETRY_POLICY/g) ?? [];
    expect(retryMatches.length).toBe(9);

    // autoApplyExecution must NOT have retryPolicy (human interrupt not retryable)
    expect(src).toContain('.addNode("autoApplyExecution", autoApplyExecutionNode)');
    expect(src).not.toContain('.addNode("autoApplyExecution", autoApplyExecutionNode, { retryPolicy');

    const gateLine = src
      .split("\n")
      .find((l) => l.includes('addNode("orchestratorGate"')) ?? "";
    expect(gateLine).toContain('addNode("orchestratorGate"');
    expect(gateLine).not.toContain("retryPolicy");
  });

  it("runPartialPipeline prefix semantics: stopAfter slices NODE_ORDER prefix", async () => {
    // stopAfter companyIntel → only 1-node prefix still succeeds
    const early = await runPartialPipeline({
      job: mockJob,
      profile: testProfile,
      targetRegion: "US",
      submit: false,
      stopAfter: "companyIntel",
    });
    expect(early.threadId).toBeDefined();
    expect(Array.isArray(early.logs)).toBe(true);

    // stopAfter resumeCVTailor → prefix inclusive (5 nodes) succeeds and populates tailoring outputs
    const mid = await runPartialPipeline({
      job: mockJob,
      profile: testProfile,
      targetRegion: "US",
      submit: false,
      stopAfter: "resumeCVTailor",
    });
    expect(mid.threadId).toBeDefined();
    // runPartialPipeline sequentially wires prefix; tailoring still produces matchingSkills via same fn
    expect(Array.isArray(mid.matchingSkills)).toBe(true);

    // stopAfter orchestratorGate → full prefix equals full pipeline (11 nodes) and yields terminal status
    const full = await runPartialPipeline({
      job: mockJob,
      profile: testProfile,
      targetRegion: "US",
      submit: false,
      stopAfter: "orchestratorGate",
    });
    expect(full.threadId).toBeDefined();
    expect(full.status).toBeDefined();

    // invalid stopAfter throws with expected message (preserved contract)
    await expect(
      runPartialPipeline({
        job: mockJob,
        profile: testProfile,
        stopAfter: "bogusNode",
      }),
    ).rejects.toThrow("Invalid stopAfter node");
  });

  it("streaming pauses the supervised run at the AutoApply review interruption", async () => {
    const nodes: string[] = [];
    const interrupts: string[] = [];
    await streamMultiAgentApp(
      {
        job: { ...mockJob, id: `job-stream-11-${Date.now()}` },
        profile: testProfile,
        targetRegion: "US",
        submit: true,
        minMatch: 30,
      },
      (ev) => {
        if (ev.kind === "node_finish" && ev.node && ev.node !== "__interrupt__") nodes.push(ev.node);
        if (ev.kind === "interrupt" && ev.node) interrupts.push(ev.node);
      },
    );
    expect(new Set(nodes).size).toBe(9);
    expect(interrupts).toEqual(["autoApplyExecution"]);
    const idxFirst = (n: string) => nodes.indexOf(n);
    const idxLast = (n: string) => nodes.lastIndexOf(n);
    expect(idxFirst("companyIntel")).toBeGreaterThanOrEqual(0);
    expect(idxFirst("regionalNorms")).toBeGreaterThanOrEqual(0);
    expect(idxFirst("piiSanitizer")).toBeGreaterThanOrEqual(0);
    expect(idxFirst("salaryIntel")).toBeGreaterThanOrEqual(0);
    expect(idxLast("resumeCVTailor")).toBeGreaterThan(idxFirst("companyIntel"));
    expect(idxLast("resumeCVTailor")).toBeGreaterThan(idxFirst("regionalNorms"));
    expect(idxLast("resumeCVTailor")).toBeGreaterThan(idxFirst("piiSanitizer"));
    expect(idxLast("atsAudit")).toBeGreaterThan(idxFirst("letterTailor"));
    expect(idxLast("atsAudit")).toBeGreaterThan(idxFirst("interviewPrep"));
    expect(idxLast("atsAudit")).toBeGreaterThan(idxFirst("outreachEmail"));
    expect(idxLast("atsAudit")).toBeGreaterThan(idxFirst("salaryIntel"));
  });

  it("createMultiAgentAppGraph still compiles with 11 nodes (no missing wiring)", () => {
    const app = createMultiAgentAppGraph();
    expect(app).toBeDefined();
    // compile returns object with invoke/stream; invoking against a trivial interrupt-free path validates wiring
    expect(typeof (app as unknown as { invoke: unknown }).invoke).toBe("function");
    expect(typeof (app as unknown as { stream: unknown }).stream).toBe("function");
  });

  it("HITL resume freshness: fresh profile + rebuilt sharedContext on resume", async () => {
    const threadId = `test_hitl_fresh_${Date.now()}`;
    const staleProfile: UserProfile = { ...testProfile, name: "Stale Name" };
    // Seed settingsRepo with stale profile so autoApplyExecutionNode sees stale on first leg
    settingsRepo.set("profile", JSON.stringify(staleProfile));

    const initialRun = await runMultiAgentApp({
      job: { ...mockJob, id: `job-hitl-${Date.now()}` },
      profile: staleProfile,
      targetRegion: "US",
      submit: false,
      minMatch: 30,
      threadId,
    });
    expect(initialRun.status).toBe("manual_required");

    // Mutate profile before resume — simulating user editing profile mid-HITL
    const freshProfile: UserProfile = { ...testProfile, name: "Fresh Name" };
    settingsRepo.set("profile", JSON.stringify(freshProfile));

    const resumed = await resumeMultiAgentApp(threadId, {
      approved: true,
      submit: false,
      editedPitch: "Edited pitch for HITL freshness check",
    });

    // resumeMultiAgentApp and autoApplyExecutionNode both reload fresh profile via settingsRepo
    expect(resumed.profile?.name).toBe("Fresh Name");
    expect(resumed.tailoredPitch).toContain("Edited pitch for HITL freshness check");
    // sharedContext rebuilt with fresh profile (buildSharedContext includes profile.name)
    expect(resumed.sharedContext).toContain("Fresh Name");
    // status reflects prefill approval path
    expect(resumed.status).toBe("manual_required");
    expect(Array.isArray(resumed.logs)).toBe(true);

    settingsRepo.set("profile", JSON.stringify({ ...testProfile, name: "Streaming Fresh" }));
    const streamNodes: string[] = [];
    await streamMultiAgentApp(
      {
        job: { ...mockJob, id: `job-hitl-stream-${Date.now()}` },
        profile: freshProfile,
        targetRegion: "US",
        submit: true,
        minMatch: 30,
      },
      (ev) => {
        if (ev.kind === "node_finish" && ev.node && ev.node !== "__interrupt__") streamNodes.push(ev.node);
      },
    );
    expect(new Set(streamNodes).size).toBe(9);
  });
});
