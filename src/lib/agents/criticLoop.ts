/**
 * Self-Correction Critic Loop — Huntflow Agent Hardening (Phase 2)
 *
 * Domain-agnostic ATS critic that decides whether a tailored resume should be
 * re-tailored. The decision is intentionally narrow: only overallScore and
 * currentPass drive the reflection gate so tests can reason about the loop.
 */

export interface CriticEvaluation {
  shouldReflect: boolean;
  nextPass: number;
  feedback: string | null;
  missingKeywords: string[];
  score: number;
}

/**
 * Evaluate whether the ATS audit result warrants a self-correction pass.
 *
 * @param overallScore - deterministic + LLM-weighted ATS score (0-100)
 * @param keywordMatchRate - binary keyword coverage (0-100) — included for
 *   feedback richness but does not gate the decision beyond reporting.
 * @param currentPass - zero-based reflection count already performed
 * @param missingSkills - skills/keywords absent from the resume
 * @param maxPasses - maximum reflection depth (default 2)
 */
export function evaluateAtsCritic(
  overallScore: number,
  keywordMatchRate: number,
  currentPass: number,
  missingSkills: string[],
  maxPasses = 2
): CriticEvaluation {
  const normalizedScore = Number.isFinite(overallScore) ? Math.round(overallScore) : 0;
  const normalizedPass = Number.isFinite(currentPass) ? Math.max(0, Math.floor(currentPass)) : 0;
  const normalizedMax = Number.isFinite(maxPasses) ? Math.max(0, Math.floor(maxPasses)) : 2;
  const skills = Array.isArray(missingSkills) ? missingSkills.filter((s) => typeof s === "string" && s.trim().length > 0) : [];

  // Keyword rate is reported for diagnostics but the gate is score-driven.
  void keywordMatchRate;

  if (normalizedScore < 75 && normalizedPass < normalizedMax) {
    const nextPass = normalizedPass + 1;
    const skillClause =
      skills.length > 0
        ? skills.slice(0, 8).join(", ")
        : "general keywords";
    const feedback = `ATS score ${normalizedScore}% is below target 75%. Prioritize incorporating verified candidate skills matching: ${skillClause}. Improve keyword density in bullet points.`;

    return {
      shouldReflect: true,
      nextPass,
      feedback,
      missingKeywords: skills,
      score: normalizedScore,
    };
  }

  return {
    shouldReflect: false,
    nextPass: normalizedPass,
    feedback: null,
    missingKeywords: skills,
    score: normalizedScore,
  };
}
