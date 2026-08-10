import { randomUUID } from "node:crypto";
import { vaultRepo, VaultDoc, VaultChunk } from "@/lib/db";
import { extractText, normalizeText } from "./extract";
import { chunkText } from "./chunk";
import { embedTexts, cosine } from "./embeddings";

export interface VaultSearchHit {
  docId: string;
  docName: string;
  chunkId: number;
  text: string;
  score: number;
  model: string;
}

export async function ingestDocument(input: {
  buffer: Buffer;
  filename: string;
  mime: string;
  label?: string;
}): Promise<VaultDoc> {
  const id = randomUUID();
  const doc: VaultDoc = {
    id,
    filename: input.filename,
    mime: input.mime,
    size: input.buffer.byteLength,
    status: "indexing",
    embedModel: "local",
    chunkCount: 0,
    label: input.label ?? "",
    createdAt: new Date().toISOString(),
  };
  vaultRepo.upsertDoc(doc);

  try {
    const raw = await extractText(input.buffer, input.mime, input.filename);
    const text = normalizeText(raw);
    if (!text) throw new Error("No readable text found in the file.");

    const chunks = chunkText(text);
    if (!chunks.length) throw new Error("File is too short to index.");

    const { vectors, model } = await embedTexts(chunks.map((c) => c.text));

    vaultRepo.deleteChunks(id);
    chunks.forEach((c, i) => {
      const chunk: Omit<VaultChunk, "id"> = {
        docId: id,
        idx: i,
        content: c.text,
        tokens: c.tokens,
        embedding: vectors[i] ?? [],
      };
      vaultRepo.insertChunk(chunk);
    });

    doc.status = "ready";
    doc.embedModel = model;
    doc.chunkCount = chunks.length;
    vaultRepo.upsertDoc(doc);
    return doc;
  } catch (err) {
    vaultRepo.deleteDoc(id);
    throw err;
  }
}

export function listDocuments(): VaultDoc[] {
  return vaultRepo.listDocs();
}

export function deleteDocument(id: string): boolean {
  const doc = vaultRepo.getDoc(id);
  if (!doc) return false;
  vaultRepo.deleteDoc(id);
  return true;
}

export function setDocLabel(id: string, label: string): boolean {
  const doc = vaultRepo.getDoc(id);
  if (!doc) return false;
  vaultRepo.setLabel(id, label);
  return true;
}

/** Semantic retrieval with keyword fallback. */
export async function searchVault(query: string, k = 4, threshold = 0.12): Promise<VaultSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const all = vaultRepo.allChunksWithModel();
  if (!all.length) return [];

  const byModel = new Map<string, (VaultChunk & { embedModel: string })[]>();
  for (const c of all) {
    const list = byModel.get(c.embedModel) ?? [];
    list.push(c);
    byModel.set(c.embedModel, list);
  }

  const hits: VaultSearchHit[] = [];
  for (const [model, chunks] of byModel) {
    const { vectors } = await embedTexts([trimmed], model).catch(() => ({ vectors: [] as number[][] }));
    const qv = vectors[0];
    if (qv?.length) {
      for (const c of chunks) {
        if (!c.embedding.length) continue;
        const score = cosine(qv, c.embedding);
        if (score >= threshold) {
          hits.push({
            docId: c.docId,
            docName: c.docId,
            chunkId: c.id,
            text: c.content,
            score,
            model,
          });
        }
      }
    }
  }

  hits.sort((a, b) => b.score - a.score);

  if (!hits.length) {
    /* keyword fallback */
    const terms = trimmed.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    if (terms.length) {
      for (const c of all) {
        const text = c.content.toLowerCase();
        const score = terms.filter((t) => text.includes(t)).length / terms.length;
        if (score > 0.4) {
          hits.push({
            docId: c.docId,
            docName: c.docId,
            chunkId: c.id,
            text: c.content,
            score: score * 0.5,
            model: "keyword",
          });
        }
      }
      hits.sort((a, b) => b.score - a.score);
    }
  }

  const docs = new Map(vaultRepo.listDocs().map((d) => [d.id, d.filename]));
  return hits.slice(0, k).map((h) => ({
    ...h,
    docName: docs.get(h.docId) ?? h.docId,
    text: h.text.slice(0, 600),
  }));
}

export function vaultStats() {
  return vaultRepo.stats();
}
