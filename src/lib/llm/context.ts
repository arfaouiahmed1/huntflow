import { UserProfile, JobApplication } from "@/types";
import { truncateHeadTail, truncateToTokens } from "./tokens";

/** Per-generation-type context budgets (prompt side, in tokens).
 *  Keeps cheap fallback models (small contexts) and slow links in bounds. */
export const GEN_BUDGETS: Record<string, { maxPrompt: number; maxOutput: number }> = {
  documents: { maxPrompt: 20_000, maxOutput: 8_000 },
  match_analysis: { maxPrompt: 10_000, maxOutput: 2_000 },
  star_flashcards: { maxPrompt: 10_000, maxOutput: 4_000 },
  interview_questions: { maxPrompt: 10_000, maxOutput: 4_000 },
  job_brief: { maxPrompt: 8_000, maxOutput: 2_500 },
  salary_intel: { maxPrompt: 6_000, maxOutput: 1_500 },
  recommendations: { maxPrompt: 24_000, maxOutput: 4_000 },
  skill_roadmap: { maxPrompt: 8_000, maxOutput: 2_500 },
  pipeline_report: { maxPrompt: 24_000, maxOutput: 4_000 },
  chat: { maxPrompt: 28_000, maxOutput: 2_000 },
  pitch: { maxPrompt: 4_000, maxOutput: 500 },
  generate: { maxPrompt: 28_000, maxOutput: 8_000 },
  resume_draft: { maxPrompt: 14_000, maxOutput: 8_000 },
  resume_improve: { maxPrompt: 14_000, maxOutput: 8_000 },
  resume_tailor: { maxPrompt: 16_000, maxOutput: 8_000 },
  resume_parse: { maxPrompt: 12_000, maxOutput: 8_000 },
  "orchestrator-route": { maxPrompt: 8_000, maxOutput: 500 },
  llm_test: { maxPrompt: 2_000, maxOutput: 100 },
};

export function budgetFor(type: string): { maxPrompt: number; maxOutput: number } {
  return GEN_BUDGETS[type] ?? { maxPrompt: 12_000, maxOutput: 3_000 };
}

/** Build a job payload sized for the type's budget. */
export function jobPayloadForBudget(job: JobApplication, maxPrompt: number): JobApplication {
  const room = Math.max(2_000, maxPrompt - 6_000); // reserve room for profile + prompt chrome
  const description = truncateHeadTail(job.jobDescription || "", room * 0.85);
  return { ...job, jobDescription: description };
}

/** Build a profile payload sized for the type's budget. */
export function profileForBudget(profile: UserProfile, maxPrompt: number): UserProfile {
  const room = Math.max(1_000, maxPrompt - 8_000);
  const skills = truncateToTokens(profile.skills.join(", "), Math.floor(room * 0.25))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    ...profile,
    skills: skills.slice(0, 40),
    summary: truncateToTokens(profile.summary, Math.floor(room * 0.2)),
    experience: profile.experience.map((e) => ({
      ...e,
      bulletPoints: truncateToTokens(e.bulletPoints.join("\n"), Math.floor(room * 0.3))
        .split("\n")
        .filter(Boolean)
        .slice(0, 8),
    })),
    education: profile.education.slice(0, 4),
  };
}
