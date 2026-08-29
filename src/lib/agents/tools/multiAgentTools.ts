import { z } from "zod";
import { LLMSettings } from "@/lib/llm/providers";
import { extractJdTerms } from "@/lib/prompts";
import { getRegionalRules, auditRegionalCompliance, RegionCode, RegionalRules } from "../regionalNorms";
import { RESUME_TEMPLATES } from "@/lib/pdf/resumeTemplates";
import { generateJSON } from "@/lib/llm/client";
import { salaryIntelPrompt, outreachEmailPrompt } from "@/lib/prompts/multiAgentPrompts";
import { researchCompany } from "@/lib/agents/companyResearch";
import { AGENT_BASE_URL, agentHeaders } from "@/lib/agentClient";
import { resolveChain, callLLMJSON } from "@/lib/llm/router";

/* ------------------------------------------------------------------ *
 * Zod Schemas for Multi-Agent Tools
 * ------------------------------------------------------------------ */

export const CompanyIntelSchema = z.object({
  company: z.string(),
  jobDescription: z.string(),
  jobUrl: z.string().optional(),
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
  region: z.string().optional(),
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
  return signals.slice(0, 6);
}

export async function executeCompanyIntelTool(input: z.infer<typeof CompanyIntelSchema>) {
  const research = await researchCompany({ company: input.company, jobUrl: input.jobUrl });
  const atsType = detectAtsType(input.jobDescription);
  const techStack = Array.from(
    new Set(extractJdTerms(input.jobDescription, []).slice(0, 8).map((term) => term.term)),
  );
  const cultureKeywords = cultureKeywordsFromJd(input.jobDescription);
  const postingSourceId = research.sources.some((source) => source.id === "job-posting")
    ? "job-posting"
    : undefined;
  if (postingSourceId && techStack.length) {
    research.facts.push({
      label: "Technologies named in posting",
      value: techStack.join(", "),
      sourceIds: [postingSourceId],
      confidence: "posting_signal",
    });
  }
  if (postingSourceId && cultureKeywords.length) {
    research.facts.push({
      label: "Culture language in posting",
      value: cultureKeywords.join(", "),
      sourceIds: [postingSourceId],
      confidence: "posting_signal",
    });
  }
  if (postingSourceId && atsType !== "generic") {
    research.facts.push({
      label: "ATS named in posting",
      value: atsType,
      sourceIds: [postingSourceId],
      confidence: "posting_signal",
    });
  }
  const organizationType = research.facts.find((fact) => fact.label === "Organization type")?.value;

  return {
    success: true,
    atsType,
    stage: organizationType,
    techStack,
    cultureKeywords,
    summary: research.summary || "No verified company overview was available in this research pass.",
    research,
  };
}

export const REGIONS = ["US", "DE", "FR", "TN", "UK", "ES", "JP", "CH", "NL", "UAE", "INTL"] as const;

function isValidRegionCode(code: string): code is RegionCode {
  return (REGIONS as readonly string[]).includes(code);
}

function validateRegionalRules(raw: unknown, fallback: RegionalRules): RegionalRules {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const required: (keyof RegionalRules)[] = [
    "region",
    "name",
    "pageLimit",
    "photoRequired",
    "photoAllowed",
    "includeDateLocationLine",
    "salutationFormat",
    "closingFormat",
    "mandatorySections",
    "restrictedFields",
    "recommendedTemplate",
    "letterKind",
  ];
  for (const k of required) if (!(k in r)) return fallback;
  const region = String(r.region).toUpperCase();
  if (!isValidRegionCode(region)) return fallback;
  if (typeof r.pageLimit !== "number" || r.pageLimit < 1 || r.pageLimit > 5) return fallback;
  if (!Array.isArray(r.mandatorySections) || !Array.isArray(r.restrictedFields)) return fallback;
  if (typeof r.recommendedTemplate !== "string" || !String(r.recommendedTemplate).trim()) return fallback;
  if (typeof r.name !== "string" || typeof r.salutationFormat !== "string" || typeof r.closingFormat !== "string") return fallback;
  return {
    region: region as RegionCode,
    name: String(r.name),
    pageLimit: Number(r.pageLimit),
    photoRequired: Boolean(r.photoRequired),
    photoAllowed: Boolean(r.photoAllowed),
    includeDateLocationLine: Boolean(r.includeDateLocationLine),
    salutationFormat: String(r.salutationFormat),
    closingFormat: String(r.closingFormat),
    mandatorySections: (r.mandatorySections as unknown[]).map((v) => String(v)),
    restrictedFields: (r.restrictedFields as unknown[]).map((v) => String(v)),
    recommendedTemplate: String(r.recommendedTemplate),
    letterKind: r.letterKind === "motivation_letter" ? "motivation_letter" : "cover_letter",
  };
}

async function scrapeRegionalNormsSearch(region: string): Promise<string | null> {
  const query = `${region} resume CV norms 2025 format photo page limit`;
  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(`${AGENT_BASE_URL}/scrape`, {
      method: "POST",
      headers: agentHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ url: searchUrl }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as { description?: string; title?: string; [k: string]: unknown };
      const snippet = String(data.description || data.title || "").trim();
      if (snippet && snippet.length > 20) return snippet.slice(0, 1200);
    }
  } catch {}
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const res = await fetch(wikiUrl, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const j = (await res.json()) as { query?: { search?: Array<{ snippet?: string }> } };
      const snippets = (j.query?.search ?? [])
        .map((s) => String(s.snippet || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join(" ")
        .slice(0, 1200);
      if (snippets) return snippets;
    }
  } catch {}
  return null;
}

export async function executeRegionalNormsTool(
  input: z.infer<typeof RegionalNormsSchema>,
  settings?: LLMSettings | null
) {
  const rawCode = (input.region || "US").toUpperCase();
  const code: RegionCode = isValidRegionCode(rawCode) ? (rawCode as RegionCode) : "US";
  const baseRules = getRegionalRules(code);

  let searchSnippet: string | null = null;
  let searchPerformed = false;
  let llmUsed = false;
  let llmRules: RegionalRules | null = null;

  try {
    searchSnippet = await scrapeRegionalNormsSearch(code);
    searchPerformed = true;
  } catch {
    searchPerformed = true;
  }

  try {
    const chain = resolveChain(settings ?? null);
    if (chain.length > 0) {
      const system =
        "You are a 2025 regional resume norms expert. Synthesize RegionalRules JSON for the given region using web search context and base rules. Respond with valid JSON only — no markdown, no commentary.";
      const user = JSON.stringify(
        {
          region: code,
          searchContext2025: searchSnippet ? searchSnippet.slice(0, 1200) : "No web search available — use base rules as fallback.",
          baseRules,
          requiredFields: [
            "region",
            "name",
            "pageLimit",
            "photoRequired",
            "photoAllowed",
            "includeDateLocationLine",
            "salutationFormat",
            "closingFormat",
            "mandatorySections",
            "restrictedFields",
            "recommendedTemplate",
            "letterKind",
          ],
          instruction:
            "Return a JSON object matching RegionalRules exactly. Keep pageLimit 1-2, respect 2025 norms for photo/legal restrictions, and choose recommendedTemplate from classic-ats, tabular-german, modern-french, modern-professional, nordic-clean, executive, creative-sidebar. Region must be one of the 11 REGIONS.",
          resumeTextHint: input.resumeText ? input.resumeText.slice(0, 800) : undefined,
        },
        null,
        2
      );
      const raw = await callLLMJSON<Record<string, unknown>>(
        { system, user, agent: "regionalNorms", json: true, maxOutput: 800 },
        chain
      );
      const validated = validateRegionalRules(raw, baseRules);
      const validator = getRegionalRules(validated.region);
      if (validator) {
        llmRules = validated;
        llmUsed = true;
      }
    }
  } catch {
    llmUsed = false;
  }

  const rules: RegionalRules = llmRules ? validateRegionalRules(llmRules, baseRules) : baseRules;
  const finalRules = getRegionalRules(rules.region) ? rules : baseRules;
  const audit = input.resumeText ? auditRegionalCompliance(input.resumeText, finalRules.region) : null;

  return {
    success: true,
    rules: finalRules,
    audit,
    meta: {
      searchPerformed,
      llmUsed,
      searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
      region: finalRules.region,
      source: llmUsed ? "llm+search" : searchPerformed ? "search+fallback" : "fallback",
    },
  };
}

const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const DOB_REGEX =
  /\b((?:19|20)\d{2}[-/.](?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01])|(?:0[1-9]|[12]\d|3[01])[-/.](?:0[1-9]|1[0-2])[-/.](?:19|20)\d{2}|(?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01])[-/.](?:19|20)\d{2})\b/g;

