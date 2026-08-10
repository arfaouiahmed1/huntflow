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

export async function executeCompanyIntelTool(input: z.infer<typeof CompanyIntelSchema>, settings?: LLMSettings) {
  try {
    const jsonResult = await generateJSON<{ atsType: string; cultureKeywords: string[]; summary: string; }>(
      settings,
      "You are an expert HR analyst.",
      companyIntelPrompt(input.jobDescription, input.company)
    );
    return {
      success: true,
      ...jsonResult,
    };
  } catch {
    return {
      success: true,
      atsType: "generic",
      cultureKeywords: ["Innovation", "Impact", "Collaboration"],
      summary: "Company focused on standard modern engineering practices.",
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
  return {
    success: true,
    focusTopics: terms,
    questionsCount: 5,
  };
}

export async function executeSalaryIntelTool(input: z.infer<typeof SalaryIntelSchema>, settings?: LLMSettings) {
  try {
    const result = await generateJSON<{ estimatedRange: string; confidence: string }>(
      settings,
      "You are a compensation analyst.",
      salaryIntelPrompt(input.jobTitle, input.company, input.location)
    );
    return {
      success: true,
      role: input.jobTitle,
      company: input.company,
      estimatedRange: result.estimatedRange,
      confidence: result.confidence,
    };
  } catch {
    return {
      success: true,
      role: input.jobTitle,
      company: input.company,
      estimatedRange: "$100,000 - $150,000 USD",
      confidence: "low",
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
