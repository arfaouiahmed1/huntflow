import { describe, it, expect } from "vitest";
import {
  cleanText,
  cleanNumber,
  cleanStringArray,
  cleanEnum,
  cleanSkillsGap,
  cleanDocuments,
  cleanSTARCards,
  cleanInterviewQuestions,
  cleanJobBrief,
  cleanSalaryIntel,
  cleanRecommendations,
  cleanRoadmap,
  cleanPipelineReport,
  cleanAutoApplyLogs,
  cleanAssistantDecision,
} from "@/lib/llm/sanitize";

describe("primitives", () => {
  it("cleanText trims, truncates and rejects non-strings", () => {
    expect(cleanText("  hi  ")).toBe("hi");
    expect(cleanText("x".repeat(5000), 100)).toHaveLength(100);
    expect(cleanText(42)).toBe("");
    expect(cleanText(null)).toBe("");
    expect(cleanText(undefined)).toBe("");
    expect(cleanText("", 100, "fallback")).toBe("");
  });

  it("cleanNumber handles strings, clamps and NaN", () => {
    expect(cleanNumber("42", 0, 100, 0)).toBe(42);
    expect(cleanNumber(42.7, 0, 100, 0)).toBe(43);
    expect(cleanNumber(500, 0, 100, 0)).toBe(100);
    expect(cleanNumber(-5, 0, 100, 0)).toBe(0);
    expect(cleanNumber("ninety", 0, 100, 0)).toBe(0);
    expect(cleanNumber(null, 0, 100, 10)).toBe(10);
    expect(cleanNumber("", 0, 100, 10)).toBe(10);
    expect(cleanNumber(undefined, 0, 100, 10)).toBe(10);
  });

  it("cleanStringArray drops non-strings, empties and enforces caps", () => {
    expect(cleanStringArray(["a", 2, "", null, "  b  "])).toEqual(["a", "b"]);
    expect(cleanStringArray("not-array")).toEqual([]);
    expect(cleanStringArray(["a", "b", "c"], 2)).toEqual(["a", "b"]);
    expect(cleanStringArray(["long"], 5, 3)).toEqual(["lon"]);
  });

  it("cleanEnum clamps to allowed values", () => {
    expect(cleanEnum("applied", ["applied", "skipped"] as const, "applied")).toBe("applied");
    expect(cleanEnum("banana", ["applied", "skipped"] as const, "skipped")).toBe("skipped");
    expect(cleanEnum(42, ["applied", "skipped"] as const, "skipped")).toBe("skipped");
  });
});

describe("cleanSkillsGap", () => {
  it("cleans a sloppy model response into a valid analysis", () => {
    const out = cleanSkillsGap({
      matchScore: "88",
      matchingSkills: ["React", 42, ""],
      missingSkills: null,
      strengths: ["  strong profile  "],
      recommendations: "nope",
      keyTermFrequency: [{ term: "react", count: "7", inResume: true }, { term: "" }, 42],
    });
    expect(out).not.toBeNull();
    expect(out!.matchScore).toBe(88);
    expect(out!.matchingSkills).toEqual(["React"]);
    expect(out!.missingSkills).toEqual([]);
    expect(out!.strengths).toEqual(["strong profile"]);
    expect(out!.recommendations).toEqual([]);
    expect(out!.keyTermFrequency).toEqual([{ term: "react", count: 7, inResume: true }]);
  });

  it("clamps matchScore to 0–100", () => {
    expect(cleanSkillsGap({ matchScore: 150, matchingSkills: ["x"] })!.matchScore).toBe(100);
    expect(cleanSkillsGap({ matchScore: -3, matchingSkills: ["x"] })!.matchScore).toBe(0);
  });

  it("returns null for a hopeless payload so callers can fall back", () => {
    expect(cleanSkillsGap(null)).toBeNull();
    expect(cleanSkillsGap("hi")).toBeNull();
    expect(cleanSkillsGap([])).toBeNull();
    expect(cleanSkillsGap({ matchScore: 0, matchingSkills: [], strengths: [], recommendations: [] })).toBeNull();
  });
});

describe("cleanDocuments", () => {
  it("keeps only real string deliverables", () => {
    const out = cleanDocuments({ tailoredResume: "  RESUME  ", coverLetter: "", motivationLetter: 42, customNotes: null });
    expect(out).toEqual({ tailoredResume: "RESUME" });
  });

  it("returns null when nothing survived", () => {
    expect(cleanDocuments({ coverLetter: 42 })).toBeNull();
    expect(cleanDocuments("nope")).toBeNull();
  });
});

describe("cleanSTARCards", () => {
  it("validates every card and generates missing ids", () => {
    const out = cleanSTARCards([
      { situation: "S", task: "T", action: "A", result: "R", question: "Q", difficulty: "impossible" },
      { situation: "S2" },
      {},
      42,
    ]);
    expect(out!.length).toBe(2);
    expect(out![0].id).toMatch(/^card-/);
    expect(out![0].difficulty).toBe("medium"); /* invalid enum clamps */
    expect(out![0].question).toBe("Q");
    expect(out![1].situation).toBe("S2");
    expect(out![1].question).toBe("—");
  });

  it("returns null for non-array or all-empty", () => {
    expect(cleanSTARCards({})).toBeNull();
    expect(cleanSTARCards([{}, 42])).toBeNull();
  });
});

