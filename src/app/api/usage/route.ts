import { agentRunHistoryRepo, usageRepo } from "@/lib/db";
import type { AgentRunHistoryEntry } from "@/lib/db";
import { getPerFieldHallucinationStats, legitAtsTest } from "@/lib/agents/evaluation";
import { getNodeBreakdowns, getNodeCostStats } from "@/lib/llm/router";

function parseLogsForHallucination(raw: string | undefined): boolean {
  if (!raw) return false;
  const needle = "Hallucinated skills rejected";
  if (!raw.includes(needle)) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (entry !== null && typeof entry === "object" && "message" in entry) {
          const msg = (entry as Record<string, unknown>).message;
          if (typeof msg === "string" && msg.includes(needle)) return true;
        } else if (typeof entry === "string" && entry.includes(needle)) {
          return true;
        } else if (entry !== null && typeof entry === "object") {
          const values = Object.values(entry as Record<string, unknown>);
          for (const v of values) {
            if (typeof v === "string" && v.includes(needle)) return true;
          }
        }
      }
      return true;
    }
    return true;
  } catch {
    return raw.includes(needle);
  }
}

export async function GET() {
  try {
    const totals = usageRepo.totals();
    const recent = usageRepo.recent(50);
    const totalCost = recent.reduce((s, e) => s + e.costEst, 0);
    const byProvider = new Map<string, { calls: number; tokens: number; cost: number }>();
    for (const e of recent) {
      const key = e.provider ?? "unknown";
      const cur = byProvider.get(key) ?? { calls: 0, tokens: 0, cost: 0 };
      cur.calls += 1;
      cur.tokens += e.promptTokens + e.completionTokens;
      cur.cost += e.costEst;
      byProvider.set(key, cur);
    }
    let hallucinatedRuns = 0;
    let atsCappedRuns = 0;
    let totalRuns = 0;
    const atsScores: number[] = [];
    try {
      const history: AgentRunHistoryEntry[] = agentRunHistoryRepo.listRecent(50);
      totalRuns = history.length;
      for (const run of history) {
        if (parseLogsForHallucination(run.logs)) hallucinatedRuns += 1;
        const ats = run.atsScore;
        if (typeof ats === "number" && Number.isFinite(ats)) {
          atsScores.push(ats);
          if (ats < 60) atsCappedRuns += 1;
        }
      }
    } catch {}
    const hallucinationRate = totalRuns ? hallucinatedRuns / totalRuns : 0;
    const atsRate = totalRuns ? atsCappedRuns / totalRuns : 0;
    const avgAts = atsScores.length ? Math.round(atsScores.reduce((a, b) => a + b, 0) / atsScores.length) : null;
    const goodAts = legitAtsTest(
      "SUMMARY\nSenior Frontend Engineer with React, TypeScript, Node.js\nSKILLS\nReact, TypeScript, Node.js, GraphQL, Tailwind CSS, AWS\nEXPERIENCE\nAcme — Senior Engineer\n- Led platform",
      "Senior Frontend Engineer with React, TypeScript, Node.js, GraphQL, Tailwind CSS, and AWS experience. Remote-first team."
    );
    const badAts = legitAtsTest("KEYWORDS React React React", "Senior Frontend Engineer with React, TypeScript, Node.js");
    const perFieldStats = getPerFieldHallucinationStats();
    const perFieldHallucinations = {
      total: perFieldStats.total,
      hallucinated: perFieldStats.hallucinated,
      rate: perFieldStats.rate,
      recent: perFieldStats.recent,
    };
    const nodeRecent = getNodeBreakdowns();
    const nodeStats = getNodeCostStats();
    const nodeBreakdowns = {
      recent: nodeRecent,
      totalNodes: nodeStats.totalNodes,
      totalTokens: nodeStats.totalTokens,
      totalCost: nodeStats.totalCost,
      avgLatencyMs: nodeStats.avgLatencyMs,
      byNode: nodeStats.byNode,
    };
    return Response.json({
      totals,
      totalCost,
      byProvider: Object.fromEntries(byProvider),
      recent,
      hallucinations: { totalRuns, hallucinatedRuns, hallucinationRate, atsCappedRuns, atsRate },
      perFieldHallucinations,
      nodeBreakdowns,
      ats: {
        sampleGood: goodAts,
        sampleBad: badAts,
        avgRecentAts: avgAts,
        recentAts: atsScores.slice(-10),
        cappedRuns: atsCappedRuns,
        rate: atsRate,
        atsCappedRuns,
        atsRate,
      },
      retries: {
        perProviderAttempts: 3,
        circuitCooldownMs: 90000,
        note: "429/408 retry 1s*2^n + jitter, hops on 5xx/401/403 — tuned for free-tier; PER_PROVIDER_ATTEMPTS=3",
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
