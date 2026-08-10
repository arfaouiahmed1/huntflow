import {
  getProvider,
  LLMProvider,
  LLMSettings,
  llmSettingsFrom,
  toLLMProvider,
} from "./providers";
import { LLMError, callProvider, extractJson, LLMResult } from "./client";
import { settingsRepo, usageRepo } from "@/lib/db";
import { budgetFor } from "./context";
import { estimateCost } from "./costs";
import { countTokens, countTokensOf } from "./tokens";

/* -------------------------------------------------------------------------- *
 *  LLM Router — multi-provider with classified retries, circuit breaking,
 *  capability filtering and a usage ledger.
 * -------------------------------------------------------------------------- */

export interface LLMRouterRequest {
  system: string;
  user: string;
  json?: boolean;
  maxOutput?: number;
  agent?: string;
}

interface CircuitState {
  failures: number;
  cooldownUntil: number;
}

const CIRCUIT: Record<string, CircuitState> = {};
const COOLDOWN_MS = 90_000; // one failed provider stays out for 90s
const MAX_FAILURES = 3;
const PER_PROVIDER_ATTEMPTS = 2;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

let _cachedChain: LLMProvider[] | null = null;
let _cachedChainAt = 0;

/** Persisted provider chain from the settings table (source of truth). */
export function loadChainFromDb(): LLMProvider[] | null {
  const now = Date.now();
  if (_cachedChain && now - _cachedChainAt < 10000) return _cachedChain;
  try {
    const raw = settingsRepo.get("llm_providers");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LLMProvider[];
    if (!Array.isArray(parsed)) return null;
    _cachedChain = parsed.filter((p) => p && typeof p === "object" && p.enabled !== false);
    _cachedChainAt = now;
    return _cachedChain;
  } catch {
    return null;
  }
}

/** Merge sources into one ordered chain:
 *  1. DB chain (Settings UI)
 *  2. environment-configured providers (missing from the DB chain)
 *  3. legacy single-provider settings (old localStorage path)
 *  4. default
 */
export function resolveChain(llmSettings?: LLMSettings | null): LLMProvider[] {
  const chain: LLMProvider[] = [];
  const seen = new Set<string>();

  const dbChain = loadChainFromDb();
  if (dbChain) {
    for (const p of dbChain) {
      if (!seen.has(p.id)) {
        chain.push(p);
        seen.add(p.id);
      }
    }
  }

  const envMap: { id: string; keyVar: string; modelVar: string }[] = [
    { id: "openrouter", keyVar: "OPENROUTER_API_KEY", modelVar: "OPENROUTER_MODEL" },
    { id: "gemini", keyVar: "GEMINI_API_KEY", modelVar: "GEMINI_MODEL" },
    { id: "anthropic", keyVar: "ANTHROPIC_API_KEY", modelVar: "ANTHROPIC_MODEL" },
    { id: "openai", keyVar: "OPENAI_API_KEY", modelVar: "OPENAI_MODEL" },
    { id: "groq", keyVar: "GROQ_API_KEY", modelVar: "GROQ_MODEL" },
    { id: "deepseek", keyVar: "DEEPSEEK_API_KEY", modelVar: "DEEPSEEK_MODEL" },
  ];
  for (const e of envMap) {
    if (seen.has(e.id)) continue;
    const key = process.env[e.keyVar] || "";
    if (!key) continue;
    const cfg = getProvider(e.id);
    const p = toLLMProvider({
      providerId: e.id,
      apiKey: key,
      model: process.env[e.modelVar] || cfg.defaultModel,
      baseURL: cfg.baseURL,
    });
    chain.push(p);
    seen.add(p.id);
  }

  if (llmSettings?.apiKey || llmSettings?.providerId === "ollama") {
    const id = llmSettings.providerId || "openrouter";
    if (!seen.has(id)) {
      chain.push(toLLMProvider(llmSettings));
      seen.add(id);
    }
  }

  if (chain.length === 0) {
    // No provider configured — callers will receive "No eligible provider in chain" via callLLM.
    // Pushing a provider with an empty apiKey would be immediately excluded by eligible() anyway.
    return chain;
  }
  return chain;
}

