"use client";

/**
 * LaTeX source pane: toolbar (save state, cursor, log toggle, Save),
 * Monaco editor, and the compile log/error strip.
 *
 * Purely presentational — the Studio page owns source truth,
 * persistence, and compilation.
 */

import dynamic from "next/dynamic";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { LatexError } from "@/lib/latexErrors";

const LatexSourceEditor = dynamic(() => import("@/components/resume/LatexSourceEditor"), {
  ssr: false,
  loading: () => null,
});

export type SourceSaveState = "idle" | "saving" | "saved" | "error";

interface ResumeSourcePaneProps {
  value: string;
  onChange: (next: string) => void;
  errors: LatexError[];
  saveState: SourceSaveState;
  isDirty: boolean;
  savedRev: number | null;
  cursor: { line: number; column: number } | null;
  onCursor: (line: number, column: number) => void;
  onSelectionText: (text: string) => void;
  onSave: () => void;
  revealLine: { line: number; nonce: number } | null;
  logOpen: boolean;
  onToggleLog: () => void;
  onRevealLine: (line: number) => void;
  logTail: string | null;
}

export default function ResumeSourcePane({
  value,
  onChange,
  errors,
  saveState,
  isDirty,
  savedRev,
  cursor,
  onCursor,
  onSelectionText,
  onSave,
  revealLine,
  logOpen,
  onToggleLog,
  onRevealLine,
  logTail,
}: ResumeSourcePaneProps) {
  return (
    <section
      aria-label="LaTeX source"
      className="order-2 flex min-h-[55vh] flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/90 backdrop-blur-xl lg:order-2 lg:h-full lg:min-h-0 lg:rounded-none lg:border-0 lg:border-r"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--ink-soft)]/60 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-bold text-[var(--paper)]">Source</span>
          <span
            role="status"
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              saveState === "error"
                ? "border-red-400/30 bg-red-400/10 text-red-200"
                : isDirty
                  ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                  : "border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
            )}
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "error"
                ? "Save failed"
                : isDirty
                  ? "Unsaved changes"
                  : savedRev !== null
                    ? `Saved · rev ${savedRev}`
                    : "Not saved yet"}
          </span>
          {cursor && (
            <span className="hidden font-mono text-[10px] tabular-nums text-dim sm:inline" aria-live="off">
              Ln {cursor.line}, Col {cursor.column}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleLog}
            aria-expanded={logOpen}
            aria-label="Toggle compile log"
            className={cn(
              "min-h-[44px] rounded-lg px-3 text-[11px] font-bold transition-colors",
              errors.length > 0
                ? "text-red-200 hover:bg-white/[0.06]"
                : "text-dim hover:bg-white/[0.06] hover:text-[var(--paper)]"
            )}
          >
            Log{errors.length > 0 ? ` (${errors.length})` : ""}
          </button>
          <Button
            size="sm"
            variant="outline"
            onClick={onSave}
            loading={saveState === "saving"}
            className="min-h-[44px] border-[var(--line)]"
          >
            <Save className="h-3.5 w-3.5" aria-hidden /> Save
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <LatexSourceEditor
          value={value}
          onChange={onChange}
          errors={errors}
          onCursorChange={onCursor}
          onSelectionText={onSelectionText}
          onSaveRequest={onSave}
          revealLine={revealLine}
        />
      </div>
      {logOpen && (
        <div
          className="max-h-44 shrink-0 overflow-y-auto border-t border-[var(--line)] bg-black/50 p-3"
          role="log"
          aria-label="LaTeX compile log"
        >
          {errors.length === 0 && !logTail ? (
            <p className="text-[11px] leading-relaxed text-dim">
              No compile log yet. Errors from the LaTeX compiler appear here with line numbers — select one to jump
              to it in the source.
            </p>
          ) : (
            <div className="space-y-1.5">
              {errors.map((e, i) => (
                <button
                  key={`${e.line}-${i}`}
                  type="button"
                  onClick={() => onRevealLine(e.line)}
                  title={`Jump to line ${e.line}`}
                  className="block w-full cursor-pointer rounded-lg border border-red-400/25 bg-red-400/10 px-2.5 py-1.5 text-left font-mono text-[10px] leading-relaxed text-red-200 transition-colors hover:bg-red-400/15"
                >
                  L{e.line}: {e.message}
                </button>
              ))}
              {logTail && (
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-black/40 p-2.5 font-mono text-[10px] leading-relaxed text-dim">
                  {logTail.slice(-3000)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
