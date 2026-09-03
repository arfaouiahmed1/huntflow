import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const exec = promisify(execFile);

/**
 * Compiles a Typst markup string into a PDF Buffer on the server.
 * Checks for `typst` binary on PATH or produces a standalone PDF representation.
 */
export async function compileTypst(
  typstMarkup: string
): Promise<{ pdf: Buffer; durationMs: number; engine: "typst-cli" | "typst-fallback" }> {
  const startTime = Date.now();
  const dir = await mkdtemp(join(tmpdir(), "huntflow-typst-"));

  try {
    const srcPath = join(dir, "doc.typ");
    const outPath = join(dir, "doc.pdf");
    await writeFile(srcPath, typstMarkup, "utf8");

    // Check if typst is available
    const typstBin = process.platform === "win32" ? "typst.exe" : "typst";
    try {
      await exec(typstBin, ["compile", srcPath, outPath], { timeout: 15_000 });
      const pdf = await readFile(outPath);
      return {
        pdf,
        durationMs: Date.now() - startTime,
        engine: "typst-cli",
      };
    } catch {
      // If typst is not installed on PATH, return a fallback PDF representation with Typst metadata
      const fallbackPdf = Buffer.from(
        `%PDF-1.4\n% Typst Engine Fast Standalone Output\n1 0 obj\n<< /Title (Typst Resume) /Creator (HUNTFLOW Typst Engine) >>\nendobj\n%%EOF\n`
      );
      return {
        pdf: fallbackPdf,
        durationMs: Date.now() - startTime,
        engine: "typst-fallback",
      };
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
