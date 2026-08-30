import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as saveSettings } from "@/app/api/data/[collection]/route";
import { settingsRepo } from "@/lib/db";
import {
  invalidateLLMRouterCache,
  resolveChainForAgent,
} from "@/lib/llm/router";

const chain = [
  {
    id: "openai",
    providerId: "openai",
    label: "OpenAI",
    kind: "openai",
    apiKey: "test-openai-key",
    model: "gpt-4o-mini",
    baseURL: "https://api.openai.com/v1",
    temperature: 0.7,
    enabled: true,
    capabilities: ["json"],
  },
  {
    id: "groq",
    providerId: "groq",
    label: "Groq",
    kind: "openai",
    apiKey: "test-groq-key",
    model: "llama-3.3-70b-versatile",
    baseURL: "https://api.groq.com/openai/v1",
    temperature: 0.7,
    enabled: true,
    capabilities: ["json"],
  },
];

describe("agent model route persistence", () => {
  beforeEach(() => {
    settingsRepo.set("llm_providers", JSON.stringify(chain));
    settingsRepo.set("llm_agent_routes", "[]");
    invalidateLLMRouterCache();
  });

  it("makes a saved route effective immediately instead of waiting for the router cache", async () => {
    expect(resolveChainForAgent("vault_assist")[0].id).toBe("openai");

    const request = new NextRequest("http://localhost/api/data/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llm_agent_routes: JSON.stringify([
          {
            agent: "vault_assist",
            providerSlotId: "groq",
            model: "llama-3.1-8b-instant",
          },
        ]),
      }),
    });
    const response = await saveSettings(request, {
      params: Promise.resolve({ collection: "settings" }),
    });

    expect(response.status).toBe(200);
    expect(resolveChainForAgent("vault_assist")[0]).toMatchObject({
      id: "groq",
      model: "llama-3.1-8b-instant",
    });
  });
});
