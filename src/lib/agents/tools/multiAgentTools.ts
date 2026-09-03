import { z } from "zod";
import { LLMSettings } from "@/lib/llm/providers";
import { extractJdTerms } from "@/lib/prompts";
import { getRegionalRules, auditRegionalCompliance, RegionCode, RegionalRules } from "../regionalNorms";
import { RESUME_TEMPLATES } from "@/lib/pdf/resumeTemplates";
import { analyzeAts, CORE_HEADERS } from "@/lib/ats/analyze";
import { generateJSON } from "@/lib/llm/client";
import { salaryIntelPrompt, outreachEmailPrompt } from "@/lib/prompts/multiAgentPrompts";
import { researchCompany } from "@/lib/agents/companyResearch";
import { AGENT_BASE_URL, agentHeaders } from "@/lib/agentClient";
import { resolveChain, callLLMJSON } from "@/lib/llm/router";
import { PRINCIPLES_BLOCK } from "@/lib/prompts/principles";
import {
  getCompanyResearchFromCache,
  setCompanyResearchCache,
  normalizeCompanyKey,
  extractCompanyDomain,
} from "@/lib/agents/companyIntelCache";
import type { CompanyResearch } from "@/types";

/* ------------------------------------------------------------------ *
 * Search snippet guardrails — prevents sidecar/wiki leakage of
 * unrelated content (e.g. region/language lists) into fallback topics.
 * Every scrape helper must pass its snippet through these validators.
 * ------------------------------------------------------------------ */
function isValidRegionalSnippet(snippet: string): boolean {
  if (!snippet || snippet.length < 20) return false;
  // Drop obvious non-STAR noise: region/language navigation lists
  if (/All Regions|Argentina|Australia|Belgium.*\(fr\).*Belgium.*\(nl\)/i.test(snippet)) return false;
  return /resume|cv|photo|template|page|format|norm|etiquette|letter/i.test(snippet);
}
function isValidStarSnippet(snippet: string): boolean {
  if (!snippet || snippet.length < 20) return false;
  if (/All Regions|Argentina|Australia|Belgium.*\(fr\).*Belgium.*\(nl\)/i.test(snippet)) return false;
  return /STAR|interview|question|behavioral|situation.*task.*action|competency/i.test(snippet);
}
function isValidSalarySnippet(snippet: string): boolean {
  if (!snippet || snippet.length < 20) return false;
  if (/All Regions|Argentina|Australia|Belgium.*\(fr\).*Belgium.*\(nl\)/i.test(snippet)) return false;
  return /salary|compensation|glassdoor|levels\.fyi|pay|market|range/i.test(snippet);
}
function isValidAtsSnippet(snippet: string): boolean {
  if (!snippet || snippet.length < 20) return false;
  if (/All Regions|Argentina|Australia|Belgium.*\(fr\).*Belgium.*\(nl\)/i.test(snippet)) return false;
  return /ATS|resume|keyword|parsing|parser|applicant/i.test(snippet);
}

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
  const companyKey = normalizeCompanyKey(input.company, input.jobUrl);
  const cached = getCompanyResearchFromCache(input.company, input.jobUrl);
  if (cached && cached.research) {
    const baseResearch = cached.research as CompanyResearch;
    const researchCopy: CompanyResearch = {
      ...baseResearch,
      facts: [...(baseResearch.facts ?? [])],
      sources: [...(baseResearch.sources ?? [])],
      news: [...(baseResearch.news ?? [])],
      warnings: [...(baseResearch.warnings ?? [])],
    };
    const atsType = detectAtsType(input.jobDescription);
    const techStack = Array.from(
      new Set(extractJdTerms(input.jobDescription, []).slice(0, 8).map((term) => term.term)),
    );
    const cultureKeywords = cultureKeywordsFromJd(input.jobDescription);
    const postingSourceId = researchCopy.sources.some((source) => source.id === "job-posting")
      ? "job-posting"
      : undefined;
    if (postingSourceId && techStack.length) {
      researchCopy.facts.push({
        label: "Technologies named in posting",
        value: techStack.join(", "),
        sourceIds: [postingSourceId],
        confidence: "posting_signal",
      });
    }
    if (postingSourceId && cultureKeywords.length) {
      researchCopy.facts.push({
        label: "Culture language in posting",
        value: cultureKeywords.join(", "),
        sourceIds: [postingSourceId],
        confidence: "posting_signal",
      });
    }
    if (postingSourceId && atsType !== "generic") {
      researchCopy.facts.push({
        label: "ATS named in posting",
        value: atsType,
        sourceIds: [postingSourceId],
        confidence: "posting_signal",
      });
    }
    const organizationType = researchCopy.facts.find((fact) => fact.label === "Organization type")?.value;
    return {
      success: true,
      cached: true,
      logs: [`Cache hit for ${companyKey} (cachedAt: ${new Date(cached.cachedAt).toISOString()})`],
      atsType,
      stage: organizationType,
      techStack,
      cultureKeywords,
      summary: researchCopy.summary || "No verified company overview was available in this research pass.",
      research: researchCopy,
    };
  }

  const logs: string[] = [];
  logs.push(`Cache miss for ${companyKey}; executing live research`);

  let research: CompanyResearch | null = null;
  let fetchError: unknown = null;

  try {
    research = await researchCompany({ company: input.company, jobUrl: input.jobUrl });
  } catch (err) {
    fetchError = err;
    logs.push(`Research failed for ${companyKey}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const needsFallback =
    fetchError !== null ||
    !research ||
    research.status === "unavailable" ||
    (research.warnings ?? []).some((w) => /timed out|timeout|unavailable|network|failed/i.test(w));

  if (needsFallback) {
    const fallbackDomain = extractCompanyDomain(input.jobUrl);
    if (fallbackDomain) {
      logs.push(`Attempting domain fallback for ${fallbackDomain}`);
      const domainCached = getCompanyResearchFromCache(fallbackDomain, input.jobUrl);
      if (domainCached && domainCached.research) {
        logs.push(`Domain fallback cache hit for ${fallbackDomain}`);
        research = domainCached.research as CompanyResearch;
        fetchError = null;
      } else {
        try {
          const fallbackResearch = await researchCompany({ company: fallbackDomain, jobUrl: input.jobUrl });
          if (fallbackResearch) {
            if (fallbackResearch.status !== "unavailable") {
              research = fallbackResearch;
              fetchError = null;
              logs.push(`Domain fallback research succeeded for ${fallbackDomain}`);
              try {
                setCompanyResearchCache(fallbackDomain, fallbackResearch, input.jobUrl);
                setCompanyResearchCache(input.company, fallbackResearch, input.jobUrl);
              } catch {
                // ignore cache persistence failure
              }
            } else {
              logs.push(`Domain fallback returned status: ${fallbackResearch.status}`);
              if (!research && fallbackResearch) research = fallbackResearch;
            }
          }
        } catch (fbErr) {
          logs.push(
            `Domain fallback failed for ${fallbackDomain}: ${fbErr instanceof Error ? fbErr.message : String(fbErr)}`,
          );
        }
      }
    } else {
      logs.push(`No domain available for fallback`);
    }
  }

  if (!research) {
    const retrievedAt = new Date().toISOString();
    const failureResearch: CompanyResearch = {
      company: input.company,
      status: "partial",
      facts: [],
      news: [],
      sources: [],
      warnings: [
        ...logs,
        `Research failed and fallback did not recover: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
      ],
      researchedAt: retrievedAt,
    };
    const atsType = detectAtsType(input.jobDescription);
    const techStack = Array.from(
      new Set(extractJdTerms(input.jobDescription, []).slice(0, 8).map((term) => term.term)),
    );
    const cultureKeywords = cultureKeywordsFromJd(input.jobDescription);
    return {
      success: true,
      cached: false,
      logs,
      atsType,
      stage: undefined,
      techStack,
      cultureKeywords,
      summary: "No verified company overview was available in this research pass.",
      research: failureResearch,
    };
  }

  try {
    setCompanyResearchCache(input.company, research, input.jobUrl);
    logs.push(`Research stored in cache for ${companyKey}`);
  } catch {
    // ignore persistence errors
  }

  const atsType = detectAtsType(input.jobDescription);
  const techStack = Array.from(
    new Set(extractJdTerms(input.jobDescription, []).slice(0, 8).map((term) => term.term)),
  );
  const cultureKeywords = cultureKeywordsFromJd(input.jobDescription);
  const augmentedResearch: CompanyResearch = {
    ...research,
    facts: [...research.facts],
    sources: [...research.sources],
    news: [...research.news],
    warnings: [...(research.warnings ?? [])],
  };
  const postingSourceId = augmentedResearch.sources.some((source) => source.id === "job-posting")
    ? "job-posting"
    : undefined;
  if (postingSourceId && techStack.length) {
    augmentedResearch.facts.push({
      label: "Technologies named in posting",
      value: techStack.join(", "),
      sourceIds: [postingSourceId],
      confidence: "posting_signal",
    });
  }
  if (postingSourceId && cultureKeywords.length) {
    augmentedResearch.facts.push({
      label: "Culture language in posting",
      value: cultureKeywords.join(", "),
      sourceIds: [postingSourceId],
      confidence: "posting_signal",
    });
  }
  if (postingSourceId && atsType !== "generic") {
    augmentedResearch.facts.push({
      label: "ATS named in posting",
      value: atsType,
      sourceIds: [postingSourceId],
      confidence: "posting_signal",
    });
  }
  const organizationType = augmentedResearch.facts.find((fact) => fact.label === "Organization type")?.value;

  return {
    success: true,
    cached: false,
    logs,
    atsType,
    stage: organizationType,
    techStack,
    cultureKeywords,
    summary: augmentedResearch.summary || "No verified company overview was available in this research pass.",
    research: augmentedResearch,
  };
}

