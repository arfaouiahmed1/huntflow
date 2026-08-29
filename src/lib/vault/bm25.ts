const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "with",
]);

export interface LexicalRank {
  chunkId: number;
  score: number;
  matchedTerms: string[];
}

export function tokenizeForSearch(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}+#.-]+/gu) ?? [])
    .map((term) => term.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

/** Small-corpus BM25 implementation for the local SQLite document vault. */
export function rankBm25<T extends { id: number; content: string }>(
  query: string,
  chunks: T[],
  options: { k1?: number; b?: number } = {}
): LexicalRank[] {
  if (!chunks.length) return [];
  const queryTerms = [...new Set(tokenizeForSearch(query))];
  if (!queryTerms.length) return [];

  const k1 = options.k1 ?? 1.2;
  const b = options.b ?? 0.75;
  const tokenized = chunks.map((chunk) => ({
    chunk,
    terms: tokenizeForSearch(chunk.content),
  }));
  const averageLength = tokenized.reduce((sum, item) => sum + item.terms.length, 0) / tokenized.length || 1;

  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    documentFrequency.set(
      term,
      tokenized.reduce((count, item) => count + (item.terms.includes(term) ? 1 : 0), 0)
    );
  }

  return tokenized
    .map(({ chunk, terms }) => {
      const frequencies = new Map<string, number>();
      for (const term of terms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);

      let score = 0;
      const matchedTerms: string[] = [];
      for (const term of queryTerms) {
        const frequency = frequencies.get(term) ?? 0;
        if (!frequency) continue;
        matchedTerms.push(term);
        const df = documentFrequency.get(term) ?? 0;
        const idf = Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5));
        const lengthNorm = frequency + k1 * (1 - b + b * (terms.length / averageLength));
        score += idf * ((frequency * (k1 + 1)) / lengthNorm);
      }

      return { chunkId: chunk.id, score, matchedTerms };
    })
    .filter((result) => result.score > 0)
    .sort((a, bResult) => bResult.score - a.score);
}
