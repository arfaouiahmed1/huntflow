import { describe, it, expect } from "vitest";
import { firstVisionEntry, isVisionModel, visionContent } from "./vision";
import type { LLMProvider } from "./providers";

function entry(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    providerId: "openrouter",
    apiKey: "k",
    model: "gpt-4o",
    enabled: true,
    capabilities: ["json", "vision"],
    ...overrides,
  };
}

describe("isVisionModel", () => {
  it("accepts native multimodal kinds and known vision models", () => {
    expect(isVisionModel("anthropic", "claude-sonnet-4-5")).toBe(true);
    expect(isVisionModel("gemini", "gemini-2.5-flash")).toBe(true);
    expect(isVisionModel("openai", "gpt-4o")).toBe(true);
    expect(isVisionModel("openai", "qwen2-vl-72b")).toBe(true);
  });

  it("rejects text-only models and empty ids", () => {
    expect(isVisionModel("openai", "deepseek-chat")).toBe(false);
    expect(isVisionModel("openai", "llama-3.3-70b-versatile")).toBe(false);
    expect(isVisionModel("openai", "")).toBe(false);
  });
});

describe("firstVisionEntry", () => {
  it("skips disabled, keyless, and text-only entries", () => {
    const chain = [
      entry({ id: "a", model: "deepseek-chat", capabilities: ["json"] }),
      entry({ id: "b", enabled: false }),
      entry({ id: "c", apiKey: "", providerId: "openai" }),
      entry({ id: "d", model: "gpt-4o" }),
    ];
    expect(firstVisionEntry(chain)?.id).toBe("d");
  });

  it("returns null when nothing vision-capable is eligible", () => {
    expect(firstVisionEntry([entry({ model: "deepseek-chat", capabilities: ["json"] })])).toBeNull();
    expect(firstVisionEntry([])).toBeNull();
  });
});

describe("visionContent", () => {
  const imgs = [{ mime: "image/png" as const, base64: "AAA" }];
  it("builds OpenAI-compatible image_url parts", () => {
    const c = visionContent("openai", "hi", imgs) as { type: string }[];
    expect(c[0]).toEqual({ type: "text", text: "hi" });
    expect(JSON.stringify(c[1])).toContain("data:image/png;base64,AAA");
  });

  it("builds Anthropic and Gemini parts", () => {
    expect(JSON.stringify(visionContent("anthropic", "hi", imgs))).toContain('"type":"image"');
    expect(JSON.stringify(visionContent("gemini", "hi", imgs))).toContain("inline_data");
  });
});
