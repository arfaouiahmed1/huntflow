import { z } from "zod";
import { LLMSettings } from "@/lib/llm/providers";
import { extractJdTerms } from "@/lib/prompts";
import { getRegionalRules, auditRegionalCompliance, RegionCode } from "../regionalNorms";
import { RESUME_TEMPLATES } from "@/lib/pdf/resumeTemplates";
import { generateText, generateJSON } from "@/lib/llm/client";
import { companyIntelPrompt, salaryIntelPrompt, outreachEmailPrompt } from "@/lib/prompts/multiAgentPrompts";

/* ------------------------------------------------------------------ *
 * Zod Schemas for Multi-Agent Tools
 * ------------------------------------------------------------------ */

export const CompanyIntelSchema = z.object({
  company: z.string(),
  jobDescription: z.string(),
});

export const RegionalNormsSchema = z.object({
  region: z.string(),
  resumeText: z.string().optional(),
});

export const PiiSanitizerSchema = z.object({
  content: z.string(),
});

export const ResumeCVTailorSchema = z.object({
  jobTitle: z.string(),
  company: z.string(),
  jobDescription: z.string(),
  region: z.string().default("US"),
  userSkills: z.array(z.string()),
});

export const LetterTailorSchema = z.object({
  jobTitle: z.string(),
  company: z.string(),
  jobDescription: z.string(),
  region: z.string().default("US"),
  kind: z.enum(["cover_letter", "motivation_letter"]).optional().default("cover_letter"),
});

export const InterviewPrepSchema = z.object({
  jobTitle: z.string(),
  company: z.string(),
  jobDescription: z.string(),
});

export const SalaryIntelSchema = z.object({
  jobTitle: z.string(),
  company: z.string(),
  location: z.string().optional(),
  jobDescription: z.string().optional(),
});

export const OutreachEmailSchema = z.object({
  type: z.enum(["linkedin_connect", "recruiter_followup", "thank_you"]),
  contactName: z.string(),
  company: z.string(),
  jobTitle: z.string().optional(),
});

export const AtsAuditSchema = z.object({
  resumeText: z.string(),
  jobDescription: z.string(),
  atsType: z.string().default("generic"),
});

/* ------------------------------------------------------------------ *
 * Tool Execution Handlers
 * ------------------------------------------------------------------ */

/** Detect an ATS vendor when the posting names it; otherwise "generic". */
function detectAtsType(jd: string): string {
  const lower = jd.toLowerCase();
  if (/greenhouse/i.test(lower)) return "greenhouse";
  if (/lever/i.test(lower)) return "lever";
  if (/workday/i.test(lower)) return "workday";
  if (/taleo|oracle recruiting/i.test(lower)) return "taleo";
  if (/ashby/i.test(lower)) return "ashby";
  return "generic";
}

/** Derive culture signals from the posting itself instead of hardcoding. */
function cultureKeywordsFromJd(jd: string): string[] {
  const lower = jd.toLowerCase();
  const signals: string[] = [];
  if (/remote|distributed|async|work from home|wfh/i.test(lower)) signals.push("Remote-first");
  if (/hybrid|flexible schedule|flexible work/i.test(lower)) signals.push("Hybrid / flexible");
  if (/fast.paced|agile|sprint|velocity|move fast/i.test(lower)) signals.push("Fast-paced");
  if (/startup|seed|series|scale.?up|pre.?ipo/i.test(lower)) signals.push("Startup / scale-up");
  if (/enterprise|fortune|large.?(company|org)/i.test(lower)) signals.push("Enterprise");
  if (/collaborat|team|cross.functional|pair|inclusive/i.test(lower)) signals.push("Collaborative");
  if (/ownership|autonom|initiative|self.?driven/i.test(lower)) signals.push("Ownership-driven");
  if (/growth|hiring|expanding|scal/i.test(lower)) signals.push("Growth phase");
  if (/impact|mission|purpose|make a difference/i.test(lower)) signals.push("Impact-focused");
  return signals.length ? signals.slice(0, 6) : ["Standard professional culture"];
}