function sanitizeReasoningForLog(raw: string): string {
  return raw
    .replace(SSN_REGEX, "[REDACTED-SSN]")
    .replace(DOB_REGEX, "[REDACTED-DOB]")
    .slice(0, 500);
}

export async function executePiiSanitizerTool(
  input: z.infer<typeof PiiSanitizerSchema>,
  settings?: LLMSettings | null
) {
  const original = input.content ?? "";

  let llmSanitized: string | null = null;
  let llmReasoning: string | null = null;
  let llmFindings: string[] = [];
  let llmUsed = false;

  try {
    const chain = resolveChain(settings ?? null);
    if (chain.length > 0 && original.trim().length > 0) {
      const system =
        "You are a PII detection expert. Identify personally identifiable information in the given content. Respond with valid JSON only — no markdown, no commentary.";
      const user = JSON.stringify(
        {
          content: original.slice(0, 4000),
          instruction:
            "Return JSON with keys: reasoning (short explanation of what PII types you detected, do NOT repeat raw values), findings (array of PII types like 'SSN','DOB','email','phone','address','name'), sanitized (content with PII replaced by [REDACTED-TYPE] placeholders). Do not include raw SSN or DOB values in reasoning.",
          example: {
            reasoning: "Detected SSN pattern and full date of birth",
            findings: ["SSN", "DOB"],
            sanitized: "My SSN is [REDACTED-SSN] and DOB [REDACTED-DOB]",
          },
        },
        null,
        2
      );
      const raw = await callLLMJSON<Record<string, unknown>>(
        { system, user, agent: "piiSanitizer", json: true, maxOutput: 600 },
        chain
      );
      if (typeof raw.reasoning === "string" && raw.reasoning.trim()) {
        llmReasoning = sanitizeReasoningForLog(raw.reasoning.trim());
      }
      if (Array.isArray(raw.findings)) {
        llmFindings = raw.findings.map((v) => String(v)).filter(Boolean).slice(0, 10);
      }
      if (typeof raw.sanitized === "string" && raw.sanitized.trim()) {
        llmSanitized = raw.sanitized;
        llmUsed = true;
        if (!llmReasoning) llmReasoning = "LLM PII analysis completed";
      } else if (Array.isArray(raw.redactions)) {
        let tmp = original;
        for (const r of raw.redactions as unknown[]) {
          if (r && typeof r === "object") {
            const rec = r as Record<string, unknown>;
            const val = typeof rec.value === "string" ? String(rec.value) : "";
            const placeholder =
              typeof rec.placeholder === "string" ? String(rec.placeholder) : "[REDACTED]";
            if (val && tmp.includes(val)) {
              tmp = tmp.split(val).join(placeholder);
            }
          }
        }
        if (tmp !== original) {
          llmSanitized = tmp;
        } else {
          llmSanitized = original;
        }
        llmUsed = true;
        if (!llmReasoning) llmReasoning = "LLM PII analysis completed";
      } else if (llmReasoning || llmFindings.length) {
        llmUsed = true;
        if (!llmReasoning) llmReasoning = `Detected: ${llmFindings.join(", ") || "PII"}`;
        llmSanitized = original;
      }
    }
  } catch {
    llmUsed = false;
  }

  const baseContent = llmSanitized ?? original;
  const sanitized = baseContent
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED-SSN]")
    .replace(
      /\b((?:19|20)\d{2}[-/.](?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01])|(?:0[1-9]|[12]\d|3[01])[-/.](?:0[1-9]|1[0-2])[-/.](?:19|20)\d{2}|(?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01])[-/.](?:19|20)\d{2})\b/g,
      "[REDACTED-DOB]"
    );

  const ssnHits = (baseContent.match(/\b\d{3}-\d{2}-\d{4}\b/g) ?? []).length;
  const dobHits =
    (
      baseContent.match(
        /\b((?:19|20)\d{2}[-/.](?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01])|(?:0[1-9]|[12]\d|3[01])[-/.](?:0[1-9]|1[0-2])[-/.](?:19|20)\d{2}|(?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01])[-/.](?:19|20)\d{2})\b/g
      ) ?? []
    ).length;

  const hasRedactions = sanitized !== original;

  return {
    success: true,
    sanitizedContent: sanitized,
    hasRedactions,
    llmUsed,
    llmReasoning,
    llmFindings,
    regexEnforced: true,
    meta: {
      llmUsed,
      llmReasoning: llmReasoning ? llmReasoning.slice(0, 200) : null,
      llmFindings,
      ssnHits,
      dobHits,
      regexEnforced: true,
    },
  };
}

