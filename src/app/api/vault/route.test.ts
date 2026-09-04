import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ingestDocument: vi.fn(),
  listDocuments: vi.fn(),
  deleteDocument: vi.fn(),
  vaultStats: vi.fn(),
  setDocLabel: vi.fn(),
  setDocEmbedModel: vi.fn(),
}));

vi.mock("@/lib/vault", () => mocks);

import { GET } from "@/app/api/vault/route";

describe("GET /api/vault", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listDocuments.mockReturnValue([]);
    mocks.vaultStats.mockReturnValue({ docs: 0, chunks: 0, bytes: 0 });
  });

  it("preserves the docs + stats response contract", async () => {
    mocks.listDocuments.mockReturnValue([
      {
        id: "doc-1",
        filename: "resume.md",
        mime: "text/markdown",
        size: 12,
        status: "ready",
        embedModel: "local",
        chunkCount: 1,
        label: "resume",
        createdAt: "2026-09-04T00:00:00.000Z",
      },
    ]);
    mocks.vaultStats.mockReturnValue({ docs: 1, chunks: 1, bytes: 12 });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      docs: expect.arrayContaining([expect.objectContaining({ id: "doc-1" })]),
      stats: { docs: 1, chunks: 1, bytes: 12 },
    });
  });

  it("returns a structured JSON error when the database read fails", async () => {
    mocks.listDocuments.mockImplementation(() => {
      throw new Error("vault database unavailable");
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toEqual({
      ok: false,
      error: { code: "Error", message: "vault database unavailable" },
    });
  });
});
