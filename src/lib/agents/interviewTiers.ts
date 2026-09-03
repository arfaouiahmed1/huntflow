/**
 * Multi-Tier STAR Interview Prep & Probing Engine — Huntflow Agent Hardening (Phase 3)
 *
 * Generates structured interview questions across 3 tiers (screening, hiring_manager, bar_raiser)
 * with concrete STAR answering guides, follow-up probe questions, and vault evidence anchors.
 */

export type InterviewStageTier = "screening" | "hiring_manager" | "bar_raiser";

export interface TieredInterviewQuestion {
  id: string;
  tier: InterviewStageTier;
  topic: string;
  question: string;
  starGuidance: {
    situation: string;
    task: string;
    action: string;
    result: string;
  };
  followUpProbes: string[];
  vaultAnchor?: string;
}

export interface TieredInterviewPrepResult {
  totalQuestions: number;
  byTier: Record<InterviewStageTier, TieredInterviewQuestion[]>;
  cultureKeywords: string[];
  vaultAnchorsCount: number;
}

const TIER_TEMPLATES: Record<
  InterviewStageTier,
  Array<{
    questionTemplate: (topic: string, company: string, role: string) => string;
    probes: (topic: string) => string[];
  }>
> = {
  screening: [
    {
      questionTemplate: (topic, company, role) =>
        `Can you walk me through your background with ${topic} and what drew you to this ${role} role at ${company}?`,
      probes: (topic) => [
        `How do you keep your ${topic} skills current when project requirements shift quickly?`,
        `What type of engineering culture brings out your best work with ${topic}?`,
      ],
    },
    {
      questionTemplate: (topic, _company) =>
        `How have you collaborated across cross-functional teams when delivering ${topic} projects at past companies?`,
      probes: () => [
        "Can you share an example where you had to push back on an unrealistic delivery deadline?",
        "How do you communicate technical trade-offs to non-engineering stakeholders?",
      ],
    },
  ],
  hiring_manager: [
    {
      questionTemplate: (topic, company, role) =>
        `Describe a complex architecture or production challenge you solved using ${topic} as a ${role}.`,
      probes: (topic) => [
        `What were the major technical trade-offs of using ${topic} over alternative solutions?`,
        `How did you verify performance, reliability, and edge-case resilience under load?`,
      ],
    },
    {
      questionTemplate: (topic) =>
        `Tell me about a time a production issue or regression occurred related to ${topic}. How did you diagnose and remediate it?`,
      probes: () => [
        "What observability or telemetry metrics alerted you to the failure?",
        "What architectural safeguards did you implement to prevent recurrence?",
      ],
    },
  ],
  bar_raiser: [
    {
      questionTemplate: (topic) =>
        `If the concurrency and traffic for your ${topic} system increased by 10x overnight, where would the primary bottlenecks emerge and how would you redesign it?`,
      probes: (topic) => [
        `How would you balance cost efficiency against high availability in this ${topic} architecture?`,
        `How do you mentor more junior engineers to maintain high architectural standards in ${topic}?`,
      ],
    },
    {
      questionTemplate: (topic, _company) =>
        `How do you approach deprecating legacy systems or migrating critical infrastructure to modern ${topic} stacks with zero downtime?`,
      probes: () => [
        "How do you handle schema migrations or state consistency during rolling updates?",
        "What rollback strategy do you establish before initiating high-risk migrations?",
      ],
    },
  ],
};

/**
 * Generate a deterministic multi-tier STAR interview prep package.
 */
export function generateTieredInterviewPrep(
  topics: string[],
  job: { title: string; company: string; jobDescription: string },
  vaultExcerpts?: Array<{ docName: string; chunkIndex: number; text: string }>
): TieredInterviewPrepResult {
  const cleanTopics = [...new Set(topics.map((t) => t.trim()).filter((t) => t.length > 0))];
  const effectiveTopics = cleanTopics.length > 0 ? cleanTopics : ["System Architecture", "Performance Optimization", "Code Quality"];

  const byTier: Record<InterviewStageTier, TieredInterviewQuestion[]> = {
    screening: [],
    hiring_manager: [],
    bar_raiser: [],
  };

  let questionCounter = 0;
  let vaultAnchorsCount = 0;

  const tiers: InterviewStageTier[] = ["screening", "hiring_manager", "bar_raiser"];

  for (const tier of tiers) {
    const templates = TIER_TEMPLATES[tier];
    for (let i = 0; i < templates.length; i++) {
      const topic = effectiveTopics[(questionCounter) % effectiveTopics.length];
      const tmpl = templates[i];
      questionCounter++;

      const questionText = tmpl.questionTemplate(topic, job.company, job.title);
      const probes = tmpl.probes(topic);

      let vaultAnchor: string | undefined;
      if (vaultExcerpts && vaultExcerpts.length > 0) {
        const matchingDoc = vaultExcerpts.find(
          (doc) =>
            doc.text.toLowerCase().includes(topic.toLowerCase()) ||
            doc.text.toLowerCase().includes(job.company.toLowerCase())
        ) || vaultExcerpts[questionCounter % vaultExcerpts.length];

        if (matchingDoc) {
          vaultAnchor = `${matchingDoc.docName}#${matchingDoc.chunkIndex}`;
          vaultAnchorsCount++;
        }
      }

      const questionItem: TieredInterviewQuestion = {
        id: `q_${tier}_${questionCounter}`,
        tier,
        topic,
        question: questionText,
        starGuidance: {
          situation: `Contextualize a high-impact project where ${topic} was central to the team's objective.`,
          task: `Define your exact responsibility and the specific technical constraints (scale, latency, budget).`,
          action: `Detail the concrete architectural decisions, design patterns, and testing strategies you implemented.`,
          result: `Conclude with measurable business or technical outcomes (e.g. 40% latency drop, 99.99% uptime, $20k/mo saved).`,
        },
        followUpProbes: probes,
        vaultAnchor,
      };

      byTier[tier].push(questionItem);
    }
  }

  // Extract culture keywords from job description
  const cultureKeywords: string[] = [];
  const jdLower = job.jobDescription.toLowerCase();
  const cultureTerms = ["remote-first", "high ownership", "collaborative", "fast-paced", "user-centric", "cross-functional", "data-driven"];
  for (const term of cultureTerms) {
    if (jdLower.includes(term)) cultureKeywords.push(term);
  }

  const totalQuestions = byTier.screening.length + byTier.hiring_manager.length + byTier.bar_raiser.length;

  return {
    totalQuestions,
    byTier,
    cultureKeywords,
    vaultAnchorsCount,
  };
}
