/**
 * Adaptive Routing — Huntflow Agent Hardening (Phase 2)
 *
 * Decides whether salary estimation can be skipped when the posting already
 * discloses compensation. Explicit salary is detected either from the
 * structured `job.salary` field or by regex extraction from the free-text
 * job description.
 */

export interface AdaptiveRoutingInput {
  salary?: string;
  jobDescription?: string;
  location?: string;
  targetRegion?: string;
}

export interface AdaptiveRoutingResult {
  hasExplicitSalary: boolean;
  extractedSalary?: string;
  regionConfidence: "high" | "inferred";
  shouldSkipSalaryLlm: boolean;
}

/**
 * Regex for salary ranges disclosed in a posting.
 * Matches patterns like:
 *  - $120k-$150k
 *  - $120,000 - $150,000
 *  - €80,000 - €95,000
 *  - £50k - £70k
 *  - 30,000 - 45,000 TND / EUR / GBP / USD / CHF / AED / DT
 *  - 180,000 - 220,000 AED (first number without currency, second with)
 *  - 28,000 - 45,000 DT/month
 *
 * The pattern allows either side to carry currency/symbol optionally, but
 * requires at least one indicator ($€£¥, k, or TND/DT/EUR/GBP/USD/CHF/AED)
 * somewhere in the range so plain date ranges are not flagged.
 */
const SALARY_RANGE_REGEX =
  /(?:[$€£¥]\s*)?\d[\d,]*k?\s*(?:TND|DT|EUR|GBP|USD|CHF|AED)?\s*[-–]\s*(?:[$€£¥]\s*)?\d[\d,]*k?\s*(?:TND|DT|EUR|GBP|USD|CHF|AED)?/i;

function containsSalaryIndicator(text: string): boolean {
  return /[$€£¥]|k\b|TND|DT|EUR|GBP|USD|CHF|AED/i.test(text);
}
function normalizeExtracted(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 200);
}

export function evaluateAdaptiveRouting(job: {
  salary?: string;
  jobDescription?: string;
  location?: string;
  targetRegion?: string;
}): {
  hasExplicitSalary: boolean;
  extractedSalary?: string;
  regionConfidence: "high" | "inferred";
  shouldSkipSalaryLlm: boolean;
} {
  const salaryField = typeof job.salary === "string" ? job.salary.trim() : "";
  const hasSalaryField = salaryField.length > 0;

  let extractedSalary: string | undefined;
  let hasExplicitSalary = false;

  if (hasSalaryField) {
    hasExplicitSalary = true;
    extractedSalary = normalizeExtracted(salaryField);
  } else if (typeof job.jobDescription === "string" && job.jobDescription.trim().length > 0) {
    const match = job.jobDescription.match(SALARY_RANGE_REGEX);
    if (match && match[0] && containsSalaryIndicator(match[0])) {
      hasExplicitSalary = true;
      extractedSalary = normalizeExtracted(match[0]);
    } else if (match && match[0]) {
      // Permissive regex may match plain number ranges like "2021 - 2023" — require an indicator
      // Search for next candidate that contains a salary indicator
      const globalRegex = new RegExp(SALARY_RANGE_REGEX.source, SALARY_RANGE_REGEX.flags.includes("g") ? SALARY_RANGE_REGEX.flags : SALARY_RANGE_REGEX.flags + "g");
      let m: RegExpExecArray | null;
      while ((m = globalRegex.exec(job.jobDescription)) !== null) {
        if (containsSalaryIndicator(m[0])) {
          hasExplicitSalary = true;
          extractedSalary = normalizeExtracted(m[0]);
          break;
        }
      }
    }
  }
  const hasTargetRegion =
    typeof job.targetRegion === "string" && job.targetRegion.trim().length > 0;
  const regionConfidence: "high" | "inferred" = hasTargetRegion ? "high" : "inferred";

  const shouldSkipSalaryLlm = hasExplicitSalary;

  if (hasExplicitSalary && extractedSalary) {
    return {
      hasExplicitSalary: true,
      extractedSalary,
      regionConfidence,
      shouldSkipSalaryLlm,
    };
  }

  if (hasExplicitSalary && !extractedSalary) {
    return {
      hasExplicitSalary: true,
      extractedSalary: undefined,
      regionConfidence,
      shouldSkipSalaryLlm,
    };
  }

  return {
    hasExplicitSalary: false,
    extractedSalary: undefined,
    regionConfidence,
    shouldSkipSalaryLlm: false,
  };
}
