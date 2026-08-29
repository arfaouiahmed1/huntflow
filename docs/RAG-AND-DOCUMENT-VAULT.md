# RAG and document vault

## Purpose

The Evidence Vault gives the application a source-backed memory of resumes, project descriptions, certificates, writing samples, and other candidate evidence. Retrieval results are meant to support human review and downstream drafting; they are not proof that a generated claim is true.

## Supported inputs

- PDF
- DOCX
- plain text
- Markdown

Uploads are validated, extracted, chunked, embedded, and stored with document metadata in the local application data directory and SQLite database.

## Ingestion pipeline

1. The upload route validates the extension and payload (25 MB cap, HTTP 413 above).
2. The extractor converts the document into plain text.
3. The chunker creates overlapping, token-sized passages while preserving word boundaries — 700-token chunks with 90 tokens of overlap (`src/lib/vault/chunk.ts:8-9`).
4. The embedding router attempts a configured embedding-capable provider.
5. If no compatible provider is available, a deterministic local 256-dim hash embedding keeps the vault functional without a key.
6. Chunks, vectors, model labels, and document metadata are stored locally.

The provider model label is stored with each chunk so search does not silently compare vectors from incompatible embedding spaces.

## Retrieval pipeline

Each query runs two retrieval branches:

- **BM25** scores exact and rare-term lexical matches. This is valuable for framework names, certifications, technologies, and proper nouns. Parameters are the classic `k1 = 1.2`, `b = 0.75` (`src/lib/vault/bm25.ts:28-29`).
- **Vector similarity** scores semantic proximity within each compatible embedding model, keeping hits at cosine ≥ 0.12.

The ranked lists are combined with reciprocal rank fusion using `k = 60`. RRF is rank-based, so it can combine different scoring scales without pretending BM25 scores and cosine similarities are directly comparable.

### Query expansion, hybrid fusion and local rerank

Before the two branches run, the query itself is expanded
(`src/lib/vault/index.ts:11-48`):

1. With a configured provider chain, an LLM call (agent `vault`, JSON mode,
   `maxOutput: 150`) proposes exactly 2 concise rewrites that preserve intent.
2. Rewrites are deduplicated case-insensitively against the original query.
3. Without a chain — or on any LLM failure — expansion degrades to the raw
   query alone, so retrieval stays fully deterministic offline.

The search then runs the full hybrid pass per expansion
(`searchVault`, `src/lib/vault/index.ts:148-260`):

```text
query ─→ expandQuery (LLM ×2 rewrites, deterministic fallback)
      ─→ BM25 ranking per expanded query
      ─→ vector ranking per embed-model group × per expanded query (cosine ≥ 0.12)
      ─→ RRF fusion K=60 over every ranking list
      ─→ local rerank: overlap boost vs expanded terms
      ─→ normalize by max boosted score → top-k
```

- Chunks are grouped by their stored `embed_model`; each group is embedded
  and scored separately so documents from different embedding spaces never
  cross-score.
- All ranking lists — one BM25 list per expansion plus one vector list per
  model × expansion — feed one RRF fusion (`score += 1 / (60 + rank)`).
- A lightweight **local rerank** then boosts fused candidates by term
  overlap with the expanded queries: `boosted = fused * (1 + 0.12 *
  overlapRatio) + overlap * 0.005`, sorted by boosted score and normalized
  by the maximum in the top-k slice (`index.ts:218-249`). No external
  reranker service is involved; the BM25 signal stays influential because
  the ratio boost is capped at 12%.

The API returns:

- source document and chunk index;
- embedding model label;
- normalized fused score;
- lexical and semantic scores;
- lexical and semantic ranks;
- matched query terms;
- retrieval strategy metadata (`hybrid | vector | lexical`);
- hit text sliced to 800 characters.

Every hit cites `docName#chunkIndex [model]`, which is the citation format
reused by vault assist, tracker Explain-fit, and agent shared-context
evidence. Retrieval quality is guarded by a deterministic evaluation suite
(`src/lib/__tests__/vaultEval.test.ts`) asserting recall@5 ≥ 0.8 and MRR ≥
0.6 over a seeded corpus with no network access.

## Local fallback limitations

The deterministic local hash embedding is private, portable, and useful for development. It is not equivalent to a trained semantic embedding model. Its collisions and bag-of-words behavior limit semantic recall, especially for paraphrases and multilingual material.

BM25 partly compensates for that limitation by providing a strong exact-match branch. For higher-quality semantic retrieval, configure a supported embedding provider and re-index the affected documents.

## Data and provider boundary

Source files, extracted text, and stored vectors remain in local application storage. When a remote embedding provider is used, the text being embedded is sent to that provider. When retrieved passages are supplied to an LLM workflow, those passages and the prompt are sent to the selected model provider.

Provider use must be treated as intentional data egress. Review provider retention and privacy policies before indexing sensitive material.

## Evaluation plan

A credible retrieval evaluation should include:

1. A redacted corpus representing resumes, projects, skills, and certifications.
2. Labelled queries with one or more relevant chunks.
3. Lexical, semantic, and hybrid runs over the same corpus.
4. Recall@5, mean reciprocal rank, and no-answer/error analysis.
5. Separate results for local fallback and each remote embedding model.

Until those measurements exist, describe the vault by its implemented pipeline and observable signals—not by an unmeasured accuracy claim.

## Operational notes

- Deleting a document removes its indexed chunks from the vault.
- Changing embedding models does not silently rewrite existing vectors; re-index documents deliberately.
- Treat uploaded documents as untrusted input and keep extraction libraries patched.
- Do not render or execute macros from uploaded office documents.

