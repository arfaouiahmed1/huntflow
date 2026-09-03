import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const exec = promisify(execFile);

export class PdfError extends Error {
  constructor(
    message: string,
    public readonly logTail?: string
  ) {
    super(message);
    this.name = "PdfError";
  }
}

export type LatexEngine = "pdflatex" | "xelatex" | "lualatex";

/** Locate a TeX engine on PATH (pdflatex preferred; xelatex/lualatex fallback). */
export async function findEngine(): Promise<string> {
  for (const name of ["pdflatex", "xelatex", "lualatex"]) {
    const candidates =
      process.platform === "win32"
        ? [name, `${name}.exe`]
        : [name];
    for (const c of candidates) {
      try {
        await exec(c, ["--version"], { timeout: 10_000 });
        return c;
      } catch {
        /* try next */
      }
    }
  }
  throw new PdfError(
    "No LaTeX engine found (pdflatex/xelatex/lualatex). Install TeX Live or MikTeX and ensure it is on PATH."
  );
}

async function runRuns(engine: string, dir: string, runs: 1 | 2) {
  const args = [
    "-interaction=nonstopmode",
    "-halt-on-error",
    "-file-line-error",
    "-output-directory=" + dir,
    join(dir, "doc.tex"),
  ];
  for (let i = 0; i < runs; i++) {
    try {
      await exec(engine, args, {
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      const tail = ((err.stdout || "") + (err.stderr || "")).split("\n").slice(-40).join("\n");
      throw new PdfError(`LaTeX compilation failed (run ${i + 1}).`, tail || err.message);
    }
  }
}

export interface CompileWithSynctexResult {
  /** PDF bytes. */
  pdf: Buffer;
  /** Persistent token to pass to the synctex endpoints (TTL ~10 min). */
  token: string;
  /** Compiler stderr/stdout tail (diagnostics). */
  logTail: string;
}

/**
 * Compile a LaTeX document to a PDF buffer in a throwaway temp dir.
 * Runs twice when the document contains references/titles (stability).
 */
export async function compileLatex(
  tex: string,
  options: { engine?: LatexEngine; runs?: 1 | 2 } = {}
): Promise<Buffer> {
  const engine = options.engine ?? "pdflatex";
  const runs = options.runs ?? 2;

  const dir = await mkdtemp(join(tmpdir(), "huntflow-tex-"));
  try {
    await writeFile(join(dir, "doc.tex"), tex, "utf8");
    await runRuns(engine, dir, runs);
    return await readFile(join(dir, "doc.pdf"));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function readLogTail(dir: string): Promise<string> {
  try {
    const log = await readFile(join(dir, "doc.log"), "utf8");
    const tail = log.split("\n").slice(-80).join("\n").slice(-6000);
    return tail.trim() || log.slice(-4000);
  } catch {
    return "";
  }
}

function buildPdfErrorMessage(stdout: string, stderr: string, logTail: string, fallback: string) {
  return logTail || ((stdout || "") + (stderr || "")).split("\n").slice(-40).join("\n") || fallback;
}

/**
 * Compile with SyncTeX enabled and KEEP the build dir alive in a TTL cache so
 * `synctex view` / `synctex edit` can run against the real artifacts.
 * Captures latexmk/pdflatex logTail from doc.log — never discards compiler diagnostics.
 */
export async function compileWithSynctex(
  tex: string,
  options: { engine?: LatexEngine; runs?: 1 | 2 } = {}
): Promise<CompileWithSynctexResult> {
  const engine = options.engine ?? "pdflatex";
  const runs = options.runs ?? 2;

  const dir = await mkdtemp(join(tmpdir(), "huntflow-sync-"));
  const token = crypto.randomUUID();

  try {
    await writeFile(join(dir, "doc.tex"), tex, "utf8");

    const args = [
      "-interaction=nonstopmode",
      "-halt-on-error",
      "-file-line-error",
      "-synctex=1",
      "-output-directory=" + dir,
      join(dir, "doc.tex"),
    ];
    for (let i = 0; i < runs; i++) {
      try {
        await exec(engine, args, {
          timeout: 60_000,
          maxBuffer: 10 * 1024 * 1024,
        });
      } catch (e) {
        const err = e as { stdout?: string; stderr?: string; message?: string };
        const logTail = await readLogTail(dir);
        const tail = buildPdfErrorMessage(err.stdout || "", err.stderr || "", logTail, err.message || "LaTeX compilation failed");
        throw new PdfError(`LaTeX compilation failed (run ${i + 1}).`, tail);
      }
    }

    const logTail = await readLogTail(dir);
    const compactLog = logTail.replace(/\s+/g, " ").replace(/con trol/i, "control");
    if (/Undefined|Missing.*brace|LaTeX Error|Emergency stop|Fatal error/i.test(compactLog)) {
      throw new PdfError("LaTeX compilation failed (log contains errors).", logTail);
    }
    const pdf = await readFile(join(dir, "doc.pdf"));
    cacheBuild(token, dir);
    return { pdf, token, logTail };
  } catch (e) {
    if (e instanceof PdfError && !e.logTail) {
      const logTail = await readLogTail(dir);
      if (logTail) (e as PdfError & { logTail: string }).logTail = logTail;
    }
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}

/** Parse a latexmk/pdflatex log tail into structured error lines (for SSE). */
export function parseLatexLog(logTail: string): string[] {
  if (!logTail) return [];
  const compact = logTail.replace(/\s+/g, " ").replace(/con trol/i, "control");
  if (/Undefined/i.test(compact)) return [compact.match(/Undefined[^.!]*[.!]?/i)?.[0]?.trim() || "Undefined control sequence"].slice(0, 20);
  return logTail
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /! |^l\.\d+|Error|Undefined|Missing|Runaway|File ended|Fatal/i.test(l))
    .slice(0, 20);
}

/* ------------------------------------------------------------------ *
 * Build cache — keeps the compiled artifact dir alive for SyncTeX.
 * ------------------------------------------------------------------ */

interface BuildEntry {
  dir: string;
  texPath: string;
  synctexPath: string | null;
  expiresAt: number;
}

const buildCache = new Map<string, BuildEntry>();
const BUILD_TTL_MS = 10 * 60 * 1000; // 10 minutes
let sweepTimer: ReturnType<typeof setTimeout> | null = null;

function sweep() {
  const now = Date.now();
  for (const [token, entry] of buildCache) {
    if (entry.expiresAt < now) {
      rm(entry.dir, { recursive: true, force: true }).catch(() => {});
      buildCache.delete(token);
    }
  }
  if (buildCache.size) {
    sweepTimer = setTimeout(sweep, BUILD_TTL_MS);
  } else {
    sweepTimer = null;
  }
}

function cacheBuild(token: string, dir: string) {
  const base = join(dir, "doc");
  buildCache.set(token, {
    dir,
    texPath: base + ".tex",
    synctexPath: existsSync(base + ".synctex.gz") ? base + ".synctex.gz" : null,
    expiresAt: Date.now() + BUILD_TTL_MS,
  });
  if (!sweepTimer) sweepTimer = setTimeout(sweep, BUILD_TTL_MS);
}

export function getBuild(token: string): BuildEntry | null {
  const entry = buildCache.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    buildCache.delete(token);
    return null;
  }
  entry.expiresAt = Date.now() + BUILD_TTL_MS; // touch
  return entry;
}

/** Drop a build early (e.g. on document delete). */
export function disposeBuild(token: string) {
  const entry = buildCache.get(token);
  if (!entry) return;
  buildCache.delete(token);
  rm(entry.dir, { recursive: true, force: true }).catch(() => {});
}

/** Read the compiled PDF bytes for a live build token. */
export async function readBuildPdf(token: string): Promise<Buffer> {
  const entry = getBuild(token);
  if (!entry) throw new PdfError("Build expired or not found — recompile first.");
  return readFile(entry.texPath.replace(/\.tex$/, ".pdf"));
}

/** Exposed for tests. */
export function _buildCacheSize() {
  return buildCache.size;
}