export async function executeResumeCVTailorTool(
  input: z.infer<typeof ResumeCVTailorSchema>,
  settings?: LLMSettings | null
) {
  const fallbackTerms = extractJdTerms(input.jobDescription, input.userSkills);
  const fallbackMatching = fallbackTerms.filter((t) => t.inResume).map((t) => t.term);
  const fallbackMissing = fallbackTerms.filter((t) => !t.inResume).map((t) => t.term);
  const regionCode = (input.region || "US").toUpperCase() as RegionCode;
  const rules = getRegionalRules(regionCode);
  const template = RESUME_TEMPLATES.find((t) => t.id === rules.recommendedTemplate) || RESUME_TEMPLATES[0];
  const cultureKeywords = cultureKeywordsFromJd(input.jobDescription);

  let vaultSnippets: string[] = [];
  try {
    const { searchVault } = await import("@/lib/vault");
    const q = `${input.jobTitle} ${input.company} ${input.jobDescription.slice(0, 800)}`.trim();
    if (q) {
      const hits = await searchVault(q, 3);
      if (hits.length) {
        vaultSnippets = hits.map(
          (h) => `${h.text.slice(0, 240).replace(/\s+/g, " ").trim()} [${h.docName}#${h.chunkIndex} ${h.model}]`
        );
      }
    }
  } catch {
    vaultSnippets = [];
  }

  let llmUsed = false;
  let llmReasoning: string | null = null;
  let matchingSkills = fallbackMatching;
  let missingSkills = fallbackMissing;

  try {
    const chain = resolveChain(settings ?? null);
    if (chain.length > 0) {
      const system =
        "You are an expert resume tailoring analyst. Compare the job description against candidate skills using vault evidence and culture signals. Respond with valid JSON only — no markdown, no commentary.";
      const user = JSON.stringify(
        {
          jobTitle: input.jobTitle,
          company: input.company,
          jobDescription: input.jobDescription.slice(0, 4000),
          userSkills: input.userSkills,
          vaultHits: vaultSnippets.length ? vaultSnippets : "No vault evidence available.",
          cultureKeywords: cultureKeywords.length ? cultureKeywords : "None detected",
          region: regionCode,
          templateHint: template.id,
          regionalRules: {
            mandatorySections: rules.mandatorySections,
            restrictedFields: rules.restrictedFields,
            recommendedTemplate: rules.recommendedTemplate,
          },
          fallbackTerms: fallbackTerms.slice(0, 12).map((t) => ({ term: t.term, inResume: t.inResume })),
          instruction:
            "Return JSON with keys: matchingSkills (string[] 0-12, skills from userSkills that semantically match JD requirements, deduplicated case-insensitively), missingSkills (string[] 0-10, JD-required skills absent from userSkills), reasoning (1-2 sentence match rationale). Prefer semantic equivalence over substring (e.g., 'Next.js' matches 'Next'). Keep template as provided.",
        },
        null,
        2
      );
      const raw = await callLLMJSON<Record<string, unknown>>(
        { system, user, agent: "resumeCVTailor", json: true, maxOutput: 600 },
        chain
      );
      const rawMatching = Array.isArray((raw as Record<string, unknown>).matchingSkills)
        ? ((raw as Record<string, unknown>).matchingSkills as unknown[])
        : null;
      const rawMissing = Array.isArray((raw as Record<string, unknown>).missingSkills)
        ? ((raw as Record<string, unknown>).missingSkills as unknown[])
        : null;
      if (rawMatching && rawMissing) {
        const cleanList = (arr: unknown[]) =>
          Array.from(new Set(arr.map((v) => String(v).trim()).filter(Boolean))).slice(0, 12);
        const lm = cleanList(rawMatching);
        const lmiss = cleanList(rawMissing).slice(0, 10);
        const lowerMatch = new Set(lm.map((s) => s.toLowerCase()));
        const filteredMissing = lmiss.filter((s) => !lowerMatch.has(s.toLowerCase()));
        if (lm.length || lmiss.length) {
          matchingSkills = lm.length ? lm : fallbackMatching;
          if (filteredMissing.length) {
            missingSkills = filteredMissing;
          } else if (lmiss.length === 0 && lm.length) {
            missingSkills = fallbackMissing.filter((s) => !lowerMatch.has(s.toLowerCase()));
          } else {
            missingSkills = filteredMissing.length ? filteredMissing : lmiss;
          }
          llmUsed = true;
          if (typeof (raw as Record<string, unknown>).reasoning === "string" && String((raw as Record<string, unknown>).reasoning).trim()) {
            llmReasoning = String((raw as Record<string, unknown>).reasoning).slice(0, 300);
          } else {
            llmReasoning = `LLM tailored ${lm.length} matching / ${filteredMissing.length} missing`;
          }
        }
      }
    }
  } catch {
    llmUsed = false;
    llmReasoning = null;
  }

  const seenLower = new Set(matchingSkills.map((s) => s.toLowerCase()));
  const dedupedMissing = missingSkills.filter((s) => !seenLower.has(s.toLowerCase()));
  const uniqMatching = Array.from(new Map(matchingSkills.map((s) => [s.toLowerCase(), s])).values());
  const uniqMissing = Array.from(new Map(dedupedMissing.map((s) => [s.toLowerCase(), s])).values());

  return {
    success: true,
    matchingSkills: uniqMatching,
    missingSkills: uniqMissing,
    recommendedTemplate: template.id,
    templateMeta: template,
    llmUsed,
    llmReasoning,
    cultureKeywords,
    vaultHitsCount: vaultSnippets.length,
    fallbackUsed: !llmUsed,
  };
}

