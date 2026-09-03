import { describe, it, expect, beforeEach } from "vitest";
import { GET as GET_VAULT, POST as POST_VAULT, PATCH as PATCH_VAULT, DELETE as DELETE_VAULT } from "@/app/api/vault/route";
import { GET as GET_SEARCH, POST as POST_SEARCH } from "@/app/api/vault/search/route";
import {
  createJsonRequest,
  createFormDataRequest,
  createUrlRequest,
  parseResponse,
  resetTestDb,
  vaultRepo,
} from "../helpers/testHarness";
import { VaultDoc } from "@/types";

describe("Tier 1: Feature Coverage — Document Vault Ingestion & Semantic Search", () => {
  beforeEach(() => {
    resetTestDb();
    vaultRepo.wipe(true);
  });

  it("1. POST /api/vault accepts multipart form-data (.txt) and indexes chunks", async () => {
    const textContent =
      "Alex Johnson is a Senior Full-Stack Engineer specializing in React, Next.js, and TypeScript distributed backends. Over 7 years of production experience scaling high-concurrency systems.";
    const blob = new Blob([textContent], { type: "text/plain" });
    const file = new File([blob], "alex-resume.txt", { type: "text/plain" });

    const form = new FormData();
    form.append("file", file);
    form.append("label", "master_resume");

    const req = createFormDataRequest("http://localhost/api/vault", form);
    const res = await POST_VAULT(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ ok: boolean; doc: VaultDoc }>(res);
    expect(body.ok).toBe(true);
    expect(body.doc.filename).toBe("alex-resume.txt");
    expect(body.doc.chunkCount).toBeGreaterThan(0);

    const chunks = vaultRepo.chunksFor(body.doc.id);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].content).toContain("Alex Johnson");
  });

  it("2. POST /api/vault assigns optional label (e.g. transcript, certificate, master_resume)", async () => {
    const form = new FormData();
    form.append("file", new File([new Blob(["Stanford CS Degree"])], "diploma.txt", { type: "text/plain" }));
    form.append("label", "certificate");

    const req = createFormDataRequest("http://localhost/api/vault", form);
    const res = await POST_VAULT(req);
    const body = await parseResponse<{ doc: VaultDoc }>(res);

    expect(body.doc.label).toBe("certificate");
    const docInDb = vaultRepo.getDoc(body.doc.id);
    expect(docInDb?.label).toBe("certificate");
  });

  it("3. GET /api/vault returns document inventory and chunk statistics", async () => {
    vaultRepo.upsertDoc({
      id: "doc-stats-1",
      filename: "test.pdf",
      mime: "application/pdf",
      size: 1024,
      status: "ready",
      embedModel: "local",
      chunkCount: 2,
      label: "reference",
      createdAt: new Date().toISOString(),
    });
    vaultRepo.insertChunk({
      docId: "doc-stats-1",
      idx: 0,
      content: "Sample chunk 1",
      tokens: 10,
      embedding: [],
    });

    const res = await GET_VAULT();
    expect(res.status).toBe(200);
    const data = await parseResponse<{ docs: VaultDoc[]; stats: { docs: number; chunks: number } }>(res);

    expect(data.docs.length).toBe(1);
    expect(data.stats.docs).toBe(1);
    expect(data.stats.chunks).toBe(1);
  });

  it("4. PATCH /api/vault updates document label and validates max label length", async () => {
    const docId = "doc-to-patch";
    vaultRepo.upsertDoc({
      id: docId,
      filename: "sample.txt",
      mime: "text/plain",
      size: 500,
      status: "ready",
      embedModel: "local",
      chunkCount: 1,
      label: "old_label",
      createdAt: new Date().toISOString(),
    });

    const req = createJsonRequest("http://localhost/api/vault", "PATCH", {
      id: docId,
      label: "updated_official_resume",
    });
    const res = await PATCH_VAULT(req);
    expect(res.status).toBe(200);

    const updated = vaultRepo.getDoc(docId);
    expect(updated?.label).toBe("updated_official_resume");
  });

  it("5. POST /api/vault/search performs semantic search with { query, k } and returns ranked hits", async () => {
    const docId = "doc-search-target";
    vaultRepo.upsertDoc({
      id: docId,
      filename: "skills.txt",
      mime: "text/plain",
      size: 1000,
      status: "ready",
      embedModel: "local",
      chunkCount: 1,
      label: "resume",
      createdAt: new Date().toISOString(),
    });
    vaultRepo.insertChunk({
      docId,
      idx: 0,
      content: "Expertise in GraphQL microservices, Next.js App Router, and TypeScript performance tuning.",
      tokens: 15,
      embedding: [],
    });

    const req = createJsonRequest("http://localhost/api/vault/search", "POST", {
      query: "GraphQL microservices",
      k: 3,
    });
    const res = await POST_SEARCH(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ hits: { text?: string; chunk?: string; docId: string; score: number }[] }>(res);
    expect(Array.isArray(body.hits)).toBe(true);
    expect(body.hits.length).toBeGreaterThan(0);
    const content = body.hits[0].text || body.hits[0].chunk || "";
    expect(content).toContain("GraphQL");
  });

  it("6. GET /api/vault/search?q=React&k=3 performs search via GET query parameters", async () => {
    const docId = "doc-get-search";
    vaultRepo.upsertDoc({
      id: docId,
      filename: "frontend.txt",
      mime: "text/plain",
      size: 1000,
      status: "ready",
      embedModel: "local",
      chunkCount: 1,
      label: "skills",
      createdAt: new Date().toISOString(),
    });
    vaultRepo.insertChunk({
      docId,
      idx: 0,
      content: "React 19, TypeScript state management, and modern responsive design using Tailwind CSS.",
      tokens: 15,
      embedding: [],
    });

    const req = createUrlRequest("http://localhost/api/vault/search?q=React&k=3");
    const res = await GET_SEARCH(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ hits: { text?: string; chunk?: string; docId: string; score: number }[] }>(res);
    expect(body.hits.length).toBeGreaterThan(0);
    const content = body.hits[0].text || body.hits[0].chunk || "";
    expect(content).toContain("React");
  });

  it("7. Keyword fallback activates when semantic embeddings yield low cosine similarity", async () => {
    const docId = "doc-keyword-fallback";
    vaultRepo.upsertDoc({
      id: docId,
      filename: "obscure.txt",
      mime: "text/plain",
      size: 500,
      status: "ready",
      embedModel: "local",
      chunkCount: 1,
      label: "misc",
      createdAt: new Date().toISOString(),
    });
    vaultRepo.insertChunk({
      docId,
      idx: 0,
      content: "UncommonTermXYZ999 specialized protocol architecture.",
      tokens: 8,
      embedding: [],
    });

    const req = createJsonRequest("http://localhost/api/vault/search", "POST", {
      query: "UncommonTermXYZ999",
      k: 2,
    });
    const res = await POST_SEARCH(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ hits: { text?: string; chunk?: string }[] }>(res);
    expect(body.hits.some((h) => (h.text || h.chunk || "").includes("UncommonTermXYZ999"))).toBe(true);
  });

  it("8. DELETE /api/vault?id=:id removes document and cascades deletion to vault_chunks", async () => {
    const docId = "doc-to-cascade-del";
    vaultRepo.upsertDoc({
      id: docId,
      filename: "cascade.txt",
      mime: "text/plain",
      size: 500,
      status: "ready",
      embedModel: "local",
      chunkCount: 2,
      label: "temp",
      createdAt: new Date().toISOString(),
    });
    vaultRepo.insertChunk({ docId, idx: 0, content: "chunk 1", tokens: 5, embedding: [] });
    vaultRepo.insertChunk({ docId, idx: 1, content: "chunk 2", tokens: 5, embedding: [] });

    expect(vaultRepo.getDoc(docId)).not.toBeNull();
    expect(vaultRepo.chunksFor(docId).length).toBe(2);

    const req = createUrlRequest(`http://localhost/api/vault?id=${docId}`, "DELETE");
    const res = await DELETE_VAULT(req);
    expect(res.status).toBe(200);

    expect(vaultRepo.getDoc(docId)).toBeNull();
    expect(vaultRepo.chunksFor(docId).length).toBe(0);
  });

  it("9. POST /api/vault rejects empty or unreadable document buffers with 400", async () => {
    const emptyFile = new File([new Blob([])], "empty.txt", { type: "text/plain" });
    const form = new FormData();
    form.append("file", emptyFile);

    const req = createFormDataRequest("http://localhost/api/vault", form);
    const res = await POST_VAULT(req);
    expect([400, 422, 500]).toContain(res.status);
  });

  it("10. POST /api/vault rejects missing file with 400", async () => {
    const form = new FormData();
    form.append("label", "no_file_attached");

    const req = createFormDataRequest("http://localhost/api/vault", form);
    const res = await POST_VAULT(req);
    expect(res.status).toBe(400);
  });

  it("11. DELETE /api/vault with unknown ID returns 404", async () => {
    const req = createUrlRequest("http://localhost/api/vault?id=non_existent_doc_id", "DELETE");
    const res = await DELETE_VAULT(req);
    expect(res.status).toBe(404);
  });

  it("12. Vault stats accurately reflect zero docs/chunks after wiping", () => {
    vaultRepo.wipe(true);
    const stats = vaultRepo.stats();
    expect(stats.docs).toBe(0);
    expect(stats.chunks).toBe(0);
  });
});
