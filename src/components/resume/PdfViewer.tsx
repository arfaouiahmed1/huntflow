"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Maximize,
  Minus,
  Plus,
  RotateCcw,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

export interface PdfForwardBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfViewerProps {
  pdfData: ArrayBuffer | null;
  token: string | null;
  latencyMs: number | null;
  pdfState: "idle" | "compiling" | "ready" | "error";
  pdfError: string | null;
  stale: boolean;
  onDownload: () => void | Promise<void>;
  downloading: boolean;
  onForward: () => Promise<PdfForwardBox | null>;
  onReverse: (page: number, x: number, y: number) => Promise<{ line: number } | null>;
  forwardBusy: boolean;
  reverseBusy: boolean;
  onRevealLine: (line: number) => void;
  compact?: boolean;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export default function PdfViewer({
  pdfData,
  token,
  latencyMs,
  pdfState,
  pdfError,
  stale,
  onDownload,
  downloading,
  onForward,
  onReverse,
  forwardBusy,
  reverseBusy,
  onRevealLine,
  compact = false,
}: PdfViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [docGen, setDocGen] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [forwardBox, setForwardBox] = useState<{
    page: number;
    leftPct: number;
    topPct: number;
    widthPct: number;
    heightPct: number;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const baseSizes = useRef<Record<number, { width: number; height: number }>>({});
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const highlightTimer = useRef<number | null>(null);

  // Load the document whenever the bytes change; destroy the old one.
  useEffect(() => {
    if (!pdfData) {
      docRef.current = null;
      baseSizes.current = {};
      setNumPages(0);
      setCurrentPage(1);
      setForwardBox(null);
      setRenderError(null);
      return;
    }
    let cancelled = false;
    let task: pdfjsLib.PDFDocumentLoadingTask | null = null;
    (async () => {
      try {
        task = pdfjsLib.getDocument({ data: pdfData.slice(0) });
        const doc = await task.promise;
        if (cancelled) {
          void task.destroy();
          return;
        }
        docRef.current = doc;
        baseSizes.current = {};
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setForwardBox(null);
        setRenderError(null);
        setDocGen((g) => g + 1);
      } catch (err) {
        if (!cancelled) {
          setRenderError(err instanceof Error ? err.message : "Failed to load the compiled PDF.");
        }
      }
    })();
    return () => {
      cancelled = true;
      docRef.current = null;
      if (task) void task.destroy();
    };
  }, [pdfData]);

  // Render every page (a resume is 1-3 pages — no virtualization).
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || numPages === 0) return;
    let cancelled = false;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    (async () => {
      for (let n = 1; n <= numPages; n += 1) {
        if (cancelled) break;
        const canvas = canvasRefs.current[n - 1];
        if (!canvas) continue;
        try {
          const page = await doc.getPage(n);
          if (cancelled) break;
          const base = page.getViewport({ scale: 1 });
          baseSizes.current[n] = { width: base.width, height: base.height };
          const viewport = page.getViewport({ scale: zoom * dpr });
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, canvas, viewport }).promise;
        } catch {
          // Keep rendering the remaining pages.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docGen, numPages, zoom]);

  // Track the top-visible page for the indicator + reverse SyncTeX.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || numPages === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let best: { page: number; ratio: number } | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const page = Number((entry.target as HTMLElement).dataset.page ?? 0);
          if (!page) continue;
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { page, ratio: entry.intersectionRatio };
          }
        }
        if (best) setCurrentPage(best.page);
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    pageRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [numPages, docGen]);

  useEffect(
    () => () => {
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    },
    []
  );

  const visiblePage = numPages === 0 ? 0 : Math.min(Math.max(currentPage, 1), numPages);

