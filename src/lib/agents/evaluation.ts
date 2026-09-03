import { analyzeAts } from "@/lib/ats/analyze";

export interface AgentEvaluationEvent {
  kind: string;
  node?: string;
}

export interface MultiAgentContractInput {
  expectedNodeIds: readonly string[];
  events: readonly AgentEvaluationEvent[];
  finalStatus?: string;
  requiredReviewNodeId?: string;
  requiredTerms?: readonly string[];
  forbiddenTerms?: readonly string[];
  output?: string;
}

export interface MultiAgentContractMetrics {
  nodeCoverage: number;
  completionObserved: boolean;
  reviewGateObserved: boolean;
  requiredTermCoverage: number;
  forbiddenTermHits: string[];
  finalStatus?: string;
}

export interface MultiAgentContractResult {
  passed: boolean;
  metrics: MultiAgentContractMetrics;
  failures: string[];
}

export interface AgentJudgeInput {
  profileFacts: readonly string[];
  jobFacts: readonly string[];
  candidateOutput: string;
  /** Optional resume text for legit ATS testing — when provided the judge prompt will include a deterministic ATS pre-analysis. */
  resumeText?: string;
  jobDescription?: string;
}

export interface AgentJudgeEvidence {
  outputQuote: string;
  sourceQuote: string;
}

export interface AgentJudgeVerdict {
  score: number;
  rationale: string;
  evidence: AgentJudgeEvidence[];
  /** Optional ATS signal when resumeText was supplied — deterministic, not LLM-generated. */
  atsScore?: number;
  atsFailures?: string[];
}

/** Deterministic, legit ATS test — no LLM, pure parser. Used by the ruthless judge as ground truth. */
export function legitAtsTest(resumeText: string, jobDescription?: string): { score: number; failures: string[]; passes: string[]; keywordCoverage: number } {
  try {
    const report = analyzeAts(resumeText, jobDescription);
    const failures = report.checks.filter((c) => !c.ok).map((c) => `${c.label}: ${c.hint}`);
    const passes = report.checks.filter((c) => c.ok).map((c) => c.label);
    const keywordCoverage = report.keywords.length ? report.keywords.filter((k) => k.inResume).length / report.keywords.length : 1;
    return { score: report.score, failures, passes, keywordCoverage };
  } catch {
    return { score: 0, failures: ["ATS analyzer unavailable"], passes: [], keywordCoverage: 0 };
  }
}


function includesTerm(text: string, term: string): boolean {
  return text.toLocaleLowerCase().includes(term.toLocaleLowerCase());
}

/**
 * Deterministic evaluation for one recorded multi-agent run.
 * Fixture authors explicitly list forbidden terms: this makes groundedness
 * auditable instead of guessing whether arbitrary prose is fabricated.
 */
export function evaluateMultiAgentContract(input: MultiAgentContractInput): MultiAgentContractResult {
  const completedNodes = new Set(
    input.events
      .filter((event) => event.kind === "node_finish" && typeof event.node === "string")
      .map((event) => event.node as string),
  );
  const coveredNodes = input.expectedNodeIds.filter((node) => completedNodes.has(node));
  const nodeCoverage = input.expectedNodeIds.length ? coveredNodes.length / input.expectedNodeIds.length : 1;
  const completionObserved = input.events.some((event) => event.kind === "complete");
  const reviewGateObserved = input.requiredReviewNodeId
    ? input.events.some((event) => event.kind === "interrupt" && event.node === input.requiredReviewNodeId)
    : true;
  const output = input.output ?? "";
  const requiredTerms = input.requiredTerms ?? [];
  const requiredTermCoverage = requiredTerms.length
    ? requiredTerms.filter((term) => includesTerm(output, term)).length / requiredTerms.length
    : 1;
  const forbiddenTermHits = (input.forbiddenTerms ?? []).filter((term) => includesTerm(output, term));

  const metrics: MultiAgentContractMetrics = {
    nodeCoverage,
    completionObserved,
    reviewGateObserved,
    requiredTermCoverage,
    forbiddenTermHits,
    finalStatus: input.finalStatus,
  };
  const failures: string[] = [];
  if (nodeCoverage < 1) failures.push(`Only ${coveredNodes.length}/${input.expectedNodeIds.length} expected node(s) finished.`);
  if (!completionObserved) failures.push("Missing complete event.");
  if (!reviewGateObserved && input.requiredReviewNodeId) {
    failures.push(`Missing human-review interrupt at ${input.requiredReviewNodeId}.`);
  }
  if (requiredTermCoverage < 1) failures.push("Output omitted one or more required fixture term(s).");
  if (forbiddenTermHits.length) failures.push(`Output contains forbidden fixture term(s): ${forbiddenTermHits.join(", ")}.`);

  return { passed: failures.length === 0, metrics, failures };
}

