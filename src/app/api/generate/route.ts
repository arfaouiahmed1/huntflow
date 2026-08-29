import { NextRequest } from "next/server";
import { routeError, AppError, readBody } from "@/lib/errors";
import { LLMSettings } from "@/lib/llm/providers";
import { generateJSON } from "@/lib/llm/client";
import { UserProfile, JobApplication } from "@/types";
import { budgetFor, jobPayloadForBudget, profileForBudget } from "@/lib/llm/context";
import {
  cleanDocuments,
  cleanSkillsGap,
  cleanSTARCards,
  cleanInterviewQuestions,
  cleanJobBrief,
  cleanSalaryIntel,
  cleanRecommendations,
  cleanRoadmap,
  cleanPipelineReport,
} from "@/lib/llm/sanitize";
import {
  documentsSystemPrompt,
  documentsUserPrompt,
  matchSystemPrompt,
  matchUserPrompt,
  matchFallback,
  starSystemPrompt,
  starUserPrompt,
  starFallback,
  questionsSystemPrompt,
  questionsUserPrompt,
  questionsFallback,
  briefSystemPrompt,
  briefUserPrompt,
  briefFallback,
  salarySystemPrompt,
  salaryUserPrompt,
  salaryFallback,
  recommendationsSystemPrompt,
  recommendationsUserPrompt,
  recommendationsFallback,
  roadmapSystemPrompt,
  roadmapUserPrompt,
  roadmapFallback,
  reportSystemPrompt,
  reportUserPrompt,
  reportFallback,
} from "@/lib/prompts";

type GenType =
  | "documents"
  | "match_analysis"
  | "star_flashcards"
  | "interview_questions"
  | "job_brief"
  | "salary_intel"
  | "recommendations"
  | "skill_roadmap"
  | "pipeline_report";

export async function POST(req: NextRequest) {
  try {
    const raw = await readBody(req);
    const body = (raw ?? {}) as {
      type?: string;
      job?: JobApplication;
      jobs?: JobApplication[];
      profile?: UserProfile;
      options?: {
        tone?: string;
        focusSkills?: string[];
        docType?: "tailoredResume" | "coverLetter" | "motivationLetter" | "followUpEmail";
      };
      trackedJobs?: JobApplication[];
      gaps?: string[];
      llmSettings?: Partial<LLMSettings>;
    };
    const { type, job, profile, options } = body;
    const llmSettings = (body as { llmSettings?: LLMSettings | null } | null)?.llmSettings ?? null;

    const GLOBAL_TYPES = new Set(["recommendations", "skill_roadmap", "pipeline_report"]);
    const isGlobalType = GLOBAL_TYPES.has(type || "");

    if (!type) throw new AppError("Missing generation type.", "BAD_BODY", 400);
    if (!isGlobalType && !job) throw new AppError("Missing job payload.", "BAD_BODY", 400);

    const budget = budgetFor(type);
    const jobLike = job ? jobPayloadForBudget(job, budget.maxPrompt) : ({} as JobApplication);
    const profLike = profileForBudget(
      (profile ?? { name: "", targetTitle: "", skills: [], summary: "", experience: [], education: [] }) as UserProfile,
      budget.maxPrompt
    );

    const run = async <T>(
      system: string,
      user: string,
      fallback: () => T
    ): Promise<{ data: T; source: "live_llm" | "heuristic_fallback"; provider?: string; model?: string }> => {
      try {
        const data = await generateJSON<T>(llmSettings, system, user, type);
        const provider = llmSettings?.providerId || "configured";
        const model = llmSettings?.model || "default";
        return { data, source: "live_llm", provider, model };
      } catch {
        /* provider chain exhausted — deterministic fallback keeps the app working */
        return { data: fallback(), source: "heuristic_fallback", provider: "local_heuristic", model: "rule_engine_v1" };
      }
    };

    switch (type as GenType) {
      case "documents": {
        const res = await run(
          documentsSystemPrompt(),
          documentsUserPrompt(jobLike, profLike, options),
          () => documentsFallback(jobLike, profLike)
        );
        const cleaned = cleanDocuments({
          ...res.data,
          source: res.source,
          provider: res.provider,
          model: res.model,
          generatedAt: new Date().toISOString(),
        }) ?? {
          ...documentsFallback(jobLike, profLike),
          source: res.source,
          provider: res.provider,
          model: res.model,
          generatedAt: new Date().toISOString(),
        };
        return Response.json({ documents: cleaned });
      }
      case "match_analysis": {
        const res = await run(
          matchSystemPrompt(),
          matchUserPrompt(jobLike, profLike),
          () => matchFallback(jobLike, profLike)
        );
        const cleaned = cleanSkillsGap({
          ...res.data,
          source: res.source,
          provider: res.provider,
          model: res.model,
          analyzedAt: new Date().toISOString(),
        }) ?? {
          ...matchFallback(jobLike, profLike),
          source: res.source,
          provider: res.provider,
          model: res.model,
          analyzedAt: new Date().toISOString(),
        };
        return Response.json({ analysis: cleaned });
      }
      case "star_flashcards": {
        const res = await run(
          starSystemPrompt(),
          starUserPrompt(jobLike, profLike),
          () => starFallback(jobLike, profLike)
        );
        return Response.json({ cards: cleanSTARCards(res.data) ?? starFallback(jobLike, profLike) });
      }
      case "interview_questions": {
        const res = await run(
          questionsSystemPrompt(),
          questionsUserPrompt(jobLike, profLike),
          () => questionsFallback(jobLike, profLike)
        );
        return Response.json({ questions: cleanInterviewQuestions(res.data) ?? questionsFallback(jobLike, profLike) });
      }
      case "job_brief": {
        const res = await run(briefSystemPrompt(), briefUserPrompt(jobLike), () => briefFallback(jobLike));
        return Response.json({ brief: cleanJobBrief(res.data) ?? briefFallback(jobLike) });
      }
      case "salary_intel": {
        const res = await run(
          salarySystemPrompt(),
          salaryUserPrompt(jobLike, profLike),
          () => salaryFallback(jobLike)
        );
        return Response.json({ salary: cleanSalaryIntel(res.data) ?? salaryFallback(jobLike) });
      }
      case "recommendations": {
        const tracked = body.jobs ?? body.trackedJobs ?? [];
        const res = await run(
          recommendationsSystemPrompt(),
          recommendationsUserPrompt(profLike, tracked),
          () => recommendationsFallback(profLike, tracked)
        );
        return Response.json({ recommendations: cleanRecommendations(res.data) ?? recommendationsFallback(profLike, tracked) });
      }
      case "skill_roadmap": {
        const gaps = body.gaps ?? [];
        const res = await run(
          roadmapSystemPrompt(),
          roadmapUserPrompt(profLike, gaps),
          () => roadmapFallback(gaps)
        );
        return Response.json({ roadmap: cleanRoadmap(res.data) ?? roadmapFallback(gaps) });
      }
      case "pipeline_report": {
        const jobs = body.jobs ?? body.trackedJobs ?? [];
        const res = await run(
          reportSystemPrompt(),
          reportUserPrompt(profLike, jobs),
          () => reportFallback(jobs)
        );
        return Response.json({ report: cleanPipelineReport(res.data) ?? reportFallback(jobs) });
      }
      default:
        throw new AppError(`Unknown generation type: ${type}`, "BAD_BODY", 400);
    }
  } catch (err) {
    return routeError(err);
  }
}

