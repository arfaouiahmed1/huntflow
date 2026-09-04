import { describe, expect, it, vi } from "vitest";

vi.mock("pdf-parse", () => {
  throw new Error("pdf-parse must not load during vault module initialization");
});
vi.mock("mammoth", () => {
  throw new Error("mammoth must not load during vault module initialization");
});

describe("vault module initialization", () => {
  it("does not eagerly load document parsers needed only for uploads", async () => {
    const { extractText } = await import("@/lib/vault/extract");

    await expect(extractText(Buffer.from("local evidence"), "text/plain", "notes.txt")).resolves.toBe("local evidence");
  });
});