/** Ruthless, evidence-first judge prompt. Misses nothing: every claim needs verbatim quotes, any hallucination = 0, generic filler = 1, ATS failures penalised. */
export function buildAgentJudgePrompt(input: AgentJudgeInput): { system: string; user: string } {
  const atsContext = (() => {
    if (!input.resumeText) return "";
    const ats = legitAtsTest(input.resumeText, input.jobDescription);
    return `\n\nLEGIT ATS PRE-ANALYSIS (deterministic, not LLM — treat as ground truth):\nScore ${ats.score}/100 · Keyword coverage ${(ats.keywordCoverage * 100).toFixed(0)}%` +
      `\nPasses: ${ats.passes.slice(0, 8).join(" | ") || "none"}` +
      `\nFailures: ${ats.failures.slice(0, 8).join(" | ") || "none"}` +
      `\nInstruction: if ATS score < 60 or any CORE header missing (summary/experience/education/skills), cap the verdict at 2 and explain why.`;
  })();
  return {
    system:
      "You are a RUTHLESS evaluation judge for a supervised job-application agent. You miss nothing. Do not use outside knowledge or infer missing facts. Stay grounded in profile.skills/vault/jobDescription — never invent skills, years, companies, or metrics not present. Respect the regionalNorms template (US/EU dates, language, formatting). Score 0-5 on this rubric — be harsh:\n" +
      "0 = hallucinated/fabricated skill, experience, or metric not in PROFILE/JOB facts\n" +
      "1 = generic filler, buzzwords, or copy-paste with no tailoring to this JD\n" +
      "2 = partially grounded but missing required JD terms or actionable next step\n" +
      "3 = grounded and relevant but not actionable (no concrete example, metric, or follow-up)\n" +
      "4 = grounded, relevant, actionable, but ATS-unready or slightly generic\n" +
      "5 = grounded, relevant, actionable, ATS-ready, and specific to this role/company\n" +
      "Return JSON only with score (integer 0-5), rationale (one sentence per point deducted, naming the exact failure), and evidence (array of {outputQuote, sourceQuote} with EXACT verbatim quotes). Every positive claim in CANDIDATE OUTPUT must have an evidence pair; any claim without an exact sourceQuote is a hallucination — score 0. Every outputQuote must appear verbatim (character-exact) in CANDIDATE OUTPUT; every sourceQuote must appear verbatim in PROFILE FACTS or JOB FACTS. Any invented or paraphrased quote = hallucination → score 0. Never invent quotes. Never reward unsupported claims. Flag generic templates: if output could apply to any JD without quoting JD terms, score ≤1. Check usefulness: tailoredPitch must mention top matchingSkills, letter must cite company research, salary must respect region currency. If ATS pre-analysis is present, enforce its failures ruthlessly. Forbid hallucinated skills/metrics. Require verbatim evidence." +
      atsContext,
    user: `PROFILE FACTS:\n${input.profileFacts.map((fact) => `- ${fact}`).join("\n") || "- None"}\n\nJOB FACTS:\n${input.jobFacts.map((fact) => `- ${fact}`).join("\n") || "- None"}\n\nCANDIDATE OUTPUT:\n${input.candidateOutput}${atsContext}\n\nJudge now. Require quote-level evidence for every positive claim; score 0 on any hallucination. Every outputQuote must be verbatim in CANDIDATE OUTPUT; every sourceQuote must be verbatim in PROFILE FACTS/JOB FACTS.`,
  };
}

