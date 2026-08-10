import { getProvider, LLMSettings, ProviderKind } from "./providers";
import { resolveChain, callLLM, callLLMJSON } from "./router";

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly providerId?: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "LLMError";
  }
}

export interface LLMResult {
  text: string;
  providerId: string;
  model: string;
  /** how many providers were attempted before success (0 = first worked) */
  attempts: number;
}

const REQUEST_TIMEOUT = 60_000;

function timeoutSignal() {
  return AbortSignal.timeout(REQUEST_TIMEOUT);
}

export function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/```(?:json)?/g, "")
    .replace(/```/g, "")
    .trim();
  const objStart = cleaned.indexOf("{");
  const arrStart = cleaned.indexOf("[");
  let start = -1;
  let end = -1;
  if (arrStart === -1 || (objStart !== -1 && objStart < arrStart)) {
    start = objStart;
    end = cleaned.lastIndexOf("}");
  } else {
    start = arrStart;
    end = cleaned.lastIndexOf("]");
  }
  if (start === -1 || end <= start) {
    throw new LLMError("Model did not return valid JSON", undefined, "PARSE_ERROR");
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new LLMError("Model did not return valid JSON", undefined, "PARSE_ERROR");
  }
}

/** fetch with classified failures: timeouts become LLMError("TIMEOUT"), other transport errors "NETWORK". */
async function safeFetch(url: string, init: RequestInit, providerId: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new LLMError(`Timed out after ${REQUEST_TIMEOUT / 1000}s`, providerId, "TIMEOUT");
    }
    throw new LLMError(`Network error reaching ${providerId} — ${(err as Error).message}`, providerId, "NETWORK");
  }
}

function classifyStatus(status: number): string {
  if (status === 401 || status === 403) return `HTTP_${status}`;
  if (status === 429) return "HTTP_429";
  if (status === 408) return "HTTP_408";
  if (status >= 500) return "HTTP_5xx";
  return `HTTP_${status}`;
}

async function parseError(res: Response, providerId: string): Promise<never> {
  const body = await res.text().catch(() => "");
  let message = `HTTP ${res.status}`;
  try {
    const j = JSON.parse(body);
    message = j?.error?.message || j?.message || message;
  } catch {
    /* keep default */
  }
  throw new LLMError(message, providerId, classifyStatus(res.status));
}

async function callOpenAICompatible(
  settings: LLMSettings,
  system: string,
  user: string,
  jsonMode: boolean,
  maxOutput: number
): Promise<string> {
  const provider = getProvider(settings.providerId);
  const baseURL = (settings.baseURL || provider.baseURL || "").replace(/\/$/, "");
  if (!baseURL) throw new LLMError("Custom provider requires a Base URL", provider.id, "NO_BASE_URL");

  const res = await safeFetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
      ...(settings.providerId === "openrouter" ? { "X-Title": "HUNTFLOW" } : {}),
    },
    signal: timeoutSignal(),
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: settings.temperature ?? 0.7,
      max_tokens: maxOutput,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  }, settings.providerId);

  if (!res.ok) await parseError(res, settings.providerId);

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new LLMError("Empty completion from model", settings.providerId, "EMPTY");
  }
  return content;
}

async function callAnthropic(
  settings: LLMSettings,
  system: string,
  user: string,
  jsonMode: boolean,
  maxOutput: number
): Promise<string> {
  const provider = getProvider(settings.providerId);
  const baseURL = (settings.baseURL || provider.baseURL || "").replace(/\/$/, "");

  const res = await safeFetch(`${baseURL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: timeoutSignal(),
    body: JSON.stringify({
      model: settings.model,
      max_tokens: maxOutput,
      system,
      messages: [{ role: "user", content: user }],
    }),
  }, settings.providerId);

  if (!res.ok) await parseError(res, settings.providerId);

  const data = await res.json();
  const content = data?.content?.find((c: { type?: string; text?: string }) => c.type === "text")?.text;
  if (typeof content !== "string" || !content.trim()) {
    throw new LLMError("Empty completion from model", settings.providerId, "EMPTY");
  }
  return content;
}

async function callGemini(
  settings: LLMSettings,
  system: string,
  user: string,
  jsonMode: boolean,
  maxOutput: number
): Promise<string> {
  const provider = getProvider(settings.providerId);
  const baseURL = (settings.baseURL || provider.baseURL || "").replace(/\/$/, "");
  const model = encodeURIComponent(settings.model);

  const res = await safeFetch(`${baseURL}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": settings.apiKey,
    },
    signal: timeoutSignal(),
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: user }] },
      ],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: {
        temperature: settings.temperature ?? 0.7,
        maxOutputTokens: maxOutput,
        ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    }),
  }, settings.providerId);

  if (!res.ok) await parseError(res, settings.providerId);

  const data = await res.json();
  const content = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ?? "";
  if (!content.trim()) {
    throw new LLMError("Empty completion from model", settings.providerId, "EMPTY");
  }
  return content;
}

export function callProvider(
  kind: ProviderKind,
  settings: LLMSettings,
  system: string,
  user: string,
  jsonMode: boolean,
  maxOutput: number
): Promise<string> {
  switch (kind) {
    case "anthropic":
      return callAnthropic(settings, system, user, jsonMode, maxOutput);
    case "gemini":
      return callGemini(settings, system, user, jsonMode, maxOutput);
    default:
      return callOpenAICompatible(settings, system, user, jsonMode, maxOutput);
  }
}

/**
 * Single generation call through the router (multi-provider fallback,
 * classified retries, circuit breaker, usage ledger).
 */
export async function generateText(settings: LLMSettings | null | undefined, system: string, user: string): Promise<LLMResult> {
  const chain = resolveChain(settings);
  return callLLM({ system, user, agent: "generate" }, chain);
}

/** JSON-mode generation through the router. Throws LLMError on total failure. */
export async function generateJSON<T>(settings: LLMSettings | null | undefined, system: string, user: string, agent = "generate"): Promise<T> {
  const chain = resolveChain(settings);
  return callLLMJSON<T>({ system, user, agent }, chain);
}
