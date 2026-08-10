import { resolveChain } from "@/lib/llm/router";
import { getProvider } from "@/lib/llm/providers";
import { usageRepo } from "@/lib/db";

export interface EmbeddingResult {
  vectors: number[][];
  /** model label used, e.g. "local" or "openai|text-embedding-3-small" */
  model: string;
}

const LOCAL_DIMS = 256;

/** Deterministic local bag-of-words hash embedding — works with zero keys. */
export function localEmbed(text: string): number[] {
  const vec = new Float64Array(LOCAL_DIMS);
  const words = text.toLowerCase().split(/[^a-z0-9+.#-]+/).filter(Boolean);
  for (const w of words) {
    let h1 = 2166136261;
    let h2 = 2246822519;
    for (let i = 0; i < w.length; i++) {
      h1 = Math.imul(h1 ^ w.charCodeAt(i), 16777619) >>> 0;
      h2 = Math.imul(h2 ^ w.charCodeAt(i), 2246822519) >>> 0;
    }
    const dim = h1 % LOCAL_DIMS;
    const sign = h2 % 2 === 0 ? 1 : -1;
    vec[dim] += sign;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return Array.from(vec, (v) => v / norm);
}

async function embedOpenAICompatible(baseURL: string, apiKey: string, model: string, texts: string[]): Promise<number[][]> {
  const res = await fetch(`${baseURL.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) throw new Error(`Embedding endpoint HTTP ${res.status}`);
  const data = await res.json();
  const items = (data?.data ?? []) as { index: number; embedding: number[] }[];
  if (!items.length) throw new Error("Empty embedding response");
  return items.sort((a, b) => a.index - b.index).map((i) => i.embedding);
}

/**
 * Embed texts through the first configured provider that advertises the
 * `embeddings` capability (OpenAI-compatible /embeddings endpoint).
 * Pass `modelHint` ("provider|model" or "local") to pin the same embedding
 * space used when the text was indexed — mismatched spaces score ~0.
 * Falls back to the built-in local hash embedding when no key/provider works.
 */
/** Default real embedding model name per provider (the chain only stores chat models).
    OpenRouter/Groq/etc. do not run embeddings; OpenAI and Ollama do. */
const EMBEDDING_MODEL_BY_ID: Record<string, string> = {
  openai: "text-embedding-3-small",
  ollama: "nomic-embed-text",
};

export async function embedTexts(texts: string[], modelHint?: string): Promise<EmbeddingResult> {
  const chain = resolveChain();
  const started = Date.now();
  const hintModel = modelHint && modelHint.includes("|") ? modelHint.split("|").pop() : modelHint;
  const hintProvider = modelHint && modelHint.includes("|") ? modelHint.split("|")[0] : undefined;

  for (const provider of chain) {
    const cfg = getProvider(provider.id);
    if (!cfg.capabilities?.includes("embeddings")) continue;
    if (cfg.kind !== "openai") continue;
    const baseURL = provider.baseURL || cfg.baseURL;
    if (!baseURL) continue;
    if (cfg.needsKey && !provider.apiKey) continue;
    // The stored chain's `model` is a CHAT model — never a valid /embeddings
    // model. Map to a real embedding model; honor the exact hint when it was
    // pinned (same embedding space), otherwise skip mismatched spaces.
    const model = EMBEDDING_MODEL_BY_ID[provider.id];
    if (!model) continue;
    if (hintModel && (model !== hintModel || (hintProvider && hintProvider !== provider.id))) continue;

    try {
      const vectors = await embedOpenAICompatible(baseURL, provider.apiKey ?? "", model, texts);
      usageRepo.log({
        agent: "vault",
        kind: "embedding",
        provider: provider.id,
        model,
        status: "ok",
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: Date.now() - started,
        costEst: 0,
      });
      return { vectors, model: `${provider.id}|${model}` };
    } catch {
      /* try next embedding-capable provider */
    }
  }

  usageRepo.log({
    agent: "vault",
    kind: "embedding",
    status: "fallback",
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: Date.now() - started,
    costEst: 0,
  });
  return { vectors: texts.map((t) => localEmbed(t)), model: "local" };
}

export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na * nb) || 1;
  return dot / denom;
}
