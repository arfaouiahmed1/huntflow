/**
 * Parse a pdflatex `-file-line-error` log tail into editor markers.
 * Pure + unit-tested: handles `./doc.tex:12: msg`, `l.12 ...`, and
 * `! ...` lines followed by `l.12`. No Monaco dependency so routes,
 * pages, and tests can all use it.
 */

export interface LatexError {
  line: number;
  column: number;
  message: string;
}

const MAX_ERRORS = 30;

export function parseLatexErrors(logTail: string | null | undefined): LatexError[] {
  if (!logTail) return [];
  const errors: LatexError[] = [];
  const lines = logTail.split("\n");
  let pendingMessage: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const fileMatch = line.match(/^(?:\.\/)?doc\.tex:(\d+):?\s*(.*)$/);
    if (fileMatch) {
      errors.push({
        line: Math.max(1, Number(fileMatch[1])),
        column: 1,
        message: (fileMatch[2] || pendingMessage || "LaTeX error").slice(0, 300),
      });
      pendingMessage = null;
      continue;
    }
    const classicMatch = line.match(/^l\.(\d+)\s*(.*)$/);
    if (classicMatch) {
      errors.push({
        line: Math.max(1, Number(classicMatch[1])),
        column: 1,
        message: (pendingMessage || classicMatch[2] || "LaTeX error").slice(0, 300),
      });
      pendingMessage = null;
      continue;
    }
    if (line.startsWith("! ")) {
      pendingMessage = line.replace(/^!\s*/, "").slice(0, 300);
      continue;
    }
    if (/^!/.test(line) && line.length > 2) {
      pendingMessage = line.slice(0, 300);
    }
  }
  return errors.slice(0, MAX_ERRORS);
}
