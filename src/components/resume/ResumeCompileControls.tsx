"use client";

import { Download, FileCode, FileText, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" data-testid="compile-preview" onClick={onCompilePreview} loading={busy} className="bg-white/80 border-black/10 text-neutral-700 hover:bg-white text-xs" disabled={noTex}>
          <Download className="h-3.5 w-3.5" /> {busy ? "Compiling…" : "Compile PDF preview"}
        </Button>
        <Button size="sm" variant="outline" data-testid="compile-synctex" onClick={onCompileSynctex} className="bg-white/80 border-black/10 text-neutral-700 hover:bg-white text-xs">
          <FileCode className="h-3.5 w-3.5" /> Compile for SyncTeX
        </Button>
        <Button size="sm" variant="ghost" data-testid="diff-toggle" onClick={onToggleDiff} className="text-xs">
          <FileText className="h-3.5 w-3.5" /> {diffCollapsed ? "Show diff" : "Hide diff"}
        </Button>
        <Button size="sm" variant="ghost" data-testid="pin-baseline" onClick={onPinBaseline} className="text-xs">Pin baseline</Button>
        {changedSections.length > 0 && <span className="font-mono text-[10px] text-neutral-600">changed: {changedSections.join(", ")}</span>}
      </div>
      {noTex && (
        <div data-testid="tex-unavailable" className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> TeX unavailable — HTML fallback is shown. Install a local TeX distribution to enable PDF compilation.
        </div>
      )}
    </div>
  );
}
