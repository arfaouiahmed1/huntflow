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
import { executeApply } from "@/lib/agents/executeApply";
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
  fields: Annotation<string[]>({ reducer: (_a, b) => b ?? [], default: () => [] }),

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

  // Check all fields that may carry sensitive PII, not just the summary —
  // including fields many regions forbid on a resume (nationality, gender,
  // marital status, age/DOB, visa status).
  const p = state.profile as unknown as Record<string, unknown>;
  const sensitiveContent = [
    state.profile.summary,
    state.profile.phone,
    p.address,
    p.dateOfBirth,
    p.nationality,
    p.gender,
    p.maritalStatus,
    p.visaStatus,
  ]
    .filter((v): v is string => typeof v === "string" && Boolean(v))
    .join(" | ");

  const res = await executePiiSanitizerTool({ content: sensitiveContent || "" });
  if (res.hasRedactions) {
    logs.push({
      timestamp: ts(),
      message: "⚠️ SSN or date-of-birth patterns detected in the profile — these must never appear in generated documents. Full name, contact, and address fields may also be region-restricted.",
      type: "warning",
    });
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

  // Build a meaningful pitch from actual pipeline data (matched skills + regional
  // salutation). Written to sound natural: no em dashes, no template clichés.
  const topSkills = state.matchingSkills.slice(0, 3).join(", ");
  const summary = state.profile?.summary?.slice(0, 180) || "";
  const pitch = topSkills
    ? `${res.salutation} The ${state.job.title} role at ${state.job.company} maps directly to my experience with ${topSkills}. ${
        summary ? summary.trim() + " " : ""
      }I would welcome the chance to talk through how I can help. ${res.closing}`
    : `${res.salutation} ${
        summary || `As a ${state.profile?.targetTitle || state.job.title} professional,`
      } I would welcome the chance to discuss the ${state.job.title} role at ${state.job.company}. ${res.closing}`;

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
    location: (state.job as { location?: string }).location,
    jobDescription: state.job.jobDescription,
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

  // Serialize profile sections as real text — joining arrays directly would
  // produce "[object Object]" and make the audit score meaningless.
  const experienceText = (state.profile.experience ?? [])
    .map((e) => `${e.role} @ ${e.company} (${e.duration})${e.bulletPoints?.length ? "\n" + e.bulletPoints.join("\n") : ""}`)
    .join("\n");
  const educationText = (state.profile.education ?? [])
    .map((e) => `${e.degree}, ${e.school}${e.year ? ` (${e.year})` : ""}`)
    .join("\n");
  const sampleResume = [state.profile.summary, experienceText, educationText].filter(Boolean).join("\n");
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

  if (state.atsScore < state.minMatch) {
    logs.push({ timestamp: ts(), message: `🛑 Auto-apply skipped — ATS score ${state.atsScore}% below threshold ${state.minMatch}%`, type: "warning" });
    return { autoApplyStatus: "skipped", logs };
  }

  // Actually drive the sidecar — same executor the single-agent path uses,
  // so both auto-apply implementations behave identically.
  const result = await executeApply({
    url: state.job.url,
    profile: state.profile,
    pitch: state.tailoredPitch,
    submit: state.submit,
    minMatch: state.minMatch,
    matchScore: state.atsScore,
  });

  logs.push(...result.logs);
  return {
    autoApplyStatus: result.status,
    fields: result.fields,
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
    interviewPrepTopics: finalState.interviewPrepTopics,
    fields: finalState.fields,
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

  // LangGraph's generics accumulate per-node channel types, so dynamic string
  // node names can't be expressed without a cast. This is sound at runtime:
  // StateGraph.addNode accepts any node fn and addEdge any two string names —
  // the exact same functions and edges the full graph wires up statically. The
  // only difference here is that we wire a *prefix* of the full 11-node graph,
  // so semantics are identical to running the full pipeline up to `stopAfter`
  // (it is genuinely the same nodes, not a different "resume" code path).
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
    interviewPrepTopics: finalState.interviewPrepTopics,
    logs: finalState.logs,
  };
}
