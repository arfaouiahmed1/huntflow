import { UserProfile, JobApplication, TailoredDocuments, EmployerReview, CompanyResearch } from "@/types";
import { LLMSettings } from "@/lib/llm/providers";
import { generateJSON } from "@/lib/llm/client";
import { buildProfileContext, buildJobContext, extractJdTerms, SYSTEM_PREAMBLE, JSON_RULE } from "@/lib/prompts/commonPrompts";
import { executeCompanyIntelTool } from "@/lib/agents/tools/multiAgentTools";

export interface EmployerSimulatorInput {
  job: Pick<JobApplication, "id" | "title" | "company" | "location" | "jobDescription" | "url" | "multiAgentOutputs">;
  profile: UserProfile;
  documents?: TailoredDocuments;
  llmSettings?: LLMSettings | null;
}

function companyIntelFromResearch(research: CompanyResearch | undefined): EmployerReview["companyIntel"] {
  if (!research) return undefined;
  const fact = (label: string) => research.facts.find((item) => item.label === label)?.value;
  const postingFact = (label: string) => (fact(label) || "").split(",").map((value) => value.trim()).filter(Boolean);
  return {
    history: research.summary,
    headquarters: fact("Headquarters"),
    foundingYear: fact("Founded"),
    stage: fact("Organization type"),
    products: [],
    techStack: postingFact("Technologies named in posting"),
    cultureSignals: postingFact("Culture language in posting"),
    research,
  };
}

export function employerReviewFallback(
  job: Pick<JobApplication, "title" | "company" | "location" | "jobDescription">,
  profile: UserProfile,
  research?: CompanyResearch,
): EmployerReview {
  const terms = extractJdTerms(job.jobDescription, profile.skills);
  const matched = terms.filter((t) => t.inResume).map((t) => t.term);
  const missing = terms.filter((t) => !t.inResume).map((t) => t.term);

  const atsScore = terms.length ? Math.round((matched.length / terms.length) * 100) : 75;
  const experienceDepth = profile.experience.length >= 2 ? 85 : 65;
  const acceptanceProbability = Math.round(atsScore * 0.5 + experienceDepth * 0.4 + 5);

  let verdict: EmployerReview["verdict"] = "possible_callback";
  if (acceptanceProbability >= 80) verdict = "interview_likely";
  else if (acceptanceProbability < 55) verdict = "likely_reject";

  return {
    acceptanceProbability: Math.min(96, Math.max(35, acceptanceProbability)),
    atsPassScore: atsScore,
    verdict,
    strengths: [
      `Strong core alignment in ${matched.slice(0, 3).join(", ") || profile.skills.slice(0, 2).join(", ")}.`,
      `Profile targets ${profile.targetTitle}, which positions well against this ${job.title} role.`,
      `${profile.experience.length} role(s) with ${profile.experience[0]?.duration ?? "industry"} tenure in the profile.`,
    ],
    riskFactors: missing.length
      ? missing.slice(0, 3).map((m) => `Missing explicit mention of ${m} in primary experience bullets.`)
      : ["No major ATS red flags detected in candidate profile."],
    actionableFixes: [
      `Feature ${missing[0] || profile.skills[0]} prominently in the resume summary paragraph.`,
      `Quantify the impact of your top 2 work experience bullets with specific percentages/revenue metrics.`,
      `Align your cover letter opening hook to directly reference ${job.company}'s core product focus.`,
    ],
    companyIntel: companyIntelFromResearch(research),
    reviewedAt: new Date().toISOString(),
  };
}

export async function runEmployerSimulator(input: EmployerSimulatorInput): Promise<EmployerReview> {
  const { job, profile, documents, llmSettings } = input;
  let research = job.multiAgentOutputs?.companyResearch;
  if (!research) {
    try {
      const companyIntel = await executeCompanyIntelTool({
        company: job.company,
        jobDescription: job.jobDescription,
        jobUrl: job.url,
      });
      research = companyIntel.research;
    } catch {
      research = undefined;
    }
  }

  const docContext = documents
    ? `
SUBMITTED DOCUMENTS:
- Tailored Resume: ${documents.tailoredResume ? documents.tailoredResume.slice(0, 1500) : "(Not attached)"}
- Cover Letter: ${documents.coverLetter ? documents.coverLetter.slice(0, 800) : "(Not attached)"}
`
    : "";

  const system = `${SYSTEM_PREAMBLE}
You are an executive hiring strategist and senior technical recruiter evaluating ${job.company}.
You cannot browse. Evaluate the candidate only from the supplied profile, job posting, documents, and verified research block. Never invent company facts.

${JSON_RULE}`;

  const user = `${buildProfileContext(profile)}

${buildJobContext(job)}
${docContext}

VERIFIED COMPANY RESEARCH (may be empty; every statement includes source IDs):
${research?.facts.map((item) => `- ${item.label}: ${item.value} [${item.sourceIds.join(", ")}]`).join("\n") || "No verified company facts available."}
Sources:
${research?.sources.map((source) => `- [${source.id}] ${source.title}: ${source.url}`).join("\n") || "None."}

TASK: Evaluate this candidate's application papers for the role at ${job.company} (location: ${job.location || "Global"}).
Respond as JSON:
- "acceptanceProbability": integer 0-100 (estimated % probability candidate gets invited to an interview).
- "atsPassScore": integer 0-100 (ATS keyword & formatting parser score).
- "verdict": "interview_likely" (score >= 80) | "possible_callback" (55-79) | "likely_reject" (< 55).
- "strengths": string[] — 3 concrete reasons this application stands out to a recruiter.
- "riskFactors": string[] — 3 red flags or gaps that decrease callback odds.
- "actionableFixes": string[] — 3 specific edits to candidate documents. Do not claim a numeric boost.`;

  try {
    const res = await generateJSON<EmployerReview>(llmSettings, system, user, "employer-simulator");
    const VERDICTS: EmployerReview["verdict"][] = ["interview_likely", "possible_callback", "likely_reject"];
    const cleanArr = (v: unknown, max = 5): string[] =>
      Array.isArray(v) ? v.slice(0, max).map((s) => String(s).slice(0, 400)).filter(Boolean) : [];
    return {
      acceptanceProbability: Math.min(98, Math.max(20, Number.isFinite(res.acceptanceProbability) ? res.acceptanceProbability : 70)),
      atsPassScore: Math.min(100, Math.max(20, Number.isFinite(res.atsPassScore) ? res.atsPassScore : 75)),
      verdict: VERDICTS.includes(res.verdict) ? res.verdict : "possible_callback",
      strengths: cleanArr(res.strengths).length ? cleanArr(res.strengths) : ["Strong skill overlap with core tech stack."],
      riskFactors: cleanArr(res.riskFactors).length ? cleanArr(res.riskFactors) : ["Resume could use more quantified achievement metrics."],
      actionableFixes: cleanArr(res.actionableFixes).length ? cleanArr(res.actionableFixes) : ["Tailor cover letter hook specifically to this company."],
      companyIntel: companyIntelFromResearch(research),
      reviewedAt: new Date().toISOString(),
    };
  } catch {
    return employerReviewFallback(job, profile, research);
  }
}
