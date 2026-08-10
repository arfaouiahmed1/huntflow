import { estimateTokens } from "@/lib/llm/tokens";

export interface Chunk {
  text: string;
  tokens: number;
}

const CHUNK_TOKENS = 700;
const OVERLAP_TOKENS = 90;

/**
 * Splits text into overlapping token-sized chunks. Words stay intact;
 * the overlap keeps meaning across chunk boundaries for retrieval.
 */
export function chunkText(text: string): Chunk[] {
  if (!text.trim()) return [];
  const words = text.split(/\s+/);
  const chunks: Chunk[] = [];
  let start = 0;

  while (start < words.length) {
    const slice: string[] = [];
    let tokens = 0;
    let i = start;
    while (i < words.length && tokens < CHUNK_TOKENS) {
      const w = words[i];
      const wTokens = Math.max(1, estimateTokens(w));
      if (wTokens > CHUNK_TOKENS) {
        if (slice.length === 0) slice.push(w);
        i++;
        break;
      }
      if (tokens + wTokens > CHUNK_TOKENS) break;
      tokens += wTokens;
      slice.push(w);
      i++;
    }
    if (slice.length === 0) break;
    const text = slice.join(" ");
    chunks.push({ text, tokens: estimateTokens(text) });
    if (i >= words.length) break;
    start = Math.max(start + 1, i - Math.min(OVERLAP_TOKENS, slice.length));
  }

  return chunks;
}
