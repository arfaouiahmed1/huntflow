import { describe, it, expect } from "vitest";
import { cssPercentFromPdfPoint, pdfPointFromClick } from "./synctexView";

const DIMS = { widthPt: 600, heightPt: 800 };

describe("pdfPointFromClick", () => {
  it("maps the rendered center to the PDF center", () => {
    const pt = pdfPointFromClick({ width: 300, height: 400 }, DIMS, 150, 200, 2);
    expect(pt).toEqual({ page: 2, x: 300, y: 400 });
  });

  it("maps the top-left corner to the origin (y measured from top)", () => {
    const pt = pdfPointFromClick({ width: 300, height: 400 }, DIMS, 0, 0, 1);
    expect(pt.x).toBe(0);
    expect(pt.y).toBe(0);
  });

  it("clamps out-of-bounds clicks instead of producing wild coordinates", () => {
    const pt = pdfPointFromClick({ width: 300, height: 400 }, DIMS, 9999, -50, 1);
    expect(pt.x).toBe(600);
    expect(pt.y).toBe(0);
  });

  it("returns the origin for a zero-size box instead of NaN", () => {
    const pt = pdfPointFromClick({ width: 0, height: 0 }, DIMS, 10, 10, 1);
    expect(pt).toEqual({ page: 1, x: 0, y: 0 });
    expect(Number.isNaN(pt.x)).toBe(false);
  });
});

describe("cssPercentFromPdfPoint", () => {
  it("converts a PDF point to overlay percentages", () => {
    expect(cssPercentFromPdfPoint(DIMS, 300, 400)).toEqual({ left: "50%", top: "50%" });
  });

  it("clamps wild SyncTeX values into the page box", () => {
    expect(cssPercentFromPdfPoint(DIMS, 9999, -5)).toEqual({ left: "100%", top: "0%" });
  });
});
