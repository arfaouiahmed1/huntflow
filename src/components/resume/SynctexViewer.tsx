"use client";

import { forwardRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Crosshair, FileCode, ArrowLeftRight, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type SynctexForwardResult = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SynctexReverseResult = {
  line: number;
  column: number;
};

interface SynctexViewerProps {
  token: string | null;
  className?: string;
  highlightBlock?: string | null;
  onForwardResult?: (res: SynctexForwardResult) => void;
  onReverseResult?: (res: SynctexReverseResult) => void;
  onHighlightRequest?: (line: number) => void;
  /** Line to forward-sync (typically first changed line). */
  targetLine?: number | null;
}

const SynctexViewer = forwardRef<HTMLDivElement, SynctexViewerProps>(
  ({ token, className, highlightBlock, onForwardResult, onReverseResult, onHighlightRequest, targetLine }, ref) => {
    const [forwardBusy, setForwardBusy] = useState(false);
    const [reverseBusy, setReverseBusy] = useState(false);
    const [forwardRes, setForwardRes] = useState<SynctexForwardResult | null>(null);
    const [reverseRes, setReverseRes] = useState<SynctexReverseResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleForward = useCallback(async () => {
      if (!token) {
        setError("Compile first to enable SyncTeX — no build token yet.");
        return;
      }
      const line = targetLine && targetLine > 0 ? targetLine : 1;
      setForwardBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/resume/synctex/forward", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, line, column: 0 }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error?.message || data.error || "SyncTeX forward failed");
        const r: SynctexForwardResult = { page: data.page, x: data.x, y: data.y, width: data.width, height: data.height };
        setForwardRes(r);
        onForwardResult?.(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Forward sync failed");
      } finally {
        setForwardBusy(false);
      }
    }, [token, targetLine, onForwardResult]);

    const handleReverse = useCallback(async () => {
      if (!token) {
        setError("Compile first to enable SyncTeX — no build token yet.");
        return;
      }
      // Reverse from center of page 1 — representative hit; user can click preview for precise pos
      setReverseBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/resume/synctex/reverse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, page: 1, x: 72, y: 144 }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error?.message || data.error || "SyncTeX reverse failed");
        const r: SynctexReverseResult = { line: data.line, column: data.column };
        setReverseRes(r);
        onReverseResult?.(r);
        if (r.line) onHighlightRequest?.(r.line);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Reverse sync failed");
      } finally {
        setReverseBusy(false);
      }
    }, [token, onReverseResult, onHighlightRequest]);

    return (
      <div
        ref={ref}
        data-testid="synctex-viewer"
        className={cn("rounded-xl border border-[var(--line)] bg-black/30 p-3", className)}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--paper)]">
            <ArrowLeftRight className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
            <span>SyncTeX</span>
            {highlightBlock && (
              <span className="ml-1 rounded-full border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 px-2 py-0.5 font-mono text-[10px] text-[var(--chartreuse)]">
                {highlightBlock}
              </span>
            )}
          </div>
          <span className="font-mono text-[10px] text-dim flex items-center gap-1">
            <MapPin className="h-3 w-3" /> forward | reverse
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            data-testid="synctex-forward"
            onClick={handleForward}
            disabled={forwardBusy}
            title={token ? `Forward sync line ${targetLine ?? 1} → PDF` : "Compile first"}
            className="gap-1.5"
          >
            {forwardBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
            <span>Jump to PDF</span>
            <span className="hidden font-mono text-[10px] opacity-60 sm:inline">forward</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            data-testid="synctex-reverse"
            onClick={handleReverse}
            disabled={reverseBusy}
            title={token ? "Reverse sync PDF → source" : "Compile first"}
            className="gap-1.5"
          >
            {reverseBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCode className="h-3.5 w-3.5" />}
            <span>Jump to source</span>
            <span className="hidden font-mono text-[10px] opacity-60 sm:inline">reverse</span>
          </Button>
        </div>

        {(forwardRes || reverseRes) && (
          <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[10px] leading-relaxed">
            {forwardRes && (
              <div
                data-testid="synctex-forward-result"
                className="rounded-lg border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 px-2 py-1.5 text-[var(--chartreuse)]"
              >
                <div className="font-bold text-[var(--chartreuse)]">forward → page {forwardRes.page}</div>
                <div>
                  x {forwardRes.x.toFixed(1)} · y {forwardRes.y.toFixed(1)}
                </div>
              </div>
            )}
            {reverseRes && (
              <div
                data-testid="synctex-reverse-result"
                className="rounded-lg border border-[var(--sky)]/30 bg-[var(--sky)]/10 px-2 py-1.5 text-[var(--sky)]"
              >
                <div className="font-bold">reverse → line {reverseRes.line}</div>
                <div>col {reverseRes.column}</div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div data-testid="synctex-error" className="mt-2 rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-2 py-1 text-xs text-[var(--coral)]">
            {error}
          </div>
        )}

        {!token && (
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-dim">
            Compile the document to get a SyncTeX token. Forward jumps source line → PDF page; reverse jumps PDF point → source line.
          </p>
        )}
      </div>
    );
  }
);
SynctexViewer.displayName = "SynctexViewer";

export default SynctexViewer;
