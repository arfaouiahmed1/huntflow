import { describe, expect, it } from "vitest";
import { scoreLiveCrawlerCanary, selectLiveCanarySource, type LiveCanarySource } from "@/lib/agents/liveCanary";

const live = process.env.HUNTFLOW_LIVE_EVAL === "1";
const agentUrl = process.env.HUNTFLOW_AGENT_URL || "http://127.0.0.1:8001";
const token = process.env.HUNTFLOW_AGENT_TOKEN;
const headers = token ? { "X-Huntflow-Token": token } : undefined;

async function request(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    return await fetch(`${agentUrl}${path}`, {
      ...init,
      headers: { ...headers, ...init?.headers },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

(live ? describe : describe.skip)("live agent crawler canary", () => {
  it("returns structured cards from one explicit, bounded public source", async () => {
    const health = await request("/health");
    expect(health.ok, `Sidecar health failed at ${agentUrl}: HTTP ${health.status}`).toBe(true);

    const sourceResponse = await request("/sources");
    expect(sourceResponse.ok, `Source catalog failed: HTTP ${sourceResponse.status}`).toBe(true);
    const sourcePayload = (await sourceResponse.json()) as { sources?: LiveCanarySource[] };
    const source = selectLiveCanarySource(
      Array.isArray(sourcePayload.sources) ? sourcePayload.sources : [],
      process.env.HUNTFLOW_EVAL_SOURCE_ID,
    );
    expect(source, "No requested or enabled canary source was available.").toBeDefined();

    const started = performance.now();
    const crawlResponse = await request("/crawl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "all",
        keyword: process.env.HUNTFLOW_EVAL_KEYWORD || "engineer",
        limit: 5,
        concurrency: 1,
        capture_screenshot: false,
        source_ids: [source!.id],
      }),
    });
    expect(crawlResponse.ok, `Canary crawl failed: HTTP ${crawlResponse.status}`).toBe(true);
    const response = await crawlResponse.json();
    const result = scoreLiveCrawlerCanary({
      sourceId: source!.id,
      latencyMs: performance.now() - started,
      response,
    });

    process.stdout.write(`agent-live-canary ${JSON.stringify(result.metrics)}\n`);
    expect(result.passed, result.failures.join(" ")).toBe(true);
  }, 60_000);
});
