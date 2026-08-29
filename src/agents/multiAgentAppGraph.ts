import { Annotation, Command, END, interrupt, StateGraph, START } from "@langchain/langgraph";
import { UserProfile, JobApplication, AutoApplyLog, CompanyResearch } from "@/types";
import { RegionCode, auditRegionalCompliance } from "@/lib/agents/regionalNorms";
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
import { agentRunHistoryRepo, settingsRepo, jobsRepo, emailsRepo, interviewsRepo, remindersRepo } from "@/lib/db";
import { rememberUnique } from "@/lib/agents/memory";
import { buildSharedContext } from "@/lib/agents/context";

export interface MultiAgentInput {
  job: Partial<JobApplication> & { id: string; title: string; company: string; jobDescription: string; url?: string; location?: string };
  profile: UserProfile;
  targetRegion?: RegionCode;
  submit?: boolean;
  minMatch?: number;
  threadId?: string;
}

export interface MultiAgentStreamEvent {
  kind: "node_start" | "node_finish" | "log" | "interrupt" | "complete" | "error";
  node?: string;
  data?: Record<string, unknown>;
  log?: AutoApplyLog;
  message?: string;
}

function loadFreshProfile(fallback: UserProfile): UserProfile {
  try {
    const raw = settingsRepo.get("profile");
    if (raw) {
      const parsed = JSON.parse(raw) as UserProfile;
      if (parsed && typeof parsed.name === "string" && parsed.name.trim()) return parsed;
    }
  } catch {}
  return fallback;
}

export const MultiAgentState = Annotation.Root({
  job: Annotation<MultiAgentInput["job"]>,
  profile: Annotation<UserProfile>({ reducer: (_a, b) => b ?? _a, default: () => undefined as unknown as UserProfile }),
  sharedContext: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
  targetRegion: Annotation<RegionCode>({ reducer: (_a, b) => b, default: () => "US" }),
  submit: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),

  
  // Phase 1 Intelligence
  atsType: Annotation<string>({ reducer: (_a, b) => b, default: () => "generic" }),
  cultureKeywords: Annotation<string[]>({ reducer: (_a, b) => b ?? [], default: () => [] }),
  companyResearch: Annotation<CompanyResearch | null>({ reducer: (_a, b) => b, default: () => null }),
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
  const freshProfile = loadFreshProfile(state.profile);
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: "🔍 Agent #2 (CompanyIntel) retrieving source-backed company facts and current news...", type: "info" });
  
  const res = await executeCompanyIntelTool({
    company: state.job.company,
    jobDescription: state.job.jobDescription,
    jobUrl: state.job.url,
  });

  if (res.success) {
    logs.push({ timestamp: ts(), message: `🏢 ATS platform identified: ${(res.atsType || "generic").toUpperCase()}`, type: "info" });
    logs.push({
      timestamp: ts(),
      message: `Reasoning: treating ${(res.atsType || "generic").toUpperCase()} as the application system shapes field mapping later — generic parsers get conservative, single-column inputs.`,
      type: "reasoning",
    });
    logs.push({
      timestamp: ts(),
      message: res.research.sources.length
        ? `🔗 Company research captured ${res.research.sources.length} source(s) and ${res.research.news.length} recent news item(s).`
        : "⚠ No external company sources were verified; only posting-derived signals will be used.",
      type: res.research.sources.length ? "success" : "warning",
    });
    if (res.research.sources.length) {
      const sourceSummary = res.research.sources.slice(0, 6).map((source) => source.url).join(", ");
      const factSummary = res.research.facts.slice(0, 6).map((fact) => `${fact.label}: ${fact.value}`).join("; ");
      rememberUnique(
        "fact",
        `Verified company research for ${state.job.company}. ${factSummary || "No structured facts returned."} Sources: ${sourceSummary}`,
        { jobId: state.job.id, source: "company-research", importance: 2 },
      );
    }
  }

  return {
    profile: freshProfile,
    atsType: res.atsType || "generic",
    cultureKeywords: res.cultureKeywords || [],
    companyResearch: res.research,
    logs,
  };
}

