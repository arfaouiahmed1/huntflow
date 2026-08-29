import { budgetFor } from "@/lib/llm/context";
import { estimateTokens, truncateHeadTail } from "@/lib/llm/tokens";
import { callLLM, resolveChain } from "@/lib/llm/router";

/**
 * Sliding-window fit: keep head + tail within the prompt budget for
 * the given generation type. Reuses the 25-entry GEN_BUDGETS table via
 * budgetFor — no hardcoded token counts here.
 */
export function fitToWindow(text: string, budgetKey: string): string {
  if (!text) return "";
  const { maxPrompt } = budgetFor(budgetKey);
  return truncateHeadTail(text, maxPrompt);
}

/**
 * Budget-aware compressor. If the content exceeds 85% of the prompt
 * budget for the given key, try an LLM summarizer via callLLM; on
 * any failure (no provider, timeout, empty chain) fall back to the
 * deterministic head/tail sliding window. Otherwise return the
 * sliding-window truncated form directly.
 */
export async function compressContextIfNeeded(
  text: string,
  budgetKey: string
): Promise<string> {
  if (!text) return "";
  const { maxPrompt, maxOutput } = budgetFor(budgetKey);
  const threshold = Math.floor(maxPrompt * 0.85);

  // Cheap pre-filter — estimateTokens is ~chars/3.7, fast.
  const needsCompression = estimateTokens(text) > threshold;

  if (!needsCompression) {
    return truncateHeadTail(text, maxPrompt);
  }

  try {
    const chain = resolveChain();
    if (chain.length === 0) throw new Error("no provider chain");

    // Keep the summarizer input within a reasonable size so the
    // provider itself doesn't reject it. Reuse truncateHeadTail
    // deterministically rather than slicing arbitrarily.
    const input = truncateHeadTail(text, maxPrompt);

    const result = await callLLM(
      {
        system:
          "You are a context compressor. Summarize the following context concisely, preserving all key facts, names, dates, decisions, and action items. Do not invent details. Keep the summary within the target length.",
        user: input,
        agent: budgetKey,
        maxOutput,
      },
      chain
    );

    const compressed = result.text.trim();
    if (!compressed) throw new Error("empty compression");

    // Guarantee the compressed result itself fits the prompt budget.
    return truncateHeadTail(compressed, maxPrompt);
  } catch {
    // Deterministic fallback — sliding window head/tail.
    return truncateHeadTail(text, maxPrompt);
  }
}

/**
 * LangGraph-friendly compressor node helper. Drops into a StateGraph
 * as `addNode("compressor", compressorNode)` or via
 * `createCompressorNode(budgetKey)`.
 *
 * Expects state shape `{ context: string }` and returns the same
 * shape with context compressed if needed. Budget key can be supplied
 * at call time or bound via createCompressorNode.
 */
export async function compressorNode(state: {
  context: string;
  budgetKey?: string;
}): Promise<{ context: string }> {
  const key = state.budgetKey ?? "generate";
  const context = await compressContextIfNeeded(state.context ?? "", key);
  return { context };
}

export function createCompressorNode(budgetKey: string) {
  return async (state: { context: string }): Promise<{ context: string }> => {
    const context = await compressContextIfNeeded(state.context ?? "", budgetKey);
    return { context };
  };
}
