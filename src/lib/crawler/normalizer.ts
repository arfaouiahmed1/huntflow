/**
 * HUNTFLOW Crawler — Deterministic Field Normalization Pipeline.
 *
 * Extracts role family, seniority, work mode, employment type, salary, visa signals,
 * technology tags, and languages deterministically without an LLM.
 */

import type {
  EmploymentType,
  SeniorityLevel,
  VisaSignal,
  WorkMode,
} from "./contracts";
import { normalizeCompanyName, tokenizeTitle } from "../dedup";

export interface NormalizedFields {
  canonicalKey: string;
  companyKey: string;
  locationKey: string;
  seniority: SeniorityLevel | null;
  workMode: WorkMode;
  employmentType: EmploymentType | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  visaSignal: VisaSignal;
  techTags: string[];
  languages: string[];
  sourceConfidence: number;
}

const TECH_TAXONOMY: readonly string[] = [
  "TypeScript", "JavaScript", "React", "Next.js", "Vue", "Angular", "Node.js",
  "Python", "Go", "Golang", "Rust", "Java", "Kotlin", "Swift", "C++", "C#", ".NET",
  "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform", "PostgreSQL", "MySQL",
  "MongoDB", "Redis", "Kafka", "GraphQL", "REST", "gRPC", "PyTorch", "TensorFlow",
  "LLM", "LangChain", "Tailwind", "CSS", "HTML", "Linux", "Git", "CI/CD",
];

const LANGUAGE_TAXONOMY: readonly { name: string; regex: RegExp }[] = [
  { name: "English", regex: /\b(english|anglais|englisch)\b/i },
  { name: "French", regex: /\b(french|français|francais|französisch)\b/i },
  { name: "German", regex: /\b(german|deutsch|allemand)\b/i },
  { name: "Arabic", regex: /\b(arabic|arabe|arabisch)\b/i },
  { name: "Spanish", regex: /\b(spanish|español|espanol|spanisch)\b/i },
];

export function sanitizeJobDescription(raw: string): string {
  if (!raw) return "";
  const text = raw.replace(/<[^>]+>/g, " ");
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&nbsp;": " ",
  };
  return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => entities[entity] ?? entity).replace(/\s+/g, " ").trim();
}

export function extractSeniority(title: string, description = ""): SeniorityLevel | null {
  const combined = `${title} ${description.slice(0, 500)}`.toLowerCase();

  if (/\b(intern|internship|co-?op|apprentice|trainee)\b/i.test(combined)) {
    return "intern";
  }
  if (/\b(principal|distinguished|fellow)\b/i.test(combined)) {
    return "principal";
  }
  if (/\b(staff|architect)\b/i.test(combined)) {
    return "staff";
  }
  if (/\b(lead|team\s+lead|tech\s+lead|engineering\s+lead|head\s+of)\b/i.test(combined)) {
    return "lead";
  }
  if (/\b(senior|sr\.?|snr|experienced)\b/i.test(combined)) {
    return "senior";
  }
  if (/\b(junior|jr\.?|entry[\s-]level|associate|graduate)\b/i.test(combined)) {
    return "junior";
  }
  if (/\b(mid|intermediate)\b/i.test(combined) || /\b(engineer|developer|designer|analyst)\b/i.test(title)) {
    return "mid";
  }

  return null;
}

export function extractWorkMode(location = "", title = "", description = ""): WorkMode {
  const combined = `${location} ${title} ${description.slice(0, 500)}`.toLowerCase();

  if (/\b(remote|work\s+from\s+home|wfh|telecommute|anywhere|worldwide|fully\s+remote)\b/i.test(combined)) {
    return "remote";
  }
  if (/\b(hybrid|flexible\s+remote|partially\s+remote)\b/i.test(combined)) {
    return "hybrid";
  }
  return "onsite";
}

export function extractEmploymentType(text: string): EmploymentType | null {
  const lower = text.toLowerCase();
  if (/\b(intern|internship|co-?op)\b/i.test(lower)) return "internship";
  if (/\b(contract|contractor|freelance|consultant|temp|temporary)\b/i.test(lower)) return "contract";
  if (/\b(part[\s-]time|half[\s-]time)\b/i.test(lower)) return "part_time";
  if (/\b(full[\s-]time|permanent|direct[\s-]hire)\b/i.test(lower)) return "full_time";
  return "full_time";
}

