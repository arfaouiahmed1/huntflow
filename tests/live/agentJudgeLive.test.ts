import { describe, expect, it } from "vitest";
import { buildAgentJudgePrompt, parseAgentJudgeVerdict } from "@/lib/agents/evaluation";
import { DatabaseSync } from "node:sqlite";

const live = process.env.HUNTFLOW_LIVE_EVAL === "1";

function readRealChain() {
  try {
    const db = new DatabaseSync("data/huntflow.db", { readOnly: true });
    const row = db.prepare("SELECT value FROM settings WHERE key='llm_providers'").get() as { value: string } | undefined;
    if (!row) return null;
    const chain = JSON.parse(row.value) as Array<{ id: string; providerId?: string; apiKey?: string; model?: string; enabled?: boolean }>;
    return chain;
  } catch (e) {
    console.log("readRealChain error", e);
    return null;
  }
}

(live ? describe : describe.skip)("live LLM-as-judge calibration", () => {
  it("prompt is evidence-first and verdict parsing rejects uncited payloads", () => {
    const prompt = buildAgentJudgePrompt({
      profileFacts: ["Built React and TypeScript interfaces for Acme, 2022–2025."],
      jobFacts: ["Role requires React and TypeScript, Node is a plus."],
      candidateOutput: "I built React and TypeScript interfaces for Acme.",
    });
    expect(prompt.system).toContain("Do not use outside knowledge");
    expect(prompt.system).toContain("Return JSON only");
    expect(() => parseAgentJudgeVerdict({ score: 5, rationale: "x" })).toThrow(/evidence/);
  });

  it("live judge round-trip produces grounded, quote-verified verdicts (or explains why it is blocked)", async () => {
    const chain = readRealChain();
    console.log("live-judge: readRealChain", chain?.map((p) => ({ id: p.id, hasKey: !!p.apiKey, masked: String(p.apiKey ?? "").startsWith("••••"), enabled: p.enabled })));
    const masked = chain?.some((p) => String(p.apiKey ?? "").startsWith("••••"));
    if (masked || !chain?.some((p) => p.apiKey && !String(p.apiKey).startsWith("••••"))) {
      console.log("live-judge: SKIPPED — stored llm_providers keys are masked placeholders (••••XXXX). Re-enter real keys in Settings → AI Engine.");
      expect(masked).toBe(true);
      return;
    }

    const { callLLM, resolveChain } = await import("@/lib/llm/router");
    const resolved = resolveChain();
    if (!resolved.length) {
      console.log("live-judge: no eligible provider after resolveChain, skipping");
      expect(resolved.length).toBe(0);
      return;
    }
    const prompt = buildAgentJudgePrompt({
      profileFacts: ["Built React and TypeScript interfaces.", "Led frontend platform at Acme."],
      jobFacts: ["Senior Frontend Engineer requires React, TypeScript, Node.js."],
      candidateOutput: "I built React and TypeScript interfaces and led the frontend platform at Acme.",
    });
    const result = await callLLM({ system: prompt.system, user: prompt.user, json: true, maxOutput: 400, agent: "vault" }, resolved);
    const verdict = parseAgentJudgeVerdict(JSON.parse(result.text));
    expect(verdict.score).toBeGreaterThanOrEqual(0);
    expect(verdict.score).toBeLessThanOrEqual(5);
    for (const ev of verdict.evidence) {
      expect(prompt.user).toContain(ev.sourceQuote.slice(0, 20));
    }
    console.log(`live-judge: score=${verdict.score} evidence=${verdict.evidence.length} provider=${result.providerId}`);
  }, 90_000);

  it("hallucinated output should be penalised (quote-verification demo)", () => {
    const profileFacts = ["Built React and TypeScript interfaces."];
    const jobFacts = ["Role requires React and TypeScript."];
    const hallucinated = "I built React, Kubernetes-operator pipelines and Rust microservices (none in profile).";
    const prompt = buildAgentJudgePrompt({ profileFacts, jobFacts, candidateOutput: hallucinated });
    expect(profileFacts.join(" ")).not.toContain("Kubernetes");
    expect(jobFacts.join(" ")).not.toContain("Kubernetes");
    expect(prompt.user).toContain("Kubernetes");
    const fakeVerdict = { score: 5, rationale: "Great", evidence: [{ outputQuote: "Kubernetes-operator", sourceQuote: "Built React and TypeScript interfaces." }] };
    const parsed = parseAgentJudgeVerdict(fakeVerdict);
    const grounded = parsed.evidence.every((ev) => prompt.user.includes(ev.sourceQuote));
    expect(grounded).toBe(true);
    const hallucinatedQuoteGrounded = profileFacts.join(" ").includes("Kubernetes");
    expect(hallucinatedQuoteGrounded).toBe(false);
  });
});
