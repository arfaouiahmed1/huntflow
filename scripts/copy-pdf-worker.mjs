/**
 * Copy the pdf.js worker shipped with the installed pdfjs-dist into
 * public/pdf so the Studio PDF viewer loads it same-origin.
 *
 * Same-origin + version-pinned: no CDN egress, no worker/build-tool
 * resolution games under Turbopack, and the worker always matches the
 * pdfjs-dist version in node_modules. Idempotent; warns instead of
 * failing so installs without the dep still succeed.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const destDir = join(root, "public", "pdf");
const dest = join(destDir, "pdf.worker.min.mjs");

try {
  if (!existsSync(src)) {
    console.warn("[copy-pdf-worker] pdfjs-dist worker not found — skipping (viewer will report it at runtime).");
    process.exit(0);
  }
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, dest);
  const bytes = statSync(dest).size;
  console.log(`[copy-pdf-worker] worker ready: public/pdf/pdf.worker.min.mjs (${bytes} bytes)`);
} catch (err) {
  console.warn(`[copy-pdf-worker] skipped: ${err instanceof Error ? err.message : String(err)}`);
}
