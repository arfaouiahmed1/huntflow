import { getProvider, LLMSettings, ProviderKind, llmSettingsFrom } from "./providers";
import { LLMError } from "./client";
import { resolveChain } from "./router";

/**
 * Token-by-token streaming generation across the configured provider chain.
 *
 * This is an OPT-IN companion to `generateText` (which waits for the whole
 * message). It keeps the same multi-provider resolve/eligibility logic but
 * streams the completion from the first usable provider, normalizing each
 * provider's native SSE shape into successive text deltas.
 *
 * Design notes:
 * - We never hop providers or retry mid-stream — a partially-consumed stream
 *   can't be safely replayed. So any pre-flight failure (no provider, bad URL,
 *   HTTP error) is thrown synchronously BEFORE the first yield, and a caller
 *   that is prepared to fall back to `generateText` will stay byte-for-byte
 *   correct whenever streaming is unavailable.
 * - Runtime mid-read transport errors surface once the reader is exhausted; the
 *   caller treats them like any generation failure and falls back.
 */

const REQUEST_TIMEOUT = 60_000;
const MAX_OUTPUT = 3000;

function timeoutSignal() {
  return AbortSignal.timeout(REQUEST_TIMEOUT);
}

/** The first provider in the chain that can serve a plain (non-JSON) completion. */
function firstUsableProvider(settings: LLMSettings | null | undefined) {
  const chain = resolveChain(settings);
  for (const p of chain) {
    if (!p.enabled) continue;
    const cfg = getProvider(p.id);
    if (cfg.needsKey && !p.apiKey) continue;
    return p;
  }
  return null;
}

function requestUrl(kind: ProviderKind, settings: LLMSettings): string {
  const provider = getProvider(settings.providerId);
  const baseURL = (settings.baseURL || provider.baseURL || "").replace(/\/$/, "");
  if (!baseURL) throw new LLMError("Custom provider requires a Base URL", provider.id, "NO_BASE_URL");
  if (kind === "gemini") {
    return `${baseURL}/models/${encodeURIComponent(settings.model)}:streamGenerateContent?alt=sse`;
  }
  return `${baseURL}/chat/completions`;
}

function requestHeaders(kind: ProviderKind, providerId: string, settings: LLMSettings): Record<string, string> {
  const common = { "Content-Type": "application/json" };
  if (kind === "anthropic") {
    return { ...common, "x-api-key": settings.apiKey, "anthropic-version": "2023-06-01" };
  }
  if (kind === "gemini") {
    return { ...common, "x-goog-api-key": settings.apiKey };
  }
  return {
    ...common,
    ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    ...(providerId === "openrouter" ? { "X-Title": "HUNTFLOW" } : {}),
  };
}

function requestBody(kind: ProviderKind, settings: LLMSettings, system: string, user: string): Record<string, unknown> {
  const temperature = settings.temperature ?? 0.7;
  if (kind === "anthropic") {
    return {
      model: settings.model,
      max_tokens: MAX_OUTPUT,
      stream: true,
      system,
      messages: [{ role: "user", content: user }],
    };
  }
  if (kind === "gemini") {
    return {
      contents: [{ role: "user", parts: [{ text: user }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { temperature, maxOutputTokens: MAX_OUTPUT },
    };
  }
  return {
    model: settings.model,
    temperature,
    stream: true,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}

/** Extract the text delta from one parsed SSE frame for the given provider kind. */
function extractDelta(kind: ProviderKind, frame: unknown): string {
  if (typeof frame !== "object" || frame === null) return "";
  const obj = frame as Record<string, unknown>;
  if (kind === "openai") {
    const first = Array.isArray(obj.choices) ? (obj.choices[0] as { delta?: { content?: string } } | undefined) : undefined;
    return first?.delta?.content ?? "";
  }
  if (kind === "anthropic") {
    const el = Array.isArray(obj.content) ? (obj.content[0] as { type?: string; text?: string } | undefined) : undefined;
    return el?.type === "text_delta" ? (el.text ?? "") : "";
  }
  // gemini
  const first = Array.isArray(obj.candidates)
    ? (obj.candidates[0] as { content?: { parts?: { text?: string }[] } } | undefined)
    : undefined;
  return first?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

/**
 * Stream successive text deltas for the given prompt. Throws `LLMError` before
 * the first yield when no provider is usable or the request cannot be set up or
 * the server rejects the request. Yields normalized text fragments as they arrive.
 */
export async function* generateTextStream(
  settings: LLMSettings | null | undefined,
  system: string,
  user: string
): AsyncGenerator<string> {
  const provider = firstUsableProvider(settings);
  if (!provider) {
    throw new LLMError("No eligible streaming provider in chain", undefined, "CHAIN_EXHAUSTED");
  }
  const cfg = getProvider(provider.id);
  const providerSettings = llmSettingsFrom(provider);

  let res: Response;
  try {
    res = await fetch(requestUrl(cfg.kind, providerSettings), {
      method: "POST",
      headers: requestHeaders(cfg.kind, provider.id, providerSettings),
      signal: timeoutSignal(),
      body: JSON.stringify(requestBody(cfg.kind, providerSettings, system, user)),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new LLMError(`Timed out after ${REQUEST_TIMEOUT / 1000}s`, provider.id, "TIMEOUT");
    }
    throw new LLMError(`Network error reaching ${provider.id} — ${(err as Error).message}`, provider.id, "NETWORK");
  }

  if (!res.ok || !res.body) {
    throw new LLMError(`Streaming request to ${provider.id} failed (HTTP ${res.status}).`, provider.id, `HTTP_${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const kind = cfg.kind;
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are line-delimited `data: <json>`; process complete lines so a
    // multi-frame payload is never cut mid-JSON.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let frame: unknown;
      try {
        frame = JSON.parse(payload);
      } catch {
        continue; // folded/partial frame — ignore
      }
      const delta = extractDelta(kind, frame);
      if (delta) yield delta;
    }
  }

  // Flush any trailing frame left in the buffer after the final `read()`.
  buffer += decoder.decode();
  for (const line of buffer.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data:")) {
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const delta = extractDelta(kind, JSON.parse(payload));
        if (delta) yield delta;
      } catch {
        /* non-JSON trailer — ignore */
      }
    }
  }
}