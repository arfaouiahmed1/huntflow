import { UserProfile, JobApplication, ResumeContent } from "@/types";
import { buildProfileContext, buildJobContext, SYSTEM_PREAMBLE, JSON_RULE } from "./commonPrompts";

export function documentsSystemPrompt(): string {
  return `${SYSTEM_PREAMBLE}
You are also a senior executive resume writer and a partner-track recruiter who knows exactly what ATS filters and hiring managers look for.

${JSON_RULE}`;
}

export function documentsUserPrompt(job: JobApplication, profile: UserProfile, options?: { tone?: string; focusSkills?: string[] }): string {
  const tone = options?.tone || "professional and confident";
  const focus = options?.focusSkills?.length ? `\nFOCUS SKILLS TO HIGHLIGHT: ${options.focusSkills.join(", ")}` : "";
  return `${buildProfileContext(profile)}

${buildJobContext(job)}
${focus}

TASK: Tailor four documents for THIS job:

1. "tailoredResume" — a complete, ATS-optimized markdown CV. Rewrite experience bullets to echo the job description's requirements, leading with the candidate's matching skills. Quantify achievements. Max 700 words.
2. "coverLetter" — 3 short paragraphs, ${tone}. Hook = the candidate's strongest relevant achievement. Reference the company and role by name.
3. "motivationLetter" — a compelling 3-paragraph motivation letter focused on why the candidate genuinely wants THIS company and role, not generic fluff.
4. "followUpEmail" — a concise, warm 4-day follow-up email to the recruiter, referencing the application and one key value point.

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

${behavior}

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
  return `${buildProfileContext(profile)}

${buildJobContext(job)}

${behavior}

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
