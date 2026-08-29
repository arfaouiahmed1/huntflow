import { NextRequest } from "next/server";
import { routeError, AppError, readBody } from "@/lib/errors";
import { settingsRepo, jobsRepo, emailsRepo, interviewsRepo, remindersRepo } from "@/lib/db";
import { UserProfile } from "@/types";
import { buildSharedContext } from "@/lib/agents/context";
import { searchVault } from "@/lib/vault";
import { resolveChain, callLLM } from "@/lib/llm/router";
import { initialProfile } from "@/lib/initialData";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SYSTEM = `You are HUNTFLOW vault assistant. You answer strictly from the provided vault evidence and shared context. Cite every claim as docName#chunkIndex [model]. If evidence is missing, say so. Never invent skills or companies.`;

export async function POST(req: NextRequest) {
  try {
    const raw = await readBody(req);
    const body = (raw ?? {}) as { query?: string; q?: string; k?: number };
    const query = (body.query ?? body.q ?? "").trim();
    if (!query) throw new AppError("query is required.", "BAD_BODY", 400);
    const k = Math.min(8, Math.max(1, Number(body.k ?? 3) || 3));

    let profile: UserProfile = initialProfile;
    try {
      const rawProfile = settingsRepo.get("profile");
      if (rawProfile) profile = JSON.parse(rawProfile) as UserProfile;
    } catch {
      profile = initialProfile;
    }

    let hits: Awaited<ReturnType<typeof searchVault>> = [];
    try {
      hits = await searchVault(query, k);
    } catch {
      hits = [];
    }

    const vaultForContext = hits.map((h) => ({
      content: h.text,
      docId: h.docId,
      docName: h.docName,
      chunkIndex: h.chunkIndex,
      model: h.model,
      score: h.score,
      text: h.text,
    }));

    const shared = await buildSharedContext({
      profile,
      jobs: jobsRepo.list(),
      emails: emailsRepo.list(),
      interviews: interviewsRepo.list(),
      reminders: remindersRepo.list(),
      vaultHits: vaultForContext,
      maxTokens: 4000,
    });

    const vaultBlock = hits.length
      ? hits
          .map(
            (h) =>
              `- ${h.text.slice(0, 280).replace(/\s+/g, " ").trim()} [${h.docName}#${h.chunkIndex} ${h.model} ${(h.score * 100).toFixed(0)}% ${h.strategy}]`
          )
          .join("\n")
      : "no vault hits";

    const user = [`## SHARED CONTEXT (v2)\n${shared.context}`, `## VAULT EVIDENCE\n${vaultBlock}`, `## USER QUERY\n${query}`, `TASK: Answer the query in 2-4 sentences, then list citations as docName#chunkIndex. If no evidence, state "No supporting passage found."`].join(
      "\n\n"
    );

    const chain = resolveChain(null);
    let answer = "";
    let source: "live_llm" | "heuristic_fallback" = "heuristic_fallback";
    let provider: string | undefined;
    let model: string | undefined;

    if (!chain.length) {
      // offline deterministic fallback — stitch vault evidence
      answer = hits.length
        ? `Found ${hits.length} supporting passages: ${hits.map((h) => `${h.docName}#${h.chunkIndex}`).join(", ")}. ${hits[0].text.slice(0, 220).replace(/\s+/g, " ").trim()}`
        : "No supporting passage found in the vault for this query.";
      source = "heuristic_fallback";
      provider = "local_heuristic";
      model = "rule_engine_v1";
    } else {
      try {
        const llm = await callLLM({ system: SYSTEM, user, json: false, agent: "vault_assist", maxOutput: 600 }, chain);
        answer = llm.text.trim().slice(0, 2000);
        if (!answer) throw new Error("Empty completion");
        source = "live_llm";
        provider = llm.providerId;
        model = llm.model;
      } catch {
        answer = hits.length
          ? `Vault evidence (offline): ${hits.map((h) => `${h.docName}#${h.chunkIndex}`).join(", ")} — ${hits[0].text.slice(0, 220).replace(/\s+/g, " ").trim()}`
          : "No supporting passage found in the vault for this query.";
        source = "heuristic_fallback";
        provider = "local_heuristic";
        model = "rule_engine_v1";
      }
    }

    return Response.json({
      answer,
      hits: hits.map((h) => ({
        docName: h.docName,
        chunkIndex: h.chunkIndex,
        docId: h.docId,
        text: h.text.slice(0, 800),
        score: h.score,
        model: h.model,
        strategy: h.strategy,
        lexicalScore: h.lexicalScore,
        semanticScore: h.semanticScore,
        lexicalRank: h.lexicalRank,
        semanticRank: h.semanticRank,
        matchedTerms: h.matchedTerms,
      })),
      sharedContext: { tokens: shared.tokens, stats: shared.stats },
      source,
      provider,
      model,
    });
  } catch (err) {
    return routeError(err);
  }
}
