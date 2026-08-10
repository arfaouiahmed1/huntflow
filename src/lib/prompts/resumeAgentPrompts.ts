import { UserProfile, JobApplication, ResumeContent } from "@/types";
import { buildProfileContext, buildJobContext, SYSTEM_PREAMBLE, JSON_RULE } from "./commonPrompts";

/**
 * Letter-specific natural-writing rules (from the Proficiently cover-letter
 * methodology). Applied to cover/motivation letters so they read like a real
 * professional wrote them, never a template.
 */
export const NATURAL_LETTER_RULES = `NATURAL LETTER RULES:
- The letter must sound like a seasoned professional talking to a colleague over coffee: confident but approachable, specific, and human.
- Extract 2-3 concrete achievements with measurable results and connect them to the employer's specific challenges — not their general requirements.
- Mix short, direct statements with longer explanations; never repeat sentence patterns or start consecutive sentences the same way.
- Never use em dashes (—); use hyphens, commas, or periods.
- Avoid template phrases: "I am excited about the opportunity", "aligns perfectly with", "living and breathing [concept]", "passionate about", "proven track record" without a concrete example.
- Keep sentences under ~25 words where possible.
- Total letter length: 250-350 words. Vary paragraph lengths for natural flow.
- STRICT ACCURACY: never extend a role's duration, describe a past role in present tense, or inflate scope beyond what the profile states. When a detail is ambiguous, omit it rather than assume. Every company-attributed metric must belong to that company's role in the profile.`;

export function documentsSystemPrompt(): string {
  return `${SYSTEM_PREAMBLE}
You are also a senior executive resume writer and a partner-track recruiter who knows exactly what ATS filters and hiring managers look for.

${JSON_RULE}`;
}

export type DocumentKind = "tailoredResume" | "coverLetter" | "motivationLetter" | "followUpEmail";

export function documentsUserPrompt(
  job: JobApplication,
  profile: UserProfile,
  options?: { tone?: string; focusSkills?: string[]; docType?: DocumentKind }
): string {
  const tone = options?.tone || "professional and confident";
  const focus = options?.focusSkills?.length ? `\nFOCUS SKILLS TO HIGHLIGHT: ${options.focusSkills.join(", ")}` : "";

  /* -------- Request a single document (Generate This One) -------- */
  if (options?.docType) {
    const specFor: Record<DocumentKind, string> = {
      tailoredResume:
        `a complete, ATS-optimized markdown CV. Rewrite experience bullets to echo the job description's requirements, leading with the candidate's matching skills. Quantify achievements. Max 700 words. Mirror the posting's terminology only for skills the candidate actually has; never invent or inflate scope.`,
      coverLetter: `3 short paragraphs, ${tone}. Hook = the candidate's strongest relevant achievement. Reference the company and role by name. Must read like natural human writing, not a template.`,
      motivationLetter:
        `a compelling 3-paragraph motivation letter focused on why the candidate genuinely wants THIS company and role, not generic fluff.`,
      followUpEmail:
        `a concise, warm 4-day follow-up email to the recruiter, referencing the application and one key value point. No em dashes.`,
    };
    const letterPreamble =
      options.docType === "coverLetter" || options.docType === "motivationLetter"
        ? `\n\n${NATURAL_LETTER_RULES}`
        : "";

    return `${buildProfileContext(profile)}

${buildJobContext(job)}
${focus}

TASK: Tailor a single document for THIS job:
"${options.docType}": ${specFor[options.docType]}${letterPreamble}

Respond as JSON with exactly one key: "${options.docType}".`;
  }

  /* -------- Request all four documents (default) -------- */
  return `${buildProfileContext(profile)}

${buildJobContext(job)}
${focus}

TASK: Tailor four documents for THIS job:

1. "tailoredResume" — a complete, ATS-optimized markdown CV. Rewrite experience bullets to echo the job description's requirements, leading with the candidate's matching skills. Quantify achievements. Max 700 words. Mirror the posting's terminology only for skills the candidate actually has; never invent or inflate scope.
2. "coverLetter" — 3 short paragraphs, ${tone}. Hook = the candidate's strongest relevant achievement. Reference the company and role by name. Must read like natural human writing, not a template.

${NATURAL_LETTER_RULES}

3. "motivationLetter" — a compelling 3-paragraph motivation letter focused on why the candidate genuinely wants THIS company and role, not generic fluff. Same natural-voice rules as the cover letter.
4. "followUpEmail" — a concise, warm 4-day follow-up email to the recruiter, referencing the application and one key value point. No em dashes.

Respond as JSON with exactly these keys: "tailoredResume", "coverLetter", "motivationLetter", "followUpEmail".`;
}

export function resumeSystemPrompt(): string {
  return `${SYSTEM_PREAMBLE}
You are also a certified resume writer who builds ATS-proof documents: single column, standard section headers, action verbs, quantified outcomes, and zero invented facts. Everything must be grounded in the provided candidate profile.

${JSON_RULE}`;
}

