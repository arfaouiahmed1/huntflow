"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Plus, Minus, FileDiff, Equal } from "lucide-react";

export type DiffLine = {
  type: "add" | "remove" | "context";
  text: string;
  beforeLine: number | null;
  afterLine: number | null;
};

function computeDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  // DP for LCS — tex docs are ~200-800 lines, O(n*m) is fine
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      out.push({ type: "context", text: a[i], beforeLine: i + 1, afterLine: j + 1 });
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      out.push({ type: "add", text: b[j], beforeLine: null, afterLine: j + 1 });
      j++;
    } else if (i < n) {
      out.push({ type: "remove", text: a[i], beforeLine: i + 1, afterLine: null });
      i++;
    }
  }
  return out;
}

export function getChangedLineNumbers(diff: DiffLine[]): number[] {
  return diff.filter((d) => d.type !== "context").map((d) => d.afterLine ?? d.beforeLine ?? 0);
}

export function getChangedSections(diff: DiffLine[]): string[] {
  const joined = diff
    .filter((d) => d.type !== "context")
    .map((d) => d.text)
    .join("\n")
    .toLowerCase();
  const sections: string[] = [];
  if (/summary/.test(joined)) sections.push("summary");
  if (/experience|\\resumeentry/.test(joined)) sections.push("experience");
  if (/projects/.test(joined)) sections.push("projects");
  if (/education/.test(joined)) sections.push("education");
  if (/skills/.test(joined)) sections.push("skills");
  if (/header|contact|name|title/.test(joined)) sections.push("header");
  return sections;
}

interface ResumeDiffProps {
  beforeTex: string;
  afterTex: string;
  className?: string;
  maxLines?: number;
}

export default function ResumeDiff({ beforeTex, afterTex, className, maxLines = 180 }: ResumeDiffProps) {
  const { diff, stats } = useMemo(() => {
    const d = computeDiff(beforeTex || "", afterTex || "");
    const adds = d.filter((x) => x.type === "add").length;
    const removes = d.filter((x) => x.type === "remove").length;
    return { diff: d, stats: { adds, removes, total: d.length } };
  }, [beforeTex, afterTex]);

  const visible = useMemo(() => {
    if (diff.length <= maxLines) return diff;
    // Window around first change, keep context
    const firstChange = diff.findIndex((d) => d.type !== "context");
    if (firstChange === -1) return diff.slice(0, maxLines);
    const start = Math.max(0, firstChange - 8);
    return diff.slice(start, start + maxLines);
  }, [diff, maxLines]);

  const isIdentical = stats.adds === 0 && stats.removes === 0;

  return (
    <div
      data-testid="resume-diff"
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--line)] bg-black/30",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-white/[0.03] px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--paper)]">
          <FileDiff className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
          <span>TeX Diff — before ↔ after</span>
          {isIdentical ? (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-dim">
              <Equal className="h-3 w-3" /> identical
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px]">
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 px-2 py-0.5 text-[var(--chartreuse)]">
            <Plus className="h-3 w-3" /> {stats.adds}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-2 py-0.5 text-[var(--coral)]">
            <Minus className="h-3 w-3" /> {stats.removes}
          </span>
        </div>
      </div>

      <div className="max-h-[320px] overflow-auto bg-[#0c1118] p-0 font-mono text-[11px] leading-5">
        {visible.length === 0 ? (
          <div className="px-3 py-6 text-center text-dim">No content to compare.</div>
        ) : (
          <div className="min-w-full">
            {visible.map((line, idx) => (
              <div
                key={idx}
                data-testid={line.type === "add" ? "diff-add" : line.type === "remove" ? "diff-remove" : "diff-context"}
                className={cn(
                  "flex gap-0 border-l-2 px-2 py-0.5 whitespace-pre-wrap break-all",
                  line.type === "add" && "border-[var(--chartreuse)] bg-[var(--chartreuse)]/10 text-[var(--chartreuse-bright)]",
                  line.type === "remove" && "border-[var(--coral)] bg-[var(--coral)]/10 text-[var(--coral)]",
                  line.type === "context" && "border-transparent text-white/55"
                )}
              >
                <span className="mr-2 inline-flex w-6 shrink-0 justify-center font-bold opacity-80">
                  {line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}
                </span>
                <span className="mr-3 hidden w-10 shrink-0 text-right text-[10px] leading-5 text-dim sm:inline">
                  {line.type === "add"
                    ? String(line.afterLine ?? "")
                    : line.type === "remove"
                      ? String(line.beforeLine ?? "")
                      : String(line.afterLine ?? "")}
                </span>
                <span className="min-w-0 flex-1">{line.text || " "}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {diff.length > visible.length && (
        <div className="border-t border-[var(--line)] bg-white/[0.02] px-3 py-1.5 text-center font-mono text-[10px] text-dim">
          Showing {visible.length} of {diff.length} lines · scroll for more
        </div>
      )}
    </div>
  );
}

export { computeDiff };
