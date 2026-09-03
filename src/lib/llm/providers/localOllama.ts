/**
 * Local Offline Inference Engine — Ollama Provider
 * Connects directly to local Ollama runtime on loopback (127.0.0.1:11434).
 * Enables 100% private, zero token-cost agent execution without cloud API keys.
 */

export interface OllamaModelInfo {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

export const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434";

export const RECOMMENDED_LOCAL_MODELS = [
  { id: "qwen2.5-coder:7b", name: "Qwen 2.5 Coder (7B)", description: "Elite coding, JSON generation, and AST editing capabilities." },
  { id: "llama3.2:3b", name: "Llama 3.2 (3B)", description: "Ultra-fast low-memory local reasoning model." },
  { id: "mistral:7b", name: "Mistral (7B)", description: "Strong general reasoning and conversational drafting." },
  { id: "deepseek-r1:7b", name: "DeepSeek R1 (7B)", description: "Advanced step-by-step chain-of-thought local reasoning." },
];

/**
 * Checks if local Ollama server is running and reachable.
 */
export async function isOllamaOnline(baseURL: string = OLLAMA_DEFAULT_BASE_URL): Promise<boolean> {
  try {
    const res = await fetch(`${baseURL}/api/version`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Lists locally installed models available in Ollama.
 */
export async function listOllamaModels(
  baseURL: string = OLLAMA_DEFAULT_BASE_URL
): Promise<string[]> {
  try {
    const res = await fetch(`${baseURL}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return (data.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

/**
 * Direct inference call to local Ollama /api/chat endpoint.
 */
export async function callLocalOllama(
  systemPrompt: string,
  userPrompt: string,
  options: {
    model?: string;
    json?: boolean;
    temperature?: number;
    baseURL?: string;
    timeoutMs?: number;
  } = {}
): Promise<{ text: string; model: string; durationMs: number }> {
  const baseURL = options.baseURL || OLLAMA_DEFAULT_BASE_URL;
  const model = options.model || "qwen2.5-coder:7b";
  const start = Date.now();

  const res = await fetch(`${baseURL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(options.timeoutMs || 45000),
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      options: {
        temperature: options.temperature ?? 0.2,
      },
      ...(options.json ? { format: "json" } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Local Ollama error (${res.status}): ${errText || res.statusText}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  const text = data.message?.content || "";

  return {
    text,
    model,
    durationMs: Date.now() - start,
  };
}
