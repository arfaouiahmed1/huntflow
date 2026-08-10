import { UserProfile, JobApplication } from "@/types";

/** Normalize skill aliases so "Next" matches "Next.js", "ReactJs" etc. */
export function normalizeSkill(skill: string): string {
  return skill
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const COMMON_TECH = [
  "React", "Next.js", "TypeScript", "JavaScript", "Node.js", "Python", "Java", "Go", "Rust",
  "Docker", "Kubernetes", "AWS", "GCP", "Azure", "GraphQL", "REST", "PostgreSQL", "MySQL",
  "MongoDB", "Redis", "Tailwind CSS", "CI/CD", "Terraform", "System Design", "Microservices",
  "Machine Learning", "LLM", "RAG", "LangChain", "Vector DB", "Playwright", "Jest", "WebSockets",
  "Serverless", "Edge", "Flutter", "Swift", "Kotlin", "Vue", "Angular", "Django", "FastAPI",
];

/** Extract candidate-relevant keywords present in a job description. */
export function extractJdTerms(jobDescription: string, skills: string[]) {
  const jd = jobDescription.toLowerCase();
  const hits: { term: string; count: number; inResume: boolean }[] = [];

  const allTerms = [
    ...skills.map((s) => ({ term: s })),
    ...COMMON_TECH.map((t) => ({ term: t })),
  ];

  for (const { term } of allTerms) {
    const norm = normalizeSkill(term);
    if (norm.length < 2) continue;
    let count = 0;
    const matches = Array.from(jd.matchAll(new RegExp(norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")));
    count += matches.length;
    if (count > 0) {
      hits.push({ term, count, inResume: skills.some((s) => normalizeSkill(s) === norm) });
    }
  }
  return hits.sort((a, b) => b.count - a.count).slice(0, 12);
}

export function buildProfileContext(profile: UserProfile): string {
  const skills = profile.skills.map((s) => `  - ${s}`).join("\n");
  const experience = profile.experience
    .map(
      (e, i) =>
        `${i + 1}) ${e.role} @ ${e.company} (${e.duration})\n     ${e.bulletPoints.map((b) => `- ${b}`).join("\n     ")}`
    )
    .join("\n");
  const education = profile.education
    .map((e) => `  - ${e.degree}, ${e.school} (${e.year})`)
    .join("\n");

  return `CANDIDATE PROFILE
Name: ${profile.name}
Contact: ${profile.email} | ${profile.phone} | ${profile.location}
Target Role: ${profile.targetTitle}
Summary: ${profile.summary}

VERIFIED CORE SKILLS (only reference these — never invent skills):
${skills || "  (none listed)"}

WORK EXPERIENCE:
${experience || "  (none)"}

EDUCATION:
${education || "  (none)"}`;
}

export function buildJobContext(job: Pick<JobApplication, "title" | "company" | "location" | "salary" | "jobDescription" | "url">): string {
  return `JOB OFFER
Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? "N/A"}
Salary: ${job.salary ?? "Not disclosed"}
URL: ${job.url ?? "N/A"}

JOB DESCRIPTION:
${job.jobDescription}`;
}

export const SYSTEM_PREAMBLE = `You are HUNTFLOW, an elite AI career copilot embedded in a job-application OS. You are brutally honest, data-driven, and specific. You never invent candidate skills, companies, or metrics that are not in the provided profile. You write like a world-class career coach with a sharp, confident, human tone.`;

export const JSON_RULE = `CRITICAL OUTPUT RULES:
- Respond with a SINGLE valid JSON object. No markdown fences, no commentary, no trailing text.
- Every string must be truthful and grounded in the provided profile/job data.`;
