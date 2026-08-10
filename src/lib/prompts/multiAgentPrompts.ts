import { PRINCIPLES_BLOCK } from "./principles";

export function companyIntelPrompt(jobDescription: string, company: string): string {
  return `${PRINCIPLES_BLOCK}

Analyze the following job description and company for ATS type and culture keywords. Base every keyword on evidence in the text — do not invent culture signals the posting does not support; if nothing signals a keyword, omit it.

Job Description: ${jobDescription}
Company: ${company}

Return a valid JSON object strictly matching this schema:
{
  "atsType": "workday" | "greenhouse" | "lever" | "taleo" | "ashby" | "generic",
  "cultureKeywords": string[] (max 8, each grounded in the posting),
  "summary": string
}`;
}

export function salaryIntelPrompt(jobTitle: string, company: string, location?: string, jobDescription?: string): string {
  return `${PRINCIPLES_BLOCK}

Estimate the salary range for the following role. If the posting discloses a range, prefer it and mark confidence "high". If it does not, give a conservative market estimate grounded in the role's seniority and location, and be honest that it is a market guess.

Role: ${jobTitle}
Company: ${company}
Location: ${location || "Unknown"}
${jobDescription ? `Job Description (first 1200 chars):\n${jobDescription.slice(0, 1200)}` : ""}

Return JSON with 'estimatedRange' (string, e.g. '$110,000 - $145,000 USD') and 'confidence' (string: 'high', 'medium', or 'low').`;
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
