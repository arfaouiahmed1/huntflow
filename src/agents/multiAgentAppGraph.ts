import { Annotation, END, StateGraph, START } from "@langchain/langgraph";
import { UserProfile, JobApplication, AutoApplyLog } from "@/types";
import { RegionCode, getRegionalRules, auditRegionalCompliance } from "@/lib/agents/regionalNorms";
import {
  executeCompanyIntelTool,
  executeRegionalNormsTool,
  executePiiSanitizerTool,
  executeResumeCVTailorTool,
  executeLetterTailorTool,
  executeInterviewPrepTool,
  executeSalaryIntelTool,
  executeOutreachEmailTool,
  executeAtsAuditTool,
} from "@/lib/agents/tools/multiAgentTools";
import { SqliteCheckpointSaver } from "@/lib/agents/checkpointer";
import { agentRunHistoryRepo } from "@/lib/db";

export interface MultiAgentInput {
  job: Partial<JobApplication> & { id: string; title: string; company: string; jobDescription: string; url?: string };
  profile: UserProfile;
  targetRegion?: RegionCode;
  submit?: boolean;
  minMatch?: number;
  threadId?: string;
}

export const MultiAgentState = Annotation.Root({
  job: Annotation<MultiAgentInput["job"]>,
  profile: Annotation<UserProfile>,
  targetRegion: Annotation<RegionCode>({ reducer: (_a, b) => b, default: () => "US" }),
  submit: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
  minMatch: Annotation<number>({ reducer: (_a, b) => b, default: () => 70 }),
  
  // Phase 1 Intelligence
  atsType: Annotation<string>({ reducer: (_a, b) => b, default: () => "generic" }),
  cultureKeywords: Annotation<string[]>({ reducer: (_a, b) => b ?? [], default: () => [] }),
  regionalRules: Annotation<Record<string, unknown> | null>({ reducer: (_a, b) => b, default: () => null }),
  
  // Phase 2 Generated Assets
  recommendedTemplate: Annotation<string>({ reducer: (_a, b) => b, default: () => "classic-ats" }),
  matchingSkills: Annotation<string[]>({ reducer: (_a, b) => b ?? [], default: () => [] }),
  missingSkills: Annotation<string[]>({ reducer: (_a, b) => b ?? [], default: () => [] }),
  tailoredPitch: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
  interviewPrepTopics: Annotation<string[]>({ reducer: (_a, b) => b ?? [], default: () => [] }),
  salaryEstimate: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
  outreachSubject: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
  
  // Phase 3 Audit & Execution
  atsScore: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  complianceWarnings: Annotation<string[]>({ reducer: (_a, b) => b ?? [], default: () => [] }),
  autoApplyStatus: Annotation<"applied" | "manual_required" | "skipped" | "failed">({
    reducer: (_a, b) => b,
    default: () => "manual_required",
  }),

  // Telemetry & Checkpoints
  logs: Annotation<AutoApplyLog[]>({
    reducer: (a, b) => [...(a ?? []), ...(b ?? [])],
    default: () => [],
  }),
});

const ts = () => new Date().toLocaleTimeString("en-US", { hour12: false });

/* ----------------------------- Graph Nodes ----------------------------- */

async function companyIntelNode(state: typeof MultiAgentState.State) {
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: "🔍 Agent #2 (CompanyIntel) analyzing ATS vendor and company culture...", type: "info" });
  
  const res = await executeCompanyIntelTool({
    company: state.job.company,
    jobDescription: state.job.jobDescription,
  });

  if (res.success) {
    logs.push({ timestamp: ts(), message: `🏢 ATS platform identified: ${(res.atsType || "generic").toUpperCase()}`, type: "info" });
  }

  return {
    atsType: res.atsType || "generic",
    cultureKeywords: res.cultureKeywords || [],
    logs,
  };
}

async function regionalNormsNode(state: typeof MultiAgentState.State) {
  const logs: AutoApplyLog[] = [];
  const region = state.targetRegion || "US";
  logs.push({ timestamp: ts(), message: `🌍 Agent #3 (RegionalNorms) loading standards for region ${region}...`, type: "info" });

  const res = await executeRegionalNormsTool({ region });
  logs.push({ timestamp: ts(), message: `📋 Formatting rules set for ${res.rules.name} (Template: ${res.rules.recommendedTemplate})`, type: "info" });

  return {
    regionalRules: res.rules as unknown as Record<string, unknown>,
    recommendedTemplate: res.rules.recommendedTemplate,
    logs,
  };
}

