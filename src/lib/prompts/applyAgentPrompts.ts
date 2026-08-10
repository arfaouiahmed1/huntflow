import { UserProfile, JobApplication } from "@/types";

/**
 * Deterministic, offline application pitch used when no LLM provider is
 * configured. Natural-sounding, grounded in the profile's real skills and the
 * strongest verified bullet — never "I am excited about the opportunity".
 */
export function pitchFallback(job: Pick<JobApplication, "title" | "company">, profile: UserProfile): string {
  const topStack = profile.skills.slice(0, 3).join(", ");
  const strongest = profile.experience[0]?.bulletPoints[0] ?? `built and shipped real products with ${topStack}`;
  return `As a ${profile.targetTitle} who works daily with ${topStack}, I can contribute to the ${job.title} role at ${job.company} from day one. One thing I am particularly proud of: ${strongest}. I would welcome the chance to discuss how my background fits your team.`;
}
