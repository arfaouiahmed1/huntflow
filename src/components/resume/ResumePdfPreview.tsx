"use client";

import { FileCheck2, Download, AlertTriangle, Loader2 } from "lucide-react";
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
      <div data-testid="compiled-pdf-loading" className="mx-auto mt-5 flex w-[calc(100%-2rem)] max-w-[900px] items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-4 text-sm text-neutral-700 sm:w-[calc(100%-4rem)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Compiling LaTeX — building PDF…
      </div>
    );
  }
  if (pdfState === "no-tex") {
    return (
      <div data-testid="no-tex-banner" className="mx-auto mt-5 flex w-[calc(100%-2rem)] max-w-[900px] items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-900 sm:w-[calc(100%-4rem)]">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span><strong>Compile requires local TeX</strong> — using the HTML approximation below. Install TeX Live or MiKTeX and press “Compile PDF preview” to see the real compiled output here.</span>
      </div>
    );
  }
  if (pdfState === "error") {
    return (
      <div data-testid="pdf-error" className="mx-auto mt-5 flex w-[calc(100%-2rem)] max-w-[900px] items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[11px] leading-relaxed text-red-900 sm:w-[calc(100%-4rem)]">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Compile failed: {pdfError}</span>
      </div>
    );
  }
  if (!pdfUrl) return null;
  const stale = compiledTex !== null && compiledTex !== latexSource;
  return (
    <section data-testid="compiled-pdf" className="mx-auto mt-5 w-[calc(100%-2rem)] max-w-[900px] shrink-0 overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.25)] sm:w-[calc(100%-4rem)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 bg-white px-4 py-2">
        <p className="flex items-center gap-2 text-[11px] font-bold text-neutral-800">
          <FileCheck2 className="h-3.5 w-3.5 text-emerald-700" /> Compiled PDF — typography source of truth
          {stale && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800">stale — recompile</span>}
        </p>
        <a href={compileToken ? `/api/resume/compile?token=${compileToken}&save=1` : pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-semibold text-neutral-600 hover:text-neutral-900">
          <Download className="h-3 w-3" /> Download PDF
        </a>
      </div>
      <SynctexViewer token={compileToken} targetLine={targetLine ?? 1} highlightBlock={highlightBlock ?? null} onForwardResult={onForward} onReverseResult={onReverse} />
      <iframe src={pdfUrl} title="Compiled resume PDF" data-testid="compiled-pdf-frame" className="h-[860px] w-full bg-white" />
    </section>
  );
}