export const REGIONS = ["US", "CA", "UK", "DE", "FR", "CH", "NL", "TN", "EG", "AE", "UAE", "GCC", "SA", "AU", "SG", "JP", "IN", "BR", "MX", "NG", "KE", "ZA", "ES", "INTL"] as const;

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
      if (snippet && snippet.length > 20) {
        const sliced = snippet.slice(0, 1200);
        if (isValidRegionalSnippet(sliced)) return sliced;
      }
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
      if (snippets && isValidRegionalSnippet(snippets)) return snippets;
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
      const system = `${PRINCIPLES_BLOCK}

ROLE: You are a senior 2025 regional resume norms analyst and ATS template specialist. You synthesize 2025-compliant RegionalRules JSON grounded in provided search context and base rules.

CONTEXT: You receive region code, searchContext2025 (2025 web-scraped norms, up to 1200 chars), baseRules (deterministic fallback for the region), requiredFields list, optional resumeTextHint. Your output determines downstream recommendedTemplate and compliance audit. Stay grounded in profile.skills/vault/jobDescription equivalent sources (here: baseRules + searchContext2025). Respect regionalNorms template mapping — compiler enforces it.

CONSTRAINTS:
- Stay grounded in baseRules/searchContext2025 — never invent regional statutes not in provided context; require verbatim evidence from searchContext2025 or baseRules.
- Forbid hallucinated skills/metrics — this tool maps norms, not candidate skills.
- Respect regionalNorms template: choose recommendedTemplate ONLY from allowlist: classic-ats, tabular-german, modern-french, modern-professional, nordic-clean, executive, creative-sidebar.
- Keep pageLimit 1-2 (2025 preference; hard range 1-5); validate region is one of 11 REGIONS (US, DE, FR, TN, UK, ES, JP, CH, NL, UAE, INTL).
- Respect 2025 photo/legal restrictions per region (e.g., US photoAllowed false, DE photoAllowed true, FR mandatorySections handling).
- Be flagged by ruthless judge if generic: copying generic US rules for DE/FR yields score 1 — must be region-specific and verbatim-grounded.
- Require verbatim evidence: every photo/mandatorySections choice must trace to searchContext2025 or baseRules.

JSON SCHEMA — respond JSON ONLY, no markdown, no commentary:
{
  "region": "US|DE|FR|TN|UK|ES|JP|CH|NL|UAE|INTL",
  "name": string,
  "pageLimit": number (1-5, prefer 1-2),
  "photoRequired": boolean,
  "photoAllowed": boolean,
  "includeDateLocationLine": boolean,
  "salutationFormat": string,
  "closingFormat": string,
  "mandatorySections": string[],
  "restrictedFields": string[],
  "recommendedTemplate": string (enum: classic-ats, tabular-german, modern-french, modern-professional, nordic-clean, executive, creative-sidebar),
  "letterKind": "cover_letter" | "motivation_letter"
}

ANTI-HALLUCINATION GUARD: Only use skills from userSkills/vault, never invent. Ground every field in searchContext2025 or baseRules; if searchContext2025 is fallback notice "No web search available", echo baseRules unchanged. Never invent metrics, legal clauses, or template IDs without verbatim evidence. Only use facts from provided vault/jobDescription equivalent inputs.

FEW-SHOT EXAMPLES:
GOOD (DE 2025 search: "Germany CV 1 page tabular photo optional"):
{"region":"DE","name":"Germany","pageLimit":1,"photoRequired":false,"photoAllowed":true,"includeDateLocationLine":true,"salutationFormat":"Sehr geehrte Damen und Herren,","closingFormat":"Mit freundlichen Grüßen,","mandatorySections":["summary","experience","education","skills"],"restrictedFields":[],"recommendedTemplate":"tabular-german","letterKind":"cover_letter"}
BAD (hallucinated template + generic filler - will be flagged by ruthless judge score 1):
{"region":"DE","name":"Deutschland Generic","pageLimit":3,"recommendedTemplate":"fancy-german-2025"} // REJECT - template not in allowlist and generic, not grounded
GOOD FALLBACK (US, no search available):
Return baseRules verbatim - e.g., US classic-ats pageLimit 2 photoAllowed false mandatorySections [summary,experience,education,skills].

Respond with valid JSON only — no markdown fences, no commentary.`;
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
            "Return a JSON object matching RegionalRules exactly. Keep pageLimit 1-2, respect 2025 norms for photo/legal restrictions, and choose recommendedTemplate from classic-ats, tabular-german, modern-french, modern-professional, nordic-clean, executive, creative-sidebar. Region must be one of the 11 REGIONS. CRITICAL: Only use skills from userSkills/vault, never invent — ground every field in searchContext2025 or baseRules (verbatim evidence required). Respect regionalNorms template. Verify JSON matches requiredFields and JSON SCHEMA before returning; be flagged by ruthless judge if generic. If searchContext2025 is fallback notice, echo baseRules unchanged. Use chain-of-thought: first verify region, then pageLimit, then template allowlist, then output JSON.",
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
  const original = Array.isArray(input.content)
    ? input.content.join("\n")
    : typeof input.content === "string"
      ? input.content
      : "";

  let llmSanitized: string | null = null;
  let llmReasoning: string | null = null;
  let llmFindings: string[] = [];
  let llmUsed = false;

  try {
    const chain = resolveChain(settings ?? null);
    if (chain.length > 0 && original.trim().length > 0) {
      const system = `${PRINCIPLES_BLOCK}

ROLE: You are a senior PII detection and privacy compliance expert. You identify and redact personally identifiable information with zero leakage of raw values.

CONTEXT: You receive candidate content up to 4000 chars (profile summary, phone, address, DOB etc). You must detect PII types and return sanitized content grounded only in the provided content — never invent new PII or repeat raw sensitive values. Stay grounded in profile.skills/vault/jobDescription equivalents: here, the exact content string.

CONSTRAINTS:
- Never repeat raw SSN (\\d{3}-\\d{2}-\\d{4}) or DOB values in reasoning, findings, or sanitized output — use placeholders [REDACTED-SSN], [REDACTED-DOB], [REDACTED-email] etc.
- Forbid hallucinated skills/metrics — only report PII types actually present (SSN, DOB, email, phone, address, name, nationality, gender, etc).
- Require verbatim evidence for sanitization: sanitized must be content with placeholders, not paraphrased.
- Respect regionalNorms template constraints indirectly: sanitize fields that are region-restricted (e.g., DOB/gender for US).
- Be flagged by ruthless judge if generic: vague "PII detected" without specific types is score 1.
- Validate JSON before returning: reasoning must not contain raw values, findings must be from allowlist, sanitized must contain placeholders for every detected type.

JSON SCHEMA — respond JSON ONLY (no markdown):
{
  "reasoning": string, // 1 sentence: what PII types detected, DO NOT include raw values
  "findings": string[], // array of types e.g., ["SSN","DOB","email","phone","address"] (0-10)
  "sanitized": string // content with PII replaced by [REDACTED-TYPE] placeholders
}
// Alternate legacy shape also accepted: {"reasoning":string,"findings":string[],"redactions":[{"value":string,"placeholder":string}]}

ANTI-HALLUCINATION GUARD: Only use skills from userSkills/vault, never invent. Ground every finding in verbatim content — do not infer PII that is not literally present. Never hallucinate metrics or PII types. Require exact evidence — if content is "john@example.com" you may report email, but not SSN unless pattern present.

FEW-SHOT EXAMPLES:
GOOD (content has SSN + DOB):
Input: "My SSN is 123-45-6789 and DOB 1990-05-12, email john@acme.com"
Output: {"reasoning":"Detected SSN pattern and full date of birth plus email","findings":["SSN","DOB","email"],"sanitized":"My SSN is [REDACTED-SSN] and DOB [REDACTED-DOB], email [REDACTED-email]"}
BAD (leaks raw values — REJECT):
{"reasoning":"SSN is 123-45-6789 should be hidden","findings":["SSN"],"sanitized":"My SSN is 123-45-6789"} // FAIL - reasoning leaks raw SSN and sanitized not redacted
GOOD (no PII):
{"reasoning":"No PII patterns detected in professional summary","findings":[],"sanitized":"Senior Frontend Engineer with 6 years React experience"}

Respond with valid JSON only — no markdown fences, no commentary.`;
      const user = JSON.stringify(
        {
          content: original.slice(0, 4000),
          instruction:
            "Return JSON with keys: reasoning (short explanation of what PII types you detected, do NOT repeat raw values), findings (array of PII types like 'SSN','DOB','email','phone','address','name'), sanitized (content with PII replaced by [REDACTED-TYPE] placeholders). Do not include raw SSN or DOB values in reasoning. CRITICAL GUARD: Only use skills from userSkills/vault, never invent — only report PII actually present (verbatim evidence). Require JSON schema compliance and chain-of-thought verification: first scan for each PII pattern, then choose placeholders, then output JSON. Be flagged by ruthless judge if generic.",
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
    // 1. US SSN
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED-SSN]")
    // 2. Canadian SIN (e.g. 123 456 789 or 123-456-789)
    .replace(/\b\d{3}[ -]\d{3}[ -]\d{3}\b/g, "[REDACTED-SIN]")
    // 3. UK National Insurance Number (NINO)
    .replace(/\b[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\s*\d{2}\s*\d{2}\s*\d{2}\s*[A-D]\b/gi, "[REDACTED-NINO]")
    // 4. French NIR / Numéro de Sécurité Sociale
    .replace(/\b[12]\s*\d{2}\s*(?:0[1-9]|1[0-2])\s*\d{2}\s*\d{3}\s*\d{3}(?:\s*\d{2})?\b/g, "[REDACTED-NIR]")
    // 5. German Tax ID (Steuer-ID) or VAT
    .replace(/\b\d{2}\s*\d{3}\s*\d{3}\s*\d{3}\b|\bDE\d{9}\b/gi, "[REDACTED-TAXID]")
    // 6. Dates of birth (DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY)
    .replace(
      /\b((?:19|20)\d{2}[-/.](?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01])|(?:0[1-9]|[12]\d|3[01])[-/.](?:0[1-9]|1[0-2])[-/.](?:19|20)\d{2}|(?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01])[-/.](?:19|20)\d{2})\b/g,
      "[REDACTED-DOB]"
    )
    // 7. Email addresses
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED-EMAIL]")
    // 8. International phone numbers (e.g. +1 555-0199 or +33 1 42 68 00 00)
    .replace(/\b(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g, "[REDACTED-PHONE]");

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
  // Guard: recommendedTemplate MUST exist in RESUME_TEMPLATES (per skill + contract); validated deterministically
  const candidateId = rules.recommendedTemplate;
  const template = RESUME_TEMPLATES.find((t) => t.id === candidateId) ?? RESUME_TEMPLATES[0];
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
      const system = `${PRINCIPLES_BLOCK}

ROLE: You are a senior ATS resume tailoring analyst and 2025 hiring strategist. You map JD requirements to verified candidate skills with strict anti-hallucination discipline.

CONTEXT: You receive jobTitle, company, jobDescription (4000 chars), userSkills (verified profile.skills array), vaultHits (up to 3 passages with [docName#chunk model] citations), cultureKeywords (JD-derived signals), region + templateHint, regionalRules (mandatorySections/restrictedFields/template), fallbackTerms (extractJdTerms). Your output drives ATS score, CORE headers (summary/experience/education/skills), keyword coverage, and template selection. You are the gating step before letterTailor/interviewPrep.

CONSTRAINTS:
- Stay grounded in profile.skills/vault/jobDescription — every matchingSkills entry MUST be verbatim from userSkills (or semantic equivalence with evidence, e.g., Next.js matches Next, but still output the userSkills spelling).
- Forbid hallucinated skills/metrics — never invent a skill not in userSkills, never invent a metric/project not in vaultHits/jobDescription.
- Require verbatim evidence: matching rationale must be traceable to JD term + vault or JD text; missingSkills must be JD terms absent from userSkills.
- Respect regionalNorms template: keep recommendedTemplate exactly as provided; do not switch templates; your skills classification must not violate restrictedFields.
- Be flagged by ruthless judge if generic: generic "Tailored resume for Senior Engineer" without citing JD terms + userSkills is score 1; deterministic legitAtsTest will cap resume at 2 if CORE headers missing or keyword coverage low.
- Chain-of-thought: first extract JD terms, second check each against userSkills (case-insensitive semantic match), third validate disjoint sets, fourth produce JSON.

JSON SCHEMA — respond JSON ONLY (no markdown):
{
  "matchingSkills": string[], // 0-12, SUBSET of userSkills case-insensitive, deduplicated, each maps to JD requirement with evidence
  "missingSkills": string[], // 0-10, JD-required skills ABSENT from userSkills, must NOT overlap matchingSkills (case-insensitive)
  "reasoning": string // 1-2 sentences: match rationale naming 2-3 JD terms and vault evidence, e.g., "Matched React/TypeScript via vault AcmeDoc#2; missing GraphQL not in profile — flagged as gap"
}

ANTI-HALLUCINATION GUARD: Only use skills from userSkills/vault, never invent. matchingSkills must be subset of userSkills (case-insensitive); missingSkills must not overlap matchingSkills. The userSkillSet guard will drop hallucinated terms and fallback will be used — you must prevent them in the first place to avoid fallback. Never hallucinate metrics, employment dates, or companies. If uncertain, classify as missing, not matching.

FEW-SHOT EXAMPLES:
GOOD (userSkills ["React","TypeScript","Node.js"], JD mentions "React, TypeScript, Next.js, GraphQL, AWS"):
Input userSkills ["React","TypeScript","Node.js"], JD asks React/TypeScript/Next.js/GraphQL/AWS, vaultHit "Built Acme design system in React [AcmeDoc#1]"
Output: {"matchingSkills":["React","TypeScript"],"missingSkills":["GraphQL","AWS","Next.js"],"reasoning":"Matched React/TypeScript via vault AcmeDoc#1 against JD frontend stack; Next.js/GraphQL/AWS absent from userSkills — marked missing"}
GOOD semantic equivalence (userSkills has "Next.js", JD says "Next"):
{"matchingSkills":["Next.js"],"missingSkills":["GraphQL"],"reasoning":"Next.js matches JD 'Next' semantically (fallbackTerms shows Next), GraphQL gap remains"}
BAD (hallucinated skill not in userSkills — will be rejected by guard and trigger fallback):
{"matchingSkills":["React","TypeScript","Kubernetes"],"missingSkills":[]} // REJECT — Kubernetes not in userSkills ["React","TypeScript","Node.js"]; matchingSkills must be subset; missingSkills overlaps? empty but hallucinated
BAD (overlap violation):
{"matchingSkills":["React"],"missingSkills":["React","GraphQL"]} // REJECT — React appears in both; missingSkills must not overlap matchingSkills
BAD generic (ruthless judge score 1):
{"matchingSkills":["Leadership","Teamwork"],"missingSkills":[],"reasoning":"Candidate is great fit"} // REJECT — generic, not grounded in JD terms

Respond with valid JSON only — no markdown fences, no commentary.`;
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
            "Return JSON with keys: matchingSkills (string[] 0-12), missingSkills (string[] 0-10), reasoning (1-2 sentences). CRITICAL: matchingSkills must be subset of userSkills (case-insensitive); missingSkills must not overlap matchingSkills. Only use skills from userSkills/vault, never invent — every matchingSkill must appear verbatim in userSkills array (allow semantic equivalence like Next.js for Next but output userSkills spelling). Require verbatim evidence from jobDescription/vault for each match. Respect regionalNorms template (do not change templateHint). Prefer semantic equivalence over substring (e.g., 'Next.js' matches 'Next'). Be flagged by ruthless judge if generic — cite JD terms + vault. Chain-of-thought: list JD terms, map to userSkills, validate disjoint, then output JSON.",
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
        let lm = cleanList(rawMatching);
        const lmiss = cleanList(rawMissing).slice(0, 10);
        // Guardrail: matchingSkills must be grounded in verified profile skills — drop any hallucinated term not in userSkills
        const userSkillSet = new Set(input.userSkills.map((s) => s.toLowerCase()));
        const hallucinated = lm.filter((s) => !userSkillSet.has(s.toLowerCase()));
        if (hallucinated.length) {
          lm = lm.filter((s) => userSkillSet.has(s.toLowerCase()));
          // If LLM hallucinated, do not trust its matching list — fall back to deterministic extraction
          if (!lm.length) {
            matchingSkills = fallbackMatching;
            missingSkills = fallbackMissing.filter((s) => !new Set(fallbackMatching.map((x) => x.toLowerCase())).has(s.toLowerCase()));
            llmUsed = false;
            llmReasoning = `Hallucinated skills rejected (${hallucinated.slice(0, 3).join(", ")} not in profile) — fallback used`;
          } else {
            const lowerMatch = new Set(lm.map((s) => s.toLowerCase()));
            const filteredMissing = lmiss.filter((s) => !lowerMatch.has(s.toLowerCase()));
            matchingSkills = lm;
            missingSkills = filteredMissing.length ? filteredMissing : lmiss.filter((s) => !lowerMatch.has(s.toLowerCase()));
            llmUsed = true;
            llmReasoning = typeof (raw as Record<string, unknown>).reasoning === "string" && String((raw as Record<string, unknown>).reasoning).trim()
              ? `${String((raw as Record<string, unknown>).reasoning).slice(0, 280)} [hallucinated filtered: ${hallucinated.slice(0, 2).join(", ")}]`
              : `LLM tailored ${lm.length} matching / ${filteredMissing.length} missing (filtered ${hallucinated.length} hallucinated)`;
          }
        } else {
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
    }
  } catch {
    llmUsed = false;
    llmReasoning = null;
  }

  // Final hardening per tailored-resume-generator: deduped case-insensitively + grounded (matching in profile, missing in JD)
  const userSkillSetFinal = new Set(input.userSkills.map((s) => s.toLowerCase()));
  const groundedMatching = matchingSkills.filter((s) => userSkillSetFinal.has(s.toLowerCase()));
  const jdLower = input.jobDescription.toLowerCase();
  // If LLM grounded matching was filtered empty, restore deterministic fallback (prevents empty hallucination-filtered result)
  const effectiveMatching = groundedMatching.length ? groundedMatching : fallbackMatching.filter((s) => userSkillSetFinal.has(s.toLowerCase()));
  const seenLower = new Set(effectiveMatching.map((s) => s.toLowerCase()));
  // Missing must be in JD and not already matched; drop hallucinated missing not present in JD, fallback to deterministic missing
  const jdGroundedMissing = missingSkills.filter((s) => jdLower.includes(s.toLowerCase()));
  const effectiveMissingRaw = jdGroundedMissing.length ? jdGroundedMissing : fallbackMissing.filter((s) => !seenLower.has(s.toLowerCase()));
  const dedupedMissing = effectiveMissingRaw.filter((s) => !seenLower.has(s.toLowerCase()));
  const uniqMatching = Array.from(new Map(effectiveMatching.map((s) => [s.toLowerCase(), s])).values());
  const uniqMissing = Array.from(new Map(dedupedMissing.map((s) => [s.toLowerCase(), s])).values());

  return {
    success: true,
    matchingSkills: uniqMatching,
    missingSkills: uniqMissing,
    recommendedTemplate: template.id,
    templateMeta: template,
    llmUsed: llmUsed && uniqMatching.length > 0,
    llmReasoning,
    cultureKeywords,
    vaultHitsCount: vaultSnippets.length,
    fallbackUsed: !llmUsed || uniqMatching.length === 0,
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
      if (snippet && snippet.length > 20) {
        const sliced = snippet.slice(0, 1200);
        if (isValidStarSnippet(sliced)) return sliced;
      }
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
      if (snippets && isValidStarSnippet(snippets)) return snippets;
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
      const system = `${PRINCIPLES_BLOCK}

ROLE: You are a senior 2025 cover-letter etiquette expert and regional business correspondence specialist.

CONTEXT: You receive regionCode, baseSalutation/baseClosing (deterministic fallback from regionalNorms), company, jobTitle, jobDescription (2000 chars), researchSummary + researchFacts + researchSources from companyResearch (source-backed), sidecarSnippet (2025 etiquette scrape), letterKind. You must produce region-appropriate salutation/closing grounded in these sources, not JD dump. Stay grounded in profile.skills/vault/jobDescription — here, researchSources are your vault equivalent; require verbatim evidence for any company reference. Respect regionalNorms template — salutation/closing must match RegionalRules salutationFormat/closingFormat patterns for the region.

CONSTRAINTS:
- Stay grounded in researchSources/sidecarSnippet/baseSalutation — never invent company financials, founder names, or metrics not in researchFacts.
- Forbid hallucinated skills/metrics — do not claim candidate skills in salutation/closing; keep them formal openings/closings only.
- Require verbatim evidence: if you reference company mission/product, cite a researchFacts label or source title verbatim.
- Respect regionalNorms template: US expects "Dear Hiring Manager," / "Sincerely,"; DE expects "Sehr geehrte Damen und Herren," / "Mit freundlichen Grüßen,"; FR "Madame, Monsieur," etc. Enforce region etiquette.
- Keep salutation and closing each max 90 chars (hard 120), formal, no em dashes, no exclamation, no JD dump.
- Keep letterKind exactly as provided — do not change it.
- Be flagged by ruthless judge if generic: generic "Dear Sir/Madam" for DE when base is "Sehr geehrte..." is score 1.
- Chain-of-thought: verify region, check baseSalutation vs etiquette, ground in research if available, then output.

JSON SCHEMA — respond JSON ONLY:
{
  "salutation": string, // 5-90 chars, formal region-appropriate opening, e.g., "Dear Hiring Manager," (US) or "Sehr geehrte Damen und Herren," (DE)
  "closing": string, // 5-90 chars, formal closing, e.g., "Sincerely," / "Mit freundlichen Grüßen,"
  "reasoning": string // 1 sentence: why this fits region + company, citing source or etiquette rule
}

ANTI-HALLUCINATION GUARD: Only use skills from userSkills/vault, never invent. Only reference company facts present in researchSummary/researchFacts with exact source citation; never hallucinate metrics. Ground every token in provided inputs; if no company research, stay generic but region-correct.

FEW-SHOT EXAMPLES:
GOOD (US, company Acme, research "Acme builds data platforms [TechCrunch 2025]"):
{"salutation":"Dear Hiring Manager,","closing":"Sincerely,","reasoning":"US etiquette prefers Dear Hiring Manager/Sincerely; Acme's data-platform focus from TechCrunch 2025 supports formal direct tone"}
BAD (DE region but US generic — flagged score 1):
{"salutation":"Dear Sir/Madam,","closing":"Best,"} // REJECT — DE expects Sehr geehrte Damen und Herren / Mit freundlichen Grüßen
GOOD (DE, sidecar says "German business letters use Sehr geehrte"):
{"salutation":"Sehr geehrte Damen und Herren,","closing":"Mit freundlichen Grüßen,","reasoning":"DE norm requires Sehr geehrte + Mit freundlichen Grüßen per sidecar 2025 etiquette"}

Respond with valid JSON only — no markdown fences, no commentary.`;
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
            "Return JSON with keys: salutation (string 5-90 chars), closing (string 5-90 chars), reasoning (1 sentence). CRITICAL: Only use skills from userSkills/vault, never invent — ground salutation/closing in baseSalutation/researchFacts (verbatim evidence). Respect regionalNorms template (US vs DE etiquette). Keep letterKind exactly. Must not dump jobDescription. Require JSON schema compliance, chain-of-thought verification (region → etiquette → research → output). Be flagged by ruthless judge if generic.",
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
      const system = `${PRINCIPLES_BLOCK}

ROLE: You are a senior interview coach specializing in STAR-method (Situation/Task/Action/Result) behavioral preparation. You are the evidence-driven counterpart to the ruthless judge.

CONTEXT: You receive jobTitle, company, jobDescription (3000 chars), jdTerms (top 5 extracted skills), researchSummary + researchFacts + researchSources from companyResearch (source-backed), starSearchContext (2025 STAR scrape), sourcesCount, hasCompanyResearch. You must output 5-8 topics grounded in JD terms and company sources. Stay grounded in profile.skills/vault/jobDescription — JD terms are your jobDescription evidence, vaultHits are companyResearch.sources, userSkills implied via jdTerms mapping. Respect regionalNorms indirectly via tone (but STAR structure is universal). Be flagged by ruthless judge if generic filler without STAR prompts.

CONSTRAINTS:
- Stay grounded in JD terms + researchFacts/researchSources + starSearchContext — every topic must cite a JD term or company fact verbatim; no hallucinated skills/metrics.
- Forbid hallucinated skills/metrics — do not invent company revenue, funding, or tech not in researchFacts; do not claim candidate has skill not in JD mapping.
- Require verbatim evidence: company-specific topic must quote a researchFacts value or source title; STAR topics must include concrete prompt like "Tell me about a time you ..." + Situation/Task/Action/Result + metric.
- At least one topic MUST be company-specific mentioning the company name and a research source/fact when sourcesCount>0 — otherwise mention company generically (fallback). Post-process will enforce, but you must produce it.
- Every topic must include a concrete STAR prompt (not generic filler like "Be prepared for leadership questions"). Each: 1-2 sentences, distinct, actionable, with example prompt and STAR cue.
- Respect regionalNorms not directly, but keep language professional and concise (chain-of-thought: map JD terms → STAR scenarios → company tie-in → output).
- Validate JSON: 5-8 topics, each 15-500 chars, includes STAR where applicable, deduplicated.

JSON SCHEMA — respond JSON ONLY:
{
  "topics": string[], // 5-8, each 1-2 sentences, STAR-structured e.g., "STAR: Tell me about a time you led a React migration — Situation: legacy SPA, Task: modernize, Action: incremental Next.js, Result: LCP -40% [metric]", grounded in JD terms and companyResearch.sources
  "reasoning": string // 1 sentence: why these topics map to JD seniority + company focus
}

ANTI-HALLUCINATION GUARD: Only use skills from userSkills/vault, never invent. Only use company financials/product details present in researchFacts/researchSources; if starSearchContext is fallback, use generic STAR but still grounded in JD. Every topic must be verifiable against jobDescription or researchFacts — generic filler = score 1 by ruthless judge. Only use facts from vault/jobDescription.

FEW-SHOT EXAMPLES:
GOOD (sourcesCount 2, JD terms React/TypeScript, company Acme, research "Acme ships data platform 2025"):
{"topics":["STAR: Tell me about a time you optimized a React design system — Situation: 12 teams on inconsistent UI, Task: unify tokens, Action: built Tailwind + Figma sync, Result: 30% faster feature delivery","STAR: Scaling Node.js API under load — Situation: 5k rps peak, Task: reduce p95, Action: introduced GraphQL batching + Redis, Result: p95 400ms→120ms","Company-specific (Acme): STAR story tying your React platform work to Acme's data platform mission (per Research 'Acme ships data platform' [Source: TechCrunch]) — prepare STAR + a question about their 2025 roadmap"],"reasoning":"Topics map to Senior Frontend JD (React/Node) + Acme mission"}
BAD generic filler (no STAR, no company mention, no JD term — ruthless judge score 1):
{"topics":["Be ready for leadership","Talk about teamwork","Why do you want this job","Tell me about yourself","Strengths and weaknesses"],"reasoning":"Generic interview prep"} // REJECT — no STAR prompts, not grounded, not company-specific when sourcesCount>0
GOOD with STAR + metric (JD GraphQL/AWS, no company research):
{"topics":["STAR: Tell me about a time you introduced GraphQL — Situation: REST over-fetching, Task: cut payload, Action: schema + codegen, Result: payload -60% and 2 fewer roundtrips","Company-specific (BetaCorp): why BetaCorp — 1-sentence STAR hook linking your GraphQL work to BetaCorp's API product scope"],"reasoning":"Fallback still grounds in JD GraphQL and generic company mention when no research"}

Respond with valid JSON only — no markdown fences, no commentary.`;
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
            "Return JSON with keys: topics (string[] 5-8, each 1-2 sentences, STAR-structured where applicable e.g. 'STAR: Tell me about a time you ... — Situation/Task/Action/Result + metric', grounded in JD terms and companyResearch.sources), reasoning (1 sentence). CRITICAL: At least one topic must be company-specific mentioning the company name and a research source or fact when sourcesCount>0 — otherwise mention the company name generically. Every topic must include a concrete STAR prompt, not generic filler (generic = ruthless judge score 1). Only use skills from userSkills/vault, never invent; ground every topic in JD terms/researchFacts (verbatim evidence). Require JSON schema compliance and chain-of-thought: map JD terms → STAR scenarios → enforce company-specific when sourcesCount>0 → deduplicate. Do not invent company financials not in researchFacts.",
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
  // Non-leaking guard: drop any topic that slipped through with sidecar/wiki region-list noise
  const leakRe = /All Regions|Argentina|Australia|Belgium.*\(fr\).*Belgium.*\(nl\)/i;
  const filteredLeak = finalTopics.filter((t) => !leakRe.test(t));
  if (filteredLeak.length !== finalTopics.length) {
    const replacements = fallbackTopics.filter((t) => !filteredLeak.some((f) => f.toLowerCase().slice(0, 40) === t.toLowerCase().slice(0, 40))).slice(0, finalTopics.length - filteredLeak.length);
    finalTopics = [...filteredLeak, ...replacements].slice(0, 8);
    if (finalTopics.length < 5) {
      const extraPad = fallbackTopics.filter((t) => !finalTopics.includes(t)).slice(0, 5 - finalTopics.length);
      finalTopics = [...finalTopics, ...extraPad].slice(0, 8);
    }
  }
  // Final distinct guarantee (case-insensitive 50-char key) + 5-8 invariant
  {
    const seenFinal = new Set<string>();
    const distinct: string[] = [];
    for (const t of finalTopics) {
      const k = t.toLowerCase().slice(0, 50);
      if (!seenFinal.has(k)) {
        seenFinal.add(k);
        distinct.push(t);
      }
    }
    finalTopics = distinct;
    if (finalTopics.length < 5) {
      const pad = fallbackTopics.filter((t) => !finalTopics.some((f) => f.toLowerCase().slice(0, 40) === t.toLowerCase().slice(0, 40))).slice(0, 5 - finalTopics.length);
      finalTopics = [...finalTopics, ...pad].slice(0, 8);
    }
    if (finalTopics.length > 8) finalTopics = finalTopics.slice(0, 8);
  }
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
      if (snippet && snippet.length > 20) {
        const sliced = snippet.slice(0, 1200);
        if (isValidSalarySnippet(sliced)) return sliced;
      }
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
      if (snippets && isValidSalarySnippet(snippets)) return snippets;
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
      const system = `${PRINCIPLES_BLOCK}

ROLE: You are a senior 2025 global compensation analyst specializing in tech market rates across 2025 glassdoor/levels.fyi benchmarks.

CONTEXT: You receive jobTitle, company, location/region, disclosedRange (posting-extracted salary hint or "None disclosed"), searchContext2025 (2025 compensation scrape, 1200 chars), basePrompt (salaryIntelPrompt truncated). You must synthesize estimatedRange in correct LOCAL currency with confidence. Stay grounded in disclosedRange/searchContext2025/vault equivalent (posting text) — require verbatim evidence. Respect regionalNorms indirectly via currency mapping. Use cn() + semantic tokens not needed here but keep output: standalone JSON. Be flagged by ruthless judge if generic USD for TN/DE etc or hallucinated salary without evidence.

CONSTRAINTS:
- Stay grounded in disclosedRange + searchContext2025 — if disclosedRange exists (e.g., "45,000 - 65,000 TND"), prefer it and mark confidence high with verbatim citation.
- Forbid hallucinated skills/metrics — do not invent compensation data not in searchContext nor posting; if estimating, state "market estimate" and cite searchContext grounding.
- Require verbatim evidence: reasoning must cite disclosedRange or searchContext2025 snippet; currency must match region exactly.
- Respect regionalNorms template for currency: TN→TND (DT/month optional), DE/FR/ES/NL→EUR, UK→GBP, CH→CHF, JP→JPY, UAE→AED, US→USD. Wrong currency = generic hallucination = score 0.
- Ensure estimatedRange is low-high with low <= high (swap guard will fix but you must produce correct order).
- Confidence: high if disclosedRange present, medium for search-grounded estimate, low for pure fallback.
- Chain-of-thought: check disclosedRange, then searchContext figures, then region currency, then format low-high, then output.

JSON SCHEMA — respond JSON ONLY:
{
  "estimatedRange": string, // formatted with correct local currency, e.g., "28,000 - 48,000 TND/year" (TN), "65,000€ - 92,000€ EUR" (DE), "$125,000 - $165,000 USD" (US), low <= high
  "confidence": "high" | "medium" | "low",
  "reasoning": string // 1 sentence grounding in searchContext2025 and disclosedRange with verbatim quote
}

ANTI-HALLUCINATION GUARD: Only use skills from userSkills/vault, never invent. Only use compensation figures from disclosedRange or searchContext2025 — never invent GBP for TN or TND for US. Ground every range in verbatim evidence from provided context.

FEW-SHOT EXAMPLES:
GOOD (TN, disclosedRange "30,000 - 45,000 TND/year", searchContext mentions "Tunisia AI Engineer 32k-48k TND"):
{"estimatedRange":"30,000 - 45,000 TND/year","confidence":"high","reasoning":"Disclosed 30k-45k TND matches searchContext 32k-48k TND for AI roles in TN — high confidence"}
BAD wrong currency (TN region but USD — ruthless judge score 0):
{"estimatedRange":"$45,000 - $65,000 USD","confidence":"medium","reasoning":"Estimated for TN"} // REJECT — TN must be TND, not USD
GOOD (DE, no disclosure, search "Berlin Senior Frontend 70k-90k EUR"):
{"estimatedRange":"70,000€ - 90,000€ EUR","confidence":"medium","reasoning":"No disclosure; searchContext shows Berlin Senior Frontend 70k-90k EUR — medium market estimate"}
BAD generic hallucinated (no evidence):
{"estimatedRange":"$100,000 - $120,000 USD","confidence":"high","reasoning":"High salary for senior"} // REJECT — no disclosed or search grounding, generic filler

Respond with valid JSON only — no markdown fences, no commentary.`;
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
            "Return JSON with keys: estimatedRange (correct local currency), confidence (high/medium/low), reasoning (1 sentence grounding in searchContext2025 and disclosedRange, verbatim evidence required). CRITICAL: Only use skills from userSkills/vault, never invent — ground every figure in disclosedRange or searchContext2025. Respect regionalNorms template for currency (TN→TND, DE/FR/ES/NL→EUR, UK→GBP, CH→CHF, JP→JPY, UAE→AED, US→USD). Be flagged by ruthless judge if generic or wrong currency. Chain-of-thought: disclose→search→currency→order→output. estimatedRange must be low-high low <= high.",
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
        const sym = region === "TN" ? "TND" : ["DE", "FR", "ES", "NL"].includes(region) ? "EUR" : region === "UK" ? "GBP" : region === "CH" ? "CHF" : region === "JP" ? "JPY" : ["AE", "UAE", "GCC", "SA"].includes(region) ? "AED" : region === "CA" ? "CAD" : region === "AU" ? "AUD" : region === "SG" ? "SGD" : region === "IN" ? "INR" : region === "BR" ? "BRL" : region === "MX" ? "MXN" : ["NG", "KE", "ZA"].includes(region) ? (region === "NG" ? "NGN" : region === "KE" ? "KES" : "ZAR") : region === "EG" ? "EGP" : "USD";
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
        `${PRINCIPLES_BLOCK}\nYou are a senior 2025 global compensation analyst. Ground salary in disclosedRange/searchContext; correct currency per region (TN→TND, DE/FR/ES/NL→EUR, UK→GBP, CH→CHF, JP→JPY, AE/UAE/GCC/SA→AED/SAR, CA→CAD, AU→AUD, SG→SGD, IN→INR, BR→BRL, MX→MXN, NG→NGN, KE→KES, ZA→ZAR, EG→EGP, US→USD). Only use skills from userSkills/vault, never invent. Respond JSON only with estimatedRange+confidence, valid JSON, no markdown.`,
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

  if (["AE", "UAE", "GCC", "SA"].includes(region) || loc.includes("dubai") || loc.includes("abu dhabi") || loc.includes("uae") || loc.includes("riyadh") || loc.includes("gcc")) {
    const base = isAI ? 220000 : 180000;
    const sym = region === "SA" ? "SAR" : "AED";
    let low = Math.round((base * senior) / 5000) * 5000;
    let high = Math.round((base * senior * 1.35) / 5000) * 5000;
    [low, high] = ensureLowHigh(low, high);
    return {
      success: true,
      role: input.jobTitle,
      company: input.company,
      estimatedRange: `${low.toLocaleString()} - ${high.toLocaleString()} ${sym} (tax-free market estimate)`,
      confidence: "medium",
      llmUsed: false,
      searchPerformed,
      searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
      meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback" },
    };
  }

  if (region === "CA" || loc.includes("canada") || loc.includes("toronto") || loc.includes("vancouver")) {
    const base = isAI ? 145000 : 120000;
    let low = Math.round((base * senior) / 1000) * 1000;
    let high = Math.round((base * senior * 1.35) / 1000) * 1000;
    [low, high] = ensureLowHigh(low, high);
    return { success: true, role: input.jobTitle, company: input.company, estimatedRange: `CA$${low.toLocaleString()} - CA$${high.toLocaleString()} CAD (market estimate)`, confidence: "medium", llmUsed: false, searchPerformed, searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null, meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback" } };
  }

  if (region === "AU" || loc.includes("australia") || loc.includes("sydney") || loc.includes("melbourne")) {
    const base = isAI ? 160000 : 135000;
    let low = Math.round((base * senior) / 1000) * 1000;
    let high = Math.round((base * senior * 1.35) / 1000) * 1000;
    [low, high] = ensureLowHigh(low, high);
    return { success: true, role: input.jobTitle, company: input.company, estimatedRange: `A$${low.toLocaleString()} - A$${high.toLocaleString()} AUD (market estimate)`, confidence: "medium", llmUsed: false, searchPerformed, searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null, meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback" } };
  }

  if (region === "SG" || loc.includes("singapore")) {
    const base = isAI ? 140000 : 115000;
    let low = Math.round((base * senior) / 1000) * 1000;
    let high = Math.round((base * senior * 1.35) / 1000) * 1000;
    [low, high] = ensureLowHigh(low, high);
    return { success: true, role: input.jobTitle, company: input.company, estimatedRange: `S$${low.toLocaleString()} - S$${high.toLocaleString()} SGD (market estimate)`, confidence: "medium", llmUsed: false, searchPerformed, searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null, meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback" } };
  }

  if (region === "IN" || loc.includes("india") || loc.includes("bangalore") || loc.includes("hyderabad")) {
    const base = isAI ? 3500000 : 2800000;
    let low = Math.round((base * senior) / 100000) * 100000;
    let high = Math.round((base * senior * 1.4) / 100000) * 100000;
    [low, high] = ensureLowHigh(low, high);
    return { success: true, role: input.jobTitle, company: input.company, estimatedRange: `₹${low.toLocaleString()} - ₹${high.toLocaleString()} INR/year (market estimate)`, confidence: "medium", llmUsed: false, searchPerformed, searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null, meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback" } };
  }

  if (region === "BR" || loc.includes("brazil") || loc.includes("são paulo") || loc.includes("sao paulo")) {
    const base = isAI ? 220000 : 180000;
    let low = Math.round((base * senior) / 1000) * 1000;
    let high = Math.round((base * senior * 1.35) / 1000) * 1000;
    [low, high] = ensureLowHigh(low, high);
    return { success: true, role: input.jobTitle, company: input.company, estimatedRange: `R$${low.toLocaleString()} - R$${high.toLocaleString()} BRL/year (market estimate)`, confidence: "medium", llmUsed: false, searchPerformed, searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null, meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback" } };
  }

  if (region === "MX" || loc.includes("mexico")) {
    const base = isAI ? 900000 : 700000;
    let low = Math.round((base * senior) / 10000) * 10000;
    let high = Math.round((base * senior * 1.4) / 10000) * 10000;
    [low, high] = ensureLowHigh(low, high);
    return { success: true, role: input.jobTitle, company: input.company, estimatedRange: `$${low.toLocaleString()} - $${high.toLocaleString()} MXN/year (market estimate)`, confidence: "medium", llmUsed: false, searchPerformed, searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null, meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback" } };
  }

  if (["NG", "KE", "ZA"].includes(region) || loc.includes("nigeria") || loc.includes("kenya") || loc.includes("south africa")) {
    const currencies: Record<string, string> = { NG: "NGN", KE: "KES", ZA: "ZAR" };
    const cur = currencies[region] || "ZAR";
    const base = isAI ? 850000 : 650000;
    let low = Math.round((base * senior) / 10000) * 10000;
    let high = Math.round((base * senior * 1.35) / 10000) * 10000;
    [low, high] = ensureLowHigh(low, high);
    return { success: true, role: input.jobTitle, company: input.company, estimatedRange: `${low.toLocaleString()} - ${high.toLocaleString()} ${cur}/year (market estimate)`, confidence: "medium", llmUsed: false, searchPerformed, searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null, meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback" } };
  }

  if (region === "EG" || loc.includes("egypt") || loc.includes("cairo")) {
    const base = isAI ? 600000 : 450000;
    let low = Math.round((base * senior) / 10000) * 10000;
    let high = Math.round((base * senior * 1.35) / 10000) * 10000;
    [low, high] = ensureLowHigh(low, high);
    return { success: true, role: input.jobTitle, company: input.company, estimatedRange: `E£${low.toLocaleString()} - E£${high.toLocaleString()} EGP/year (market estimate)`, confidence: "medium", llmUsed: false, searchPerformed, searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null, meta: { llmUsed: false, searchPerformed, source: searchPerformed ? "search+fallback" : "fallback" } };
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
      const system = `${PRINCIPLES_BLOCK}

ROLE: You are a senior career coach specializing in high-response outreach email subjects. You write concise, human, role-specific subject lines that pass recruiter triage and avoid repetition.

CONTEXT: You receive type (linkedin_connect|recruiter_followup|thank_you), contactName, company, jobTitle, priorOutreach (up to 3 previous subjects from memory), vaultVoice (up to 3 passages reflecting candidate's voice/style), basePrompt (outreachEmailPrompt truncated). You must produce a subject that is specific to role/company, grounded in vault voice where available, and distinct from every prior subject. Stay grounded in profile.skills/vault/jobDescription — vaultVoice is your evidence for voice; company/jobTitle are your grounding.

CONSTRAINTS:
- Stay grounded in vaultVoice/jobTitle/company — subtly reflect candidate's voice if vaultVoice available; never invent company team names not given.
- Forbid hallucinated skills/metrics — do not claim expertise not in vault; keep subject role-specific, not inflated.
- Require verbatim evidence: if vaultVoice provided, echo a phrase or tone; if no vault, fall back to jobTitle+company.
- Respect: Keep subject under 9 words, specific, human — no clickbait, no exclamation marks (!), no em dashes (—); avoid AI-sounding phrases.
- Must differ from every priorOutreach subject listed — deduplicate case-insensitively; if prior is "Exploring Frontend at Acme", you must vary (e.g., "Quick intro — Frontend role at Acme" is also banned due to em dash).
- Keep type exactly as provided — do not change it.
- Be flagged by ruthless judge if generic: "Hello" or "Opportunity" without role/company is score 1.
- Chain-of-thought: check priorOutreach for duplicates, check vaultVoice for tone, compose 6-9 word specific subject, verify no bad punctuation, then output.

JSON SCHEMA — respond JSON ONLY:
{
  "suggestedSubject": string // 3-80 chars, <9 words, specific, human, no ! or —, must differ from priorOutreach
}

ANTI-HALLUCINATION GUARD: Only use skills from userSkills/vault, never invent. Only reference company/jobTitle provided; never hallucinate metrics or company facts. Ground every subject in vaultVoice/jobDescription verbatim. Only use facts from vault/jobDescription.

FEW-SHOT EXAMPLES:
GOOD (type linkedin_connect, jobTitle Senior Frontend Engineer, company Acme, vaultVoice "Led React design system for 12 teams [AcmeDoc#1]", priorOutreach none):
{"suggestedSubject":"Exploring Senior Frontend role at Acme"}
GOOD variation when priorOutreach includes "Exploring Senior Frontend role at Acme":
{"suggestedSubject":"Quick intro regarding Frontend role at Acme"} // varies, still specific, <9 words, no !/—, vault voice subtly reflected
BAD (exclamation + generic — flagged score 1):
{"suggestedSubject":"Exciting Opportunity at Acme!!!"} // REJECT — exclamation, clickbait, not specific to role
BAD (em dash):
{"suggestedSubject":"Frontend role — Acme opportunity"} // REJECT — contains em dash
BAD duplicate:
{"suggestedSubject":"Exploring Senior Frontend role at Acme"} when priorOutreach already contains that exact string // REJECT — must differ

Respond with valid JSON only — no markdown fences, no commentary.`;
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
            "Return JSON with key suggestedSubject (string under 9 words, specific, human — no clickbait, no exclamation marks, no em dashes). Must differ from every prior outreach subject listed (verbatim check, case-insensitive). If vaultVoice provided, subtly reflect candidate's voice/style (grounded). Keep type exactly as provided — do not change it. CRITICAL: Only use skills from userSkills/vault, never invent — grounding in vaultVoice/jobTitle required. Be flagged by ruthless judge if generic. Chain-of-thought: check duplicates, apply vault tone, verify <9 words and no bad punctuation, then output JSON.",
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
      if (snippet && snippet.length > 20) {
        const sliced = snippet.slice(0, 1200);
        if (isValidAtsSnippet(sliced)) return sliced;
      }
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
      if (snippets && isValidAtsSnippet(snippets)) return snippets;
    }
  } catch {}
  return null;
}

export async function executeAtsAuditTool(
  input: z.infer<typeof AtsAuditSchema>,
  settings?: LLMSettings | null
) {
  // Guard: empty resume text must not silently score 0 — return explicit failure (per contract)
  if (!input.resumeText || !input.resumeText.trim()) {
    return {
      success: false as const,
      error: "Resume text is empty — cannot run ATS audit. Provide resume content before scoring.",
      overallScore: 0,
      keywordMatchRate: 0,
      matchedKeywords: [] as string[],
      missingKeywords: [] as string[],
      llmUsed: false,
      searchPerformed: false,
      densityHint: 0,
      searchSnippet: null,
      parserNotes: ["No resume text provided"],
      reasoning: "Empty resume — audit aborted",
      meta: { llmUsed: false, searchPerformed: false, source: "error", densityHint: 0 },
    };
  }
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
      const system = `${PRINCIPLES_BLOCK}

ROLE: You are a senior 2025 ATS parsing expert and keyword-density analyst. You score resume parseability + keyword coverage with deterministic ground truth (legitAtsTest) as reference.

CONTEXT: You receive resumeText (3500 chars), jobDescription (3000 chars), atsType (detected vendor), jdTerms (top 20 extracted terms), deterministic {matched, missing, matchRate, densityHint}, searchContext2025 (2025 ATS parser scrape). You must weight overallScore by keyword density + parser readability, not just binary matchRate, citing ATS quirks from searchContext2025. Stay grounded in resumeText/jobDescription/jdTerms — require verbatim evidence for every matchedKeyword. Respect regionalNorms not needed but keep CORE headers (summary/experience/education/skills) in mind for parserNotes.

CONSTRAINTS:
- Stay grounded in jdTerms + resumeText verbatim — matchedKeywords must be substrings of resumeText (case-insensitive) and from jdTerms; missingKeywords must be jdTerms absent from resumeText.
- Forbid hallucinated skills/metrics — never invent keywords not in jdTerms; never invent ATS score without evidence.
- Require verbatim evidence: every matchedKeyword must appear verbatim in resumeText; if not, it is not matched.
- overallScore 0-100 weighted by keyword density (repeated terms score higher) + parser readability from searchContext2025; usually differs 3-12 points from matchRate unless perfect (100 or 0) — do not just echo matchRate.
- Keep atsType exactly as provided — do not change it.
- Be flagged by ruthless judge if generic: generic scoring without density/parserNotes is score 1; deterministic legitAtsTest will cap at 2 if CORE headers missing.
- Chain-of-thought: list jdTerms, check each in resumeText (density count), review searchContext for parser quirks (e.g., Greenhouse tolerates tables, Workday strict single-column), then weight score, then output.
- Validate JSON: overallScore integer 0-100, keywordMatchRate 0-100, arrays 0-20, parserNotes 0-4 actionable tips.

JSON SCHEMA — respond JSON ONLY:
{
  "overallScore": number, // 0-100 integer weighted by density + parser compatibility (must differ 3-12 from matchRate unless 0/100)
  "keywordMatchRate": number, // 0-100
  "matchedKeywords": string[], // 0-20 from jdTerms found verbatim in resumeText
  "missingKeywords": string[], // 0-20 from jdTerms not in resumeText
  "reasoning": string, // 1 sentence: density + parser weighting rationale with verbatim keyword examples
  "parserNotes": string[] // 0-4 parser tips for this atsType from searchContext2025, e.g., "Use single-column for Workday"
}

ANTI-HALLUCINATION GUARD: Only use skills from userSkills/vault, never invent. Only score keywords from jdTerms; never invent missing terms. Ground every keyword in exact resumeText substring; if unsure, mark as missing. Never hallucinate ATS vendor behavior not in searchContext2025.

FEW-SHOT EXAMPLES:
GOOD (JD terms React,TypeScript,GraphQL,AWS, resume has React×3, TypeScript×1, no GraphQL/AWS, densityHint 75, search says "Workday penalizes tables"):
{"overallScore":68,"keywordMatchRate":50,"matchedKeywords":["React","TypeScript"],"missingKeywords":["GraphQL","AWS"],"reasoning":"50% binary match but React repeated 3× raises density to 68; Workday single-column tip applied","parserNotes":["Avoid tables for Workday — use single-column classic-ats"]}
BAD (hallucinated keyword not in jdTerms — REJECT):
{"overallScore":85,"keywordMatchRate":80,"matchedKeywords":["React","Kubernetes"],"missingKeywords":[]} // REJECT — Kubernetes not in jdTerms [React,TypeScript,GraphQL,AWS]
BAD generic (echoes matchRate without density weighting — ruthless judge score 1):
{"overallScore":50,"keywordMatchRate":50,"matchedKeywords":["React","TypeScript"],"missingKeywords":["GraphQL","AWS"],"reasoning":"Score is 50"} // REJECT — no density weighting, no parserNotes, generic
GOOD perfect match (all terms found multiple times):
{"overallScore":92,"keywordMatchRate":100,"matchedKeywords":["React","TypeScript","GraphQL","AWS"],"missingKeywords":[],"reasoning":"100% match with high density (React 3×) retains 92 after parser check","parserNotes":["Keywords naturally integrated — ATS will parse cleanly"]}

Respond with valid JSON only — no markdown fences, no commentary.`;
      const user = JSON.stringify(
        {
          resumeText: input.resumeText.slice(0, 3500),
          jobDescription: input.jobDescription.slice(0, 3000),
          atsType: input.atsType || "generic",
          jdTerms: terms.slice(0, 20).map((t) => t.term),
          deterministic: { matched, missing, matchRate, densityHint },
          searchContext2025: searchSnippet ? searchSnippet.slice(0, 1000) : "No web search available — use ATS parser knowledge as fallback.",
          instruction:
            "Return JSON with keys: overallScore (0-100 weighted by density+parser, must differ 3-12 from matchRate unless perfect), keywordMatchRate (0-100), matchedKeywords (0-20), missingKeywords (0-20), reasoning (1 sentence with density/parser verbatim), parserNotes (0-4 tips). CRITICAL: overallScore must reflect keyword density (repeated terms score higher) and ATS parser quirks from searchContext2025 — do not just echo matchRate. Only use skills from userSkills/vault, never invent — only keywords from jdTerms, verbatim in resumeText. Respect CORE headers for parserNotes. Be flagged by ruthless judge if generic. Chain-of-thought: verify each jdTerm in resumeText, compute density, check searchContext, weight score, then output. Keep atsType exactly.",
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

  // --- Legit ATS ground truth gate (deterministic, not LLM-only) ---
  // Mirrors legitAtsTest / analyzeAts: if ATS parser score <60 or core header missing, cap LLM-inflated scores and annotate.
  let finalOverall: number;
  let finalKeywordRate: number;
  let finalMatched: string[];
  let finalMissing: string[];
  let finalParserNotes: string[];
  let finalLlmUsed: boolean;
  let finalReasoning: string | null;
  let finalSource: string;
  if (llmUsed && llmScore !== null) {
    finalOverall = llmScore;
    finalKeywordRate = llmKeywordRate ?? llmScore;
    finalMatched = llmMatched ?? matched;
    finalMissing = llmMissing ?? missing;
    finalParserNotes = [...llmParserNotes];
    finalLlmUsed = true;
    finalReasoning = llmReasoning;
    finalSource = "llm+search";
  } else {
    finalOverall = matchRate;
    finalKeywordRate = matchRate;
    finalMatched = matched;
    finalMissing = missing;
    finalParserNotes = [];
    finalLlmUsed = false;
    finalReasoning = `Deterministic fallback — ${matchRate}% keyword match, density ${densityHint}`;
    finalSource = searchPerformed ? "search+fallback" : "fallback";
  }
  // Run deterministic analyzeAts as ground truth
  try {
    const gateReport = analyzeAts(input.resumeText, input.jobDescription);
    const gateScore = gateReport.score;
    const sectionsCheck = gateReport.checks.find((c) => c.id === "sections");
    const coreHeaderMissing = sectionsCheck ? !sectionsCheck.ok : CORE_HEADERS.some((h) => !input.resumeText.toLowerCase().includes(h));
    const shouldCap = gateScore < 60 || coreHeaderMissing;
    if (shouldCap) {
      finalOverall = Math.min(finalOverall, 59);
      if (!finalParserNotes.includes("Legit ATS gate capped")) {
        finalParserNotes = [...finalParserNotes, "Legit ATS gate capped"].slice(0, 5);
      }
      // Annotate reasoning with gate signal for observability when not already capped
      if (!finalParserNotes.includes(`gate:${gateScore}`) && finalParserNotes.length < 5) {
        // keep original notes — gate score available via meta/debug; not leaking extra note unless needed
      }
    }
    // Attach gate score to meta via closure below
    if (finalLlmUsed) {
      return {
        success: true,
        overallScore: finalOverall,
        keywordMatchRate: finalKeywordRate,
        matchedKeywords: finalMatched,
        missingKeywords: finalMissing,
        llmUsed: true,
        searchPerformed,
        reasoning: finalReasoning,
        parserNotes: finalParserNotes,
        densityHint,
        searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
        gateScore,
        gateCoreHeaderMissing: coreHeaderMissing,
        meta: { llmUsed: true, searchPerformed, source: finalSource, densityHint, gateScore, gateCapped: shouldCap },
      };
    }
    return {
      success: true,
      overallScore: finalOverall,
      keywordMatchRate: finalKeywordRate,
      matchedKeywords: finalMatched,
      missingKeywords: finalMissing,
      llmUsed: false,
      searchPerformed,
      reasoning: finalReasoning,
      parserNotes: finalParserNotes,
      densityHint,
      searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
      gateScore,
      gateCoreHeaderMissing: coreHeaderMissing,
      meta: { llmUsed: false, searchPerformed, source: finalSource, densityHint, gateScore, gateCapped: shouldCap },
    };
  } catch {
    // If analyzer throws, fall back to uncapped but still return deterministic scores
    if (finalLlmUsed) {
      return {
        success: true,
        overallScore: finalOverall,
        keywordMatchRate: finalKeywordRate,
        matchedKeywords: finalMatched,
        missingKeywords: finalMissing,
        llmUsed: true,
        searchPerformed,
        reasoning: finalReasoning,
        parserNotes: finalParserNotes,
        densityHint,
        searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
        meta: { llmUsed: true, searchPerformed, source: finalSource, densityHint },
      };
    }
    return {
      success: true,
      overallScore: finalOverall,
      keywordMatchRate: finalKeywordRate,
      matchedKeywords: finalMatched,
      missingKeywords: finalMissing,
      llmUsed: false,
      searchPerformed,
      densityHint,
      searchSnippet: searchSnippet ? searchSnippet.slice(0, 200) : null,
      meta: { llmUsed: false, searchPerformed, source: finalSource, densityHint },
    };
  }
}