export function extractSalary(rawText: string): { min: number | null; max: number | null; currency: string | null } {
  if (!rawText) return { min: null, max: null, currency: null };

  const currencyMatch = rawText.match(/(\$|€|£|CAD|USD|EUR|GBP|AUD|CHF|TND)/i);
  let currency: string | null = null;
  if (currencyMatch) {
    const sym = currencyMatch[0].toUpperCase();
    if (sym === "$") currency = "USD";
    else if (sym === "€") currency = "EUR";
    else if (sym === "£") currency = "GBP";
    else currency = sym;
  }

  // Look for range e.g. $140,000 - $180,000 or 120k - 160k
  const rangeMatch = rawText.match(/(?:[\$€£]|USD|EUR|GBP)?\s*(\d{2,3}(?:,\d{3})*|\d{2,3})k?\s*(?:-|to|–)\s*(?:[\$€£]|USD|EUR|GBP)?\s*(\d{2,3}(?:,\d{3})*|\d{2,3})k?/i);
  if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
    let rawMin = Number(rangeMatch[1].replace(/,/g, ""));
    let rawMax = Number(rangeMatch[2].replace(/,/g, ""));

    if (rawMin < 1000) rawMin *= 1000;
    if (rawMax < 1000) rawMax *= 1000;

    return { min: rawMin, max: rawMax, currency: currency || "USD" };
  }

  const singleMatch = rawText.match(/(?:[\$€£]|USD|EUR|GBP)?\s*(\d{2,3}(?:,\d{3})*|\d{2,3})k?/i);
  if (singleMatch && singleMatch[1]) {
    let rawVal = Number(singleMatch[1].replace(/,/g, ""));
    if (rawVal > 20 && rawVal < 1000) rawVal *= 1000;
    if (rawVal >= 10000) {
      return { min: rawVal, max: null, currency: currency || "USD" };
    }
  }

  return { min: null, max: null, currency };
}

export function extractVisaSignal(text: string): VisaSignal {
  const lower = text.toLowerCase();
  if (
    /\b(visa\s+sponsorship|sponsorship\s+available|will\s+sponsor|sponsors\s+visas?|relocation\s+assistance|visa\s+provided)\b/i.test(lower)
  ) {
    return "explicit";
  }
  if (
    /\b(no\s+sponsorship|unable\s+to\s+sponsor|us\s+citizen\s+only|must\s+be\s+authorized\s+to\s+work\s+without\s+sponsorship)\b/i.test(lower)
  ) {
    return "unknown";
  }
  return "unknown";
}

export function extractTechTags(text: string): string[] {
  const found = new Set<string>();
  for (const tag of TECH_TAXONOMY) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    if (regex.test(text)) {
      found.add(tag === "Golang" ? "Go" : tag);
    }
  }
  return Array.from(found);
}

export function extractLanguages(text: string): string[] {
  const found = new Set<string>();
  for (const lang of LANGUAGE_TAXONOMY) {
    if (lang.regex.test(text)) {
      found.add(lang.name);
    }
  }
  return Array.from(found);
}

export function buildCanonicalKey(company: string, title: string, location = ""): string {
  const cKey = normalizeCompanyName(company) || "unknown-company";
  const titleTokens = Array.from(tokenizeTitle(title)).sort().join("-") || "role";
  const locKey = location.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16) || "remote";
  return `${cKey}::${titleTokens}::${locKey}`;
}

export function normalizeJobCandidate(raw: {
  title: string;
  company: string;
  location?: string;
  url?: string;
  description?: string;
  salary?: string;
  sourceConnector?: string;
}): NormalizedFields {
  const cleanDesc = sanitizeJobDescription(raw.description || "");
  const companyKey = normalizeCompanyName(raw.company);
  const locationKey = (raw.location || "Remote").toLowerCase().replace(/[^a-z0-9]/g, "");
  const canonicalKey = buildCanonicalKey(raw.company, raw.title, raw.location);

  const seniority = extractSeniority(raw.title, cleanDesc);
  const workMode = extractWorkMode(raw.location, raw.title, cleanDesc);
  const employmentType = extractEmploymentType(`${raw.title} ${cleanDesc}`);
  const salaryInfo = extractSalary(raw.salary || cleanDesc);
  const visaSignal = extractVisaSignal(cleanDesc);
  const techTags = extractTechTags(`${raw.title} ${cleanDesc}`);
  const languages = extractLanguages(cleanDesc);

  let sourceConfidence = 0.8;
  if (raw.sourceConnector && ["greenhouse", "lever", "ashby", "smartrecruiters", "personio"].includes(raw.sourceConnector)) {
    sourceConfidence = 1.0;
  } else if (raw.sourceConnector && ["arbeitnow", "himalayas", "jobicy", "remotive"].includes(raw.sourceConnector)) {
    sourceConfidence = 0.9;
  }

  return {
    canonicalKey,
    companyKey,
    locationKey,
    seniority,
    workMode,
    employmentType,
    salaryMin: salaryInfo.min,
    salaryMax: salaryInfo.max,
    salaryCurrency: salaryInfo.currency,
    visaSignal,
    techTags,
    languages,
    sourceConfidence,
  };
}
