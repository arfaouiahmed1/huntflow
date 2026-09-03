import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/generate/route";
import { generateJSON } from "@/lib/llm/client";
import { NextRequest } from "next/server";
import { testProfile } from "@/agents/__tests__/fixtures";

vi.mock("@/lib/llm/client", () => ({
  generateJSON: vi.fn(),
}));

const mockGenerateJSON = vi.mocked(generateJSON);

function post(body: unknown) {
  return new NextRequest("http://localhost/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const job = {
  id: "g-1",
  title: "Frontend Engineer",
  company: "Acme",
  location: "Remote",
  salary: "",
  url: "",
  jobDescription: "React, TypeScript, Node.js, GraphQL, AWS, Tailwind CSS, Docker, CI/CD.",
  matchScore: 80,
  status: "applied",
};

describe("POST /api/generate — validation", () => {
  it("rejects a missing type with 400 BAD_BODY", async () => {
    const res = await POST(post({ job }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("BAD_BODY");
  });

  it("rejects a missing job with 400", async () => {
    const res = await POST(post({ type: "match_analysis", profile: testProfile }));
    expect(res.status).toBe(400);
  });

  it("rejects unknown types with 400", async () => {
    const res = await POST(post({ type: "magic", job, profile: testProfile }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/generate — response contract per feature (AppContext shapes)", () => {
  beforeEach(() => {
    mockGenerateJSON.mockReset();
  });

  it("match_analysis returns data.analysis with matchScore + skillsGap fields", async () => {
    mockGenerateJSON.mockRejectedValue(new Error("no provider"));
    const res = await POST(post({ type: "match_analysis", job, profile: testProfile }));
    expect(res.status).toBe(200);
    const { analysis } = await res.json();
    expect(typeof analysis.matchScore).toBe("number");
    expect(analysis.matchScore).toBeGreaterThanOrEqual(38);
    expect(analysis.matchScore).toBeLessThanOrEqual(97);
    expect(Array.isArray(analysis.matchingSkills)).toBe(true);
    expect(Array.isArray(analysis.missingSkills)).toBe(true);
    expect(Array.isArray(analysis.strengths)).toBe(true);
    expect(Array.isArray(analysis.recommendations)).toBe(true);
  });

  it("match_analysis uses the LLM result when available", async () => {
    mockGenerateJSON.mockResolvedValue({
      matchScore: 91,
      matchingSkills: ["React"],
      missingSkills: ["Kubernetes"],
      strengths: ["x"],
      recommendations: ["y"],
    });
    const res = await POST(post({ type: "match_analysis", job, profile: testProfile }));
    const { analysis } = await res.json();
    expect(analysis.matchScore).toBe(91);
  });

  it("documents returns data.documents with the four deliverables", async () => {
    mockGenerateJSON.mockRejectedValue(new Error("no provider"));
    const res = await POST(post({ type: "documents", job, profile: testProfile }));
    expect(res.status).toBe(200);
    const { documents } = await res.json();
    for (const key of ["tailoredResume", "coverLetter", "motivationLetter", "followUpEmail"]) {
      expect(typeof documents[key]).toBe("string");
      expect(documents[key].length).toBeGreaterThan(20);
    }
  });

  it("star_flashcards returns an array under data.cards", async () => {
    mockGenerateJSON.mockResolvedValue([{ id: "c1", situation: "s", task: "t", action: "a", result: "r" }]);
    const res = await POST(post({ type: "star_flashcards", job, profile: testProfile }));
    const { cards } = await res.json();
    expect(Array.isArray(cards)).toBe(true);
    expect(cards[0]).toHaveProperty("id");
  });

  it("interview_questions returns an array under data.questions", async () => {
    mockGenerateJSON.mockResolvedValue([{ question: "Tell me about yourself", type: "behavioral" }]);
    const res = await POST(post({ type: "interview_questions", job, profile: testProfile }));
    const { questions } = await res.json();
    expect(Array.isArray(questions)).toBe(true);
    expect(questions[0]).toHaveProperty("question");
  });

  it("job_brief returns data.brief", async () => {
    mockGenerateJSON.mockRejectedValue(new Error("no provider"));
    const res = await POST(post({ type: "job_brief", job, profile: testProfile }));
    expect(res.status).toBe(200);
    const { brief } = await res.json();
    expect(brief).toBeTruthy();
    expect(typeof brief).toBe("object");
  });

  it("salary_intel returns data.salary", async () => {
    mockGenerateJSON.mockRejectedValue(new Error("no provider"));
    const res = await POST(post({ type: "salary_intel", job, profile: testProfile }));
    expect(res.status).toBe(200);
    const { salary } = await res.json();
    expect(salary).toBeTruthy();
    expect(typeof salary).toBe("object");
  });

  it("recommendations returns an array under data.recommendations without requiring job", async () => {
    mockGenerateJSON.mockRejectedValue(new Error("no provider"));
    const res = await POST(
      post({ type: "recommendations", profile: testProfile, jobs: [job] })
    );
    expect(res.status).toBe(200);
    const { recommendations } = await res.json();
    expect(Array.isArray(recommendations)).toBe(true);
  });

  it("skill_roadmap returns an array under data.roadmap without requiring job", async () => {
    mockGenerateJSON.mockRejectedValue(new Error("no provider"));
    const res = await POST(post({ type: "skill_roadmap", profile: testProfile, gaps: ["K8s"] }));
    expect(res.status).toBe(200);
    const { roadmap } = await res.json();
    expect(Array.isArray(roadmap)).toBe(true);
  });

  it("pipeline_report returns data.report without requiring job", async () => {
    mockGenerateJSON.mockRejectedValue(new Error("no provider"));
    const res = await POST(post({ type: "pipeline_report", profile: testProfile, jobs: [job] }));
    expect(res.status).toBe(200);
    const { report } = await res.json();
    expect(report).toBeTruthy();
  });

  it("passes the chosen llmSettings to the model", async () => {
    mockGenerateJSON.mockResolvedValue({ matchScore: 50, matchingSkills: [], missingSkills: [], strengths: [], recommendations: [] });
    await POST(post({ type: "match_analysis", job, profile: testProfile, llmSettings: { providerId: "openrouter", apiKey: "sk-test" } }));
    expect(mockGenerateJSON.mock.calls[0][0]).toMatchObject({ apiKey: "sk-test" });
  });
});

describe("POST /api/generate — LLM garbage is cleaned, never persisted raw", () => {
  beforeEach(() => {
    mockGenerateJSON.mockReset();
  });

  it("clamps a match score of 150 and drops non-string skills", async () => {
    mockGenerateJSON.mockResolvedValue({
      matchScore: 150,
      matchingSkills: ["React", 42],
      missingSkills: { not: "an array" },
      strengths: null,
      recommendations: [],
    });
    const res = await POST(post({ type: "match_analysis", job, profile: testProfile }));
    const { analysis } = await res.json();
    expect(analysis.matchScore).toBe(100);
    expect(analysis.matchingSkills).toEqual(["React"]);
    expect(Array.isArray(analysis.missingSkills)).toBe(true);
    expect(Array.isArray(analysis.strengths)).toBe(true);
  });

  it("falls back to the deterministic generator when the model returns a hopeless payload", async () => {
    mockGenerateJSON.mockResolvedValue("I feel lucky today");
    const res = await POST(post({ type: "match_analysis", job, profile: testProfile }));
    const { analysis } = await res.json();
    expect(analysis.matchScore).toBeGreaterThanOrEqual(38);
    expect(analysis.matchScore).toBeLessThanOrEqual(97);
    expect(analysis.matchingSkills.length).toBeGreaterThan(0);
  });

  it("drops flashcards without any STAR content", async () => {
    mockGenerateJSON.mockResolvedValue([
      { situation: "S", task: "T", action: "A", result: "R" },
      { nonsense: true },
      "text",
    ]);
    const res = await POST(post({ type: "star_flashcards", job, profile: testProfile }));
    const { cards } = await res.json();
    expect(cards.length).toBe(1);
    expect(cards[0]).toHaveProperty("id");
    expect(cards[0]).toHaveProperty("situation", "S");
  });

  it("swaps an inverted salary range and rejects zero ranges", async () => {
    mockGenerateJSON.mockResolvedValue({ estimateLow: 200, estimateHigh: 100, basis: "posting", factors: ["Berlin"], negotiationTips: [] });
    const res = await POST(post({ type: "salary_intel", job, profile: testProfile }));
    const { salary } = await res.json();
    expect(salary.estimateLow).toBe(100);
    expect(salary.estimateHigh).toBe(200);

    mockGenerateJSON.mockResolvedValue({ estimateLow: "none", estimateHigh: 0 });
    const res2 = await POST(post({ type: "salary_intel", job, profile: testProfile }));
    const { salary: fallbackSalary } = await res2.json();
    expect(fallbackSalary.estimateHigh).toBeGreaterThan(0);
  });

  it("clamps document length and drops invalid deliverables", async () => {
    mockGenerateJSON.mockResolvedValue({ tailoredResume: "R".repeat(50000), coverLetter: 123, motivationLetter: "Real letter" });
    const res = await POST(post({ type: "documents", job, profile: testProfile }));
    const { documents } = await res.json();
    expect(documents.tailoredResume.length).toBeLessThanOrEqual(20000);
    expect(documents.coverLetter).toBeUndefined();
    expect(documents.motivationLetter).toBe("Real letter");
  });
});