async function regionalNormsNode(state: typeof MultiAgentState.State) {
  const freshProfile = loadFreshProfile(state.profile);
  const logs: AutoApplyLog[] = [];
  const region = state.targetRegion || "US";
  logs.push({ timestamp: ts(), message: `🌍 Agent #3 (RegionalNorms) loading standards for region ${region}...`, type: "info" });
  logs.push({ timestamp: ts(), message: `🔍 Searching web for ${region} resume norms 2025 via sidecar /scrape...`, type: "info" });
  const res = await executeRegionalNormsTool({ region });
  const meta = (res as { meta?: { searchPerformed?: boolean; llmUsed?: boolean; searchSnippet?: string | null } }).meta;
  if (meta?.searchPerformed) {
    logs.push({
      timestamp: ts(),
      message: `🔍 Web search for ${region} resume norms 2025 completed${meta.searchSnippet ? ": snippet captured" : " (fallback)"} via sidecar /scrape`,
      type: "info",
    });
  }
  if (meta?.llmUsed) {
    logs.push({
      timestamp: ts(),
      message: `🤖 LLM reasoning applied for ${region} regional norms (2025) — template ${res.rules.recommendedTemplate}`,
      type: "info",
    });
  } else {
    logs.push({
      timestamp: ts(),
      message: `⚙️ LLM unavailable — using validated fallback rules for ${region} (template ${res.rules.recommendedTemplate})`,
      type: "warning",
    });
  }
  logs.push({
    timestamp: ts(),
    message: `Reasoning: template ${res.rules.recommendedTemplate} chosen because ${res.rules.name} conventions for ${region} dictate photo rules, length, and date formats the compiler must respect.`,
    type: "reasoning",
  });
  logs.push({ timestamp: ts(), message: `📋 Formatting rules set for ${res.rules.name} (Template: ${res.rules.recommendedTemplate})`, type: "info" });
  return {
    profile: freshProfile,
    regionalRules: res.rules as unknown as Record<string, unknown>,
    recommendedTemplate: res.rules.recommendedTemplate,
    logs,
  };
}

async function piiSanitizerNode(state: typeof MultiAgentState.State) {
  const freshProfile = loadFreshProfile(state.profile);
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: "🛡️ Agent #4 (VerificationSanitizer) auditing candidate profile for PII compliance...", type: "info" });

  const p = freshProfile as unknown as Record<string, unknown>;
  const sensitiveContent = [
    freshProfile.summary,
    freshProfile.phone,
    p.address,
    p.dateOfBirth,
    p.nationality,
    p.gender,
    p.maritalStatus,
    p.visaStatus,
  ]
    .filter((v): v is string => typeof v === "string" && Boolean(v))
    .join(" | ");

  const res = (await executePiiSanitizerTool({ content: sensitiveContent || "" })) as Awaited<ReturnType<typeof executePiiSanitizerTool>>;
  const llmUsed = (res as { llmUsed?: boolean }).llmUsed;
  const llmReasoning = (res as { llmReasoning?: string | null }).llmReasoning;
  const llmFindings = (res as { llmFindings?: string[] }).llmFindings;
  const meta = (res as { meta?: { ssnHits?: number; dobHits?: number } }).meta;

  if (llmUsed && llmReasoning) {
    const safeReasoning = String(llmReasoning)
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED-SSN]")
      .replace(
        /\b((?:19|20)\d{2}[-/.](?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01])|(?:0[1-9]|[12]\d|3[01])[-/.](?:0[1-9]|1[0-2])[-/.](?:19|20)\d{2}|(?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01])[-/.](?:19|20)\d{2})\b/g,
        "[REDACTED-DOB]"
      )
      .slice(0, 200);
    logs.push({ timestamp: ts(), message: `🧠 LLM PII reasoning: ${safeReasoning}`, type: "reasoning" });
    if (llmFindings && llmFindings.length) {
      logs.push({ timestamp: ts(), message: `🔍 LLM PII findings: ${llmFindings.join(", ")}`, type: "info" });
    }
  } else if (llmUsed) {
    logs.push({
      timestamp: ts(),
      message: `🤖 LLM PII analysis completed — findings: ${llmFindings?.join(", ") || "none"}`,
      type: "info",
    });
  } else {
    logs.push({ timestamp: ts(), message: "⚙️ LLM unavailable — regex guard enforced (SSN/DOB)", type: "info" });
  }

  if (meta && (meta.ssnHits || meta.dobHits)) {
    logs.push({
      timestamp: ts(),
      message: `🛡️ Regex guard enforced — ${meta.ssnHits || 0} SSN and ${meta.dobHits || 0} DOB pattern(s) redacted`,
      type: "info",
    });
  }

  if (res.hasRedactions) {
    logs.push({
      timestamp: ts(),
      message:
        "⚠️ SSN or date-of-birth patterns detected in the profile — these must never appear in generated documents. Full name, contact, and address fields may also be region-restricted.",
      type: "warning",
    });
  }

  return { profile: freshProfile, logs };
}

