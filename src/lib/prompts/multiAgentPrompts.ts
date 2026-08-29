import { PRINCIPLES_BLOCK } from "./principles";

export function companyIntelPrompt(jobDescription: string, company: string): string {
  return `${PRINCIPLES_BLOCK}

Analyze the following job description and company for deep intelligence: ATS platform, tech stack, funding/stage (e.g. Early Stage, Series A-C, Pre-IPO, Public, Enterprise), engineering culture signals, and mission summary. Base every keyword on evidence in the text.

Job Description: ${jobDescription}
Company: ${company}

Return a valid JSON object strictly matching this schema:
{
  "atsType": "workday" | "greenhouse" | "lever" | "taleo" | "ashby" | "generic",
  "stage": string,
  "techStack": string[],
  "cultureKeywords": string[] (max 8, each grounded in the posting),
  "summary": string
}`;
}

export function salaryIntelPrompt(jobTitle: string, company: string, location?: string, jobDescription?: string, region?: string): string {
  return `${PRINCIPLES_BLOCK}

Estimate the salary range for the following role.
CRITICAL: You MUST output the salary in the correct LOCAL currency unit for the specified country/region/location:
- Tunisia / North Africa / MENA (TN): TND (e.g., '28,000 - 48,000 TND/year' or '2,300 - 4,000 TND/month')
- Germany / France / Spain / Netherlands / Eurozone (DE, FR, ES, NL): EUR (e.g., '65,000€ - 92,000€ EUR')
- United Kingdom (UK): GBP (e.g., '£58,000 - £85,000 GBP')
- Switzerland (CH): CHF (e.g., '125,000 - 165,000 CHF')
- Japan (JP): JPY (e.g., '¥7,500,000 - ¥11,000,000 JPY')
- UAE / Gulf (UAE): AED (e.g., '180,000 - 320,000 AED')
- United States / Canada / Global (US): USD (e.g., '$125,000 - $165,000 USD')

If the posting discloses a range, prefer it and mark confidence 'high'. If not, give a grounded market estimate and mark confidence 'medium'.

Role: ${jobTitle}
Company: ${company}
Location / Region: ${location || region || "Global"}
${jobDescription ? `Job Description:\n${jobDescription.slice(0, 1200)}` : ""}

Return JSON with 'estimatedRange' (string formatted with correct local currency) and 'confidence' ('high', 'medium', or 'low').`;
}

export function outreachEmailPrompt(type: string, contactName: string, company: string, jobTitle?: string): string {
  return `${PRINCIPLES_BLOCK}

Write a single subject line for an outreach email. Make it short (under 9 words), specific, and human — no clickbait, no exclamation marks, no em dashes.

Type: ${type}
Contact Name: ${contactName}
Company: ${company}
Job Title: ${jobTitle || "Unknown"}

Return ONLY the subject line.`;
}
