import { describe, it, expect } from "vitest";
import {
  isOllamaOnline,
  listOllamaModels,
  RECOMMENDED_LOCAL_MODELS,
  OLLAMA_DEFAULT_BASE_URL,
} from "../providers/localOllama";
import { getProvider, LLM_PROVIDERS } from "../providers";

describe("Local Offline Ollama Provider", () => {
  it("provides recommended local models including Qwen 2.5 Coder and Llama 3.2", () => {
    expect(RECOMMENDED_LOCAL_MODELS.some((m) => m.id.includes("qwen"))).toBe(true);
    expect(RECOMMENDED_LOCAL_MODELS.some((m) => m.id.includes("llama"))).toBe(true);
    expect(RECOMMENDED_LOCAL_MODELS.some((m) => m.id.includes("deepseek"))).toBe(true);
  });

  it("registers Ollama in LLM_PROVIDERS as zero-key offline provider", () => {
    const ollama = getProvider("ollama");
    expect(ollama).toBeDefined();
    expect(ollama.id).toBe("ollama");
    expect(ollama.needsKey).toBe(false);
    expect(ollama.baseURL).toBe("http://127.0.0.1:11434/v1");
  });

  it("handles offline state gracefully without crashing", async () => {
    // Non-existent port to test offline detection
    const online = await isOllamaOnline("http://127.0.0.1:59999");
    expect(online).toBe(false);

    const models = await listOllamaModels("http://127.0.0.1:59999");
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBe(0);
  });
});
