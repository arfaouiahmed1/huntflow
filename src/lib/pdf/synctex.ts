import { execFile } from "child_process";
import { promisify } from "util";
import { getBuild } from "./compileLatex";

const exec = promisify(execFile);

/**
 * Thin wrapper over the SyncTeX CLI (ships with TeX Live / MiKTeX).
 *
 * Units: the CLI emits "scaled points" (1pt = 65536sp). PDF user units are
 * points (72/inch), and pdf.js reports page coordinates in the same units,
 * so converting sp -> pt gives directly usable numbers. y is measured from
 * the TOP of the page in SyncTeX output (we pass it through; the client maps
 * to its own coordinate space).
 */

export class SynctexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SynctexError";
  }
}

export interface ForwardSyncResult {
  page: number; // 1-based
  x: number; // PDF points from left edge
  y: number; // PDF points from top edge
  width: number;
  height: number;
}

export interface ReverseSyncResult {
  line: number;
  column: number;
}

function parseScaledPoint(v: string | undefined): number {
  const n = Number(v ?? "0");
  if (!Number.isFinite(n)) return 0;
  return n / 65536; // sp -> pt
}

function locateSynctexBinary(): string {
  return process.platform === "win32" ? "synctex.exe" : "synctex";
}

/** Forward sync: source line -> PDF page + point. */
export async function forwardSync(token: string, line: number, column = 0): Promise<ForwardSyncResult> {
  const build = getBuild(token);
  if (!build) throw new SynctexError("Build expired or not found — recompile first.");
  if (!build.synctexPath) throw new SynctexError("No .synctex.gz produced — recompile with SyncTeX enabled.");

  const doc = build.texPath;
  const pdfPath = doc.replace(/\.tex$/, ".pdf");

  const args = ["view", "-i", `${line}:${column}:${doc}`, "-o", pdfPath, "-d", process.cwd()];
  let out = "";
  try {
    const res = await exec(locateSynctexBinary(), args, {
      timeout: 10_000,
      maxBuffer: 2 * 1024 * 1024,
      cwd: build.dir,
    });
    out = (res.stdout || "") + (res.stderr || "");
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    out = (err.stdout || "") + (err.stderr || "");
    if (!out.includes("Page:")) throw new SynctexError(`SyncTeX failed: ${(err as Error).message}`);
  }

  const pageMatch = out.match(/Page:(\d+)/);
  const xMatch = out.match(/x:([-\d.]+)/);
  const yMatch = out.match(/y:([-\d.]+)/);
  const hMatch = out.match(/h:([-\d.]+)/);
  const wMatch = out.match(/w:([-\d.]+)/);

  if (!pageMatch) throw new SynctexError("SyncTeX returned no page data.");

  return {
    page: Number(pageMatch[1]),
    x: parseScaledPoint(xMatch?.[1]),
    y: parseScaledPoint(yMatch?.[1]),
    width: parseScaledPoint(wMatch?.[1]),
    height: parseScaledPoint(hMatch?.[1]),
  };
}

/** Reverse sync: PDF page + point -> source line. */
export async function reverseSync(token: string, page: number, x: number, y: number): Promise<ReverseSyncResult> {
  const build = getBuild(token);
  if (!build) throw new SynctexError("Build expired or not found — recompile first.");
  if (!build.synctexPath) throw new SynctexError("No .synctex.gz produced — recompile with SyncTeX enabled.");

  const pdfPath = build.texPath.replace(/\.tex$/, ".pdf");
  const args = ["edit", "-o", `${page}:${Math.round(x * 65536)}:${Math.round(y * 65536)}:${pdfPath}`];

  let out = "";
  try {
    const res = await exec(locateSynctexBinary(), args, {
      timeout: 10_000,
      maxBuffer: 2 * 1024 * 1024,
      cwd: build.dir,
    });
    out = (res.stdout || "") + (res.stderr || "");
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    out = (err.stdout || "") + (err.stderr || "");
    if (!out.includes("Line:")) throw new SynctexError(`SyncTeX failed: ${(err as Error).message}`);
  }

  const lineMatch = out.match(/Line:(\d+)/);
  const colMatch = out.match(/Column:(\d+)/);
  if (!lineMatch) throw new SynctexError("SyncTeX returned no line data.");

  return {
    line: Number(lineMatch[1]),
    column: Number(colMatch?.[1] ?? 0),
  };
}
