import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { compileLatex, compileWithSynctex, disposeBuild, _buildCacheSize } from "@/lib/pdf/compileLatex";
import { forwardSync, reverseSync, SynctexError } from "@/lib/pdf/synctex";

const TEX = `\\documentclass[11pt]{article}
\\usepackage{helvet}
\\renewcommand{\\familydefault}{\\sfdefault}
\\begin{document}
\\section{Alpha}
Hello from line three.
\\end{document}
`;

function hasEngine(): boolean {
  try {
    const bin = process.platform === "win32" ? "pdflatex.exe" : "pdflatex";
    const res = spawnSync(bin, ["--version"], { timeout: 10_000 });
    return res.status === 0;
  } catch {
    return false;
  }
}

const engineAvailable = hasEngine();

describe("compileLatex (engine-gated)", () => {
  it.runIf(engineAvailable)("compiles a minimal document to a PDF buffer", async () => {
    const pdf = await compileLatex(TEX, { runs: 1 });
    expect(pdf.slice(0, 4).toString()).toBe("%PDF");
  }, 60_000);

  it.runIf(engineAvailable)("compileWithSynctex keeps artifacts and returns a token", async () => {
    const { pdf, token } = await compileWithSynctex(TEX, { runs: 1 });
    expect(pdf.slice(0, 4).toString()).toBe("%PDF");
    expect(token).toBeTruthy();
    disposeBuild(token);
    expect(_buildCacheSize()).toBe(0);
  }, 60_000);

  it("surfaces a compile error with a log tail", async () => {
    const broken = "\\documentclass{article}\n\\begin{document}\n\\madeupcommand\n\\end{document}";
    await expect(compileLatex(broken, { runs: 1 })).rejects.toThrow(/LaTeX compilation failed/);
  }, 60_000);
});

describe("synctex roundtrip (engine-gated)", () => {
  it.runIf(engineAvailable)("forward then reverse sync lands on the source line", async () => {
    const { token } = await compileWithSynctex(TEX, { runs: 1 });
    try {
      const fwd = await forwardSync(token, 5, 0);
      expect(fwd.page).toBe(1);
      expect(fwd.x).toBeGreaterThanOrEqual(0);
      expect(fwd.y).toBeGreaterThanOrEqual(0);

      const rev = await reverseSync(token, fwd.page, fwd.x + 2, fwd.y + 2);
      expect(rev.line).toBeGreaterThanOrEqual(1);
      expect(rev.line).toBeLessThanOrEqual(10);
    } finally {
      disposeBuild(token);
    }
  }, 60_000);

  it("rejects an unknown token", async () => {
    await expect(forwardSync("nope", 1, 0)).rejects.toThrow(SynctexError);
    await expect(reverseSync("nope", 1, 0, 0)).rejects.toThrow(SynctexError);
  });
});
