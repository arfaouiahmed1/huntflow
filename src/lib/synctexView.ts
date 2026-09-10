/**
 * SyncTeX <-> PDF.js coordinate math (pure, unit-tested).
 *
 * Units: SyncTeX reports PDF points (1/72in) with y measured from the TOP
 * of the page (see src/lib/pdf/synctex.ts). PDF.js renders pages into
 * CSS-pixel boxes, so mapping is a linear scale in both directions.
 */

export interface CssRect {
  width: number;
  height: number;
}

export interface PdfPageDims {
  /** Page width in PDF points. */
  widthPt: number;
  /** Page height in PDF points. */
  heightPt: number;
}

export interface PdfPoint {
  page: number;
  x: number;
  y: number;
}

/** Click offset (CSS px, from the page box top-left) -> PDF point. Clamped. */
export function pdfPointFromClick(
  rect: CssRect,
  dims: PdfPageDims,
  offsetX: number,
  offsetY: number,
  page: number
): PdfPoint {
  if (!(rect.width > 0) || !(rect.height > 0)) return { page, x: 0, y: 0 };
  const x = Math.min(Math.max((offsetX / rect.width) * dims.widthPt, 0), dims.widthPt);
  const y = Math.min(Math.max((offsetY / rect.height) * dims.heightPt, 0), dims.heightPt);
  return { page, x, y };
}

/** PDF point -> CSS percentages for an overlay marker (y from top). */
export function cssPercentFromPdfPoint(dims: PdfPageDims, x: number, y: number): { left: string; top: string } {
  const left = dims.widthPt > 0 ? Math.min(Math.max((x / dims.widthPt) * 100, 0), 100) : 0;
  const top = dims.heightPt > 0 ? Math.min(Math.max((y / dims.heightPt) * 100, 0), 100) : 0;
  return { left: `${left}%`, top: `${top}%` };
}
