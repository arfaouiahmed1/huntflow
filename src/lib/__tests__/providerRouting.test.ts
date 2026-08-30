import { describe, expect, it } from "vitest";
import type { LLMProvider } from "@/lib/llm/providers";
import {
  nextProviderSlotId,
  prioritizeProviderChain,
  type AgentModelRoute,
} from "@/lib/llm/providers";

function provider(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    id: "openai",
    providerId: "openai",
    label: "OpenAI",
    kind: "openai",
    apiKey: "test-key",
    model: "gpt-4o-mini",
    baseURL: "https://api.openai.com/v1",
    temperature: 0.7,
    enabled: true,
    capabilities: ["json"],
    ...overrides,
  };
}

describe("provider routing", () => {
  it("allocates stable, unique slots for multiple keys from one provider", () => {
    const chain = [provider(), provider({ id: "openai-2" })];

    expect(nextProviderSlotId(chain, "openai")).toBe("openai-3");
    expect(nextProviderSlotId([provider({ id: "groq" })], "openai")).toBe("openai");
  });

  it("promotes a configured agent slot and applies its model without losing fallbacks", () => {
    const openai = provider();
    const groq = provider({
      id: "groq",
      providerId: "groq",
      label: "Groq",
      model: "llama-3.3-70b-versatile",
    });
    const route: AgentModelRoute = {
      agent: "match_analysis",
      providerSlotId: "groq",
      model: "llama-3.1-8b-instant",
    };

    expect(prioritizeProviderChain([openai, groq], route)).toEqual([
      { ...groq, model: "llama-3.1-8b-instant" },
      openai,
    ]);
  });

  it("leaves the priority chain unchanged when the selected slot is unavailable", () => {
    const chain = [provider(), provider({ id: "groq", providerId: "groq" })];
    const route: AgentModelRoute = {
      agent: "resume",
      providerSlotId: "missing-slot",
      model: "any-model",
    };

    expect(prioritizeProviderChain(chain, route)).toEqual(chain);
  });
});
