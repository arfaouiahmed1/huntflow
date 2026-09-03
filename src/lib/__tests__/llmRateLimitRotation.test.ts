import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { settingsRepo } from "@/lib/db";
import { callLLM, invalidateLLMRouterCache } from "@/lib/llm/router";
import type { LLMProvider } from "@/lib/llm/providers";

const chain: LLMProvider[] = [
  {
    id: "openai-primary",
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
    id: "groq-reserve",
    providerId: "groq",
    label: "Groq reserve",
    kind: "openai",
    apiKey: "test-groq-key",
    model: "llama-3.3-70b-versatile",
    baseURL: "https://api.groq.com/openai/v1",
    temperature: 0.7,
    enabled: true,
    capabilities: ["json"],
  },
];

describe("LLM rate-limit rotation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.stubGlobal("fetch", vi.fn());
    settingsRepo.set("llm_agent_routes", "[]");
    invalidateLLMRouterCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries a rate-limited key once and then continues with the next enabled key slot", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async () => {
      const attempt = fetchMock.mock.calls.length;
      if (attempt <= 3) {
        return new Response(JSON.stringify({ error: { message: "rate limited" } }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "reserve provider reply" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const resultPromise = callLLM(
      { system: "System", user: "User", agent: "match_analysis" },
      chain,
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toMatchObject({ providerId: "groq-reserve", model: "llama-3.3-70b-versatile", attempts: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://api.openai.com/v1/chat/completions",
      "https://api.openai.com/v1/chat/completions",
      "https://api.openai.com/v1/chat/completions",
      "https://api.groq.com/openai/v1/chat/completions",
    ]);
  });
});
