import { usageRepo } from "@/lib/db";

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
    return Response.json({
      totals,
      totalCost,
      byProvider: Object.fromEntries(byProvider),
      recent,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
