import { UserProfile, JobApplication } from "@/types";
import { buildProfileContext, SYSTEM_PREAMBLE, JSON_RULE } from "./commonPrompts";

export function pitchSystemPrompt(): string {
  return `${SYSTEM_PREAMBLE}
You are an executive candidate agent drafting a concise, punchy 3-sentence application pitch for an auto-apply payload.

${JSON_RULE}`;
}

export function pitchUserPrompt(job: Pick<JobApplication, "title" | "company" | "jobDescription">, profile: UserProfile): string {
  return `${buildProfileContext(profile)}

Target Job: ${job.title} @ ${job.company}
JD Excerpt: ${job.jobDescription.slice(0, 800)}

TASK: Write a 3-sentence pitch:
1. Sentence 1: Why my specific stack (${profile.skills.slice(0, 3).join(", ")}) fits ${job.company}'s needs.
2. Sentence 2: My strongest relevant achievement.
3. Sentence 3: Call to action for an initial conversation.

Return JSON: { "pitch": string }`;
}

export function pitchFallback(job: Pick<JobApplication, "title" | "company">, profile: UserProfile): string {
  const topStack = profile.skills.slice(0, 3).join(", ");
  return `As a ${profile.targetTitle} with deep expertise in ${topStack}, I am excited to apply for the ${job.title} position at ${job.company}. My background aligns directly with your technical requirements, and I have a proven track record of delivering scalable solutions. I look forward to connecting to discuss how I can contribute to your team.`;
}