async function resumeCVTailorNode(state: typeof MultiAgentState.State) {
  const freshProfile = loadFreshProfile(state.profile);
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: "📄 Agent #5 (ResumeCVTailor) tailoring resume — JD + vault + culture + region template...", type: "info" });

  const res = (await executeResumeCVTailorTool({
    jobTitle: state.job.title,
    company: state.job.company,
    jobDescription: state.job.jobDescription,
    region: state.targetRegion,
    userSkills: freshProfile.skills || [],
  })) as Awaited<ReturnType<typeof executeResumeCVTailorTool>> & {
    llmUsed?: boolean;
    llmReasoning?: string | null;
    cultureKeywords?: string[];
    vaultHitsCount?: number;
  };

  const llmUsed = res.llmUsed === true;
  const vaultHitsCount = typeof res.vaultHitsCount === "number" ? res.vaultHitsCount : 0;
  const cultureKeywords = Array.isArray(res.cultureKeywords) ? res.cultureKeywords : [];

  if (llmUsed) {
    logs.push({
      timestamp: ts(),
      message: `🤖 LLM tailoring applied — ${res.matchingSkills.length} matching / ${res.missingSkills.length} missing (vault ${vaultHitsCount} hits, culture: ${cultureKeywords.slice(0, 3).join(", ") || "none"})`,
      type: "info",
    });
    if (res.llmReasoning) {
      logs.push({ timestamp: ts(), message: `🧠 LLM reasoning: ${String(res.llmReasoning).slice(0, 200)}`, type: "reasoning" });
    }
    logs.push({
      timestamp: ts(),
      message: `Reasoning: kept ${res.matchingSkills.length} evidence-backed skills up top and flagged ${res.missingSkills.length} gaps instead of inventing claims — template ${res.recommendedTemplate} stays within ${state.targetRegion} norms.`,
      type: "reasoning",
    });
    logs.push({ timestamp: ts(), message: `📄 Region template respected: ${res.recommendedTemplate} (${state.targetRegion})`, type: "info" });
  } else {
    logs.push({
      timestamp: ts(),
      message: `⚙️ LLM unavailable — fallback extractJdTerms used (${res.matchingSkills.length} matching / ${res.missingSkills.length} missing, template ${res.recommendedTemplate})`,
      type: "warning",
    });
  }
  logs.push({ timestamp: ts(), message: `✨ Matched ${res.matchingSkills.length} skills (${res.missingSkills.length} gaps identified).`, type: "info" });

  return {
    profile: freshProfile,
    matchingSkills: res.matchingSkills,
    missingSkills: res.missingSkills,
    recommendedTemplate: res.recommendedTemplate,
    logs,
  };
}

