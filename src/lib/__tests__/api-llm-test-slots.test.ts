import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { callLLM, resolveChain, loadChainFromDb } = vi.hoisted(() => ({
  callLLM: vi.fn(),
  resolveChain: vi.fn(),
  loadChainFromDb: vi.fn(),
}));
vi.mock("@/lib/llm/router", () => ({ callLLM, resolveChain, loadChainFromDb }));

import { POST } from "@/app/api/llm/test/route";

describe("POST /api/llm/test with a duplicate key slot", () => {
  beforeEach(() => {
    callLLM.mockReset();
    resolveChain.mockReset();
    loadChainFromDb.mockReset();
    resolveChain.mockReturnValue([]);
    callLLM.mockResolvedValue({
      text: "OK",
      providerId: "groq-2",
      model: "llama-3.1-8b-instant",
      attempts: 0,
    });
  });

  it("uses the slot's canonical providerId instead of treating the slot id as a provider", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: {
            id: "groq-2",
            providerId: "groq",
            apiKey: "test-key",
            model: "llama-3.1-8b-instant",
            baseURL: "https://api.groq.com/openai/v1",
            kind: "openai",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(callLLM).toHaveBeenCalledWith(
      expect.any(Object),
      [expect.objectContaining({ id: "groq", providerId: "groq" })],
    );
  });

  it("allows a keyless local provider to pass its connectivity test", async () => {
    resolveChain.mockReturnValue([
      {
        id: "ollama",
        providerId: "ollama",
        label: "Ollama (local)",
        kind: "openai",
        apiKey: "",
        model: "llama3.2",
        baseURL: "http://localhost:11434/v1",
        temperature: 0.7,
        enabled: true,
        capabilities: ["json"],
      },
    ]);
    callLLM.mockResolvedValue({ text: "OK", providerId: "ollama", model: "llama3.2", attempts: 0 });

    const response = await POST(
      new NextRequest("http://localhost/api/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: "ollama", model: "llama3.2" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(callLLM).toHaveBeenCalledWith(expect.any(Object), [expect.objectContaining({ id: "ollama" })]);
  });
});