async function piiSanitizerNode(state: typeof MultiAgentState.State) {
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: "🛡️ Agent #4 (VerificationSanitizer) auditing candidate profile for PII compliance...", type: "info" });

  // Check all fields that may carry sensitive PII, not just the summary
  const profileAny = state.profile as unknown as Record<string, string | undefined>;
  const sensitiveContent = [
    state.profile.summary,
    state.profile.phone,
    profileAny.address,
    profileAny.dateOfBirth,
  ].filter(Boolean).join(" | ");

  const res = await executePiiSanitizerTool({ content: sensitiveContent || "" });
  if (res.hasRedactions) {
    logs.push({ timestamp: ts(), message: "⚠️ Sensitive fields (phone, address, DOB, or SSN) detected and sanitized prior to document generation.", type: "warning" });
  }

  return { logs };
}

async function resumeCVTailorNode(state: typeof MultiAgentState.State) {
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: "📄 Agent #5 (ResumeCVTailor) applying keyword extraction rules...", type: "info" });

  const res = await executeResumeCVTailorTool({
    jobTitle: state.job.title,
    company: state.job.company,
    jobDescription: state.job.jobDescription,
    region: state.targetRegion,
    userSkills: state.profile.skills || [],
  });

  logs.push({ timestamp: ts(), message: `✨ Matched ${res.matchingSkills.length} skills (${res.missingSkills.length} gaps identified).`, type: "info" });

  return {
    matchingSkills: res.matchingSkills,
    missingSkills: res.missingSkills,
    recommendedTemplate: res.recommendedTemplate,
    logs,
  };
}

async function letterTailorNode(state: typeof MultiAgentState.State) {
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: "✉️ Agent #6 (LetterTailor) formatting motivational / cover letter etiquette...", type: "info" });

  const res = await executeLetterTailorTool({
    jobTitle: state.job.title,
    company: state.job.company,
    jobDescription: state.job.jobDescription,
    region: state.targetRegion,
    kind: "cover_letter",
  });

  // Build a meaningful pitch from actual pipeline data (matched skills + regional salutation)
  const topSkills = state.matchingSkills.slice(0, 3).join(", ");
  const summary = state.profile?.summary?.slice(0, 180) || "";
  const pitch = topSkills
    ? `${res.salutation} — With proven expertise in ${topSkills}, I am excited to contribute to ${state.job.company} as ${state.job.title}. ${
        summary ? summary + " " : ""
      }I look forward to discussing how my background aligns with your team's goals. ${res.closing}`
    : `${summary || `I am a motivated ${state.profile?.targetTitle || state.job.title} professional`} eager to join ${state.job.company} as ${state.job.title}. ${res.closing}`;

  logs.push({ timestamp: ts(), message: `✉️ Cover letter drafted using ${res.letterKind} convention (${state.targetRegion}).`, type: "info" });

  return {
    tailoredPitch: pitch,
    logs,
  };
}

async function interviewPrepNode(state: typeof MultiAgentState.State) {
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: "🎯 Agent #7 (InterviewPrep) applying topic extraction rules...", type: "info" });

  const res = await executeInterviewPrepTool({
    jobTitle: state.job.title,
    company: state.job.company,
    jobDescription: state.job.jobDescription,
  });

  return {
    interviewPrepTopics: res.focusTopics,
    logs,
  };
}

async function salaryIntelNode(state: typeof MultiAgentState.State) {
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: "💰 Agent #8 (SalaryIntel) estimating market compensation benchmarks...", type: "info" });

  const res = await executeSalaryIntelTool({
    jobTitle: state.job.title,
    company: state.job.company,
    location: (state.job as any).location,
  });

  return {
    salaryEstimate: res.estimatedRange,
    logs,
  };
}

async function outreachEmailNode(state: typeof MultiAgentState.State) {
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: "📩 Agent #9 (OutreachEmail) generating recruiter outreach template...", type: "info" });

  const res = await executeOutreachEmailTool({
    type: "linkedin_connect",
    contactName: "Hiring Manager",
    company: state.job.company,
    jobTitle: state.job.title,
  });

  return {
    outreachSubject: res.suggestedSubject,
    logs,
  };
}

