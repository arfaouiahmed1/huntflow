import { NextRequest } from "next/server";
import { routeError, AppError, readBody } from "@/lib/errors";
import {
  jobsRepo,
  settingsRepo,
  emailsRepo,
  interviewsRepo,
  remindersRepo,
} from "@/lib/db";
import { UserProfile, JobApplication } from "@/types";
import { budgetFor, jobPayloadForBudget, profileForBudget } from "@/lib/llm/context";
import { matchSystemPrompt, matchUserPrompt, matchFallback } from "@/lib/prompts/generationPrompts";
import { cleanSkillsGap } from "@/lib/llm/sanitize";
import { buildSharedContext } from "@/lib/agents/context";
import { searchVault } from "@/lib/vault";
import { resolveChain, callLLM } from "@/lib/llm/router";
import { extractJson } from "@/lib/llm/client";
import { initialProfile } from "@/lib/initialData";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const raw = await readBody(req);
    const body = (raw ?? {}) as { jobId?: string; job?: JobApplication };
    let job: JobApplication | null = null;
    if (body.jobId) {
      job = jobsRepo.get(body.jobId);
    } else if (body.job && typeof (body.job as JobApplication).id === "string") {
      const maybe = body.job as JobApplication;
      // prefer DB version if exists to keep hydrated fields
      job = jobsRepo.get(maybe.id) ?? maybe;
    }
    if (!job) throw new AppError("Missing or unknown job.", "BAD_BODY", 400);

    // Profile from DB (single source of truth)
    let profile: UserProfile = initialProfile;
    try {
      const rawProfile = settingsRepo.get("profile");
      if (rawProfile) profile = JSON.parse(rawProfile) as UserProfile;
    } catch {
      profile = initialProfile;
    }

    // Budget is server-owned — tracker no longer duplicates it
    const budget = budgetFor("match_analysis");
    const jobLike = jobPayloadForBudget(job, budget.maxPrompt);
    const profLike = profileForBudget(profile, budget.maxPrompt);

    // Vault hits inline (searchVault handles LLM query expansion when chain exists, else deterministic BM25)
    let vaultHits: Awaited<ReturnType<typeof searchVault>> = [];
    try {
      const q = `${job.title} ${job.company} ${job.jobDescription.slice(0, 600)}`.trim().slice(0, 500);
      if (q) vaultHits = await searchVault(q, 3);
    } catch {
      vaultHits = [];
    }

    const vaultForContext = vaultHits.map((h) => ({
      content: h.text,
      docId: h.docId,
      docName: h.docName,
      chunkIndex: h.chunkIndex,
      model: h.model,
      score: h.score,
      text: h.text,
    }));

    // SharedContext v2 — includes PIPELINE STATUS, REMEMBERED, VAULT EVIDENCE, USAGE
    const allJobs = jobsRepo.list();
    const shared = await buildSharedContext({
      profile: profLike,
      jobs: allJobs,
      emails: emailsRepo.list(),
      interviews: interviewsRepo.list(),
      reminders: remindersRepo.list(),
      vaultHits: vaultForContext,
      maxTokens: 4000,
    });

    const system = matchSystemPrompt();
    const baseUser = matchUserPrompt(jobLike, profLike);
    // Diffuse sharedContext + vault evidence into the prompt so LLM reasoning is grounded
    const user = [
      baseUser,
      `## SHARED CONTEXT (v2)\n${shared.context}`,
      vaultHits.length
        ? `## VAULT HITS\n${vaultHits
            .map(
              (h) =>
                `- ${h.text.slice(0, 240).replace(/\s+/g, " ").trim()} [${h.docName}#${h.chunkIndex} ${h.model} ${(h.score * 100).toFixed(0)}%]`
            )
            .join("\n")}`
        : "## VAULT HITS\nno vault hits (upload evidence to cite)",
    ].join("\n\n");

    const chain = resolveChain(null);

    let analysis: ReturnType<typeof matchFallback> | null = null;
    let source: "live_llm" | "heuristic_fallback" = "heuristic_fallback";
    let provider: string | undefined;
    let model: string | undefined;

    try {
      if (!chain.length) throw new Error("No eligible provider in chain");
      const llm = await callLLM(
        { system, user, json: true, agent: "match_analysis", maxOutput: budget.maxOutput },
        chain
      );
      const parsed = extractJson(llm.text) as unknown;
      const cleaned = cleanSkillsGap(parsed);
      if (!cleaned || typeof cleaned.matchScore !== "number") throw new Error("Invalid LLM JSON");
      analysis = {
        ...cleaned,
        source: "live_llm",
        provider: llm.providerId,
        model: llm.model,
        analyzedAt: new Date().toISOString(),
      } as typeof cleaned;
      source = "live_llm";
      provider = llm.providerId;
      model = llm.model;
    } catch {
      // deterministic offline fallback — keeps ExplainFit usable without LLM
      const fb = matchFallback(job, profile);
      analysis = {
        ...fb,
        source: "heuristic_fallback",
        provider: "local_heuristic",
        model: "rule_engine_v1",
        analyzedAt: new Date().toISOString(),
      };
      source = "heuristic_fallback";
      provider = "local_heuristic";
      model = "rule_engine_v1";
    }

    // Ensure cleaned shape even for live_llm path
    const cleaned =
      cleanSkillsGap({
        ...(analysis as object),
        source,
        provider,
        model,
        analyzedAt: (analysis as { analyzedAt?: string })?.analyzedAt ?? new Date().toISOString(),
      }) ??
      ({
        ...matchFallback(job, profile),
        source,
        provider,
        model,
        analyzedAt: new Date().toISOString(),
      } as ReturnType<typeof cleanSkillsGap>);

    const vaultForClient = vaultHits.map((h) => ({
      docName: h.docName,
      chunkIndex: h.chunkIndex,
      text: h.text.slice(0, 800),
      score: h.score,
      model: h.model,
      strategy: h.strategy,
      lexicalScore: h.lexicalScore,
      semanticScore: h.semanticScore,
    }));

    return Response.json({
      analysis: cleaned,
      vaultHits: vaultForClient,
      sharedContext: { tokens: shared.tokens, stats: shared.stats },
      budget,
      source,
      provider,
      model,
    });
  } catch (err) {
    return routeError(err);
  }
}