async function letterTailorNode(state: typeof MultiAgentState.State) {
  const freshProfile = loadFreshProfile(state.profile);
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: "✉️ Agent #6 (LetterTailor) formatting motivational / cover letter etiquette...", type: "info" });
  logs.push({ timestamp: ts(), message: `🔍 LetterTailor researching company ${state.job.company} + regional etiquette ${state.targetRegion} via sidecar /scrape...`, type: "info" });

  const res = (await executeLetterTailorTool({
    jobTitle: state.job.title,
    company: state.job.company,
    jobDescription: state.job.jobDescription,
    region: state.targetRegion,
    kind: "cover_letter",
  })) as Awaited<ReturnType<typeof executeLetterTailorTool>> & {
    llmUsed?: boolean;
    llmReasoning?: string | null;
    meta?: { searchPerformed?: boolean; sourcesCount?: number; source?: string };
    companyResearch?: { sourcesCount: number } | null;
  };

  if (res.meta?.searchPerformed) {
    logs.push({ timestamp: ts(), message: `🔍 LetterTailor sidecar search completed for ${state.targetRegion} etiquette + company research`, type: "info" });
  }
  if (res.llmUsed) {
    logs.push({ timestamp: ts(), message: `🤖 LLM tailored salutation/closing for ${state.targetRegion} — ${res.salutation} … ${res.closing} (company sources: ${res.companyResearch?.sourcesCount ?? res.meta?.sourcesCount ?? 0})`, type: "info" });
    if (res.llmReasoning) logs.push({ timestamp: ts(), message: `🧠 LLM reasoning: ${String(res.llmReasoning).slice(0, 200)}`, type: "reasoning" });
    logs.push({
      timestamp: ts(),
      message: `Reasoning: opening with "${res.salutation}" and closing "${res.closing}" because ${state.targetRegion} cover-letter etiquette expects this register; clichés are stripped to keep the letter human.`,
      type: "reasoning",
    });
  } else {
    logs.push({ timestamp: ts(), message: `⚙️ LLM unavailable — fallback salutation/closing for ${state.targetRegion} (${res.salutation} … ${res.closing})`, type: "warning" });
  }

  const topSkills = state.matchingSkills.slice(0, 3).join(", ");
  const summary = freshProfile?.summary?.slice(0, 180) || "";
  const pitch = topSkills
    ? `${res.salutation} The ${state.job.title} role at ${state.job.company} maps directly to my experience with ${topSkills}. ${
        summary ? summary.trim() + " " : ""
      }I would welcome the chance to talk through how I can help. ${res.closing}`
    : `${res.salutation} ${
        summary || `As a ${freshProfile?.targetTitle || state.job.title} professional,`
      } I would welcome the chance to discuss the ${state.job.title} role at ${state.job.company}. ${res.closing}`;

  logs.push({ timestamp: ts(), message: `✉️ Cover letter drafted using ${res.letterKind} convention (${state.targetRegion}) — kind=cover_letter contract preserved.`, type: "info" });

  return {
    profile: freshProfile,
    tailoredPitch: pitch,
    logs,
  };
}

