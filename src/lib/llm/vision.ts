/**
 * Vision support for multimodal Copilot turns (server-only).
 *
 * Images are NEVER described locally (no OCR binaries): they travel as
 * base64 data URLs to the first vision-capable provider in the user's
 * chain. Capability comes from the provider registry; for
 * OpenAI-compatible endpoints the model id must additionally look
 * multimodal, because one endpoint serves both kinds.
 */

import { getProvider } from "./providers";
import type { LLMProvider, ProviderKind } from "./providers";

export type VisionMime = "image/png" | "image/jpeg" | "image/webp";

export interface VisionImage {
  mime: VisionMime;
  base64: string;
}

/** Model-id patterns for OpenAI-compatible endpoints (name is the only signal). */
const VISION_MODEL_PATTERNS = [
  /gpt-4o/i,
  /\bo[13]\b/i,
  /vision/i,
  /qwen[\w-]*vl/i,
  /llama[\w-]*vision/i,
  /maverick/i,
  /gemini/i,
  /claude/i,
  /sonnet/i,
  /opus/i,
  /haiku/i,
];

export function isVisionModel(kind: ProviderKind, model: string): boolean {
  if (!model) return false;
  // Anthropic + Gemini APIs are natively multimodal.
  if (kind === "anthropic" || kind === "gemini") return true;
  return VISION_MODEL_PATTERNS.some((re) => re.test(model));
}

/**
 * First chain entry that may legally receive images: enabled, keyed,
 * vision-capable (registry capability, except native multimodal kinds),
 * and model-matched. Null means images cannot be analyzed — the caller
 * must say so instead of dropping them silently.
 */
export function firstVisionEntry(chain: LLMProvider[]): LLMProvider | null {
  for (const p of chain) {
    if (!p.enabled) continue;
    const cfg = getProvider(p.providerId);
    if (cfg.needsKey && !p.apiKey) continue;
    if (p.kind === "openai" && !p.capabilities.includes("vision")) continue;
    if (!isVisionModel(p.kind, p.model)) continue;
    return p;
  }
  return null;
}

/** Build the user-message content value carrying text + images for a kind. */
export function visionContent(kind: ProviderKind, text: string, images: VisionImage[]): unknown {
  if (kind === "anthropic") {
    return [
      { type: "text", text },
      ...images.map((img) => ({
        type: "image",
        source: { type: "base64", media_type: img.mime, data: img.base64 },
      })),
    ];
  }
  if (kind === "gemini") {
    return [{ text }, ...images.map((img) => ({ inline_data: { mime_type: img.mime, data: img.base64 } }))];
  }
  return [
    { type: "text", text },
    ...images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.base64}` } })),
  ];
}
