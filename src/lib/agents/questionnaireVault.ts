/**
 * Universal Bespoke Questionnaire Vault — Huntflow Agent Hardening (Phase 2)
 *
 * Stores and auto-fills recurring bespoke ATS questions (notice period, visa sponsorship,
 * salary expectations, non-compete agreements, work authorization) so candidates
 * never answer the same question twice.
 */

import { questionnaireRepo, QuestionnaireItem } from "@/lib/db";

export interface QuestionnaireMatchResult {
  matched: boolean;
  entry?: QuestionnaireItem;
  answer?: string;
  confidence: number;
  category: string;
  inferredCategory: string;
}

export function detectQuestionCategory(questionText: string): string {
  const q = questionText.toLowerCase();

  if (/notice\s*period|start\s*date|availability|how\s*soon/i.test(q)) {
    return "notice_period";
  }
  if (/visa|sponsorship|require\s*(now|in\s*the\s*future)|h-?1b|opt|stem/i.test(q)) {
    return "visa_sponsorship";
  }
  if (/salary|compensation|expected\s*(pay|rate|gross|hourly)|remuneration/i.test(q)) {
    return "salary_expectation";
  }
  if (/non-?compete|non-?disclosure|restrictive\s*covenant|conflict\s*of\s*interest/i.test(q)) {
    return "non_compete";
  }
  if (/legally\s*authorized|work\s*authorization|eligible\s*to\s*work|right\s*to\s*work/i.test(q)) {
    return "work_authorization";
  }
  return "general";
}

function computeQuestionSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Find the highest-confidence answer for an ATS form question.
 */
export function findMatchingQuestionAnswer(questionText: string): QuestionnaireMatchResult {
  const cleanQ = questionText.trim();
  const category = detectQuestionCategory(cleanQ);
  const entries = questionnaireRepo.list();

  let bestEntry: QuestionnaireItem | undefined;
  let bestScore = 0;

  for (const entry of entries) {
    const sim = computeQuestionSimilarity(cleanQ, entry.question);
    const categoryBonus = entry.category === category ? 0.3 : 0;
    const finalScore = sim * 0.7 + categoryBonus;

    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestEntry = entry;
    }
  }

  if (bestEntry && bestScore >= 0.45) {
    return {
      matched: true,
      entry: bestEntry,
      answer: bestEntry.answer,
      confidence: Math.min(1.0, Math.round(bestScore * 100) / 100),
      category: bestEntry.category,
      inferredCategory: category,
    };
  }

  return {
    matched: false,
    confidence: 0,
    category: "general",
    inferredCategory: category,
  };
}

/**
 * Save or update a question/answer pair in the vault.
 */
export function saveQuestionAnswer(
  questionText: string,
  answer: string,
  categoryOverride?: string
): QuestionnaireItem {
  const cleanQ = questionText.trim();
  const category = categoryOverride || detectQuestionCategory(cleanQ);
  const key = cleanQ.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 48);
  const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const item = {
    id,
    key,
    question: cleanQ,
    category,
    answer: answer.trim(),
  };

  questionnaireRepo.upsert(item);
  return { ...item, updatedAt: new Date().toISOString() };
}

/**
 * Auto-fill a batch of form questions from the questionnaire vault.
 */
export function autoFillApplicationQuestions(questions: string[]): Array<{
  question: string;
  answer: string;
  confidence: number;
  isPreFilled: boolean;
}> {
  return questions.map((q) => {
    const match = findMatchingQuestionAnswer(q);
    return {
      question: q,
      answer: match.answer || "",
      confidence: match.confidence,
      isPreFilled: match.matched,
    };
  });
}