async function interviewPrepNode(state: typeof MultiAgentState.State) {
  const freshProfile = loadFreshProfile(state.profile);
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: "🎯 Agent #7 (InterviewPrep) STAR topics via sidecar search + companyResearch...", type: "info" });
  logs.push({ timestamp: ts(), message: `🔍 Searching sidecar STAR questions for ${state.job.company} ${state.job.title} + companyResearch via researchCompany...`, type: "info" });

  const res = (await executeInterviewPrepTool({
    jobTitle: state.job.title,
    company: state.job.company,
    jobDescription: state.job.jobDescription,
  })) as Awaited<ReturnType<typeof executeInterviewPrepTool>> & {
    llmUsed?: boolean;
    llmReasoning?: string | null;
    meta?: { searchPerformed?: boolean; sourcesCount?: number; source?: string };
    starSnippet?: string | null;
  };

  if (res.meta?.searchPerformed) {
    logs.push({ timestamp: ts(), message: `🔍 InterviewPrep STAR sidecar search captured${res.starSnippet ? ": snippet" : ""} + companyResearch ${res.meta.sourcesCount ?? 0} sources`, type: "info" });
  }
  if (res.llmUsed) {
    logs.push({ timestamp: ts(), message: `🤖 LLM generated ${res.focusTopics.length} STAR topics grounded in JD + companyResearch ${res.meta?.sourcesCount ?? 0} sources (via sidecar search)`, type: "info" });
    if (res.llmReasoning) logs.push({ timestamp: ts(), message: `🧠 LLM reasoning: ${String(res.llmReasoning).slice(0, 200)}`, type: "reasoning" });
    logs.push({
      timestamp: ts(),
      message: `Reasoning: picked topics "${res.focusTopics.slice(0, 3).join('", "')}" because they map to the JD's seniority signals and the company's current focus, so practice time targets the most likely questions.`,
      type: "reasoning",
    });
  } else {
    logs.push({ timestamp: ts(), message: `⚙️ LLM unavailable — fallback ${res.focusTopics.length} STAR topics (company-specific when research exists) via sidecar search + JD terms`, type: "warning" });
  }
  logs.push({ timestamp: ts(), message: `🎯 InterviewPrep produced ${res.focusTopics.length} topics (5-8, company-specific when research exists)`, type: "info" });

  return {
    profile: freshProfile,
    interviewPrepTopics: res.focusTopics,
    logs,
  };
}

async function salaryIntelNode(state: typeof MultiAgentState.State) {
  const freshProfile = loadFreshProfile(state.profile);
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: `💰 Agent #8 (SalaryIntel) estimating market compensation in ${state.targetRegion}...`, type: "info" });

  const res = await executeSalaryIntelTool({
    jobTitle: state.job.title,
    company: state.job.company,
    location: (state.job as { location?: string }).location,
    region: state.targetRegion,
    jobDescription: state.job.jobDescription,
  });

  logs.push({
    timestamp: ts(),
    message: `Reasoning: anchored the range at ${res.estimatedRange} from ${state.targetRegion} market data for ${state.job.title}${(state.job as { location?: string }).location ? ` in ${(state.job as { location?: string }).location}` : ""} — seniority signals in the JD shift the band more than company prestige.`,
    type: "reasoning",
  });

  return {
    profile: freshProfile,
    salaryEstimate: res.estimatedRange,
    logs,
  };
}

async function outreachEmailNode(state: typeof MultiAgentState.State) {
  const freshProfile = loadFreshProfile(state.profile);
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: "📩 Agent #9 (OutreachEmail) generating recruiter outreach template...", type: "info" });

  const res = await executeOutreachEmailTool({
    type: "linkedin_connect",
    contactName: "Hiring Manager",
    company: state.job.company,
    jobTitle: state.job.title,
  });

  logs.push({
    timestamp: ts(),
    message: `Reasoning: subject "${res.suggestedSubject}" leads with the role, not a sales hook — recruiter inboxes filter vague connect requests, specificity survives triage.`,
    type: "reasoning",
  });

  return {
    profile: freshProfile,
    outreachSubject: res.suggestedSubject,
    logs,
  };
}

