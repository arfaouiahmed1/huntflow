export type ProviderKind = "openai" | "anthropic" | "gemini";

export type ProviderCapability = "json" | "embeddings" | "long-context" | "cheap" | "vision";

export interface LLMProviderConfig {
  id: string;
  label: string;
  kind: ProviderKind;
  baseURL?: string;
  defaultModel: string;
  needsKey: boolean;
  website: string;
  hint?: string;
  capabilities?: ProviderCapability[];
}

export const LLM_PROVIDERS: LLMProviderConfig[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "google/gemini-2.5-flash",
    needsKey: true,
    website: "openrouter.ai",
    hint: "One key for 500+ models — Claude, GPT, Gemini, Llama…",
    capabilities: ["json", "long-context", "vision"],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    kind: "gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash",
    needsKey: true,
    website: "aistudio.google.com",
    capabilities: ["json", "long-context", "cheap", "vision"],
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    kind: "anthropic",
    baseURL: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-5",
    needsKey: true,
    website: "console.anthropic.com",
    capabilities: ["json", "long-context", "vision"],
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    needsKey: true,
    website: "platform.openai.com",
    capabilities: ["json", "embeddings", "vision"],
  },
  {
    id: "groq",
    label: "Groq",
    kind: "openai",
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    needsKey: true,
    website: "console.groq.com",
    hint: "Free tier — blazing fast Llama/Mixtral/DeepSeek.",
    capabilities: ["json", "cheap"],
  },
  {
    id: "mistral",
    label: "Mistral",
    kind: "openai",
    baseURL: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    needsKey: true,
    website: "console.mistral.ai",
    capabilities: ["json"],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai",
    baseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    needsKey: true,
    website: "platform.deepseek.com",
    capabilities: ["json", "cheap"],
  },
  {
    id: "together",
    label: "Together AI",
    kind: "openai",
    baseURL: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    needsKey: true,
    website: "api.together.ai",
    capabilities: ["json"],
  },
  {
    id: "xai",
    label: "xAI Grok",
    kind: "openai",
    baseURL: "https://api.x.ai/v1",
    defaultModel: "grok-3-mini",
    needsKey: true,
    website: "console.x.ai",
    capabilities: ["json"],
  },
  {
    id: "cerebras",
    label: "Cerebras",
    kind: "openai",
    baseURL: "https://api.cerebras.ai/v1",
    defaultModel: "llama-3.3-70b",
    needsKey: true,
    website: "cloud.cerebras.ai",
    hint: "Ultra-fast open models with an OpenAI-compatible API.",
    capabilities: ["json", "cheap"],
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    kind: "openai",
    baseURL: "https://api.fireworks.ai/inference/v1",
    defaultModel: "accounts/fireworks/models/llama-v3p1-8b-instruct",
    needsKey: true,
    website: "fireworks.ai",
    hint: "Hosted open models and fine-tunes.",
    capabilities: ["json", "long-context", "vision"],
  },
  {
    id: "perplexity",
    label: "Perplexity",
    kind: "openai",
    baseURL: "https://api.perplexity.ai",
    defaultModel: "sonar",
    needsKey: true,
    website: "docs.perplexity.ai",
    hint: "Web-grounded research models.",
    capabilities: ["json", "long-context"],
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    kind: "openai",
    baseURL: "https://integrate.api.nvidia.com/v1",
    defaultModel: "meta/llama-3.3-70b-instruct",
    needsKey: true,
    website: "build.nvidia.com",
    hint: "NVIDIA-hosted open models via NIM.",
    capabilities: ["json", "long-context", "vision"],
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    kind: "openai",
    baseURL: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    needsKey: false,
    website: "ollama.com",
    hint: "Free, private, runs on your machine.",
    capabilities: ["json", "embeddings", "cheap"],
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    kind: "openai",
    baseURL: "",
    defaultModel: "",
    needsKey: false,
    website: "",
    hint: "Any /v1/chat/completions endpoint — LM Studio, vLLM, OpenWebUI…",
    capabilities: ["json"],
  },
];

export function getProvider(id: string | undefined): LLMProviderConfig {
  return LLM_PROVIDERS.find((p) => p.id === id) ?? LLM_PROVIDERS[0];
}

/** Single active provider (legacy shape — kept for backward compat). */
export interface LLMSettings {
  providerId: string;
  apiKey: string;
  model: string;
  baseURL?: string;
  temperature?: number;
}

/** One entry in the prioritized multi-provider chain. */
export interface LLMProvider extends LLMSettings {
  /** Unique key slot identifier. Multiple slots may share one providerId. */
  id: string;
  label: string;
  kind: ProviderKind;
  enabled: boolean;
  capabilities: ProviderCapability[];
}

/**
 * One explicit model preference for a workflow. providerSlotId refers to the
 * unique provider entry (rather than providerId) so two keys for the same
 * provider can be independently assigned and rotated.
 */
export interface AgentModelRoute {
  agent: string;
  providerSlotId: string;
  model: string;
}

/** Generate the next stable slot id for another key from one provider. */
export function nextProviderSlotId(chain: readonly Pick<LLMProvider, "id">[], providerId: string): string {
  if (!chain.some((provider) => provider.id === providerId)) return providerId;
  let suffix = 2;
  while (chain.some((provider) => provider.id === `${providerId}-${suffix}`)) suffix += 1;
  return `${providerId}-${suffix}`;
}

/**
 * Put an agent's selected key slot first while retaining the original ordered
 * chain as its automatic rate-limit/outage fallback. Unknown or disabled
 * selections intentionally retain the configured default chain.
 */
export function prioritizeProviderChain(
  chain: readonly LLMProvider[],
  route?: AgentModelRoute,
): LLMProvider[] {
  if (!route) return [...chain];
  const selected = chain.find((provider) => provider.id === route.providerSlotId && provider.enabled);
  if (!selected) return [...chain];
  const resolved = { ...selected, model: route.model || selected.model };
  return [resolved, ...chain.filter((provider) => provider.id !== selected.id)];
}

export function toLLMProvider(settings: LLMSettings, enabled = true): LLMProvider {
  const cfg = getProvider(settings.providerId);
  return {
    id: cfg.id,
    label: cfg.label,
    kind: cfg.kind,
    providerId: cfg.id,
    apiKey: settings.apiKey,
    model: settings.model || cfg.defaultModel,
    baseURL: settings.baseURL || cfg.baseURL,
    temperature: settings.temperature ?? 0.7,
    enabled,
    capabilities: cfg.capabilities ?? [],
  };
}

export function llmSettingsFrom(provider: LLMProvider): LLMSettings {
  return {
    providerId: provider.providerId,
    apiKey: provider.apiKey,
    model: provider.model,
    baseURL: provider.baseURL,
    temperature: provider.temperature,
  };
}

export const PROVIDER_STORAGE_KEY = "huntflow_llm_settings";
export const PROVIDER_CHAIN_KEY = "huntflow_provider_chain";
export const AGENT_ROUTING_STORAGE_KEY = "huntflow_llm_agent_routes";
export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  providerId: "openrouter",
  apiKey: "",
  model: "google/gemini-2.5-flash",
  temperature: 0.7,
};