async function scrapeInterviewStarSearch(company: string, jobTitle: string, jdSnippet: string): Promise<string | null> {
  const terms = extractJdTerms(jdSnippet, []).slice(0, 3).map((t) => t.term).join(" ");
  const query = `${company} ${jobTitle} ${terms} STAR interview questions 2025`;
  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(`${AGENT_BASE_URL}/scrape`, {
      method: "POST",
      headers: agentHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ url: searchUrl }),
      signal: AbortSignal.timeout(7000),
    });
    if (res.ok) {
      const data = (await res.json()) as { description?: string; title?: string; [k: string]: unknown };
      const snippet = String(data.description || data.title || "").trim();
      if (snippet && snippet.length > 20) return snippet.slice(0, 1200);
    }
  } catch {}
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent("STAR interview method " + jobTitle)}&format=json&origin=*`;
    const res = await fetch(wikiUrl, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const j = (await res.json()) as { query?: { search?: Array<{ snippet?: string }> } };
      const snippets = (j.query?.search ?? [])
        .map((s) => String(s.snippet || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join(" ")
        .slice(0, 1200);
      if (snippets) return snippets;
    }
  } catch {}
  return null;
}

export async function executeLetterTailorTool(
  input: z.infer<typeof LetterTailorSchema>,
  settings?: LLMSettings | null
) {
  const regionCode = (input.region || "US").toUpperCase() as RegionCode;
  const rules = getRegionalRules(regionCode);
  const fallbackSalutation = rules.salutationFormat;
  const fallbackClosing = rules.closingFormat;
  const letterKind = (input.kind || rules.letterKind) as "cover_letter" | "motivation_letter";

  let companyResearch: Awaited<ReturnType<typeof researchCompany>> | null = null;
  try {
    companyResearch = await researchCompany({ company: input.company });
  } catch {
    companyResearch = null;
  }

  let sidecarSnippet: string | null = null;
  try {
    const query = `${regionCode} cover letter salutation closing etiquette 2025`;
    const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(`${AGENT_BASE_URL}/scrape`, {
      method: "POST",
      headers: agentHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ url: searchUrl }),
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = (await res.json()) as { description?: string; title?: string; [k: string]: unknown };
      const snippet = String(data.description || data.title || "").trim();
      if (snippet && snippet.length > 20) sidecarSnippet = snippet.slice(0, 800);
    }
  } catch {}

  let llmUsed = false;
  let llmSalutation: string | null = null;
  let llmClosing: string | null = null;
  let llmReasoning: string | null = null;

  try {
    const chain = resolveChain(settings ?? null);
    if (chain.length > 0) {
      const researchFacts = companyResearch?.facts.slice(0, 6).map((f) => `${f.label}: ${f.value}`).join("; ") || "No verified company facts in this research pass.";
      const researchSources = companyResearch?.sources.slice(0, 6).map((s) => `${s.title} (${s.url})`).join("; ") || "No external sources verified.";
      const system =
        "You are a 2025 cover-letter etiquette expert. Draft a region-appropriate salutation and closing grounded in company research via sidecar sources and regional norms. Respond with valid JSON only — no markdown, no commentary.";
      const user = JSON.stringify(
        {
          region: regionCode,
          baseSalutation: fallbackSalutation,
          baseClosing: fallbackClosing,
          company: input.company,
          jobTitle: input.jobTitle,
          jobDescription: input.jobDescription.slice(0, 2000),
          researchSummary: companyResearch?.summary ? companyResearch.summary.slice(0, 600) : "No summary available.",
          researchFacts,
          researchSources,
          sidecarSnippet: sidecarSnippet ? sidecarSnippet.slice(0, 600) : "No sidecar snippet available.",
          letterKind,
          instruction:
            "Return JSON with keys: salutation (string, formal region-appropriate opening, max 90 chars, e.g. 'Dear Hiring Manager,' for US or 'Sehr geehrte Damen und Herren,' for DE, must respect region etiquette), closing (string, formal region-appropriate closing, max 90 chars, e.g. 'Sincerely,' / 'Mit freundlichen Grüßen,'), reasoning (1 sentence why this fits region + company). Keep letterKind exactly as provided — do not change it. Salutation/closing must not dump jobDescription.",
        },
        null,
        2
      );
      const raw = await callLLMJSON<Record<string, unknown>>(
        { system, user, agent: "letterTailor", json: true, maxOutput: 400 },
        chain
      );
      const s = typeof raw.salutation === "string" ? String(raw.salutation).trim() : "";
      const c = typeof raw.closing === "string" ? String(raw.closing).trim() : "";
      if (s && c && s.length <= 120 && c.length <= 120) {
        llmSalutation = s;
        llmClosing = c;
        llmUsed = true;
        if (typeof raw.reasoning === "string" && String(raw.reasoning).trim()) {
          llmReasoning = String(raw.reasoning).slice(0, 300);
        } else {
          llmReasoning = `LLM tailored salutation/closing for ${regionCode} grounded in ${companyResearch?.sources.length ?? 0} sources`;
        }
      }
    }
  } catch {
    llmUsed = false;
    llmReasoning = null;
  }

  return {
    success: true,
    salutation: llmSalutation || fallbackSalutation,
    closing: llmClosing || fallbackClosing,
    letterKind,
    llmUsed,
    llmReasoning,
    companyResearch: companyResearch
      ? {
          summary: companyResearch.summary,
          sourcesCount: companyResearch.sources.length,
          factsCount: companyResearch.facts.length,
          sources: companyResearch.sources.slice(0, 4).map((s) => ({ id: s.id, title: s.title, url: s.url })),
        }
      : null,
    meta: {
      llmUsed,
      searchPerformed: !!sidecarSnippet,
      region: regionCode,
      source: llmUsed ? "llm+research" : sidecarSnippet ? "search+fallback" : "fallback",
      sourcesCount: companyResearch?.sources.length ?? 0,
    },
  };
}

export async function executeInterviewPrepTool(
  input: z.infer<typeof InterviewPrepSchema>,
  settings?: LLMSettings | null
) {
  const terms = extractJdTerms(input.jobDescription, []).slice(0, 5).map((t) => t.term);
  const jd = (input.jobDescription || "").toLowerCase();

  let companyResearch: Awaited<ReturnType<typeof researchCompany>> | null = null;
  try {
    companyResearch = await researchCompany({ company: input.company });
  } catch {
    companyResearch = null;
  }

  let starSnippet: string | null = null;
  try {
    starSnippet = await scrapeInterviewStarSearch(input.company, input.jobTitle, input.jobDescription);
  } catch {
    starSnippet = null;
  }

  function buildFallbackTopics(): string[] {
    const focus: string[] = [];
    for (const t of terms) {
      focus.push(`Hands-on depth on ${t}: be ready to explain real usage, tradeoffs, and a concrete example from your work.`);
    }
    const signalTopics: Array<[RegExp, string]> = [
      [/lead|manage|mentor|team|stakeholder/i, "Leadership and alignment: prepare 1-2 STAR stories about leading work or unblocking a team."],
      [/remote|distributed|async/i, "Remote collaboration: how you communicate, document decisions, and stay aligned async."],
      [/startup|fast.paced|ambiguous|scale|growth/i, "Ownership under ambiguity: a STAR story where you took initiative without clear direction."],
      [/legacy|migrat|refactor|moderni/i, "Migration and modernization: tradeoffs you made and how you de-risked the change."],
      [/customer|user|product|impact|metric/i, "User-facing impact: connect your work to a measurable outcome (STAR: metrics before/after)."],
      [/incident|on.?call|reliab|sre/i, "Reliability and incidents: how you diagnose, respond, and prevent recurrence (STAR)."],
    ];
    for (const [re, topic] of signalTopics) {
      if (re.test(jd)) focus.push(topic);
    }
    if (companyResearch && companyResearch.sources.length > 0) {
      const factHint = companyResearch.facts.slice(0, 2).map((f) => f.value).join(", ") || companyResearch.summary?.slice(0, 120) || "";
      const sourceHint = companyResearch.sources[0]?.title || companyResearch.sources[0]?.url || "";
      focus.push(
        `Company-specific (${input.company}): tie one STAR answer to ${input.company}'s mission/product${factHint ? ` — e.g. ${factHint.slice(0, 120)}` : ""}${sourceHint ? ` [${sourceHint.slice(0, 80)}]` : ""} and one question you'd ask about their recent direction.`
      );
    } else {
      focus.push(`Company-aware story: why ${input.company} — 1-sentence STAR hook linking your motivation to their domain and the ${input.jobTitle} scope.`);
    }
    if (starSnippet) {
      focus.push(`STAR method drill (via sidecar search): ${starSnippet.slice(0, 140).replace(/\s+/g, " ").trim()} — rehearse Situation/Task/Action/Result for each topic.`);
    }
    const genericPad = [
      "Behavioral STAR: conflict resolution — a time you disagreed on approach and drove alignment.",
      "Growth story: a skill you deliberately learned for this role and how you applied it.",
      "System design STAR: tradeoff you made between velocity and quality, and what you'd do differently.",
      "Execution STAR: delivering a feature end-to-end — planning, risks, and how you measured success.",
    ];
    let padIdx = 0;
    while (focus.length < 5 && padIdx < genericPad.length) {
      focus.push(genericPad[padIdx++]);
    }
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const t of focus) {
      const k = t.toLowerCase().slice(0, 60);
      if (!seen.has(k)) {
        seen.add(k);
        deduped.push(t);
      }
    }
    return deduped.slice(0, 8);
  }

  const fallbackTopics = buildFallbackTopics();

  let llmUsed = false;
  let llmReasoning: string | null = null;
  let finalTopics = fallbackTopics;

  try {
    const chain = resolveChain(settings ?? null);
    if (chain.length > 0) {
      const researchFacts = companyResearch?.facts.slice(0, 6).map((f) => `${f.label}: ${f.value}`).join("; ") || "No verified company facts.";
      const researchSources = companyResearch?.sources.slice(0, 6).map((s) => `${s.title} (${s.url})`).join("; ") || "No external sources verified.";
      const system =
        "You are a senior interview coach. Generate 5-8 STAR-grounded interview prep topics per role, grounded in JD, companyResearch.sources and sidecar STAR search context. Respond with valid JSON only — no markdown, no commentary.";
      const user = JSON.stringify(
        {
          jobTitle: input.jobTitle,
          company: input.company,
          jobDescription: input.jobDescription.slice(0, 3000),
          jdTerms: terms,
          researchSummary: companyResearch?.summary ? companyResearch.summary.slice(0, 700) : "No company summary available.",
          researchFacts,
          researchSources,
          starSearchContext: starSnippet ? starSnippet.slice(0, 800) : "No sidecar STAR snippet available.",
          sourcesCount: companyResearch?.sources.length ?? 0,
          hasCompanyResearch: (companyResearch?.sources.length ?? 0) > 0,
          instruction:
            "Return JSON with keys: topics (string[] 5-8, each 1-2 sentences, STAR-structured where applicable e.g. 'STAR: Tell me about a time you ... — Situation/Task/Action/Result + metric', grounded in JD terms and companyResearch.sources), reasoning (1 sentence). At least one topic must be company-specific mentioning the company name and a research source or fact when sourcesCount>0 — otherwise mention the company name generically. Each topic must be distinct, actionable, and include a concrete example prompt. Do not invent company financials not in researchFacts.",
        },
        null,
        2
      );
      const raw = await callLLMJSON<Record<string, unknown>>(
        { system, user, agent: "interviewPrep", json: true, maxOutput: 900 },
        chain
      );
      const rawTopics = Array.isArray(raw.topics) ? (raw.topics as unknown[]) : null;
      if (rawTopics && rawTopics.length >= 5 && rawTopics.length <= 8) {
        const cleaned = rawTopics.map((v) => String(v).trim()).filter((s) => s.length > 15 && s.length < 500);
        if (cleaned.length >= 5) {
          const hasCompanyMention = cleaned.some((t) => t.toLowerCase().includes(input.company.toLowerCase()));
          if ((companyResearch?.sources.length ?? 0) > 0 && !hasCompanyMention) {
            const factHint = companyResearch?.facts[0]?.value?.slice(0, 80) || "";
            cleaned[cleaned.length - 1] = `Company-specific (${input.company}): prepare a STAR answer tying your work to ${input.company}'s direction${factHint ? ` (${factHint})` : ""} — Situation/Task/Action/Result with a question for them.`;
          }
          const hasStar = cleaned.some((t) => /STAR/i.test(t));
          if (!hasStar) {
            cleaned[0] = `STAR: ${cleaned[0]}`;
          }
          const seenL = new Set<string>();
          const deduped: string[] = [];
          for (const t of cleaned) {
            const k = t.toLowerCase().slice(0, 50);
            if (!seenL.has(k)) {
              seenL.add(k);
              deduped.push(t);
            }
          }
          if (deduped.length >= 5 && deduped.length <= 8) {
            finalTopics = deduped.slice(0, 8);
            llmUsed = true;
            if (typeof raw.reasoning === "string" && String(raw.reasoning).trim()) {
              llmReasoning = String(raw.reasoning).slice(0, 300);
            } else {
              llmReasoning = `LLM generated ${deduped.length} STAR topics grounded in ${companyResearch?.sources.length ?? 0} sources + JD terms`;
            }
          }
        }
      } else if (rawTopics && rawTopics.length >= 3) {
        const cleaned = rawTopics.map((v) => String(v).trim()).filter((s) => s.length > 15);
        if (cleaned.length >= 3) {
          const needed = 5 - cleaned.length;
          const pad = fallbackTopics.filter((t) => !cleaned.some((c) => c.toLowerCase().slice(0, 30) === t.toLowerCase().slice(0, 30))).slice(0, needed);
          const merged = [...cleaned, ...pad].slice(0, 8);
          const hasCompanyMention = merged.some((t) => t.toLowerCase().includes(input.company.toLowerCase()));
          if ((companyResearch?.sources.length ?? 0) > 0 && !hasCompanyMention) {
            merged[merged.length - 1] = `Company-specific (${input.company}): STAR answer linking your impact to ${input.company}'s mission/product with a question about their recent news.`;
          }
          finalTopics = merged;
          llmUsed = true;
          llmReasoning = typeof raw.reasoning === "string" ? String(raw.reasoning).slice(0, 300) : `LLM + fallback padded to ${merged.length} topics`;
        }
      }
    }
  } catch {
    llmUsed = false;
    llmReasoning = null;
  }

  if (finalTopics.length < 5) {
    const pad = fallbackTopics.filter((t) => !finalTopics.includes(t)).slice(0, 5 - finalTopics.length);
    finalTopics = [...finalTopics, ...pad].slice(0, 8);
  }
  if (finalTopics.length > 8) finalTopics = finalTopics.slice(0, 8);
  if ((companyResearch?.sources.length ?? 0) > 0) {
    const hasCompanyMention = finalTopics.some((t) => t.toLowerCase().includes(input.company.toLowerCase()));
    if (!hasCompanyMention) {
      finalTopics[finalTopics.length - 1] = `Company-specific (${input.company}): STAR story connecting your work to ${input.company}'s mission — prepare a question about their product/industry from ${companyResearch?.sources[0]?.title?.slice(0, 60) || "verified sources"}.`;
    }
  }

  return {
    success: true,
    focusTopics: finalTopics,
    questionsCount: finalTopics.length,
    llmUsed,
    llmReasoning,
    starSnippet: starSnippet ? starSnippet.slice(0, 200) : null,
    companyResearch: companyResearch
      ? {
          summary: companyResearch.summary,
          sourcesCount: companyResearch.sources.length,
          factsCount: companyResearch.facts.length,
        }
      : null,
    meta: {
      llmUsed,
      searchPerformed: !!starSnippet,
      sourcesCount: companyResearch?.sources.length ?? 0,
      source: llmUsed ? "llm+research+star" : starSnippet ? "search+fallback" : "fallback",
    },
  };
}

