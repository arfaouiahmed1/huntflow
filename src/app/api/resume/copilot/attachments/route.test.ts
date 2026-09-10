import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const MINIMAL_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 24 Tf 100 700 Td (Hello attachment) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>`,
  "utf8"
);

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function uploadRequest(files: { name: string; type: string; bytes: Buffer }[]) {
  const form = new FormData();
  for (const f of files) {
    form.append("files", new File([new Uint8Array(f.bytes)], f.name, { type: f.type }));
  }
  return new NextRequest("http://localhost/api/resume/copilot/attachments", { method: "POST", body: form });
}

describe("POST /api/resume/copilot/attachments", () => {
  it("accepts a PDF and returns a descriptor without bytes or text", async () => {
    const res = await POST(uploadRequest([{ name: "cv.pdf", type: "application/pdf", bytes: MINIMAL_PDF }]));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok?: boolean;
      attachments?: { id?: string; kind?: string; chars?: number }[];
    };
    expect(data.ok).toBe(true);
    expect(data.attachments).toHaveLength(1);
    expect(data.attachments?.[0].kind).toBe("pdf");
    expect(typeof data.attachments?.[0].id).toBe("string");
    expect(JSON.stringify(data)).not.toContain("Hello attachment");
    expect(JSON.stringify(data)).not.toContain("base64");
  });

  it("accepts a PNG for the vision path without local extraction", async () => {
    const res = await POST(uploadRequest([{ name: "shot.png", type: "image/png", bytes: TINY_PNG }]));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok?: boolean; attachments?: { kind?: string }[] };
    expect(data.attachments?.[0].kind).toBe("image");
  });

  it("rejects content that does not match its label with 415", async () => {
    const res = await POST(uploadRequest([{ name: "evil.pdf", type: "application/pdf", bytes: TINY_PNG }]));
    expect(res.status).toBe(415);
    const data = (await res.json()) as { error?: { code?: string } };
    expect(data.error?.code).toBe("TYPE_MISMATCH");
  });

  it("rejects unsupported types with 415", async () => {
    const res = await POST(
      uploadRequest([{ name: "notes.exe", type: "application/octet-stream", bytes: Buffer.from("MZ") }])
    );
    expect(res.status).toBe(415);
  });

  it("rejects encrypted PDFs with 422, never attempting extraction", async () => {
    const locked = Buffer.concat([MINIMAL_PDF, Buffer.from(" trailer /Encrypt 6 0 R")]);
    const res = await POST(uploadRequest([{ name: "locked.pdf", type: "application/pdf", bytes: locked }]));
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error?: { code?: string } };
    expect(data.error?.code).toBe("ENCRYPTED_PDF");
  });

  it("rejects oversized files and too many files", async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
    big.write("%PDF-");
    const tooBig = await POST(uploadRequest([{ name: "big.pdf", type: "application/pdf", bytes: big }]));
    expect(tooBig.status).toBe(413);

    const many = await POST(
      uploadRequest([1, 2, 3, 4].map((i) => ({ name: `a${i}.png`, type: "image/png", bytes: TINY_PNG })))
    );
    expect(many.status).toBe(413);
  });

  it("requires the files field", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/resume/copilot/attachments", { method: "POST", body: new FormData() })
    );
    expect(res.status).toBe(400);
  });
});
