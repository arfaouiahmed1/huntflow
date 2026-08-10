/** Approximate USD per 1M tokens for completion calls, keyed by provider id. */
const PRICES: Record<string, { in: number; out: number }> = {
  openrouter: { in: 0.25, out: 1.0 },
  gemini: { in: 0.3, out: 2.5 },
  anthropic: { in: 3.0, out: 15.0 },
  openai: { in: 0.15, out: 0.6 },
  groq: { in: 0.15, out: 0.6 },
  mistral: { in: 0.2, out: 0.6 },
  deepseek: { in: 0.27, out: 1.1 },
  together: { in: 0.2, out: 0.6 },
  xai: { in: 0.15, out: 0.6 },
};

const FALLBACK = { in: 0.25, out: 1.0 };

export function estimateCost(providerId: string | undefined, promptTokens: number, completionTokens: number): number {
  if (providerId === "ollama" || providerId === "custom") return 0;
  const p = PRICES[providerId ?? ""] ?? FALLBACK;
  return (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out;
}