async function scrapeSalaryGlassdoorSearch(
  jobTitle: string,
  company: string,
  location: string,
  region: string,
  jdSnippet: string
): Promise<string | null> {
  const terms = jdSnippet ? jdSnippet.slice(0, 80).replace(/\s+/g, " ").trim() : "";
  const query = `${jobTitle} ${company} ${location} salary glassdoor levels.fyi 2025 ${region} ${terms}`.trim();
  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(`${AGENT_BASE_URL}/scrape`, {
      method: "POST",
      headers: agentHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ url: searchUrl }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as { description?: string; title?: string; [k: string]: unknown };
      const snippet = String(data.description || data.title || "").trim();
      if (snippet && snippet.length > 20) return snippet.slice(0, 1200);
    }
  } catch {}
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const res = await fetch(wikiUrl, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const j = (await res.json()) as { query?: { search?: Array<{ snippet?: string }> } };
      const snippets = (j.query?.search ?? [])
        .map((s) => String(s.snippet || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join(" ")
        .slice(0, 1200);
      if (snippets) return snippets;
    }
  } catch {}
  return null;
}

function swapGuardRangeString(raw: string): string {
  const matches = Array.from(raw.matchAll(/[\d,]+/g));
  if (matches.length >= 2) {
    const low = Number(matches[0][0].replace(/,/g, ""));
    const high = Number(matches[1][0].replace(/,/g, ""));
    if (low > high && high > 0) {
      const first = matches[0][0];
      const second = matches[1][0];
      const placeholder = "__SWAP__";
      let out = raw.replace(first, placeholder);
      const secondIndex = out.indexOf(second);
      if (secondIndex !== -1) {
        out = out.slice(0, secondIndex) + first + out.slice(secondIndex + second.length);
        out = out.replace(placeholder, second);
        return out;
      }
    }
  }
  return raw;
}

function ensureLowHigh(low: number, high: number): [number, number] {
  if (low > high) return [high, low];
  return [low, high];
}

