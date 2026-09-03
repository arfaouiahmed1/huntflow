/**
 * Multi-Stage Outreach Sequence Generator — Huntflow Agent Hardening (Phase 3)
 *
 * Generates structured, high-conversion multi-stage outreach sequences
 * with increasing value delivery and clear non-pushy calls to action.
 */

export type OutreachStage = "day_0_connect" | "day_4_value_nudge" | "day_10_proof_followup";

export interface OutreachSequenceItem {
  stage: OutreachStage;
  delayDays: number;
  subject: string;
  body: string;
  callToAction: string;
  channel: "linkedin_inmail" | "email";
  personalizedHooks: string[];
}

export interface OutreachSequencePlan {
  sequenceId: string;
  targetCompany: string;
  targetRole: string;
  stages: OutreachSequenceItem[];
  totalEstimatedDurationDays: number;
}

/**
 * Generate a 3-stage candidate-led outreach campaign for a specific role.
 */
export function generateOutreachSequence(
  job: { company: string; title: string; url?: string; jobDescription: string },
  candidate: { name: string; summary?: string; topSkills: string[] },
  newsSnippet?: string
): OutreachSequencePlan {
  const topSkillStr = candidate.topSkills.slice(0, 3).join(", ") || "software engineering";
  const firstSkill = candidate.topSkills[0] || "modern engineering";
  const secondSkill = candidate.topSkills[1] || "system design";

  const sequenceId = `seq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const stage1: OutreachSequenceItem = {
    stage: "day_0_connect",
    delayDays: 0,
    subject: `${job.title} application — ${candidate.name} intro`,
    body: `Hi team,

I recently submitted my application for the ${job.title} role at ${job.company}. Over the past several years, I've specialized in ${topSkillStr}.

Given ${job.company}'s focus on high-impact engineering, I wanted to reach out directly to express my enthusiasm for the team's mission.

Looking forward to connecting,
${candidate.name}`,
    callToAction: "Connect on LinkedIn / acknowledge receipt",
    channel: "linkedin_inmail",
    personalizedHooks: [`Specialized in ${topSkillStr}`, `Specific interest in ${job.company}'s engineering culture`],
  };

  const newsContext = newsSnippet ? `I saw the recent updates regarding ${newsSnippet.slice(0, 100)} and ` : "";

  const stage2: OutreachSequenceItem = {
    stage: "day_4_value_nudge",
    delayDays: 4,
    subject: `Quick follow-up on ${job.title} / ${firstSkill} work at ${job.company}`,
    body: `Hi there,

Following up on my note earlier this week regarding the ${job.title} opening. ${newsContext}I wanted to share a quick architectural reflection:

In past projects, pairing ${firstSkill} with ${secondSkill} allowed our team to significantly streamline throughput while maintaining tight reliability boundaries. I would love to bring this same operational rigor to ${job.company}.

Best,
${candidate.name}`,
    callToAction: "Open to a brief 10-minute sync",
    channel: "email",
    personalizedHooks: [`Value proposition around ${firstSkill} & ${secondSkill}`, `Relevant to ${job.company}'s stack`],
  };

  const stage3: OutreachSequenceItem = {
    stage: "day_10_proof_followup",
    delayDays: 10,
    subject: `Case study & project links for ${job.title} review`,
    body: `Hi team,

Wrapping up my outreach regarding the ${job.title} position at ${job.company}. To give your hiring team concrete evidence of my work, here is a summary of relevant systems I've designed and delivered with ${topSkillStr}.

Regardless of timing, I remain a big fan of what ${job.company} is building.

Warm regards,
${candidate.name}`,
    callToAction: "Review case study portfolio",
    channel: "email",
    personalizedHooks: [`Direct proof of work with ${topSkillStr}`, `Zero-pressure closing`],
  };

  return {
    sequenceId,
    targetCompany: job.company,
    targetRole: job.title,
    stages: [stage1, stage2, stage3],
    totalEstimatedDurationDays: 10,
  };
}
