/**
 * Hybrid vault reranker — deterministic, no external models.
 * Scoring components:
 *  - BM25-style term frequency + inverse document frequency + saturation
 *  - Exact phrase match boost (weighted higher)
 *  - Keyword density & positional proximity (terms close together)
 *  - Length normalization penalty (short/bloated chunks)
 *  - Original vector / RRF score fusion
 *  - Clean 160-char excerpt around best query-term hit
 */

export interface ChunkProvenance {
  docName: string;
  chunkIndex: number;
  similarity: number;
  excerpt: string;
}

export interface RerankedVaultChunk {
  id: string;
  docId: string;
  docName: string;
  chunkIndex: number;
  text: string;
  score: number;
  provenance: ChunkProvenance;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with",
]);

const K1 = 1.2;
const B = 0.75;
const PHRASE_BOOST_BASE = 4.0;
const PHRASE_BOOST_MULTI_TERM_EXTRA = 2.0;
const DENSITY_WEIGHT = 1.8;
const PROXIMITY_WEIGHT = 2.2;
const ORIGINAL_SCORE_WEIGHT = 1.5;
const LENGTH_PENALTY_STRENGTH = 0.55;
const EXCERPT_LEN = 160;

function tokenizeForRerank(text: string): string[] {
  const lowered = text.toLowerCase();
  const rawMatches = lowered.match(/[\p{L}\p{N}+#.-]+/gu) ?? [];
  const cleaned: string[] = [];
  for (const term of rawMatches) {
    const stripped = term.replace(/^[.-]+|[.-]+$/g, "");
    if (stripped.length > 1 && !STOP_WORDS.has(stripped)) cleaned.push(stripped);
  }
  return cleaned;
}

function normalizePhrase(text: string): string {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const collapsed = lower.replace(/\s+/g, " ");
  return collapsed;
}

function extractExcerpt(
  text: string,
  queryLower: string,
  queryTerms: string[]
): string {
  if (!text) return "";
  const cleanedText = text.replace(/\s+/g, " ").trim();
  if (!cleanedText) return "";
  if (cleanedText.length <= EXCERPT_LEN) return cleanedText;

  const lower = text.toLowerCase();
  let bestIdx = -1;
  let bestTerm = "";

  if (queryLower.length > 3) {
    const phraseIdx = lower.indexOf(queryLower);
    if (phraseIdx !== -1) {
      bestIdx = phraseIdx;
      bestTerm = queryLower;
    }
  }

  if (bestIdx === -1 && queryTerms.length) {
    let earliest = Infinity;
    for (const term of queryTerms) {
      const idx = lower.indexOf(term);
      if (idx !== -1 && idx < earliest) {
        earliest = idx;
        bestIdx = idx;
        bestTerm = term;
      }
    }
    if (bestIdx === -1) {
      const rawWords = queryLower.split(/\s+/).filter((w) => w.length > 2);
      for (const w of rawWords) {
        const idx = lower.indexOf(w);
        if (idx !== -1 && idx < earliest) {
          earliest = idx;
          bestIdx = idx;
          bestTerm = w;
        }
      }
    }
  }

  if (bestIdx === -1) {
    return cleanedText.slice(0, EXCERPT_LEN).trim();
  }

  const half = Math.floor(EXCERPT_LEN / 2);
  const termCenter = bestIdx + Math.floor(bestTerm.length / 2);
  let start = Math.max(0, termCenter - half);
  let end = start + EXCERPT_LEN;

  if (end > text.length) {
    end = text.length;
    start = Math.max(0, end - EXCERPT_LEN);
  }

  let excerpt = text.slice(start, end).replace(/\s+/g, " ").trim();

  if (excerpt.length > EXCERPT_LEN) {
    excerpt = excerpt.slice(0, EXCERPT_LEN).trim();
  }

  const hasBefore = start > 0;
  const hasAfter = end < text.length;
  if (hasBefore || hasAfter) {
    const prefix = hasBefore ? "…" : "";
    const suffix = hasAfter ? "…" : "";
    const reserve = prefix.length + suffix.length;
    if (excerpt.length + reserve > EXCERPT_LEN) {
      excerpt = excerpt.slice(0, EXCERPT_LEN - reserve).trimEnd();
    }
    excerpt = prefix + excerpt + suffix;
  }

  return excerpt;
}

function proximityRatio(tokens: string[], queryTerms: string[]): number {
  const matchedTerms = queryTerms.filter((t) => tokens.includes(t));
  if (matchedTerms.length < 2) return 0;

  const positions: Array<{ pos: number; term: string }> = [];
  tokens.forEach((tok, idx) => {
    if (matchedTerms.includes(tok)) positions.push({ pos: idx, term: tok });
  });

  const need = new Set(matchedTerms).size;
  let bestWindow = Infinity;
  let left = 0;
  const count = new Map<string, number>();
  let have = 0;

  for (let right = 0; right < positions.length; right++) {
    const term = positions[right].term;
    const prev = count.get(term) ?? 0;
    count.set(term, prev + 1);
    if (prev === 0) have++;

    while (have === need && left <= right) {
      const windowSize = positions[right].pos - positions[left].pos + 1;
      if (windowSize < bestWindow) bestWindow = windowSize;
      const leftTerm = positions[left].term;
      const leftCount = count.get(leftTerm) ?? 1;
      if (leftCount === 1) {
        count.set(leftTerm, 0);
        have--;
      } else {
        count.set(leftTerm, leftCount - 1);
      }
      left++;
    }
  }

  if (!Number.isFinite(bestWindow) || bestWindow === Infinity) return 0;
  return matchedTerms.length / bestWindow;
}

export function rerankVaultChunks<
  T extends {
    id: string;
    docId?: string;
    docName?: string;
    chunkIndex?: number;
    text?: string;
    score?: number;
  },
>(
  query: string,
  candidates: T[],
  limit?: number
): Array<T & { rerankScore: number; provenance: ChunkProvenance }> {
  if (!candidates.length) return [];
  const normalizedQuery = normalizePhrase(query);
  const effectiveLimit =
    typeof limit === "number" && Number.isFinite(limit) && limit >= 0
      ? Math.min(Math.floor(limit), candidates.length)
      : candidates.length;

  if (effectiveLimit === 0) return [];

  const queryTerms = [...new Set(tokenizeForRerank(normalizedQuery))];
  const hasMeaningfulQuery = queryTerms.length > 0;

  interface ScoredInternal {
    candidate: T;
    tokens: string[];
    lowerText: string;
    bm25: number;
    phraseBoost: number;
    densityBoost: number;
    proximityBoost: number;
    originalBoost: number;
    lengthPenalty: number;
    rerankScore: number;
    excerpt: string;
  }

  const tokenized = candidates.map((c) => {
    const text = c.text ?? "";
    return {
      candidate: c,
      tokens: tokenizeForRerank(text),
      lowerText: text.toLowerCase(),
      text,
    };
  });

  const avgLen =
    tokenized.reduce((sum, t) => sum + t.tokens.length, 0) / tokenized.length || 1;

  const docFreq = new Map<string, number>();
  if (hasMeaningfulQuery) {
    for (const term of queryTerms) {
      let df = 0;
      for (const tc of tokenized) {
        if (tc.tokens.includes(term)) df++;
      }
      docFreq.set(term, df);
    }
  }

  const N = candidates.length;

  const scored: ScoredInternal[] = tokenized.map((tc) => {
    const { candidate, tokens, lowerText, text } = tc;

    const freq = new Map<string, number>();
    for (const tok of tokens) freq.set(tok, (freq.get(tok) ?? 0) + 1);

    let bm25 = 0;
    let matchedUnique = 0;
    if (hasMeaningfulQuery) {
      for (const term of queryTerms) {
        const tf = freq.get(term) ?? 0;
        if (!tf) continue;
        matchedUnique++;
        const df = docFreq.get(term) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const lenNorm = tf + K1 * (1 - B + B * (tokens.length / avgLen));
        const termScore = idf * ((tf * (K1 + 1)) / lenNorm);
        bm25 += termScore;
      }
    }

    let phraseBoost = 0;
    if (normalizedQuery.length > 2 && lowerText.includes(normalizedQuery)) {
      const extra = queryTerms.length > 1 ? PHRASE_BOOST_MULTI_TERM_EXTRA : 0;
      phraseBoost = PHRASE_BOOST_BASE + extra;
      phraseBoost += bm25 * 0.15;
    }

    let densityBoost = 0;
    if (hasMeaningfulQuery && queryTerms.length) {
      const density = matchedUnique / queryTerms.length;
      densityBoost = density * DENSITY_WEIGHT;
      if (matchedUnique === queryTerms.length && queryTerms.length > 1) {
        densityBoost += 0.6;
      }
    }

    let proximityBoost = 0;
    if (hasMeaningfulQuery) {
      const ratio = proximityRatio(tokens, queryTerms);
      proximityBoost = ratio * PROXIMITY_WEIGHT;
    }

    const originalScore =
      typeof candidate.score === "number" && Number.isFinite(candidate.score)
        ? candidate.score
        : 0;
    const originalBoost = originalScore * ORIGINAL_SCORE_WEIGHT;

    const len = tokens.length || 1;
    const ratio = len / avgLen;
    const deviation = Math.abs(Math.log(ratio));
    // Extra penalty for severely bloated chunks (e.g. len > 3 * avgLen)
    const bloatFactor = len > avgLen * 2 ? (len / avgLen) * 0.4 : 0;
    const lengthPenalty = 1 / (1 + (deviation + bloatFactor) * LENGTH_PENALTY_STRENGTH);
    const withoutPenalty = bm25 + phraseBoost + densityBoost + proximityBoost + originalBoost;
    const rerankScore = withoutPenalty * lengthPenalty;

    const excerpt = extractExcerpt(text, normalizedQuery, queryTerms);

    return {
      candidate,
      tokens,
      lowerText,
      bm25,
      phraseBoost,
      densityBoost,
      proximityBoost,
      originalBoost,
      lengthPenalty,
      rerankScore,
      excerpt,
    };
  });

  scored.sort((a, b) => {
    if (b.rerankScore !== a.rerankScore) return b.rerankScore - a.rerankScore;
    const aOrig = a.candidate.score ?? 0;
    const bOrig = b.candidate.score ?? 0;
    if (bOrig !== aOrig) return bOrig - aOrig;
    return a.candidate.id.localeCompare(b.candidate.id);
  });

  const top = scored.slice(0, effectiveLimit);
  const maxScore = Math.max(...top.map((s) => s.rerankScore), 0);

  return top.map((s) => {
    const c = s.candidate;
    const docName = c.docName ?? c.docId ?? "unknown";
    const chunkIndex =
      typeof c.chunkIndex === "number" && Number.isFinite(c.chunkIndex) ? c.chunkIndex : 0;
    const similarity = maxScore > 0 ? s.rerankScore / maxScore : 0;
    const provenance: ChunkProvenance = {
      docName,
      chunkIndex,
      similarity,
      excerpt: s.excerpt,
    };
    return {
      ...c,
      rerankScore: s.rerankScore,
      provenance,
    };
  });
}
