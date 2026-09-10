"use client";

/**
 * Real PDF viewer for the Studio (react-pdf / pdf.js).
 *
 * This is what makes SyncTeX navigation genuine: every rendered page is
 * a measured box, so a click maps to a true PDF point (points, y from
 * top) for reverse sync, and a forward-sync result maps back to a
 * visible highlight. No hardcoded coordinates anywhere.
 *
 * Worker loads same-origin from /pdf/pdf.worker.min.mjs (postinstall
 * copies the version-pinned bundle) — offline-safe, no CDN.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { AlertTriangle, Loader2, MousePointerClick, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { cssPercentFromPdfPoint, pdfPointFromClick } from "@/lib/synctexView";
import type { PdfPageDims } from "@/lib/synctexView";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";

export interface ForwardMark {
  page: number;
  x: number;
  y: number;
  nonce: number;
}

interface PdfDocumentHandle {
  numPages: number;
  getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number } }>;
}

interface ResumePdfViewerProps {
  file: string;
  token: string | null;
  forwardMark: ForwardMark | null;
  pickReverse: boolean;
  onReversePick: (page: number, x: number, y: number) => void;
  onReverseDisabledClick: () => void;
}

const BASE_SCALE = 1.35;

export default function ResumePdfViewer({
  file,
  token,
  forwardMark,
  pickReverse,
  onReversePick,
  onReverseDisabledClick,
}: ResumePdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [dims, setDims] = useState<Record<number, PdfPageDims>>({});
  const [docError, setDocError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [hiddenNonce, setHiddenNonce] = useState<number | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement>>({});

  const onDocumentLoad = useCallback(async (pdf: PdfDocumentHandle) => {
    setNumPages(pdf.numPages);
    setDocError(null);
    const next: Record<number, PdfPageDims> = {};
    for (let n = 1; n <= pdf.numPages; n += 1) {
      try {
        const page = await pdf.getPage(n);
        const vp = page.getViewport({ scale: 1 });
        next[n] = { widthPt: vp.width, heightPt: vp.height };
      } catch {
        /* keep rendering without dims for this page */
      }
    }
    setDims(next);
  }, []);

  // Forward mark: scroll the target page into view and auto-hide the
  // marker after 2.6s. Only the scroll runs synchronously in the effect;
  // the hide fires from the timer callback.
  useEffect(() => {
    if (!forwardMark) return;
    pageRefs.current[forwardMark.page]?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setHiddenNonce(forwardMark.nonce), 2600);
    return () => clearTimeout(t);
  }, [forwardMark]);

  const handlePageClick = useCallback(
    (pageNumber: number) => (e: MouseEvent<HTMLDivElement>) => {
      if (!pickReverse) return;
      if (!token) {
        onReverseDisabledClick();
        return;
      }
      const dim = dims[pageNumber];
      if (!dim) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pt = pdfPointFromClick(
        { width: rect.width, height: rect.height },
        dim,
        e.clientX - rect.left,
        e.clientY - rect.top,
        pageNumber
      );
      onReversePick(pt.page, pt.x, pt.y);
    },
    [pickReverse, token, dims, onReversePick, onReverseDisabledClick]
  );

  const scale = (zoom / 100) * BASE_SCALE;

  return (
    <div className="w-full" data-testid="pdf-viewer">
      <div className="mx-auto flex max-w-[900px] flex-wrap items-center gap-2 px-1 pb-2">
        <div className="flex items-center gap-1 rounded-xl border border-[var(--line)] bg-black/40 px-1.5 py-1 shadow-inner">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(z - 10, 50))}
            aria-label="Zoom out PDF"
            className="grid h-11 w-11 place-items-center rounded-md text-dim transition-colors hover:bg-white/[0.06] hover:text-[var(--paper)]"
          >
            <ZoomOut className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span
            aria-live="polite"
            className="min-w-[44px] text-center font-mono text-[11px] font-semibold tabular-nums text-[var(--paper)]"
          >
            {zoom}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(z + 10, 200))}
            aria-label="Zoom in PDF"
            className="grid h-11 w-11 place-items-center rounded-md text-dim transition-colors hover:bg-white/[0.06] hover:text-[var(--paper)]"
          >
            <ZoomIn className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setZoom(100)}
            aria-label="Reset PDF zoom to 100 percent"
            className="grid h-11 w-11 place-items-center rounded-md text-dim transition-colors hover:bg-white/[0.06] hover:text-[var(--paper)]"
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
          </button>
        </div>
        <span className="font-mono text-[10px] text-dim" aria-live="polite">
          {numPages ? `${numPages} page${numPages === 1 ? "" : "s"}` : "Loading PDF…"}
        </span>
        {pickReverse && (
          <span
            role="status"
            className="flex items-center gap-1.5 rounded-full border border-[var(--sky)]/30 bg-[var(--sky)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--sky)]"
          >
            <MousePointerClick className="h-3 w-3" aria-hidden /> Click the PDF to jump to source
          </span>
        )}
      </div>

      <Document
        file={file}
        onLoadSuccess={onDocumentLoad}
        onLoadError={(err: Error) => setDocError(err?.message || "Could not render this PDF.")}
        loading={
          <div
            data-testid="pdf-viewer-loading"
            className="mx-auto flex max-w-[900px] items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--ink-card)] px-4 py-6 text-sm text-[var(--paper)]"
          >
            <Loader2 className="h-4 w-4 animate-spin text-[var(--chartreuse)]" aria-hidden />
            <span className="text-xs">Rendering PDF pages…</span>
          </div>
        }
        error={
          <div
            data-testid="pdf-viewer-error"
            className="mx-auto flex max-w-[900px] items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[11px] leading-relaxed text-red-900"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden />
            <span>PDF render failed{docError ? `: ${docError}` : "."} Recompile to regenerate the artifact.</span>
          </div>
        }
        className="flex flex-col items-center gap-4"
      >
        {numPages !== null &&
          Array.from({ length: numPages }, (_, i) => i + 1).map((pageNumber) => {
            const dim = dims[pageNumber];
            const mark =
              forwardMark && forwardMark.page === pageNumber && dim && hiddenNonce !== forwardMark.nonce
                ? cssPercentFromPdfPoint(dim, forwardMark.x, forwardMark.y)
                : null;
            return (
              <div
                key={`${file}-p${pageNumber}`}
                ref={(el) => {
                  if (el) pageRefs.current[pageNumber] = el;
                  else delete pageRefs.current[pageNumber];
                }}
                data-testid={`pdf-page-${pageNumber}`}
                data-page={pageNumber}
                onClick={handlePageClick(pageNumber)}
                className={cn(
                  "relative overflow-hidden rounded-[3px] bg-white shadow-[0_18px_60px_rgba(0,0,0,0.22)] ring-1 ring-neutral-200",
                  pickReverse && "cursor-crosshair"
                )}
                title={pickReverse ? `Click to reverse-sync from page ${pageNumber}` : undefined}
              >
                <Page pageNumber={pageNumber} scale={scale} renderTextLayer renderAnnotationLayer={false} />
                {mark && (
                  <div
                    data-testid="forward-mark"
                    aria-hidden
                    className="pointer-events-none absolute h-6 w-8 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded border-2 border-[var(--chartreuse)] bg-[var(--chartreuse)]/25"
                    style={{ left: mark.left, top: mark.top }}
                  />
                )}
              </div>
            );
          })}
      </Document>
    </div>
  );
}