export async function executeSalaryIntelTool(
  input: z.infer<typeof SalaryIntelSchema>,
  settings?: LLMSettings | null
) {
  const region = (input.region || "US").toUpperCase();
  const loc = (input.location || "").toLowerCase();
  const jd = input.jobDescription || "";

  let searchSnippet: string | null = null;
  let searchPerformed = false;
  try {
    searchSnippet = await scrapeSalaryGlassdoorSearch(input.jobTitle, input.company, input.location || "", region, jd);
    searchPerformed = true;
  } catch {
    searchPerformed = true;
  }

  try {
    const chain = resolveChain(settings ?? null);
    if (chain.length > 0) {
      const disclosedHint = jd.match(
        /(?:[$€£¥]\s?\d[\d,]*k?|\d[\d,]*\s*(?:TND|DT|EUR|GBP|USD|CHF|AED))\s*[-–]\s*(?:[$€£¥]\s?\d[\d,]*k?|\d[\d,]*\s*(?:TND|DT|EUR|GBP|USD|CHF|AED))/i
      )?.[0]?.replace(/\s+/g, " ") || null;
      const system =
        "You are a 2025 global compensation analyst. Synthesize salary range using 2025 glassdoor/levels market search context and posting disclosure. Respond with valid JSON only — no markdown, no commentary.";
      const user = JSON.stringify(
        {
          jobTitle: input.jobTitle,
          company: input.company,
          location: input.location || region,
          region,
          disclosedRange: disclosedHint ? disclosedHint : "None disclosed — estimate market",
          searchContext2025: searchSnippet ? searchSnippet.slice(0, 1200) : "No web search available — use market knowledge as fallback.",
          basePrompt: salaryIntelPrompt(input.jobTitle, input.company, input.location, jd, region).slice(0, 800),
          instruction:
            "Return JSON with keys: estimatedRange (string formatted with correct local currency for the region), confidence (high/medium/low), reasoning (1 sentence grounding in searchContext2025 and disclosedRange). When searchContext2025 contains salary figures, prefer them over pure model knowledge. Keep correct currency per region (TND for TN, EUR for DE/FR/ES/NL, GBP for UK, CHF for CH, JPY for JP, AED for UAE, USD otherwise). estimatedRange must be low-high with low <= high.",
        },
        null,
        2
      );
      const raw = await callLLMJSON<Record<string, unknown>>(
        { system, user, agent: "salaryIntel", json: true, maxOutput: 400 },
        chain
      );
      let candidate: string | null = null;
      let confidence: string = "medium";
      if (typeof raw.estimatedRange === "string" && String(raw.estimatedRange).trim().length > 3) {
        candidate = String(raw.estimatedRange).trim().slice(0, 200);
      } else if (typeof (raw as Record<string, unknown>).range === "string" && String((raw as Record<string, unknown>).range).trim().length > 3) {
        candidate = String((raw as Record<string, unknown>).range).trim().slice(0, 200);
      } else if (typeof raw.estimateLow === "number" && typeof raw.estimateHigh === "number") {
        let low = Number(raw.estimateLow);
        let high = Number(raw.estimateHigh);
        [low, high] = ensureLowHigh(low, high);
        const sym = region === "TN" ? "TND" : ["DE", "FR", "ES", "NL"].includes(region) ? "EUR" : region === "UK" ? "GBP" : region === "CH" ? "CHF" : region === "JP" ? "JPY" : region === "UAE" ? "AED" : "USD";
        candidate = `${low.toLocaleString()} - ${high.toLocaleString()} ${sym}`;
      }
      if (typeof raw.confidence === "string" && ["high", "medium", "low"].includes(String(raw.confidence).toLowerCase())) {
        confidence = String(raw.confidence).toLowerCase();
      }
      if (candidate) {
        const guarded = swapGuardRangeString(candidate);
        return {
          success: true,
          role: input.jobTitle,
          company: input.company,
          estimatedRange: guarded,
          confidence,
          llmUsed: true,
          searchPerformed,
          searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
          reasoning: typeof raw.reasoning === "string" ? String(raw.reasoning).slice(0, 300) : null,
          meta: { llmUsed: true, searchPerformed, source: "llm+search" },
        };
      }
    }
  } catch {
    /* Fallback to deterministic regional calculation */
  }

  try {
    if (!searchSnippet) {
      const legacy = await generateJSON<{ estimatedRange: string; confidence: string }>(
        settings ?? undefined,
        "You are a global compensation analyst.",
        salaryIntelPrompt(input.jobTitle, input.company, input.location, input.jobDescription, region)
      );
      if (legacy.estimatedRange) {
        const guarded = swapGuardRangeString(legacy.estimatedRange);
        return {
          success: true,
          role: input.jobTitle,
          company: input.company,
          estimatedRange: guarded,
          confidence: legacy.confidence || "medium",
          llmUsed: true,
          searchPerformed,
          searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
          meta: { llmUsed: true, searchPerformed, source: "llm+search" },
        };
      }
    }
  } catch {
    /* Fallback to deterministic regional calculation */
  }

  const disclosed = jd.match(/(?:[$€£¥]\s?\d[\d,]*k?|\d[\d,]*\s*(?:TND|DT|EUR|GBP|USD|CHF|AED))\s*[-–]\s*(?:[$€£¥]\s?\d[\d,]*k?|\d[\d,]*\s*(?:TND|DT|EUR|GBP|USD|CHF|AED))/i);
  if (disclosed) {
    const guardedDisclosed = swapGuardRangeString(disclosed[0].replace(/\s+/g, " "));
    return {
      success: true,
      role: input.jobTitle,
      company: input.company,
      estimatedRange: guardedDisclosed,
      confidence: "high",
      llmUsed: false,
      searchPerformed,
      searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
      meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback" },
    };
  }

  const senior = /senior|lead|principal|staff|head|sr\.?/i.test(input.jobTitle) ? 1.3 : 1.0;
  const isAI = /ai|ml|llm|machine|data/i.test(jd);

  if (region === "TN" || loc.includes("tunis") || loc.includes("tunisia")) {
    let lowYear = Math.round((28000 * senior * (isAI ? 1.2 : 1)) / 1000) * 1000;
    let highYear = Math.round((45000 * senior * (isAI ? 1.25 : 1)) / 1000) * 1000;
    [lowYear, highYear] = ensureLowHigh(lowYear, highYear);
    const lowMonth = Math.round(lowYear / 12);
    const highMonth = Math.round(highYear / 12);
    return {
      success: true,
      role: input.jobTitle,
      company: input.company,
      estimatedRange: `${lowYear.toLocaleString()} - ${highYear.toLocaleString()} TND/year (~${lowMonth.toLocaleString()} - ${highMonth.toLocaleString()} DT/month)`,
      confidence: "medium",
      llmUsed: false,
      searchPerformed,
      searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
      meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback" },
    };
  }

  if (["DE", "FR", "ES", "NL"].includes(region) || loc.includes("germany") || loc.includes("france") || loc.includes("berlin") || loc.includes("paris") || loc.includes("europe")) {
    const base = isAI ? 75000 : 65000;
    let low = Math.round((base * senior) / 1000) * 1000;
    let high = Math.round((base * senior * 1.35) / 1000) * 1000;
    [low, high] = ensureLowHigh(low, high);
    return {
      success: true,
      role: input.jobTitle,
      company: input.company,
      estimatedRange: `${low.toLocaleString()}€ - ${high.toLocaleString()}€ EUR (market estimate)`,
      confidence: "medium",
      llmUsed: false,
      searchPerformed,
      searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
      meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback" },
    };
  }

  if (region === "UK" || loc.includes("london") || loc.includes("united kingdom") || loc.includes("uk")) {
    const base = isAI ? 65000 : 55000;
    let low = Math.round((base * senior) / 1000) * 1000;
    let high = Math.round((base * senior * 1.35) / 1000) * 1000;
    [low, high] = ensureLowHigh(low, high);
    return {
      success: true,
      role: input.jobTitle,
      company: input.company,
      estimatedRange: `£${low.toLocaleString()} - £${high.toLocaleString()} GBP (market estimate)`,
      confidence: "medium",
      llmUsed: false,
      searchPerformed,
      searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
      meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback" },
    };
  }

  if (region === "CH" || loc.includes("switzerland") || loc.includes("zurich") || loc.includes("geneva")) {
    const base = isAI ? 140000 : 120000;
    let low = Math.round((base * senior) / 1000) * 1000;
    let high = Math.round((base * senior * 1.3) / 1000) * 1000;
    [low, high] = ensureLowHigh(low, high);
    return {
      success: true,
      role: input.jobTitle,
      company: input.company,
      estimatedRange: `${low.toLocaleString()} - ${high.toLocaleString()} CHF (market estimate)`,
      confidence: "medium",
      llmUsed: false,
      searchPerformed,
      searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
      meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback" },
    };
  }

  if (region === "JP" || loc.includes("japan") || loc.includes("tokyo")) {
    const base = isAI ? 8500000 : 7000000;
    let low = Math.round((base * senior) / 100000) * 100000;
    let high = Math.round((base * senior * 1.35) / 100000) * 100000;
    [low, high] = ensureLowHigh(low, high);
    return {
      success: true,
      role: input.jobTitle,
      company: input.company,
      estimatedRange: `¥${low.toLocaleString()} - ¥${high.toLocaleString()} JPY (market estimate)`,
      confidence: "medium",
      llmUsed: false,
      searchPerformed,
      searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
      meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback" },
    };
  }

  if (region === "UAE" || loc.includes("dubai") || loc.includes("abu dhabi") || loc.includes("uae")) {
    const base = isAI ? 220000 : 180000;
    let low = Math.round((base * senior) / 5000) * 5000;
    let high = Math.round((base * senior * 1.35) / 5000) * 5000;
    [low, high] = ensureLowHigh(low, high);
    return {
      success: true,
      role: input.jobTitle,
      company: input.company,
      estimatedRange: `${low.toLocaleString()} - ${high.toLocaleString()} AED (tax-free market estimate)`,
      confidence: "medium",
      llmUsed: false,
      searchPerformed,
      searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
      meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback" },
    };
  }

  const base = isAI ? 165000 : 135000;
  let low = Math.round((base * senior) / 1000) * 1000;
  let high = Math.round((base * senior * 1.35) / 1000) * 1000;
  [low, high] = ensureLowHigh(low, high);
  return {
    success: true,
    role: input.jobTitle,
    company: input.company,
    estimatedRange: `$${low.toLocaleString()} - $${high.toLocaleString()} USD (market estimate)`,
    confidence: "medium",
    llmUsed: false,
    searchPerformed,
    searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
    meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback" },
  };
}