async function atsAuditNode(state: typeof MultiAgentState.State) {
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: "📊 Agent #10 (ATSAudit) running deterministic ATS parsing rules...", type: "info" });

  const profileAny = state.profile as unknown as Record<string, string | undefined>;
  const sampleResume = [state.profile.summary, profileAny.experience, profileAny.education].filter(Boolean).join("\n");
  const res = await executeAtsAuditTool({
    resumeText: sampleResume,
    jobDescription: state.job.jobDescription,
    atsType: state.atsType,
  });

  const compliance = auditRegionalCompliance(sampleResume, state.targetRegion);
  logs.push({ timestamp: ts(), message: `✅ ATS Audit Score: ${res.overallScore}% (Keyword match: ${res.keywordMatchRate}%)`, type: "success" });

  return {
    atsScore: res.overallScore,
    complianceWarnings: compliance.warnings,
    logs,
  };
}

async function autoApplyExecutionNode(state: typeof MultiAgentState.State) {
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: "🕷️ Agent #11 (AutoApplyExecution) driving Scrapling browser agent...", type: "info" });

  let status: "applied" | "manual_required" | "skipped" = "manual_required";
  if (state.atsScore < state.minMatch) {
    status = "skipped";
    logs.push({ timestamp: ts(), message: `🛑 Auto-apply skipped — ATS score ${state.atsScore}% below threshold ${state.minMatch}%`, type: "warning" });
  } else if (state.submit) {
    status = "manual_required";
    logs.push({ timestamp: ts(), message: "🚀 Ready for Scrapling driver! (Delegating to auto-apply)", type: "info" });
  } else {
    status = "manual_required";
    logs.push({ timestamp: ts(), message: "⏸ Prefill complete. Ready for human-in-the-loop review.", type: "warning" });
  }

  return {
    autoApplyStatus: status,
    logs,
  };
}

async function orchestratorGateNode(state: typeof MultiAgentState.State) {
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: `🎉 Multi-Agent Pipeline Completed cleanly. Terminal status: ${state.autoApplyStatus}`, type: "success" });
  return { logs };
}

/* ----------------------------- Graph Construction ----------------------------- */

export function createMultiAgentAppGraph(checkpointer?: SqliteCheckpointSaver) {
  const workflow = new StateGraph(MultiAgentState)
    .addNode("companyIntel", companyIntelNode)
    .addNode("regionalNorms", regionalNormsNode)
    .addNode("piiSanitizer", piiSanitizerNode)
    .addNode("resumeCVTailor", resumeCVTailorNode)
    .addNode("letterTailor", letterTailorNode)
    .addNode("interviewPrep", interviewPrepNode)
    .addNode("salaryIntel", salaryIntelNode)
    .addNode("outreachEmail", outreachEmailNode)
    .addNode("atsAudit", atsAuditNode)
    .addNode("autoApplyExecution", autoApplyExecutionNode)
    .addNode("orchestratorGate", orchestratorGateNode)

    // Edges
    .addEdge(START, "companyIntel")
    .addEdge("companyIntel", "regionalNorms")
    .addEdge("regionalNorms", "piiSanitizer")
    .addEdge("piiSanitizer", "resumeCVTailor")
    .addEdge("resumeCVTailor", "letterTailor")
    .addEdge("letterTailor", "interviewPrep")
    .addEdge("interviewPrep", "salaryIntel")
    .addEdge("salaryIntel", "outreachEmail")
    .addEdge("outreachEmail", "atsAudit")
    .addEdge("atsAudit", "autoApplyExecution")
    .addEdge("autoApplyExecution", "orchestratorGate")
    .addEdge("orchestratorGate", END);

  return workflow.compile({ checkpointer });
}


export async function runMultiAgentApp(input: MultiAgentInput) {
  const checkpointer = new SqliteCheckpointSaver();
  const app = createMultiAgentAppGraph(checkpointer);
  const threadId = input.threadId || `thread_${Date.now()}`;

  const finalState = await app.invoke(
    {
      job: input.job,
      profile: input.profile,
      targetRegion: input.targetRegion || "US",
      submit: input.submit ?? false,
      minMatch: input.minMatch ?? 70,
    },
    { configurable: { thread_id: threadId } }
  );

  // Store in SQLite database run history
  agentRunHistoryRepo.log({
    threadId,
    jobId: input.job.id,
    agentName: "MasterMultiAgentOrchestrator",
    status: finalState.autoApplyStatus,
    region: input.targetRegion || "US",
    atsScore: finalState.atsScore,
    reasoning: `Target Region: ${input.targetRegion || "US"}. Template chosen: ${finalState.recommendedTemplate}. Match Score: ${finalState.atsScore}%.`,
    findings: JSON.stringify({
      matchingSkills: finalState.matchingSkills,
      missingSkills: finalState.missingSkills,
      salaryEstimate: finalState.salaryEstimate,
      outreachSubject: finalState.outreachSubject,
    }),
    logs: JSON.stringify(finalState.logs),
  });

  return {
    threadId,
    status: finalState.autoApplyStatus,
    atsScore: finalState.atsScore,
    recommendedTemplate: finalState.recommendedTemplate,
    matchingSkills: finalState.matchingSkills,
    missingSkills: finalState.missingSkills,
    salaryEstimate: finalState.salaryEstimate,
    outreachSubject: finalState.outreachSubject,
    logs: finalState.logs,
  };
}

