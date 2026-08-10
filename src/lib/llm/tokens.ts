import { encode } from "gpt-tokenizer";

/** Fast, dependency-free token estimate (chars/4 + correction). Used as a
 *  cheap pre-filter before the precise encoder. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // cl100k_base ≈ 1 token per ~4 chars, but code/symbols skew higher
  return Math.ceil(text.length / 3.7);
}

/** Precise count via gpt-tokenizer (cl100k_base — a good universal proxy). */
export function countTokens(text: string): number {
  if (!text) return 0;
  if (text.length > 400_000) return estimateTokens(text); // guard against pathological input
  try {
    return encode(text).length;
  } catch {
    return estimateTokens(text);
  }
}

export function countTokensOf(messages: { role: string; content: string }[]): number {
  // per-message framing overhead ≈ 4 tokens each
  return messages.reduce((s, m) => s + countTokens(m.content) + 4, 3);
}

/** Truncate text to fit within maxTokens (token-aware, keeps head + tail). */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (!text) return "";
  if (countTokens(text) <= maxTokens) return text;
  // binary-search the prefix length that fits
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (countTokens(text.slice(0, mid)) <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo);
}

export function truncateHeadTail(text: string, maxTokens: number, tailRatio = 0.2): string {
  if (!text) return "";
  if (countTokens(text) <= maxTokens) return text;
  const headTokens = Math.floor(maxTokens * (1 - tailRatio));
  const tailTokens = maxTokens - headTokens;
  const head = truncateToTokens(text, headTokens);
  const tail = truncateToTokens(text.slice(-Math.floor(tailTokens * 6)), tailTokens); // ~6 chars/token for the tail slice
  return `${head}\n\n…[truncated for context budget]…\n\n${tail}`;
}
