/**
 * Episodic Career Memory & Outcomes Graph — Huntflow Agent Hardening (Phase 3)
 *
 * Tracks application stage transitions, interview feedback reflections, and
 * extracts cross-role pattern insights without adding new database tables.
 */

import { settingsRepo } from "@/lib/db";

export type ApplicationStage = "applied" | "screening" | "technical" | "offer" | "rejected";

export interface EpisodicCareerOutcome {
  id: string;
  company: string;
  role: string;
  stage: ApplicationStage;
  feedbackNotes?: string;
  keyStrengthsUsed: string[];
  keyGapsIdentified: string[];
  date: string;
}

export interface CareerPatternInsight {
  pattern: string;
  confidence: number;
  category: "skill_fit" | "interview_technique" | "company_culture";
  relevantTags: string[];
}

const MEMORY_STORAGE_KEY = "episodic_career_outcomes";
const MAX_STORED_OUTCOMES = 100;

// In-memory cache for test isolation and fast lookup
let inMemoryOutcomes: EpisodicCareerOutcome[] = [];
let hydrated = false;

function hydrate(): void {
  if (hydrated) return;
  try {
    const raw = settingsRepo.get(MEMORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as EpisodicCareerOutcome[];
      if (Array.isArray(parsed)) {
        inMemoryOutcomes = parsed;
      }
    }
  } catch {
    inMemoryOutcomes = [];
  }
  hydrated = true;
}

function persist(): void {
  try {
    settingsRepo.set(MEMORY_STORAGE_KEY, JSON.stringify(inMemoryOutcomes.slice(0, MAX_STORED_OUTCOMES)));
  } catch {
    // Non-fatal: in-memory cache remains valid
  }
}

/**
 * Record an application stage outcome or interview debrief.
 */
export function recordCareerOutcome(outcome: Omit<EpisodicCareerOutcome, "id">): EpisodicCareerOutcome {
  hydrate();
  const id = `outcome_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const record: EpisodicCareerOutcome = {
    id,
    ...outcome,
    keyStrengthsUsed: [...new Set(outcome.keyStrengthsUsed.map((s) => s.trim()).filter(Boolean))],
    keyGapsIdentified: [...new Set(outcome.keyGapsIdentified.map((g) => g.trim()).filter(Boolean))],
  };

  inMemoryOutcomes.unshift(record);
  if (inMemoryOutcomes.length > MAX_STORED_OUTCOMES) {
    inMemoryOutcomes = inMemoryOutcomes.slice(0, MAX_STORED_OUTCOMES);
  }

  persist();
  return record;
}

/**
 * List historical career outcomes, newest first.
 */
export function listCareerOutcomes(limit = 20): EpisodicCareerOutcome[] {
  hydrate();
  return inMemoryOutcomes.slice(0, Math.max(1, limit));
}

/**
 * Reset memory state (useful for test isolation).
 */
export function resetCareerOutcomesForTest(): void {
  inMemoryOutcomes = [];
  hydrated = true;
  persist();
}

/**
 * Extract pattern insights from cumulative outcomes.
 */
export function deriveCareerPatternInsights(outcomes: EpisodicCareerOutcome[]): CareerPatternInsight[] {
  if (!outcomes.length) return [];
  const insights: CareerPatternInsight[] = [];

  // 1. Skill strength frequency in positive stages (screening, technical, offer)
  const positiveOutcomes = outcomes.filter((o) => o.stage === "screening" || o.stage === "technical" || o.stage === "offer");
  const strengthCounts = new Map<string, number>();
  for (const o of positiveOutcomes) {
    for (const s of o.keyStrengthsUsed) {
      strengthCounts.set(s, (strengthCounts.get(s) ?? 0) + 1);
    }
  }

  const topStrengths = [...strengthCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  if (topStrengths.length > 0) {
    const topNames = topStrengths.slice(0, 3).map(([k]) => k).join(", ");
    const confidence = Math.min(0.95, 0.6 + topStrengths[0][1] * 0.1);
    insights.push({
      pattern: `Highlighting ${topNames} strongly correlates with progression to interview stages.`,
      confidence: Math.round(confidence * 100) / 100,
      category: "skill_fit",
      relevantTags: topStrengths.map(([k]) => k),
    });
  }
  // 2. Gap analysis across all stages with identified gaps
  const gapCounts = new Map<string, number>();
  for (const o of outcomes) {
    for (const g of o.keyGapsIdentified) {
      gapCounts.set(g, (gapCounts.get(g) ?? 0) + 1);
    }
  }

  const recurringGaps = [...gapCounts.entries()]
    .filter(([, count]) => count >= (outcomes.length <= 3 ? 1 : 2))
    .sort((a, b) => b[1] - a[1]);

  if (recurringGaps.length > 0) {
    const gapNames = recurringGaps.slice(0, 3).map(([k]) => k).join(", ");
    insights.push({
      pattern: `Recurring gap detected across rejected stages: ${gapNames}. Ensure proactive mitigation or related project evidence in application materials.`,
      confidence: 0.85,
      category: "interview_technique",
      relevantTags: recurringGaps.map(([k]) => k),
    });
  }

  // 3. Culture & feedback summary
  const feedbackNotes = outcomes.map((o) => o.feedbackNotes).filter((f): f is string => typeof f === "string" && f.trim().length > 0);
  if (feedbackNotes.length >= 3) {
    insights.push({
      pattern: `Accumulated ${feedbackNotes.length} detailed stage feedback note(s) — candidate demonstrates high feedback loop convergence.`,
      confidence: 0.75,
      category: "company_culture",
      relevantTags: ["feedback", "iterations"],
    });
  }

  return insights;
}

/**
 * Format episodic career learnings into a concise prompt context block for a target role.
 */
export function formatEpisodicContextForRole(job: { company: string; title: string; jobDescription: string }): string {
  hydrate();
  if (!inMemoryOutcomes.length) return "";

  const jobTokens = `${job.title} ${job.company} ${job.jobDescription}`.toLowerCase();
  
  // Find outcomes sharing keywords or same company
  const relevant = inMemoryOutcomes.filter((o) => {
    if (o.company.toLowerCase() === job.company.toLowerCase()) return true;
    const roleMatch = o.role.toLowerCase().split(/\s+/).some((w) => w.length > 3 && jobTokens.includes(w));
    const skillMatch = o.keyStrengthsUsed.some((s) => jobTokens.includes(s.toLowerCase()));
    return roleMatch || skillMatch;
  });

  const selected = (relevant.length > 0 ? relevant : inMemoryOutcomes).slice(0, 4);
  const insights = deriveCareerPatternInsights(inMemoryOutcomes);

  const lines: string[] = ["=== EPISODIC CAREER LEARNINGS ==="];
  if (insights.length > 0) {
    lines.push("Historical Winning Patterns:");
    for (const ins of insights) {
      lines.push(`- [Confidence ${(ins.confidence * 100).toFixed(0)}%] ${ins.pattern}`);
    }
  }

  lines.push("Relevant Past Experiences & Stage Debriefs:");
  for (const o of selected) {
    const feedback = o.feedbackNotes ? ` | Note: ${o.feedbackNotes}` : "";
    const strengths = o.keyStrengthsUsed.length ? ` | Strengths: ${o.keyStrengthsUsed.join(", ")}` : "";
    const gaps = o.keyGapsIdentified.length ? ` | Gaps to address: ${o.keyGapsIdentified.join(", ")}` : "";
    lines.push(`- ${o.company} (${o.role}) -> ${o.stage.toUpperCase()}${strengths}${gaps}${feedback}`);
  }

  return lines.join("\n");
}
