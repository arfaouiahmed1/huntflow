import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { settingsRepo } from "@/lib/db";

const { discoverProviderModels } = vi.hoisted(() => ({
  discoverProviderModels: vi.fn(),
}));
vi.mock("@/lib/llm/modelDiscovery", () => ({ discoverProviderModels }));

import { POST } from "@/app/api/llm/models/route";

describe("POST /api/llm/models", () => {
  beforeEach(() => {
    discoverProviderModels.mockReset();
    settingsRepo.set(
      "llm_providers",
      JSON.stringify([
        {
          id: "groq-2",
          providerId: "groq",
          label: "Groq reserve",
          kind: "openai",
          apiKey: "stored-test-key",
          model: "llama-3.3-70b-versatile",
          baseURL: "https://api.groq.com/openai/v1",
          enabled: true,
          capabilities: ["json"],
        },
      ]),
    );
  });

  it("imports models from a saved key slot without returning its API key", async () => {
    discoverProviderModels.mockResolvedValue(["llama-3.1-8b-instant"]);
    const response = await POST(
      new NextRequest("http://localhost/api/llm/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerSlotId: "groq-2" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      providerSlotId: "groq-2",
      models: ["llama-3.1-8b-instant"],
    });
    expect(discoverProviderModels).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "groq",
        apiKey: "stored-test-key",
      }),
    );
  });

  it("rejects a request that does not identify a provider", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/llm/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
  });
});
