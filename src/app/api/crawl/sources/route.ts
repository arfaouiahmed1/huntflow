import { NextResponse } from "next/server";
import { crawlerSourcesRepo, crawlerSourceStateRepo } from "@/lib/db";
import { AGENT_BASE_URL, agentHeaders } from "@/lib/agentClient";
import type { CrawlerSourcePublic } from "@/lib/crawler/contracts";

export async function GET() {
  try {
    // 1. Try sidecar for live registry + health
    let sidecarSources: CrawlerSourcePublic[] = [];
    try {
      const res = await fetch(`${AGENT_BASE_URL}/sources`, {
        headers: agentHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        sidecarSources = Array.isArray(data.sources) ? data.sources : [];
      }
    } catch {
      // Sidecar offline — continue with SQLite cached sources
    }

    // 2. Fetch local SQLite sources and sync states
    const localSources = crawlerSourcesRepo.list();
    const localStates = new Map(crawlerSourceStateRepo.list().map((s) => [s.sourceId, s]));

    const sourceMap = new Map<string, CrawlerSourcePublic>();

    // Merge sidecar sources
    for (const s of sidecarSources) {
      const localState = localStates.get(s.id);
      let health = s.health || "healthy";
      if (localState?.circuitOpenUntil && new Date(localState.circuitOpenUntil) > new Date()) {
        health = "circuit_open";
      } else if (localState?.consecutiveFailures && localState.consecutiveFailures > 0) {
        health = "degraded";
      }
      sourceMap.set(s.id, {
        ...s,
        health,
        lastSuccessAt: localState?.lastSuccessAt ?? null,
      });
    }

    // Merge any user-added local SQLite sources
    for (const ls of localSources) {
      if (!sourceMap.has(ls.id)) {
        const localState = localStates.get(ls.id);
        sourceMap.set(ls.id, {
          id: ls.id,
          name: ls.definition.name,
          channel: ls.definition.channel,
          connector: ls.definition.connector,
          regions: ls.definition.regions,
          countryCodes: ls.definition.countryCodes,
          languages: ls.definition.languages,
          capabilities: ls.definition.capabilities,
          authMode: ls.definition.authMode,
          crawlPolicy: ls.definition.crawlPolicy,
          cadenceMinutes: ls.definition.cadenceMinutes,
          perDomainRps: ls.definition.perDomainRps,
          termsUrl: ls.definition.termsUrl,
          attribution: ls.definition.attribution,
          enabled: ls.enabled,
          health: "healthy",
          description: ls.definition.description,
          lastSuccessAt: localState?.lastSuccessAt ?? null,
        });
      }
    }

    const allSources = Array.from(sourceMap.values());

    return NextResponse.json({
      success: true,
      count: allSources.length,
      sources: allSources,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to load sources" },
      { status: 500 }
    );
  }
}