describe("cleanInterviewQuestions", () => {
  it("clamps enums and drops questions without text", () => {
    const out = cleanInterviewQuestions([
      { question: "Tell me about yourself", category: "space", difficulty: "hard", hint: "h", idealAnswer: "a" },
      { category: "technical" },
    ]);
    expect(out!.length).toBe(1);
    expect(out![0].category).toBe("behavioral");
    expect(out![0].id).toMatch(/^q-/);
    expect(out![0].difficulty).toBe("hard");
  });
});

describe("cleanJobBrief", () => {
  it("rebuilds the brief with only valid arrays", () => {
    const out = cleanJobBrief({
      summary: "  Solid role  ",
      techStack: ["React", ""],
      topRequirements: 42,
      redFlags: ["oncall"],
      questionsToAsk: [],
      cultureSignals: null,
    });
    expect(out).toEqual({
      summary: "Solid role",
      techStack: ["React"],
      topRequirements: [],
      redFlags: ["oncall"],
      questionsToAsk: [],
      cultureSignals: [],
    });
  });

  it("returns null when entirely empty", () => {
    expect(cleanJobBrief({ summary: "", techStack: [] })).toBeNull();
  });
});

describe("cleanSalaryIntel", () => {
  it("swaps inverted ranges and clamps", () => {
    const out = cleanSalaryIntel({ estimateLow: 200, estimateHigh: 100, basis: "hybrid", disclosedRange: "100-200k", factors: ["Berlin"], negotiationTips: ["ask 10% up"] });
    expect(out!.estimateLow).toBe(100);
    expect(out!.estimateHigh).toBe(200);
    expect(out!.basis).toBe("hybrid");
  });

  it("falls back on garbage numbers and nulls on zero range", () => {
    expect(cleanSalaryIntel({ estimateLow: "banana", estimateHigh: 90, basis: "posting" })!.estimateLow).toBe(0);
    expect(cleanSalaryIntel({ estimateLow: 0, estimateHigh: 0 })).toBeNull();
    expect(cleanSalaryIntel("x")).toBeNull();
  });
});

describe("recommendations / roadmap / report", () => {
  it("cleanRecommendations keeps titled items and clamps probability", () => {
    const out = cleanRecommendations([
      { title: "  Startup  ", companyArchetype: "B2B", why: "growth", matchProbability: 250 },
      { why: "no title" },
      "junk",
    ]);
    expect(out!.length).toBe(1);
    expect(out![0].title).toBe("Startup");
    expect(out![0].matchProbability).toBe(100);
  });

  it("cleanRoadmap clamps priority", () => {
    const out = cleanRoadmap([{ skill: "K8s", priority: "urgent", why: "", resources: ["doc", 7] }]);
    expect(out![0].priority).toBe("medium");
    expect(out![0].resources).toEqual(["doc"]);
  });

  it("cleanPipelineReport requires some signal", () => {
    expect(cleanPipelineReport({ headline: "Good week", highlights: [], risks: [], actions: [] })!.headline).toBe("Good week");
    expect(cleanPipelineReport({})).toBeNull();
  });
});

describe("cleanAutoApplyLogs", () => {
  it("validates timestamp, message and type", () => {
    const out = cleanAutoApplyLogs([
      { timestamp: "10:00:00", message: "  ok  ", type: "success" },
      { message: 42 },
      { message: "bad type", type: "exploded" },
      null,
    ]);
    expect(out).toEqual([
      { timestamp: "10:00:00", message: "ok", type: "success" },
      { timestamp: "", message: "bad type", type: "info" },
    ]);
  });
});

describe("cleanAssistantDecision", () => {
  it("accepts a valid answer", () => {
    expect(cleanAssistantDecision({ action: "answer", message: "hello" })).toEqual({ action: "answer", message: "hello" });
  });

  it("accepts a valid tool call and stringifies args", () => {
    expect(cleanAssistantDecision({ action: "tool", tool: "remember", args: { content: "note" }, note: "n" })).toEqual({
      action: "tool",
      tool: "remember",
      args: { content: "note" },
      note: "n",
    });
  });

  it("rejects unknown tools, actions and non-string args", () => {
    expect(cleanAssistantDecision({ action: "tool", tool: "delete_everything" })).toBeNull();
    expect(cleanAssistantDecision({ action: "hack" })).toBeNull();
    expect(cleanAssistantDecision("answer")).toBeNull();
    expect(cleanAssistantDecision(null)).toBeNull();
    expect(cleanAssistantDecision({ action: "tool", tool: "remember", args: { content: { nested: true } } })!.args).toEqual({
      content: "[object Object]",
    });
  });
});