export async function executeCompanyIntelTool(input: z.infer<typeof CompanyIntelSchema>, settings?: LLMSettings) {
  try {
    const jsonResult = await generateJSON<{ atsType: string; cultureKeywords: string[]; summary: string; }>(
      settings,
      "You are an expert HR analyst.",
      companyIntelPrompt(input.jobDescription, input.company)
    );
    return {
      success: true,
      atsType: typeof jsonResult.atsType === "string" && jsonResult.atsType ? jsonResult.atsType : detectAtsType(input.jobDescription),
      cultureKeywords: Array.isArray(jsonResult.cultureKeywords) ? jsonResult.cultureKeywords.slice(0, 8) : cultureKeywordsFromJd(input.jobDescription),
      summary: typeof jsonResult.summary === "string" ? jsonResult.summary : "",
    };
  } catch {
    return {
      success: true,
      atsType: detectAtsType(input.jobDescription),
      cultureKeywords: cultureKeywordsFromJd(input.jobDescription),
      summary: `Deterministic scan of the posting (offline): ${cultureKeywordsFromJd(input.jobDescription).join(", ").toLowerCase()}.`,
    };
  }
}

export async function executeRegionalNormsTool(input: z.infer<typeof RegionalNormsSchema>) {
  const code = (input.region || "US").toUpperCase() as RegionCode;
  const rules = getRegionalRules(code);
  const audit = input.resumeText ? auditRegionalCompliance(input.resumeText, code) : null;

  return {
    success: true,
    rules,
    audit,
  };
}

export async function executePiiSanitizerTool(input: z.infer<typeof PiiSanitizerSchema>) {
  const sanitized = input.content
    // US Social Security Numbers: 123-45-6789
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED-SSN]")
    // Full date-of-birth patterns: YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, MM/DD/YYYY
    .replace(/\b((?:19|20)\d{2}[-/.](?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01])|(?:0[1-9]|[12]\d|3[01])[-/.](?:0[1-9]|1[0-2])[-/.](?:19|20)\d{2})\b/g, "[REDACTED-DOB]");

  return {
    success: true,
    sanitizedContent: sanitized,
    hasRedactions: sanitized !== input.content,
  };
}

export async function executeResumeCVTailorTool(input: z.infer<typeof ResumeCVTailorSchema>) {
  const terms = extractJdTerms(input.jobDescription, input.userSkills);
  const regionCode = (input.region || "US").toUpperCase() as RegionCode;
  const rules = getRegionalRules(regionCode);
  const template = RESUME_TEMPLATES.find((t) => t.id === rules.recommendedTemplate) || RESUME_TEMPLATES[0];

  return {
    success: true,
    matchingSkills: terms.filter((t) => t.inResume).map((t) => t.term),
    missingSkills: terms.filter((t) => !t.inResume).map((t) => t.term),
    recommendedTemplate: template.id,
    templateMeta: template,
  };
}

export async function executeLetterTailorTool(input: z.infer<typeof LetterTailorSchema>) {
  const regionCode = (input.region || "US").toUpperCase() as RegionCode;
  const rules = getRegionalRules(regionCode);

  return {
    success: true,
    salutation: rules.salutationFormat,
    closing: rules.closingFormat,
    letterKind: input.kind || rules.letterKind,
  };
}