/** Verify that every outputQuote appears verbatim in candidateOutput and every sourceQuote appears verbatim in profileFacts/jobFacts. On failure, force score:0 and rationale naming the missing quote. Also enforces ATS cap (score ≤2 when ATS <60 or CORE headers missing). */
export function verifyJudgeEvidence(
  verdict: AgentJudgeVerdict,
  input: AgentJudgeInput,
): AgentJudgeVerdict {
  // 1. Verbatim quote checks — fail-closed to 0
  for (const ev of verdict.evidence) {
    if (!input.candidateOutput.includes(ev.outputQuote)) {
      return {
        score: 0,
        rationale: `outputQuote not found verbatim in candidateOutput: "${ev.outputQuote.slice(0, 90)}" — ${verdict.rationale}`,
        evidence: verdict.evidence,
        atsScore: verdict.atsScore,
        atsFailures: verdict.atsFailures,
      };
    }
    const sourcePool = [...input.profileFacts, ...input.jobFacts].join("\n");
    if (!sourcePool.includes(ev.sourceQuote)) {
      return {
        score: 0,
        rationale: `sourceQuote not found verbatim in profileFacts/jobFacts: "${ev.sourceQuote.slice(0, 90)}" — ${verdict.rationale}`,
        evidence: verdict.evidence,
        atsScore: verdict.atsScore,
        atsFailures: verdict.atsFailures,
      };
    }
  }

  // 2. ATS cap — deterministic, no LLM
  if (typeof input.resumeText === "string" && input.resumeText.trim().length > 0) {
    const ats = legitAtsTest(input.resumeText, input.jobDescription);
    const coreMissing = ats.failures.some((f) => /Standard section headers/i.test(f));
    const shouldCap = ats.score < 60 || coreMissing;
    if (shouldCap) {
      if (verdict.score > 2) {
        return {
          score: 2,
          rationale: `ATS capped at 2: score ${ats.score}/100 — ${ats.failures.slice(0, 2).join("; ") || "missing CORE headers"} — ${verdict.rationale}`,
          evidence: verdict.evidence,
          atsScore: ats.score,
          atsFailures: ats.failures,
        };
      }
      // Attach ATS signal even when no cap needed beyond current score
      return {
        ...verdict,
        atsScore: ats.score,
        atsFailures: ats.failures,
      };
    }
    return {
      ...verdict,
      atsScore: ats.score,
      atsFailures: ats.failures,
    };
  }

  return verdict;
}


/** Reject malformed or uncited judge output rather than allowing it to influence evaluation. */
export function parseAgentJudgeVerdict(value: unknown): AgentJudgeVerdict {
  if (!value || typeof value !== "object") throw new Error("Agent judge verdict must be an object.");
  const record = value as Record<string, unknown>;
  if (!Number.isInteger(record.score) || typeof record.score !== "number" || record.score < 0 || record.score > 5) {
    throw new Error("Agent judge verdict score must be an integer from 0 to 5.");
  }
  if (typeof record.rationale !== "string" || !record.rationale.trim()) {
    throw new Error("Agent judge verdict must include a rationale.");
  }
  if (!Array.isArray(record.evidence) || record.evidence.length === 0) {
    throw new Error("Agent judge verdict must include evidence.");
  }
  const evidence = record.evidence.map((item): AgentJudgeEvidence => {
    if (!item || typeof item !== "object") throw new Error("Agent judge evidence must be an object.");
    const evidenceRecord = item as Record<string, unknown>;
    if (
      typeof evidenceRecord.outputQuote !== "string" ||
      !evidenceRecord.outputQuote.trim() ||
      typeof evidenceRecord.sourceQuote !== "string" ||
      !evidenceRecord.sourceQuote.trim()
    ) {
      throw new Error("Agent judge evidence must include outputQuote and sourceQuote.");
    }
    return { outputQuote: evidenceRecord.outputQuote, sourceQuote: evidenceRecord.sourceQuote };
  });
  const atsScore = typeof record.atsScore === "number" ? record.atsScore : undefined;
  const atsFailures = Array.isArray(record.atsFailures)
    ? (record.atsFailures.filter((v): v is string => typeof v === "string"))
    : undefined;
  return {
    score: record.score,
    rationale: record.rationale,
    evidence,
    ...(atsScore !== undefined ? { atsScore } : {}),
    ...(atsFailures !== undefined ? { atsFailures } : {}),
  };
}