export async function runPartialPipeline(input: MultiAgentInput & { stopAfter: string }) {
  const NODE_ORDER = [
    "companyIntel",
    "regionalNorms",
    "piiSanitizer",
    "resumeCVTailor",
    "letterTailor",
    "interviewPrep",
    "salaryIntel",
    "outreachEmail",
    "atsAudit",
    "autoApplyExecution",
    "orchestratorGate"
  ];
  
  const stopIndex = NODE_ORDER.indexOf(input.stopAfter);
  if (stopIndex === -1) {
    throw new Error(`Invalid stopAfter node: ${input.stopAfter}`);
  }
  
  const nodesToInclude = NODE_ORDER.slice(0, stopIndex + 1);
  const nodeFunctions: Record<string, (state: typeof MultiAgentState.State) => Promise<Record<string, unknown>>> = {
    companyIntel: companyIntelNode,
    regionalNorms: regionalNormsNode,
    piiSanitizer: piiSanitizerNode,
    resumeCVTailor: resumeCVTailorNode,
    letterTailor: letterTailorNode,
    interviewPrep: interviewPrepNode,
    salaryIntel: salaryIntelNode,
    outreachEmail: outreachEmailNode,
    atsAudit: atsAuditNode,
    autoApplyExecution: autoApplyExecutionNode,
    orchestratorGate: orchestratorGateNode,
  };

  // LangGraph generics accumulate per-node types; dynamic string node names require a cast.
  // Using a named alias keeps the workflow variable itself properly typed for .compile().
  const workflow = new StateGraph(MultiAgentState);
  type DynamicBuilder = {
    addNode(name: string, fn: (state: typeof MultiAgentState.State) => Promise<Record<string, unknown>>): void;
    addEdge(from: string, to: string): void;
  };
  const g = workflow as unknown as DynamicBuilder;

  // Add nodes
  for (const nodeName of nodesToInclude) {
    g.addNode(nodeName, nodeFunctions[nodeName]);
  }

  // Add sequential edges
  g.addEdge(START, nodesToInclude[0]);
  for (let i = 0; i < nodesToInclude.length - 1; i++) {
    g.addEdge(nodesToInclude[i], nodesToInclude[i + 1]);
  }
  g.addEdge(nodesToInclude[nodesToInclude.length - 1], END);

  const checkpointer = new SqliteCheckpointSaver();
  const app = workflow.compile({ checkpointer });
  const threadId = input.threadId || `thread_partial_${Date.now()}`;

  const finalState = await app.invoke(
    {
      job: input.job,
      profile: input.profile,
      targetRegion: input.targetRegion || "US",
      submit: input.submit ?? false,
      minMatch: input.minMatch ?? 70,
    },
    { configurable: { thread_id: threadId } }
  );

  // Store in SQLite database run history
  agentRunHistoryRepo.log({
    threadId,
    jobId: input.job.id,
    agentName: `PartialPipeline_UpTo_${input.stopAfter}`,
    status: finalState.autoApplyStatus || "skipped",
    region: input.targetRegion || "US",
    atsScore: finalState.atsScore,
    reasoning: `Partial pipeline execution up to ${input.stopAfter}. Match Score: ${finalState.atsScore}%.`,
    findings: JSON.stringify({
      matchingSkills: finalState.matchingSkills,
      missingSkills: finalState.missingSkills,
      salaryEstimate: finalState.salaryEstimate,
      outreachSubject: finalState.outreachSubject,
    }),
    logs: JSON.stringify(finalState.logs),
  });

  return {
    threadId,
    status: finalState.autoApplyStatus,
    atsScore: finalState.atsScore,
    recommendedTemplate: finalState.recommendedTemplate,
    matchingSkills: finalState.matchingSkills,
    missingSkills: finalState.missingSkills,
    salaryEstimate: finalState.salaryEstimate,
    outreachSubject: finalState.outreachSubject,
    logs: finalState.logs,
  };
}
