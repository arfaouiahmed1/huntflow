export function companyIntelPrompt(jobDescription: string, company: string): string {
  return `Analyze the following job description and company for ATS type and culture keywords. Job Description: ${jobDescription}. Company: ${company}. Return a valid JSON object strictly matching this schema:
{
  "atsType": "workday" | "greenhouse" | "lever" | "taleo" | "ashby" | "generic",
  "cultureKeywords": string[] (max 8),
  "summary": string
}`;
}

export function salaryIntelPrompt(jobTitle: string, company: string, location?: string): string {
  return `Estimate the salary range for the following role.\nRole: ${jobTitle}\nCompany: ${company}\nLocation: ${location || 'Unknown'}\n\nReturn JSON with 'estimatedRange' (string, e.g. '$110,000 - $145,000 USD') and 'confidence' (string: 'high', 'medium', or 'low').`;
}

export function outreachEmailPrompt(type: string, contactName: string, company: string, jobTitle?: string): string {
  return `Write a single subject line for an outreach email.\nType: ${type}\nContact Name: ${contactName}\nCompany: ${company}\nJob Title: ${jobTitle || 'Unknown'}\n\nReturn ONLY the subject line.`;
}