/** Find the first provider capable of the request that isn't cooling down. */
function eligible(chain: LLMProvider[], needsJson: boolean): LLMProvider[] {
  const now = Date.now();
  return chain.filter((p) => {
    if (!p.enabled) return false;
    const cfg = getProvider(p.id);
    if (needsJson && cfg.capabilities && !cfg.capabilities.includes("json") && p.id !== "custom") {
      return false;
    }
    if (!p.apiKey && cfg.needsKey) return false;
    const c = CIRCUIT[p.id];
    if (c && c.failures >= MAX_FAILURES && c.cooldownUntil > now) return false;
    return true;
  });
}

function recordFailure(providerId: string) {
  const c = CIRCUIT[providerId] ?? { failures: 0, cooldownUntil: 0 };
  c.failures += 1;
  if (c.failures >= MAX_FAILURES) c.cooldownUntil = Date.now() + COOLDOWN_MS;
  CIRCUIT[providerId] = c;
}

function recordSuccess(providerId: string) {
  CIRCUIT[providerId] = { failures: 0, cooldownUntil: 0 };
}

const JSON_HINT = "\n\nRespond with valid JSON only — no markdown fences, no commentary.";

export async function callLLM(req: LLMRouterRequest, chain: LLMProvider[]): Promise<LLMResult> {
  const { system, user, json = false, maxOutput, agent = "generate" } = req;
  const budget = budgetFor(agent);
  const attempts: string[] = [];
  const started = Date.now();
  let lastError: unknown = null;

  const providers = eligible(chain, json);

  for (const provider of providers) {
    const settings = llmSettingsFrom(provider);
    const cfg = getProvider(provider.id);
    const sys = json ? `${system}${JSON_HINT}` : system;

    for (let attempt = 0; attempt < PER_PROVIDER_ATTEMPTS; attempt++) {
      try {
        const text = await callProvider(cfg.kind, settings, sys, user, json, maxOutput ?? budget.maxOutput);
        recordSuccess(provider.id);
        const promptTokens = countTokensOf([
          { role: "system", content: sys },
          { role: "user", content: user },
        ]);
        const completionTokens = countTokens(text);
        usageRepo.log({
          agent,
          kind: "completion",
          provider: provider.id,
          model: settings.model,
          status: "ok",
          promptTokens,
          completionTokens,
          latencyMs: Date.now() - started,
          costEst: estimateCost(provider.id, promptTokens, completionTokens),
        });
        return { text, providerId: provider.id, model: settings.model, attempts: attempts.length };
      } catch (err) {
        lastError = err;
        attempts.push(provider.id);
        const code = err instanceof LLMError ? err.code : undefined;

        if (code === "HTTP_429" || code === "HTTP_408") {
          // rate limit / timeout — backoff + jitter, retry same provider
          if (attempt < PER_PROVIDER_ATTEMPTS - 1) {
            await sleep(1000 * Math.pow(2, attempt) + Math.random() * 300);
            continue;
          }
          recordFailure(provider.id);
          break;
        }
        if (code === "HTTP_5xx" || code === "TIMEOUT" || code === "NETWORK") {
          recordFailure(provider.id);
          break;
        }
        if (code === "PARSE_ERROR" && json) {
          // json mode failed on this provider — move on (json-hint hop)
          recordFailure(provider.id);
          break;
        }
        if (code === "HTTP_401" || code === "HTTP_403") {
          recordFailure(provider.id);
          break;
        }
        // unknown errors — retry once, then hop
        if (attempt < PER_PROVIDER_ATTEMPTS - 1) {
          await sleep(700);
          continue;
        }
        recordFailure(provider.id);
        break;
      }
    }
  }

  usageRepo.log({
    agent,
    kind: "completion",
    status: "error",
    promptTokens: countTokensOf([
      { role: "system", content: system },
      { role: "user", content: user },
    ]),
    completionTokens: 0,
    latencyMs: Date.now() - started,
    costEst: 0,
    error: lastError instanceof Error ? lastError.message : lastError != null ? String(lastError) : "No eligible provider in chain",
  });

  throw lastError instanceof Error ? lastError : new LLMError("All providers failed", undefined, "CHAIN_EXHAUSTED");
}

/** JSON-mode with a final parse attempt over provider text. */
export async function callLLMJSON<T>(req: LLMRouterRequest, chain: LLMProvider[]): Promise<T> {
  const result = await callLLM({ ...req, json: true }, chain);
  return extractJson(result.text) as T;
}