export async function executeInterviewPrepTool(input: z.infer<typeof InterviewPrepSchema>) {
  const terms = extractJdTerms(input.jobDescription, []).slice(0, 5).map((t) => t.term);
  const jd = (input.jobDescription || "").toLowerCase();
  const focusTopics: string[] = [];
  for (const t of terms) {
    focusTopics.push(
      `Hands-on depth on ${t}: be ready to explain real usage, tradeoffs, and a concrete example from your work.`
    );
  }
  const signalTopics: Array<[RegExp, string]> = [
    [/lead|manage|mentor|team|stakeholder/i, "Leadership and alignment: prepare 1-2 stories about leading work or unblocking a team."],
    [/remote|distributed|async/i, "Remote collaboration: how you communicate, document decisions, and stay aligned async."],
    [/startup|fast.paced|ambiguous|scale|growth/i, "Ownership under ambiguity: a story where you took initiative without clear direction."],
    [/legacy|migrat|refactor|moderni/i, "Migration and modernization: tradeoffs you made and how you de-risked the change."],
    [/customer|user|product|impact|metric/i, "User-facing impact: connect your work to a measurable outcome."],
    [/incident|on.?call|reliab|sre/i, "Reliability and incidents: how you diagnose, respond, and prevent recurrence."],
  ];
  for (const [re, topic] of signalTopics) {
    if (re.test(jd)) focusTopics.push(topic);
  }
  return {
    success: true,
    focusTopics: focusTopics.slice(0, 8),
    questionsCount: focusTopics.length,
  };
}

export async function executeSalaryIntelTool(input: z.infer<typeof SalaryIntelSchema>, settings?: LLMSettings) {
  try {
    const result = await generateJSON<{ estimatedRange: string; confidence: string }>(
      settings,
      "You are a compensation analyst.",
      salaryIntelPrompt(input.jobTitle, input.company, input.location, input.jobDescription)
    );
    return {
      success: true,
      role: input.jobTitle,
      company: input.company,
      estimatedRange: result.estimatedRange,
      confidence: result.confidence,
    };
  } catch {
    const jd = input.jobDescription || "";
    const disclosed = jd.match(/\$\s?\d[\d,]*k?\s*[-–]\s*\$\s?\d[\d,]*k?/i);
    if (disclosed) {
      return {
        success: true,
        role: input.jobTitle,
        company: input.company,
        estimatedRange: disclosed[0].replace(/\s+/g, " "),
        confidence: "high",
      };
    }
    const senior = /senior|lead|principal|staff|sr\.?/i.test(input.jobTitle) ? 1.25 : 1;
    const base = /ai|ml|llm|machine|data/i.test(jd) ? 165000 : 140000;
    const low = Math.round((base * senior) / 1000) * 1000;
    const high = Math.round((base * senior * 1.35) / 1000) * 1000;
    return {
      success: true,
      role: input.jobTitle,
      company: input.company,
      estimatedRange: `$${low.toLocaleString()} - $${high.toLocaleString()} USD (market estimate)`,
      confidence: "medium",
    };
  }
}

export async function executeOutreachEmailTool(input: z.infer<typeof OutreachEmailSchema>, settings?: LLMSettings) {
  try {
    const result = await generateText(
      settings,
      "You are an expert career coach writing outreach email subjects.",
      outreachEmailPrompt(input.type, input.contactName, input.company, input.jobTitle)
    );
    return {
      success: true,
      type: input.type,
      suggestedSubject: result.text.trim(),
    };
  } catch {
    return {
      success: true,
      type: input.type,
      suggestedSubject: `Inquiry regarding ${input.jobTitle || 'opportunities'} at ${input.company}`,
    };
  }
}

export async function executeAtsAuditTool(input: z.infer<typeof AtsAuditSchema>) {
  const terms = extractJdTerms(input.jobDescription, []);
  const lowerText = input.resumeText.toLowerCase();
  const matched = terms.filter((t) => lowerText.includes(t.term.toLowerCase())).map((t) => t.term);
  const missing = terms.filter((t) => !lowerText.includes(t.term.toLowerCase())).map((t) => t.term);
  const matchRate = terms.length ? Math.round((matched.length / terms.length) * 100) : 100;

  return {
    success: true,
    overallScore: matchRate,
    keywordMatchRate: matchRate,
    matchedKeywords: matched,
    missingKeywords: missing,
  };
}