async function atsAuditNode(state: typeof MultiAgentState.State) {
  const freshProfile = loadFreshProfile(state.profile);
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: "📊 Agent #10 (ATSAudit) running deterministic ATS parsing rules...", type: "info" });

  const experienceText = (freshProfile.experience ?? [])
    .map((e) => `${e.role} @ ${e.company} (${e.duration})${e.bulletPoints?.length ? "\n" + e.bulletPoints.join("\n") : ""}`)
    .join("\n");
  const educationText = (freshProfile.education ?? [])
    .map((e) => `${e.degree}, ${e.school}${e.year ? ` (${e.year})` : ""}`)
    .join("\n");
  const sampleResume = [freshProfile.summary, experienceText, educationText].filter(Boolean).join("\n");
  const res = await executeAtsAuditTool({
    resumeText: sampleResume,
    jobDescription: state.job.jobDescription,
    atsType: state.atsType,
  });

  const compliance = auditRegionalCompliance(sampleResume, state.targetRegion);
  logs.push({ timestamp: ts(), message: `✅ ATS Audit Score: ${res.overallScore}% (Keyword match: ${res.keywordMatchRate}%)`, type: "success" });
  logs.push({
    timestamp: ts(),
    message: `Reasoning: score ${res.overallScore}% is driven mostly by keyword match (${res.keywordMatchRate}%) against a ${state.atsType} parser${compliance.warnings.length ? `; ${compliance.warnings.length} regional compliance warning(s) lower trust in the layout, not the content.` : " with no regional compliance warnings."}`,
    type: "reasoning",
  });
  logs.push({ timestamp: ts(), message: "⏸ Human review requested — pausing graph for user approval...", type: "warning" });
  logs.push({
    timestamp: ts(),
    message: "Reasoning: fit evidence informs your review, but submission is irreversible, so the graph always parks at the HITL gate for explicit approval.",
    type: "reasoning",
  });

  return {
    profile: freshProfile,
    atsScore: res.overallScore,
    complianceWarnings: compliance.warnings,
    autoApplyStatus: "manual_required" as const,
    logs,
  };
}

async function autoApplyExecutionNode(state: typeof MultiAgentState.State) {
  const freshProfile = loadFreshProfile(state.profile);
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: "🕷️ Agent #11 (AutoApplyExecution) preparing application payload...", type: "info" });

  const decision = interrupt({
    type: "human_review",
    jobId: state.job.id,
    jobTitle: state.job.title,
    company: state.job.company,
    url: state.job.url,
    atsScore: state.atsScore,
    tailoredPitch: state.tailoredPitch,
    recommendedTemplate: state.recommendedTemplate,
    matchingSkills: state.matchingSkills,
    missingSkills: state.missingSkills,
    salaryEstimate: state.salaryEstimate,
  }) as { approved?: boolean; submit?: boolean; editedPitch?: string } | undefined;

  if (!decision) {
    return { profile: freshProfile, autoApplyStatus: "manual_required" as const, logs };
  }

  const resumedProfile = loadFreshProfile(freshProfile);
  let rebuiltContext = "";
  try {
    const ctx = await buildSharedContext({
      profile: resumedProfile,
      jobs: jobsRepo.list(),
      emails: emailsRepo.list(),
      interviews: interviewsRepo.list(),
      reminders: remindersRepo.list(),
      maxTokens: 4000,
    });
    rebuiltContext = ctx.context;
    logs.push({ timestamp: ts(), message: `🔄 Shared context rebuilt with fresh profile (${resumedProfile.name})`, type: "info" });
    rememberUnique("fact", `HITL resume — fresh profile ${resumedProfile.name} rebuilt sharedContext (${ctx.tokens} tokens)`, { jobId: state.job.id, source: "hitl-resume", importance: 2 });
  } catch {}
  const pitchToUse = decision.editedPitch ?? state.tailoredPitch;
  if (decision.approved && decision.submit) {
    logs.push({ timestamp: ts(), message: "👤 Human review APPROVED with submission — driving browser agent...", type: "info" });
    const result = await executeApply({
      url: state.job.url,
      profile: resumedProfile,
      pitch: pitchToUse,
      submit: true,
      matchScore: state.atsScore,
    });
    logs.push(...result.logs);
    return {
      profile: resumedProfile,
      sharedContext: rebuiltContext,
      autoApplyStatus: result.status,
      fields: result.fields,
      tailoredPitch: pitchToUse,
      logs,
    };
  }
  if (decision.approved) {
    logs.push({ timestamp: ts(), message: "👤 Human review APPROVED in prefill mode.", type: "info" });
    return { profile: resumedProfile, sharedContext: rebuiltContext, autoApplyStatus: "manual_required" as const, tailoredPitch: pitchToUse, logs };
  }

  logs.push({ timestamp: ts(), message: "🛑 Application rejected by user.", type: "warning" });
  return { profile: resumedProfile, sharedContext: rebuiltContext, autoApplyStatus: "skipped" as const, logs };
}

