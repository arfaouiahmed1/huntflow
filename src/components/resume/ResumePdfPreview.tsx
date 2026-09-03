"use client";

import { FileCheck2, Download, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import SynctexViewer from "./SynctexViewer";

type PdfState = "idle" | "compiling" | "ready" | "no-tex" | "error";
interface Props {
  pdfUrl: string | null;
  pdfState: PdfState;
  pdfError: string | null;
  compiledTex: string | null;
  latexSource: string;
  compileToken: string | null;
  targetLine?: number | null;
  highlightBlock?: string | null;
  onForward?: (r: { page: number; x: number; y: number }) => void;
  onReverse?: (r: { line: number; column: number }) => void;
}

export default function ResumePdfPreview({
  pdfUrl,
  pdfState,
  pdfError,
  compiledTex,
  latexSource,
  compileToken,
  targetLine,
  highlightBlock,
  onForward,
  onReverse,
}: Props) {
  if (pdfState === "compiling") {
    return (
      <div
        data-testid="compiled-pdf-loading"
        className="mx-auto mt-5 flex w-[calc(100%-2rem)] max-w-[900px] items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--ink-card)] px-4 py-4 text-sm text-[var(--paper)] shadow-sm"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--chartreuse)]/12 ring-1 ring-[var(--chartreuse)]/20">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--chartreuse)]" />
        </span>
        <span className="flex flex-col">
          <span className="text-xs font-semibold tracking-tight">Compiling LaTeX — building PDF…</span>
          <span className="text-[11px] text-dim">Typesetting with pdflatex · SyncTeX enabled</span>
        </span>
      </div>
    );
  }
  if (pdfState === "no-tex") {
    return (
      <div
        data-testid="no-tex-banner"
        className="mx-auto mt-5 flex w-[calc(100%-2rem)] max-w-[900px] items-start gap-2.5 rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-900 shadow-sm sm:w-[calc(100%-4rem)]"
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
        <span>
          <strong>Compile requires local TeX</strong> — showing the HTML approximation below. Install TeX Live or MiKTeX and press
          “Compile PDF preview” to see the real compiled output here.
        </span>
      </div>
    );
  }
  if (pdfState === "error") {
    return (
      <div
        data-testid="pdf-error"
        className="mx-auto mt-5 flex w-[calc(100%-2rem)] max-w-[900px] items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[11px] leading-relaxed text-red-900 shadow-sm sm:w-[calc(100%-4rem)]"
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
        <span>Compile failed: {pdfError}</span>
      </div>
    );
  }
  if (!pdfUrl) return null;
  const stale = compiledTex !== null && compiledTex !== latexSource;
  return (
    <section
      data-testid="compiled-pdf"
      className={cn(
        "mx-auto mt-2 w-[calc(100%-2rem)] max-w-[900px] shrink-0 overflow-hidden rounded-2xl border bg-white shadow-[0_18px_60px_rgba(0,0,0,0.22),0_1px_0_rgba(0,0,0,0.06)] sm:w-[calc(100%-4rem)]",
        "border-neutral-200"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50/70 px-4 py-2.5 backdrop-blur">
        <p className="flex items-center gap-2.5 text-[11px] font-bold tracking-tight text-neutral-800">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-600 text-white shadow-sm">
            <FileCheck2 className="h-3.5 w-3.5" />
          </span>
          Compiled PDF — typography source of truth
          {stale && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-200">
              stale — recompile
            </span>
          )}
        </p>
        <a
          href={compileToken ? `/api/resume/compile?token=${compileToken}&save=1` : pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
        >
          <Download className="h-3 w-3" /> Download PDF <ExternalLink className="h-3 w-3 opacity-60" />
        </a>
      </div>
      <SynctexViewer
        token={compileToken}
        targetLine={targetLine ?? 1}
        highlightBlock={highlightBlock ?? null}
        onForwardResult={onForward}
        onReverseResult={onReverse}
      />
      <iframe src={pdfUrl} title="Compiled resume PDF" data-testid="compiled-pdf-frame" className="h-[860px] w-full bg-white" />
    </section>
  );
}
