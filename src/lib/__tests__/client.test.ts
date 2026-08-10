import { describe, it, expect } from "vitest";
import { extractJson } from "@/lib/llm/client";
import { LLMError } from "@/lib/llm/client";

describe("extractJson", () => {
  it("parses a plain JSON object", () => {
    expect(extractJson('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
  });

  it("parses JSON inside markdown fences", () => {
    const text = 'Here is your result:\n```json\n{"matchScore":62,"skills":["react"]}\n```\nDone.';
    expect(extractJson(text)).toEqual({ matchScore: 62, skills: ["react"] });
  });

  it("parses a bare top-level array", () => {
    expect(extractJson('["a","b",{"c":2}]')).toEqual(["a", "b", { c: 2 }]);
  });

  it("parses an array inside prose", () => {
    const text = 'Output:\n[1, 2, 3]\nThat is all.';
    expect(extractJson(text)).toEqual([1, 2, 3]);
  });

  it("handles nested braces and arrays", () => {
    const obj = { a: [{ b: { c: [1, 2, 3] } }], d: "}" };
    expect(extractJson(JSON.stringify(obj))).toEqual(obj);
  });

  it("extracts the first object from surrounding prose", () => {
    const text = 'The answer is {"ok":true,"n":42} according to my analysis.';
    expect(extractJson(text)).toEqual({ ok: true, n: 42 });
  });

  it("throws LLMError PARSE_ERROR for non-JSON output", () => {
    try {
      extractJson("I cannot produce JSON right now.");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LLMError);
      expect((e as LLMError).code).toBe("PARSE_ERROR");
    }
  });
});