  const scrollToPage = (page: number) => {
    const clamped = Math.min(Math.max(page, 1), numPages);
    pageRefs.current[clamped - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setCurrentPage(clamped);
  };
  const fitWidth = () => {
    const container = scrollRef.current;
    const base = baseSizes.current[visiblePage] ?? baseSizes.current[1];
    if (!container || !base || base.width <= 0) return;
    const available = container.clientWidth - 32;
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, available / base.width)));
  };

  const handleForward = async () => {
    const result = await onForward();
    if (!result) return;
    const base = baseSizes.current[result.page];
    scrollToPage(result.page);
    if (base && base.width > 0 && base.height > 0) {
      setForwardBox({
        page: result.page,
        leftPct: (result.x / base.width) * 100,
        topPct: (result.y / base.height) * 100,
        widthPct: (result.width / base.width) * 100,
        heightPct: (result.height / base.height) * 100,
      });
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
      highlightTimer.current = window.setTimeout(() => setForwardBox(null), 2800);
    }
  };

  const handleReverse = async () => {
    const base = baseSizes.current[visiblePage];
    const x = base ? base.width / 2 : 0;
    const y = base ? base.height / 2 : 0;
    const result = await onReverse(visiblePage || 1, x, y);
    if (result) onRevealLine(result.line);
  };

  if (pdfState === "compiling" && !pdfData) {
    return (
      <div
        data-testid="compiled-pdf-loading"
        className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--ink-card)] px-4 py-4 text-sm text-[var(--paper)] shadow-sm"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--chartreuse)]/12 ring-1 ring-[var(--chartreuse)]/20">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--chartreuse)]" />
        </span>
        <span className="flex flex-col">
          <span className="text-xs font-semibold tracking-tight">Compiling LaTeX — building PDF…</span>
          <span className="text-dim text-[11px]">Typesetting with pdflatex · SyncTeX enabled</span>
        </span>
      </div>
    );
  }

  if (pdfState === "error") {
    return (
      <div
        data-testid="pdf-error"
        className="flex items-start gap-2.5 rounded-xl border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-4 py-3 text-[11px] leading-relaxed text-[var(--paper)] shadow-sm"
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--coral)]" />
        <span>Compile failed: {pdfError ?? "Unknown error."}</span>
      </div>
    );
  }

  if (!pdfData) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--ink-card)] px-4 py-3 text-[11px] leading-relaxed text-[var(--paper)] shadow-sm">
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--chartreuse)]" />
        <span>
          <strong>No compiled preview yet</strong> —{" "}
          {pdfState === "idle"
            ? "press Recompile to typeset the current .tex buffer."
            : "waiting for the compiler to finish."}{" "}
          Compile requires local TeX — install TeX Live or MiKTeX and press “Recompile” to see the real
          compiled output here.
        </span>
      </div>
    );
  }

  const iconBtn =
    "grid h-7 w-7 place-items-center rounded-lg text-[var(--paper)] transition-colors hover:bg-[var(--ink-soft)] disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <section
      data-testid="compiled-pdf"
      aria-label="Compiled PDF preview"
      title={token ? `Compiled PDF (build ${token.slice(0, 8)})` : "Compiled PDF preview"}
      className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--ink-card)] text-[var(--paper)] shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 border-b border-[var(--line)] px-3 py-2">
        <button type="button" aria-label="Previous page" title="Previous page" className={iconBtn} onClick={() => scrollToPage(visiblePage - 1)} disabled={numPages < 2 || visiblePage <= 1}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-14 text-center text-[11px] tabular-nums" aria-live="polite">
          {visiblePage} / {numPages}
        </span>
        <button type="button" aria-label="Next page" title="Next page" className={iconBtn} onClick={() => scrollToPage(visiblePage + 1)} disabled={numPages < 2 || visiblePage >= numPages}>
          <ChevronRight className="h-4 w-4" />
        </button>

        <span className="mx-1 h-4 w-px bg-[var(--line)]" aria-hidden="true" />

        <button type="button" aria-label="Zoom out" title="Zoom out" className={iconBtn} onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100))} disabled={zoom <= MIN_ZOOM}>
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-12 text-center text-[11px] tabular-nums" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <button type="button" aria-label="Zoom in" title="Zoom in" className={iconBtn} onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100))} disabled={zoom >= MAX_ZOOM}>
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Fit width" title="Fit width" className={iconBtn} onClick={fitWidth}>
          <Maximize className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Reset zoom" title="Reset zoom" className={iconBtn} onClick={() => setZoom(1)} disabled={zoom === 1}>
          <RotateCcw className="h-3.5 w-3.5" />
        </button>

        {!compact && (
          <>
            <span className="mx-1 h-4 w-px bg-[var(--line)]" aria-hidden="true" />
            <button
              type="button"
              title="Jump to PDF"
              aria-label="Jump to PDF"
              onClick={() => void handleForward()}
              disabled={forwardBusy}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--ink-soft)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Jump to PDF
            </button>
            <button
              type="button"
              title="Jump to source"
              aria-label="Jump to source"
              onClick={() => void handleReverse()}
              disabled={reverseBusy}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--ink-soft)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Jump to source
            </button>
          </>
        )}

        <span className="flex-1" />

        {!compact && pdfState === "compiling" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--chartreuse)]/12 px-2 py-0.5 text-[10px] font-semibold text-[var(--chartreuse)] ring-1 ring-[var(--chartreuse)]/20">
            <Loader2 className="h-3 w-3 animate-spin" /> Compiling…
          </span>
        )}
        {!compact && latencyMs !== null && (
          <span className="text-dim inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] tabular-nums" title="Last compile latency">
            <Zap className="h-3 w-3" />
            {latencyMs} ms
          </span>
        )}
        {!compact && stale && (
          <span className="rounded-full bg-[var(--amber)]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--amber)] ring-1 ring-[var(--amber)]/30">
            Stale — recompile
          </span>
        )}
        {renderError && (
          <span className="inline-flex items-center gap-1 text-[10px] text-[var(--coral)]" title={renderError}>
            <AlertTriangle className="h-3 w-3" /> Render issue
          </span>
        )}

        <button
          type="button"
          aria-label="Download PDF"
          title="Download PDF"
          onClick={() => void onDownload()}
          disabled={downloading}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-[var(--chartreuse)]/15 px-2.5 text-[11px] font-semibold text-[var(--chartreuse)] ring-1 ring-[var(--chartreuse)]/25 transition-colors hover:bg-[var(--chartreuse)]/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download
        </button>
      </div>
      <div ref={scrollRef} className="max-h-[820px] min-h-[320px] flex-1 overflow-y-auto bg-[var(--ink-deep)] p-4">
        <div data-testid="compiled-pdf-frame" className="mx-auto w-full max-w-[820px]">
          {numPages === 0 && !renderError && (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-[var(--paper)]">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--chartreuse)]" />
              Loading PDF…
            </div>
          )}
          {Array.from({ length: numPages }, (_, i) => i + 1).map((page) => (
            <div
              key={`${docGen}-${page}`}
              ref={(el) => {
                pageRefs.current[page - 1] = el;
              }}
              data-page={page}
              className={cn("relative mb-4 w-full scroll-mt-4 last:mb-0")}
            >
              <canvas
                ref={(el) => {
                  canvasRefs.current[page - 1] = el;
                }}
                className="block w-full rounded-lg bg-white shadow-lg"
              />
              {forwardBox?.page === page && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute rounded-sm bg-[var(--chartreuse)]/30 ring-2 ring-[var(--chartreuse)]"
                  style={{
                    left: `${forwardBox.leftPct}%`,
                    top: `${forwardBox.topPct}%`,
                    width: `${Math.max(forwardBox.widthPct, 1)}%`,
                    height: `${Math.max(forwardBox.heightPct, 0.5)}%`,
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