export async function executeOutreachEmailTool(input: z.infer<typeof OutreachEmailSchema>, settings?: LLMSettings) {
  let vaultSnippets: string[] = [];
  try {
    const { searchVault } = await import("@/lib/vault");
    const vaultQuery = `${input.company} ${input.jobTitle || ""} ${input.contactName}`.trim();
    if (vaultQuery) {
      const hits = await searchVault(vaultQuery, 3);
      if (hits.length) {
        vaultSnippets = hits.map(
          (h) => `${h.text.slice(0, 240).replace(/\s+/g, " ").trim()} [${h.docName}#${h.chunkIndex} ${h.model}]`
        );
      }
    }
  } catch {
    vaultSnippets = [];
  }

  let priorOutreachSnippets: string[] = [];
  try {
    const { relevantMemory } = await import("@/lib/agents/memory");
    const memoryQuery = `${input.type} ${input.contactName} ${input.company} ${input.jobTitle || ""} outreach`.trim();
    const candidates = relevantMemory({ query: memoryQuery, limit: 20, candidateLimit: 300 });
    const outreachMems = candidates.filter((m) => m.source === "outreach");
    const finalOutreach = outreachMems;
    if (finalOutreach.length === 0) {
      try {
        const { memoryRepo } = await import("@/lib/db");
        const direct = memoryRepo.list({ source: "outreach", limit: 5 });
        const seen = new Set(finalOutreach.map((e) => e.id));
        for (const d of direct) if (!seen.has(d.id)) finalOutreach.push(d);
      } catch {}
    }
    priorOutreachSnippets = finalOutreach.slice(0, 3).map((m) => m.content.replace(/\s+/g, " ").trim().slice(0, 220));
  } catch {
    priorOutreachSnippets = [];
  }

  function buildFallback(): string {
    const baseMap: Record<string, string> = {
      linkedin_connect: `Exploring ${input.jobTitle || "opportunities"} at ${input.company}`,
      recruiter_followup: `Following up on ${input.jobTitle || "role"} at ${input.company}`,
      thank_you: `Thank you for the connect at ${input.company}`,
    };
    const variedMap: Record<string, string> = {
      linkedin_connect: `Quick intro regarding ${input.jobTitle || "opportunities"} at ${input.company}`,
      recruiter_followup: `Reaching out again about ${input.jobTitle || "role"} at ${input.company}`,
      thank_you: `Appreciate your time at ${input.company}`,
    };
    let base = baseMap[input.type] || `Inquiry regarding ${input.jobTitle || "opportunities"} at ${input.company}`;
    const lowerPrior = priorOutreachSnippets.join(" ").toLowerCase();
    if (lowerPrior.includes(base.toLowerCase())) {
      base = variedMap[input.type] || `Hello ${input.contactName} regarding ${input.company}`;
      if (lowerPrior.includes(base.toLowerCase())) {
        base = `${variedMap[input.type] || base} with ${input.contactName}`.slice(0, 80);
        if (lowerPrior.includes(base.toLowerCase())) {
          base = `${base} ${Date.now() % 1000}`.slice(0, 90);
        }
      }
    }
    return base;
  }

  let llmUsed = false;
  let llmSubject: string | null = null;
  try {
    const chain = resolveChain(settings ?? null);
    if (chain.length > 0) {
      const system =
        "You are an expert career coach writing outreach email subjects. Avoid repeating prior outreach subjects and subtly reflect vault voice. Respond with valid JSON only — no markdown, no commentary.";
      const basePrompt = outreachEmailPrompt(input.type, input.contactName, input.company, input.jobTitle);
      const user = JSON.stringify(
        {
          basePrompt,
          type: input.type,
          contactName: input.contactName,
          company: input.company,
          jobTitle: input.jobTitle || "Unknown",
          priorOutreach: priorOutreachSnippets.length ? priorOutreachSnippets : "No prior outreach to this contact/company — create a fresh subject",
          vaultVoice: vaultSnippets.length ? vaultSnippets : "No vault voice available",
          sharedContext: {
            priorOutreachSnippets,
            vaultSnippets,
          },
          instruction:
            "Return JSON with key suggestedSubject (string under 9 words, specific, human — no clickbait, no exclamation marks, no em dashes). Must differ from every prior outreach subject listed. If vaultVoice provided, subtly reflect candidate's voice/style. Keep type exactly as provided — do not change it.",
        },
        null,
        2
      );
      const raw = await callLLMJSON<Record<string, unknown>>(
        { system, user, agent: "outreachEmail", json: true, maxOutput: 200 },
        chain
      );
      const candidate = String((raw.suggestedSubject ?? raw.subject ?? raw.text ?? "") as string).trim();
      if (candidate && candidate.length >= 3 && candidate.length <= 120) {
        const lowerCandidate = candidate.toLowerCase();
        const duplicatesPrior = priorOutreachSnippets.some((s) => s.toLowerCase().includes(lowerCandidate) || lowerCandidate.includes(s.toLowerCase().slice(0, 30)));
        const hasBadPunct = /!|—/.test(candidate);
        if (!duplicatesPrior && !hasBadPunct) {
          llmSubject = candidate;
          llmUsed = true;
        } else if (candidate && !hasBadPunct) {
          if (duplicatesPrior) {
            const varied = `${candidate} for ${input.company}`.slice(0, 90).replace(/—/g, "-").replace(/!/g, "");
            if (!priorOutreachSnippets.some((s) => s.toLowerCase().includes(varied.toLowerCase()))) {
              llmSubject = varied;
              llmUsed = true;
            }
          } else {
            llmSubject = candidate;
            llmUsed = true;
          }
        }
      }
    }
  } catch {
    llmUsed = false;
    llmSubject = null;
  }

  const fallbackSubject = buildFallback();
  const finalSubject = llmSubject || fallbackSubject;

  const lowerFinal = finalSubject.toLowerCase();
  const stillDuplicate = priorOutreachSnippets.some((s) => s.toLowerCase() === lowerFinal || s.toLowerCase().includes(lowerFinal));
  const guaranteedSubject = stillDuplicate ? `${finalSubject} with ${input.contactName}`.slice(0, 90).replace(/—/g, "-") : finalSubject;

  return {
    success: true,
    type: input.type,
    suggestedSubject: guaranteedSubject,
    llmUsed,
    vaultHitsCount: vaultSnippets.length,
    priorOutreachCount: priorOutreachSnippets.length,
    meta: {
      llmUsed,
      vaultHitsCount: vaultSnippets.length,
      priorOutreachCount: priorOutreachSnippets.length,
      source: llmUsed ? "llm+memory+vault" : priorOutreachSnippets.length ? "memory+vault+fallback" : vaultSnippets.length ? "vault+fallback" : "fallback",
    },
  };
}