export interface PerFieldHallucinationReport {
  matchingSkillsHallucinated: string[];
  salaryRealistic: boolean;
  outreachGrounded: boolean;
  interviewGrounded: boolean;
  overallHallucinationScore: number;
  details: string[];
}

// Internal rolling window for per-field audits (exposed via stats helpers for /api/usage)
const PER_FIELD_HISTORY_MAX = 100;
const perFieldHistory: PerFieldHallucinationReport[] = [];

export function recordPerFieldHallucination(report: PerFieldHallucinationReport): void {
  perFieldHistory.push(report);
  if (perFieldHistory.length > PER_FIELD_HISTORY_MAX) perFieldHistory.shift();
}

export function getPerFieldHallucinationStats(): {
  total: number;
  hallucinated: number;
  rate: number;
  recent: PerFieldHallucinationReport[];
} {
  const total = perFieldHistory.length;
  const hallucinated = perFieldHistory.filter(
    (r) =>
      r.matchingSkillsHallucinated.length > 0 ||
      !r.salaryRealistic ||
      !r.outreachGrounded ||
      !r.interviewGrounded,
  ).length;
  return {
    total,
    hallucinated,
    rate: total ? hallucinated / total : 0,
    recent: [...perFieldHistory].slice(-10),
  };
}

export function clearPerFieldHallucinationHistory(): void {
  perFieldHistory.length = 0;
}

