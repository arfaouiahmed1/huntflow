import { describe, it, expect } from "vitest";
import { parseLatexErrors } from "./latexErrors";

describe("parseLatexErrors", () => {
  it("returns empty for null/undefined/empty logs", () => {
    expect(parseLatexErrors(null)).toEqual([]);
    expect(parseLatexErrors(undefined)).toEqual([]);
    expect(parseLatexErrors("")).toEqual([]);
  });

  it("parses -file-line-error locations", () => {
    const tail = "./doc.tex:12: Undefined control sequence.\nl.12 \\badcommand";
    const errors = parseLatexErrors(tail);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].line).toBe(12);
    expect(errors[0].message).toMatch(/Undefined/);
  });

  it("parses classic l.NN lines with a pending bang message", () => {
    const tail = "! Missing } inserted.\nl.42 \\end{itemize}";
    const errors = parseLatexErrors(tail);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(42);
    expect(errors[0].message).toMatch(/Missing/);
  });

  it("ignores benign log chatter and caps output", () => {
    const tail = ["Output written on doc.pdf (1 page).", "Transcript written on doc.log."]
      .concat(Array.from({ length: 60 }, (_, i) => `./doc.tex:${i + 1}: Fake`))
      .join("\n");
    const errors = parseLatexErrors(tail);
    expect(errors.length).toBeLessThanOrEqual(30);
    expect(errors.every((e) => e.line >= 1 && e.message.length > 0)).toBe(true);
  });

  it("clamps non-positive line numbers to 1", () => {
    expect(parseLatexErrors("./doc.tex:0: Boom")[0].line).toBe(1);
  });
});
