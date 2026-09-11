"use client";

import { forwardRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Crosshair, FileCode, Loader2 } from "lucide-react";
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
  reversePage?: number;
  reverseX?: number;
  reverseY?: number;
}

const SynctexViewer = forwardRef<HTMLDivElement, SynctexViewerProps>(
  ({ token, className, highlightBlock, onForwardResult, onReverseResult, onHighlightRequest, targetLine, reversePage, reverseX, reverseY }, ref) => {
    const [forwardBusy, setForwardBusy] = useState(false);
    const [reverseBusy, setReverseBusy] = useState(false);
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
      setReverseBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/resume/synctex/reverse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, page: reversePage ?? 1, x: reverseX ?? 72, y: reverseY ?? 144 }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error?.message || data.error || "SyncTeX reverse failed");
        const r: SynctexReverseResult = { line: data.line, column: data.column };
        onReverseResult?.(r);
        if (r.line) onHighlightRequest?.(r.line);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Reverse sync failed");
      } finally {
        setReverseBusy(false);
      }
    }, [token, onReverseResult, onHighlightRequest, reversePage, reverseX, reverseY]);

    return (
      <div ref={ref} data-testid="synctex-viewer" className={cn("flex items-center gap-1.5", className)}>
        <Button
          size="sm"
          variant="ghost"
          data-testid="synctex-forward"
          onClick={handleForward}
          disabled={forwardBusy || !token}
          title={token ? `Forward sync line ${targetLine ?? 1} → PDF` : "Compile first"}
          className="h-7 px-2 text-[11px] text-dim hover:text-[var(--paper)]"
        >
          {forwardBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crosshair className="h-3 w-3" />}
          <span>Jump to PDF</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          data-testid="synctex-reverse"
          onClick={handleReverse}
          disabled={reverseBusy || !token}
          title={token ? "Reverse sync PDF → source" : "Compile first"}
          className="h-7 px-2 text-[11px] text-dim hover:text-[var(--paper)]"
        >
          {reverseBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCode className="h-3 w-3" />}
          <span>Jump to source</span>
        </Button>
        {highlightBlock && (
          <span className="hidden rounded-full border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 px-2 py-0.5 font-mono text-[10px] text-[var(--chartreuse)] xl:inline">
            {highlightBlock}
          </span>
        )}
        {error && (
          <span data-testid="synctex-error" role="alert" className="truncate text-[11px] text-[var(--coral)]" title={error}>
            {error}
          </span>
        )}
      </div>
    );
  }
);
SynctexViewer.displayName = "SynctexViewer";

export default SynctexViewer;
