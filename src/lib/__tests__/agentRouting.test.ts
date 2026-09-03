import { beforeEach, describe, expect, it } from "vitest";
import { settingsRepo } from "@/lib/db";
import {
  invalidateLLMRouterCache,
  resolveChainForAgent,
} from "@/lib/llm/router";

const providers = [
  {
    id: "openai",
    providerId: "openai",
    label: "OpenAI primary",
    kind: "openai",
    apiKey: "test-openai-key",
    model: "gpt-4o-mini",
    baseURL: "https://api.openai.com/v1",
    temperature: 0.7,
    enabled: true,
    capabilities: ["json"],
  },
  {
    id: "groq-2",
    providerId: "groq",
    label: "Groq reserve key",
    kind: "openai",
    apiKey: "test-groq-key",
    model: "llama-3.3-70b-versatile",
    baseURL: "https://api.groq.com/openai/v1",
    temperature: 0.7,
    enabled: true,
    capabilities: ["json"],
  },
];

describe("persisted agent model routing", () => {
  beforeEach(() => {
    settingsRepo.set("llm_providers", JSON.stringify(providers));
    settingsRepo.set(
      "llm_agent_routes",
      JSON.stringify([
        {
          agent: "match_analysis",
          providerSlotId: "groq-2",
          model: "llama-3.1-8b-instant",
        },
      ]),
    );
    invalidateLLMRouterCache();
  });

  it("uses an agent's configured key slot/model first and keeps the saved chain as fallback", () => {
    const chain = resolveChainForAgent("match_analysis");

    expect(chain.map((provider) => provider.id)).toEqual(["groq-2", "openai"]);
    expect(chain[0].model).toBe("llama-3.1-8b-instant");
  });

  it("uses the normal chain when an agent has no override", () => {
    expect(resolveChainForAgent("resume").map((provider) => provider.id)).toEqual([
      "openai",
      "groq-2",
    ]);
  });
});