async function orchestratorGateNode(state: typeof MultiAgentState.State) {
  const freshProfile = loadFreshProfile(state.profile);
  const logs: AutoApplyLog[] = [];
  logs.push({ timestamp: ts(), message: `🎉 Multi-Agent Pipeline Completed cleanly. Terminal status: ${state.autoApplyStatus}`, type: "success" });
  return { profile: freshProfile, logs };
}

/* ----------------------------- Graph Construction ----------------------------- */

const DEFAULT_RETRY_POLICY = {
  maxAttempts: 3,
  initialInterval: 1000,
  backoffFactor: 2,
};

export function createMultiAgentAppGraph(checkpointer?: SqliteCheckpointSaver) {
  const workflow = new StateGraph(MultiAgentState)
    // Nodes with automatic retry policies for transient network/LLM errors
    .addNode("companyIntel", companyIntelNode, { retryPolicy: DEFAULT_RETRY_POLICY })
    .addNode("regionalNorms", regionalNormsNode, { retryPolicy: DEFAULT_RETRY_POLICY })
    .addNode("piiSanitizer", piiSanitizerNode, { retryPolicy: DEFAULT_RETRY_POLICY })
    .addNode("resumeCVTailor", resumeCVTailorNode, { retryPolicy: DEFAULT_RETRY_POLICY })
    .addNode("letterTailor", letterTailorNode, { retryPolicy: DEFAULT_RETRY_POLICY })
    .addNode("interviewPrep", interviewPrepNode, { retryPolicy: DEFAULT_RETRY_POLICY })
    .addNode("salaryIntel", salaryIntelNode, { retryPolicy: DEFAULT_RETRY_POLICY })
    .addNode("outreachEmail", outreachEmailNode, { retryPolicy: DEFAULT_RETRY_POLICY })
    .addNode("atsAudit", atsAuditNode, { retryPolicy: DEFAULT_RETRY_POLICY })
    .addNode("autoApplyExecution", autoApplyExecutionNode)
    .addNode("orchestratorGate", orchestratorGateNode)

    // Parallel Branching (Fan-Out from START)
    .addEdge(START, "companyIntel")
    .addEdge(START, "regionalNorms")
    .addEdge(START, "piiSanitizer")
    .addEdge(START, "salaryIntel")

    // Fan-In: wait for all three intelligence nodes before tailoring.
    .addEdge(["companyIntel", "regionalNorms", "piiSanitizer"], "resumeCVTailor")

    // Fan-Out from resumeCVTailor: generate secondary assets concurrently
    .addEdge("resumeCVTailor", "letterTailor")
    .addEdge("resumeCVTailor", "interviewPrep")
    .addEdge("resumeCVTailor", "outreachEmail")

    // Fan-In: wait for every tailored asset and market salary before auditing.
    .addEdge(["letterTailor", "interviewPrep", "outreachEmail", "salaryIntel"], "atsAudit")

    // Final execution sequence
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
    },
    { configurable: { thread_id: threadId } }
  );

  // Store in SQLite database run history
  agentRunHistoryRepo.log({
    threadId,
    jobId: input.job.id,
    agentName: "MasterMultiAgentOrchestrator",
    status: finalState.autoApplyStatus || "manual_required",
    region: input.targetRegion || "US",
    atsScore: finalState.atsScore,
    reasoning: `Target Region: ${input.targetRegion || "US"}. Template chosen: ${finalState.recommendedTemplate}. Match Score: ${finalState.atsScore}%.`,
    findings: JSON.stringify({
      matchingSkills: finalState.matchingSkills,
      missingSkills: finalState.missingSkills,
      salaryEstimate: finalState.salaryEstimate,
      outreachSubject: finalState.outreachSubject,
      companyResearch: finalState.companyResearch,
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
    companyResearch: finalState.companyResearch,
    fields: finalState.fields,
    logs: finalState.logs,
  };
}

/**
 * Stream real-time node transitions, logs, and partial updates over SSE.
 */
export async function streamMultiAgentApp(
  input: MultiAgentInput,
  onEvent: (event: MultiAgentStreamEvent) => void
) {
  const checkpointer = new SqliteCheckpointSaver();
  const app = createMultiAgentAppGraph(checkpointer);
  const threadId = input.threadId || `thread_stream_${Date.now()}`;

  const stream = await app.stream(
    {
      job: input.job,
      profile: input.profile,
      targetRegion: input.targetRegion || "US",
      submit: input.submit ?? false,
    },
    { configurable: { thread_id: threadId }, streamMode: "updates" }
  );

  let finalState: Partial<typeof MultiAgentState.State> = {};
  const accumulatedLogs: AutoApplyLog[] = [];

  for await (const step of stream) {
    if (!step || typeof step !== "object") continue;
    const update = step as Record<string, Record<string, unknown>>;
    for (const [nodeName, partial] of Object.entries(update)) {
      if (nodeName === "__interrupt__") {
        onEvent({
          kind: "interrupt",
          node: "autoApplyExecution",
          data: partial,
          message: "Human review is required before this application can continue.",
        });
        continue;
      }
      onEvent({ kind: "node_finish", node: nodeName, data: partial });
      if (Array.isArray(partial.logs)) {
        for (const l of partial.logs as AutoApplyLog[]) {
          accumulatedLogs.push(l);
          onEvent({ kind: "log", log: l, node: nodeName });
        }
      }
      finalState = { ...finalState, ...partial };
    }
  }

  onEvent({
    kind: "complete",
    data: {
      threadId,
      status: finalState.autoApplyStatus,
      atsScore: finalState.atsScore,
      companyResearch: finalState.companyResearch,
      logs: accumulatedLogs,
    },
  });

  return {
    threadId,
    finalState,
    logs: accumulatedLogs,
  };
}

/**
 * Resume an interrupted LangGraph run with the user's review decision.
 */
export async function resumeMultiAgentApp(
  threadId: string,
  resumeData: { approved: boolean; submit?: boolean; editedPitch?: string }
) {
  const fallbackProfile = (() => {
    try {
      const raw = settingsRepo.get("profile");
      if (raw) return JSON.parse(raw) as UserProfile;
    } catch {}
    return null;
  })();
  let rebuiltContext = "";
  if (fallbackProfile) {
    try {
      const ctx = await buildSharedContext({
        profile: fallbackProfile,
        jobs: jobsRepo.list(),
        emails: emailsRepo.list(),
        interviews: interviewsRepo.list(),
        reminders: remindersRepo.list(),
        maxTokens: 4000,
      });
      rebuiltContext = ctx.context;
      rememberUnique("fact", `resumeMultiAgentApp rebuilt sharedContext for ${threadId} with fresh profile ${fallbackProfile.name} (${ctx.tokens} tokens)`, { source: "hitl-resume", importance: 1 });
    } catch {}
  }

  const checkpointer = new SqliteCheckpointSaver();
  const app = createMultiAgentAppGraph(checkpointer);

  const finalState = await app.invoke(
    new Command({ resume: resumeData }),
    { configurable: { thread_id: threadId } }
  );

  const tailoredPitch = resumeData.editedPitch || finalState.tailoredPitch;
  const mergedSharedContext = (finalState.sharedContext as string) || rebuiltContext;

  return {
    threadId,
    status: finalState.autoApplyStatus,
    atsScore: finalState.atsScore,
    tailoredPitch,
    fields: finalState.fields,
    logs: finalState.logs,
    sharedContext: mergedSharedContext,
    profile: finalState.profile ?? fallbackProfile,
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
      companyResearch: finalState.companyResearch,
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
    companyResearch: finalState.companyResearch,
    logs: finalState.logs,
  };
}