/* -------------------- deterministic document fallback -------------------- */

function documentsFallback(job: JobApplication, profile: UserProfile) {
  const exp = profile.experience;
  const edu = profile.education;
  const skills = profile.skills;

  const tailoredResume = `${profile.name.toUpperCase()} | ${job.title}
${profile.email} | ${profile.phone} | ${profile.location}

PROFESSIONAL SUMMARY
${profile.summary} — aligned specifically for the ${job.title} role at ${job.company}, anchored in ${skills.slice(0, 5).join(", ")}.

CORE COMPETENCIES
• ${skills.slice(0, 8).join(" • ")}

WORK EXPERIENCE
${exp
  .map(
    (x) => `${x.role} — ${x.company} (${x.duration})
${x.bulletPoints.map((bp) => `• ${bp}`).join("\n")}
• Tailored to ${job.company}: reframed this experience around the requirements of the ${job.title} role.`
  )
  .join("\n\n")}

EDUCATION
${edu.map((x) => `• ${x.degree}, ${x.school} (${x.year})`).join("\n")}`;

  const coverLetter = `Dear Hiring Manager at ${job.company},

I am writing to apply for the ${job.title} role. As a ${profile.targetTitle} with experience across ${skills.slice(0, 4).join(", ")}, I'm confident I can contribute from day one.

${exp[0]?.bulletPoints[0] ?? "My work has consistently combined technical rigor with product impact."} This experience maps directly onto what your team is looking for.

I would welcome the chance to discuss how I can help ${job.company} hit its engineering goals. Thank you for your consideration.

Best regards,
${profile.name}`;

  const motivationLetter = `Motivation Letter — ${job.title} at ${job.company}

Dear Selection Committee,

My motivation for joining ${job.company} comes from the quality of the problems you're solving and the caliber of the team solving them. The ${job.title} role sits exactly at the intersection of my skills — ${skills.slice(0, 3).join(", ")} — and the kind of impact I want to have next.

I'd be excited to bring my experience shipping high-stakes software, along with the energy and ownership this role demands.

Warm regards,
${profile.name}`;

  const followUpEmail = `Subject: Following up — ${job.title} application (${profile.name})

Hi ${job.company} team,

I applied for the ${job.title} role a few days ago and wanted to briefly follow up. I wanted to make sure you saw my application — I'm especially excited about the chance to contribute via my experience with ${skills.slice(0, 3).join(", ")}.

Happy to make time for a conversation whenever convenient.

Best,
${profile.name}
${profile.email} | ${profile.phone}`;

  return { tailoredResume, coverLetter, motivationLetter, followUpEmail };
}