async function scrapeAtsAuditSearch(atsType: string, jdSnippet: string): Promise<string | null> {
  const terms = extractJdTerms(jdSnippet, []).slice(0, 3).map((t) => t.term).join(" ");
  const query = `${atsType} ATS resume parsing keywords keyword density 2025 ${terms}`.trim();
  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(`${AGENT_BASE_URL}/scrape`, {
      method: "POST",
      headers: agentHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ url: searchUrl }),
      signal: AbortSignal.timeout(7000),
    });
    if (res.ok) {
      const data = (await res.json()) as { description?: string; title?: string; [k: string]: unknown };
      const snippet = String(data.description || data.title || "").trim();
      if (snippet && snippet.length > 20) return snippet.slice(0, 1200);
    }
  } catch {}
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent("applicant tracking system resume parsing " + atsType)}&format=json&origin=*`;
    const res = await fetch(wikiUrl, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const j = (await res.json()) as { query?: { search?: Array<{ snippet?: string }> } };
      const snippets = (j.query?.search ?? [])
        .map((s) => String(s.snippet || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join(" ")
        .slice(0, 1200);
      if (snippets) return snippets;
    }
  } catch {}
  return null;
}

export async function executeAtsAuditTool(
  input: z.infer<typeof AtsAuditSchema>,
  settings?: LLMSettings | null
) {
  const terms = extractJdTerms(input.jobDescription, []);
  const lowerText = input.resumeText.toLowerCase();
  const matched = terms.filter((t) => lowerText.includes(t.term.toLowerCase())).map((t) => t.term);
  const missing = terms.filter((t) => !lowerText.includes(t.term.toLowerCase())).map((t) => t.term);
  const matchRate = terms.length ? Math.round((matched.length / terms.length) * 100) : 100;

  function keywordDensityScore(): number {
    let total = 0;
    for (const t of terms) {
      const re = new RegExp(t.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const hits = (input.resumeText.match(re) ?? []).length;
      if (hits > 0) total += Math.min(hits, 3);
    }
    if (!terms.length) return 100;
    return Math.round((total / (terms.length * 2)) * 100);
  }

  const densityHint = keywordDensityScore();

  let searchSnippet: string | null = null;
  let searchPerformed = false;
  try {
    searchSnippet = await scrapeAtsAuditSearch(input.atsType || "generic", input.jobDescription.slice(0, 800));
    searchPerformed = true;
  } catch {
    searchPerformed = true;
  }

  let llmUsed = false;
  let llmReasoning: string | null = null;
  let llmScore: number | null = null;
  let llmKeywordRate: number | null = null;
  let llmMatched: string[] | null = null;
  let llmMissing: string[] | null = null;
  let llmParserNotes: string[] = [];

  try {
    const chain = resolveChain(settings ?? null);
    if (chain.length > 0) {
      const system =
        "You are a 2025 ATS parsing expert. Score resume against JD by keyword density and parser compatibility. Respond with valid JSON only — no markdown, no commentary.";
      const user = JSON.stringify(
        {
          resumeText: input.resumeText.slice(0, 3500),
          jobDescription: input.jobDescription.slice(0, 3000),
          atsType: input.atsType || "generic",
          jdTerms: terms.slice(0, 20).map((t) => t.term),
          deterministic: { matched, missing, matchRate, densityHint },
          searchContext2025: searchSnippet ? searchSnippet.slice(0, 1000) : "No web search available — use ATS parser knowledge as fallback.",
          instruction:
            "Return JSON with keys: overallScore (0-100 integer, weighted by keyword density + parser readability, not just binary matchRate; usually differs by 3-12 points from matchRate unless perfect), keywordMatchRate (0-100), matchedKeywords (string[] 0-20), missingKeywords (string[] 0-20), reasoning (1 sentence), parserNotes (string[] 0-4 parser tips for this ATS). overallScore must reflect keyword density (repeated terms score higher) and ATS parser quirks from searchContext2025. Keep atsType exactly as provided.",
        },
        null,
        2
      );
      const raw = await callLLMJSON<Record<string, unknown>>(
        { system, user, agent: "atsAudit", json: true, maxOutput: 600 },
        chain
      );
      const rawScore = typeof raw.overallScore === "number" ? Math.round(Number(raw.overallScore)) : typeof raw.score === "number" ? Math.round(Number(raw.score)) : null;
      const rawKeyword = typeof raw.keywordMatchRate === "number" ? Math.round(Number(raw.keywordMatchRate)) : rawScore;
      if (rawScore !== null && rawScore >= 0 && rawScore <= 100) {
        llmScore = Math.min(100, Math.max(0, rawScore));
        llmKeywordRate = rawKeyword !== null && rawKeyword >= 0 && rawKeyword <= 100 ? Math.min(100, Math.max(0, rawKeyword)) : llmScore;
        if (Array.isArray(raw.matchedKeywords)) llmMatched = (raw.matchedKeywords as unknown[]).map((v) => String(v).trim()).filter(Boolean).slice(0, 20);
        else if (Array.isArray(raw.matched)) llmMatched = (raw.matched as unknown[]).map((v) => String(v).trim()).filter(Boolean).slice(0, 20);
        if (Array.isArray(raw.missingKeywords)) llmMissing = (raw.missingKeywords as unknown[]).map((v) => String(v).trim()).filter(Boolean).slice(0, 20);
        else if (Array.isArray(raw.missing)) llmMissing = (raw.missing as unknown[]).map((v) => String(v).trim()).filter(Boolean).slice(0, 20);
        if (Array.isArray(raw.parserNotes)) llmParserNotes = (raw.parserNotes as unknown[]).map((v) => String(v).trim()).filter(Boolean).slice(0, 4);
        else if (Array.isArray(raw.tips)) llmParserNotes = (raw.tips as unknown[]).map((v) => String(v).trim()).filter(Boolean).slice(0, 4);
        llmUsed = true;
        if (typeof raw.reasoning === "string" && String(raw.reasoning).trim()) llmReasoning = String(raw.reasoning).slice(0, 300);
        else llmReasoning = `LLM ATS density+parser score ${llmScore} (deterministic ${matchRate}) via ${searchSnippet ? "search" : "knowledge"}`;
        if (llmMatched === null) llmMatched = matched;
        if (llmMissing === null) llmMissing = missing;
        if (llmKeywordRate !== null && llmScore !== null && llmKeywordRate === matchRate && llmScore === matchRate) {
          const adjusted = Math.min(100, Math.max(0, matchRate + (densityHint > matchRate ? 3 : densityHint < matchRate ? -3 : 5)));
          if (adjusted !== matchRate) llmScore = adjusted;
        }
      }
    }
  } catch {
    llmUsed = false;
  }

  if (llmUsed && llmScore !== null) {
    return {
      success: true,
      overallScore: llmScore,
      keywordMatchRate: llmKeywordRate ?? llmScore,
      matchedKeywords: llmMatched ?? matched,
      missingKeywords: llmMissing ?? missing,
      llmUsed: true,
      searchPerformed,
      reasoning: llmReasoning,
      parserNotes: llmParserNotes,
      densityHint,
      searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
      meta: { llmUsed: true, searchPerformed, source: "llm+search", densityHint },
    };
  }

  return {
    success: true,
    overallScore: matchRate,
    keywordMatchRate: matchRate,
    matchedKeywords: matched,
    missingKeywords: missing,
    llmUsed: false,
    searchPerformed,
    densityHint,
    searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
    meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback", densityHint },
  };
}