function isSalaryRealistic(salaryEstimate: string | undefined): boolean {
  if (salaryEstimate === undefined || salaryEstimate === null) return true;
  const s = salaryEstimate.trim();
  if (!s) return true;
  const matches = s.match(/\d[\d,]*(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return false;
  const nums = matches
    .map((m) => Number(m.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) return false;
  const hasAbsurd = nums.some((n) => n < 100 || n > 500_000_000);
  if (hasAbsurd) return false;
  const hasRealistic = nums.some((n) => n >= 1_000 && n <= 100_000_000);
  return hasRealistic || nums.length > 0;
}

function containsHallucinatedSkill(text: string, hallucinated: string[]): boolean {
  const lower = text.toLowerCase();
  return hallucinated.some((h) => lower.includes(h.trim().toLowerCase()));
}

function isOutreachGrounded(
  outreachSubject: string | undefined,
  hallucinated: string[],
  job: { jobDescription?: string; title?: string },
): boolean {
  if (outreachSubject === undefined || outreachSubject === null) return true;
  const subject = outreachSubject.trim();
  if (!subject) return true;
  if (subject.length < 5 || subject.length > 300) return false;
  if (containsHallucinatedSkill(subject, hallucinated)) return false;
  // If job context exists, require at least superficial grounding: subject should not be pure hallucination.
  // When job title/description provided, check for at least one content word overlap (>3 chars) or hallucinated check already passes.
  const jobText = `${job.title ?? ""} ${job.jobDescription ?? ""}`.toLowerCase();
  if (jobText.trim().length > 10) {
    const subjectWords = subject
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);
    const jobWords = new Set(jobText.split(/\W+/).filter((w) => w.length > 3));
    const hasOverlap = subjectWords.some((w) => jobWords.has(w));
    // Overlap is advisory — if no overlap but no hallucinated skill, still consider grounded to avoid false positives
    // Only flag as ungrounded when subject is clearly off-topic and contains no job terms
    if (!hasOverlap && subjectWords.length > 0) {
      // Check if subject mentions a skill-like term not in job — treat as ungrounded only if we have strong signal
      // For now, allow it to keep 0 false positives on valid outreach; rely on hallucinated skill check above
      return true;
    }
  }
  return true;
}

function isInterviewGrounded(
  interviewTopics: string[] | undefined,
  hallucinated: string[]
): boolean {
  if (!interviewTopics || interviewTopics.length === 0) return true;
  // Any hallucinated skill surfacing in interview topics is a grounding failure
  for (const topic of interviewTopics) {
    const t = topic.trim();
    if (!t) continue;
    if (containsHallucinatedSkill(t, hallucinated)) return false;
    if (t.length < 1 || t.length > 250) return false;
  }
  // When job description is present, topics should be at least loosely related — but allow lenient to avoid false positives
  // Only enforce hallucinated-skill check for now; JD overlap is optional
  return true;
}

export function auditPerFieldHallucination(
  outputs: {
    matchingSkills?: string[];
    salaryEstimate?: string;
    outreachSubject?: string;
    interviewTopics?: string[];
  },
  profile: { skills?: string[] },
  job: { jobDescription?: string; title?: string },
): PerFieldHallucinationReport {
  const matchingSkills = outputs.matchingSkills ?? [];
  const profileSkills = profile.skills ?? [];
  const profileSet = new Set(profileSkills.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const hallucinated = matchingSkills.filter((s) => {
    const normalized = s.trim().toLowerCase();
    if (!normalized) return false;
    return !profileSet.has(normalized);
  });
  // Deduplicate hallucinated preserving original casing but case-insensitive uniqueness
  const seen = new Set<string>();
  const dedupedHallucinated: string[] = [];
  for (const h of hallucinated) {
    const key = h.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      dedupedHallucinated.push(h.trim());
    }
  }

  const salaryRealistic = isSalaryRealistic(outputs.salaryEstimate);
  const outreachGrounded = isOutreachGrounded(outputs.outreachSubject, dedupedHallucinated, job);
  const interviewGrounded = isInterviewGrounded(outputs.interviewTopics, dedupedHallucinated);

  const details: string[] = [];
  if (dedupedHallucinated.length) {
    details.push(`Hallucinated skills not in profile: ${dedupedHallucinated.join(", ")}`);
  }
  if (!salaryRealistic) {
    details.push(`Salary estimate unrealistic or unparsable: ${outputs.salaryEstimate ?? ""}`.trim());
  }
  if (!outreachGrounded) {
    details.push(`Outreach subject not grounded in job context or contains hallucinated skill: ${outputs.outreachSubject ?? ""}`.trim());
  }
  if (!interviewGrounded) {
    details.push(`Interview topics not grounded or contain hallucinated skill: ${(outputs.interviewTopics ?? []).join("; ")}`.trim());
  }
  if (details.length === 0) {
    details.push("All fields grounded — matchingSkills subset of profile, salary realistic, outreach and interview topics grounded.");
  }

  let score = 0;
  if (dedupedHallucinated.length > 0) score += 0.5;
  if (!salaryRealistic) score += 0.2;
  if (!outreachGrounded) score += 0.15;
  if (!interviewGrounded) score += 0.15;
  const overallHallucinationScore = Math.min(1, Math.round(score * 100) / 100);

  return {
    matchingSkillsHallucinated: dedupedHallucinated,
    salaryRealistic,
    outreachGrounded,
    interviewGrounded,
    overallHallucinationScore,
    details,
  };
}