export function resumeDraftUserPrompt(
  kind: string,
  profile: UserProfile,
  behavior: string,
  targetJob?: { title: string; company: string; jobDescription: string } | null
): string {
  const jobBlock = targetJob
    ? `

TARGET ROLE (tailor the document to this posting):
${buildJobContext(targetJob as JobApplication)}
`
    : "";
  const letterKind = kind === "cover_letter" || kind === "motivation_letter";
  const letterRules = letterKind ? `\n${NATURAL_LETTER_RULES}\n` : "";
  const shape = letterKind
    ? `{
  "header": { "name": string, "title": string, "email": string, "phone": string, "location": string, "linkedin": string, "github": string, "portfolio": string },
  "recipient": string | null,
  "paragraphs": [ string ]
}`
    : `{
  "header": { "name": string, "title": string, "email": string, "phone": string, "location": string, "linkedin": string, "github": string, "portfolio": string },
  "summary": string,
  "skills": [ string ],
  "experience": [ { "role": string, "company": string, "duration": string, "bullets": [ string ] } ],
  "education": [ { "degree": string, "school": string, "year": string } ],
  "projects": [ { "name": string, "tech": string, "link": string | null, "bullets": [ string ] } ],
  "certifications": [ { "name": string, "issuer": string, "year": string } ],
  "languages": [ { "name": string, "level": string } ]
}`;
  return `${buildProfileContext(profile)}
${jobBlock}

${behavior}${letterRules}

TASK: Draft a complete ${kind.replace("_", " ")} document.
Respond as JSON with exactly this shape (all strings plain text, no markdown):
${shape}
Never invent experience, skills, numbers or companies not present in the candidate profile.`;
}

export function resumeImproveUserPrompt(kind: string, current: string, profile: UserProfile, behavior: string): string {
  const shapeNote =
    kind === "cover_letter" || kind === "motivation_letter"
      ? "recipient/paragraphs for letters"
      : "header + summary/skills/experience/education/projects/certifications/languages";
  return `${buildProfileContext(profile)}

${behavior}

CURRENT DRAFT (fix it up, keep structure and facts, sharpen language):
${current}

TASK: Return the improved document as JSON with the SAME shape used for drafting (${shapeNote}).`;
}

export function resumeTailorUserPrompt(kind: string, current: string, job: JobApplication, profile: UserProfile, behavior: string): string {
  const shapeNote =
    kind === "cover_letter" || kind === "motivation_letter"
      ? "recipient/paragraphs for letters"
      : "header + summary/skills/experience/education/projects/certifications/languages";
  const letterRules =
    kind === "cover_letter" || kind === "motivation_letter" ? `\n${NATURAL_LETTER_RULES}\n` : "";
  return `${buildProfileContext(profile)}

${buildJobContext(job)}

${behavior}${letterRules}

CURRENT DRAFT:
${current}

TASK: Tailor this document to the job above. Return it as JSON with the SAME shape used for drafting (${shapeNote}). Mirror the posting's terminology for skills the candidate actually has, reorder skills by relevance to this role, and rewrite the summary/paragraphs around the role. Never invent skills or metrics.`;
}

/** Fallback resume content built deterministically from the profile. */
export function resumeFallbackContent(
  profile: UserProfile,
  kind: string,
  targetJob?: { title: string; company: string; jobDescription: string } | null
): { content: ResumeContent; summary: string } {
  const header = {
    name: profile.name,
    title: profile.targetTitle,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    linkedin: profile.linkedin ?? "",
    github: profile.github ?? "",
    portfolio: profile.portfolio ?? "",
  };
  const letterKind = kind === "cover_letter" || kind === "motivation_letter";
  if (letterKind) {
    const para = (s: string) => (s.trim() ? s.trim() : "·");
    return {
      content: {
        header,
        recipient: `Hiring Manager${targetJob?.company ? `\n${targetJob.company}` : ""}`,
        paragraphs: [
          `I am writing to express my interest in the ${targetJob?.title ?? profile.targetTitle} position${targetJob?.company ? ` at ${targetJob.company}` : ""}. ${para(profile.summary)}`,
          `My background covers ${profile.skills.slice(0, 5).join(", ")} — directly relevant to this role.`,
          "I would welcome the opportunity to discuss how I can contribute to your team.",
        ],
      },
      summary: "Letter drafted from profile summary and skills.",
    };
  }
  return {
    content: {
      header,
      summary: profile.summary,
      skills: profile.skills,
      experience: profile.experience.map((e) => ({ role: e.role, company: e.company, duration: e.duration, bullets: e.bulletPoints })),
      education: profile.education.map((e) => ({ degree: e.degree, school: e.school, year: e.year })),
    },
    summary: "Draft assembled from verified profile data.",
  };
}
