import { describe, expect, it, vi } from "vitest";
import { discoverProviderModels } from "@/lib/llm/modelDiscovery";

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as Response;

describe("provider model discovery", () => {
  it("discovers OpenAI-compatible models using the configured key without exposing it in the URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ id: "gpt-4o-mini" }, { id: "gpt-4.1-mini" }] }),
    );

    await expect(
      discoverProviderModels(
        {
          providerId: "openai",
          baseURL: "https://api.openai.com/v1",
          apiKey: "test-key",
        },
        fetcher,
      ),
    ).resolves.toEqual(["gpt-4.1-mini", "gpt-4o-mini"]);

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      }),
    );
  });

  it("normalizes Gemini resource names and sends the key as a header", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: "models/gemini-2.5-flash" }] }),
    );

    await expect(
      discoverProviderModels(
        {
          providerId: "gemini",
          baseURL: "https://generativelanguage.googleapis.com/v1beta",
          apiKey: "test-key",
        },
        fetcher,
      ),
    ).resolves.toEqual(["gemini-2.5-flash"]);

    expect(fetcher).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-goog-api-key": "test-key" }),
      }),
    );
  });

  it("uses Ollama's native tag endpoint even when its configured endpoint ends in /v1", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: "qwen3:8b" }, { name: "llama3.2:latest" }] }),
    );

    await expect(
      discoverProviderModels(
        {
          providerId: "ollama",
          baseURL: "http://localhost:11434/v1",
          apiKey: "",
        },
        fetcher,
      ),
    ).resolves.toEqual(["llama3.2:latest", "qwen3:8b"]);

    expect(fetcher).toHaveBeenCalledWith("http://localhost:11434/api/tags", expect.any(Object));
  });
});
