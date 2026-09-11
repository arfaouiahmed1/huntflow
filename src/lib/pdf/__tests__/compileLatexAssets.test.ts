import { describe, it, expect } from "vitest";
import { DEFAULT_AVATAR_PNG_BASE64, isValidPngBuffer } from "@/lib/pdf/compileLatex";

describe("compileLatex photo asset handling", () => {
  it("DEFAULT_AVATAR_PNG_BASE64 decodes to a valid PNG with IHDR and IEND", () => {
    const buf = Buffer.from(DEFAULT_AVATAR_PNG_BASE64, "base64");
    expect(buf.length).toBeGreaterThanOrEqual(24);

    // PNG signature: \x89PNG\r\n\x1a\n
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // P
    expect(buf[2]).toBe(0x4e); // N
    expect(buf[3]).toBe(0x47); // G
    expect(buf[4]).toBe(0x0d); // \r
    expect(buf[5]).toBe(0x0a); // \n
    expect(buf[6]).toBe(0x1a); // \x1a
    expect(buf[7]).toBe(0x0a); // \n

    // IHDR chunk
    expect(buf.subarray(12, 16).toString("ascii")).toBe("IHDR");

    // Width & Height are 1x1
    expect(buf.readUInt32BE(16)).toBe(1);
    expect(buf.readUInt32BE(20)).toBe(1);

    // Valid PNG checker returns true
    expect(isValidPngBuffer(buf)).toBe(true);
  });

  it("isValidPngBuffer rejects invalid or corrupted buffers", () => {
    expect(isValidPngBuffer(Buffer.from([]))).toBe(false);
    expect(isValidPngBuffer(Buffer.from("not a png file at all"))).toBe(false);
    expect(isValidPngBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]))).toBe(false);
  });
});
