"use client";

import { Download, FileCode, FileText, AlertTriangle, GitCompare, Pin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type PdfState = "idle" | "compiling" | "ready" | "no-tex" | "error";

interface Props {
  pdfState: PdfState;
  diffCollapsed: boolean;
  changedSections: string[];
  onCompilePreview: () => void;
  onCompileSynctex: () => void;
  onToggleDiff: () => void;
  onPinBaseline: () => void;
}

export default function ResumeCompileControls({
  pdfState,
  diffCollapsed,
  changedSections,
  onCompilePreview,
  onCompileSynctex,
  onToggleDiff,
  onPinBaseline,
}: Props) {
  const busy = pdfState === "compiling";
  const noTex = pdfState === "no-tex";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          data-testid="compile-preview"
          onClick={onCompilePreview}
          loading={busy}
          disabled={noTex}
          className={cn(
            "border-[var(--line)] bg-white/[0.04] text-[var(--paper)] hover:bg-white/[0.08] hover:border-[var(--chartreuse)]/30 text-xs",
            noTex && "opacity-50"
          )}
        >
          <Download className="h-3.5 w-3.5" /> {busy ? "Compiling…" : "Compile PDF preview"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          data-testid="compile-synctex"
          onClick={onCompileSynctex}
          className="text-xs text-dim hover:text-[var(--paper)] hover:bg-white/[0.06]"
        >
          <FileCode className="h-3.5 w-3.5" /> Compile for SyncTeX
        </Button>
        <span className="mx-0.5 hidden h-4 w-px bg-[var(--line)] sm:inline-block" aria-hidden />
        <Button
          size="sm"
          variant="ghost"
          data-testid="diff-toggle"
          onClick={onToggleDiff}
          className="text-xs text-dim hover:text-[var(--paper)]"
        >
          <GitCompare className="h-3.5 w-3.5" /> {diffCollapsed ? "Show diff" : "Hide diff"}
        </Button>
        <Button size="sm" variant="ghost" data-testid="pin-baseline" onClick={onPinBaseline} className="text-xs text-dim">
          <Pin className="h-3.5 w-3.5" /> Pin baseline
        </Button>
        {changedSections.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--chartreuse)]">
            <FileText className="h-3 w-3" /> changed: {changedSections.join(", ")}
          </span>
        )}
      </div>
      {noTex && (
        <div
          data-testid="tex-unavailable"
          className="flex items-center gap-2 rounded-xl border border-amber-300/40 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 shadow-sm"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" /> TeX unavailable — HTML fallback is shown. Install a local
          TeX distribution to enable PDF compilation.
        </div>
      )}
    </div>
  );
}
