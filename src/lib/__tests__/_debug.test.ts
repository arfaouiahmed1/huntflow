import { it } from "vitest";
import { compileLatex, findEngine } from "@/lib/pdf/compileLatex";

it("debug compile", async () => {
  try {
    const e = await findEngine();
    console.log("ENGINE:", e);
    const pdf = await compileLatex("\\documentclass{article}\n\\begin{document}hi\\end{document}", { runs: 1 });
    console.log("PDF HEADER:", pdf.slice(0, 4).toString());
  } catch (err) {
    console.log("ERR:", (err as Error).message, (err as { logTail?: string }).logTail?.slice(0, 300));
  }
});
