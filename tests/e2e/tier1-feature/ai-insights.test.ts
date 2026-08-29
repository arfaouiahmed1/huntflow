import { describe, it, expect, beforeEach } from "vitest";
import { POST as POST_GENERATE } from "@/app/api/generate/route";
import {
  createJsonRequest,
  parseResponse,
  resetTestDb,
  usageRepo,
} from "../helpers/testHarness";
import {
  mockJobApplication1,
  mockUserProfile,
} from "../helpers/testFixtures";
import {
  cleanSkillsGap,
  cleanSalaryIntel,
  cleanDocuments,
} from "@/lib/llm/sanitize";

describe("Tier 1: Feature Coverage — AI Insights & Generation Engine", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("1. POST /api/generate with type: recommendations works without mandatory job parameter", async () => {
    const req = createJsonRequest("http://localhost/api/generate", "POST", {
      type: "recommendations",
      profile: mockUserProfile,
      trackedJobs: [mockJobApplication1],
    });

    const res = await POST_GENERATE(req);
    expect(res.status).toBe(200);

    const data = await parseResponse<{ recommendations: unknown[] }>(res);
    expect(data.recommendations).toBeDefined();
    expect(Array.isArray(data.recommendations)).toBe(true);
    expect(data.recommendations.length).toBeGreaterThan(0);
  });

  it("2. POST /api/generate with type: skill_roadmap works with candidate profile and gaps without job", async () => {
    const req = createJsonRequest("http://localhost/api/generate", "POST", {
      type: "skill_roadmap",
      profile: mockUserProfile,
      gaps: ["Kubernetes", "Rust", "System Architecture"],
    });

    const res = await POST_GENERATE(req);
    expect(res.status).toBe(200);

    const data = await parseResponse<{ roadmap: { skill: string; priority: string; resources: string[] }[] }>(res);
    expect(data.roadmap).toBeDefined();
    expect(Array.isArray(data.roadmap)).toBe(true);
    expect(data.roadmap.length).toBeGreaterThan(0);
  });

  it("3. POST /api/generate with type: pipeline_report generates macro insights without single job", async () => {
    const req = createJsonRequest("http://localhost/api/generate", "POST", {
      type: "pipeline_report",
      profile: mockUserProfile,
      trackedJobs: [mockJobApplication1],
    });

    const res = await POST_GENERATE(req);
    expect(res.status).toBe(200);

    const data = await parseResponse<{ report: { headline: string; highlights: string[]; actions: string[] } }>(res);
    expect(data.report).toBeDefined();
    expect(typeof data.report.headline).toBe("string");
    expect(Array.isArray(data.report.highlights)).toBe(true);
  });

  it("4. POST /api/generate with type: match_analysis evaluates skills gap and returns matchScore (0-100)", async () => {
    const req = createJsonRequest("http://localhost/api/generate", "POST", {
      type: "match_analysis",
      job: mockJobApplication1,
      profile: mockUserProfile,
    });

    const res = await POST_GENERATE(req);
    expect(res.status).toBe(200);

    const data = await parseResponse<{
      analysis: {
        matchScore: number;
        matchingSkills: string[];
        missingSkills: string[];
        strengths: string[];
      };
    }>(res);

    expect(data.analysis).toBeDefined();
    expect(typeof data.analysis.matchScore).toBe("number");
    expect(data.analysis.matchScore).toBeGreaterThanOrEqual(0);
    expect(data.analysis.matchScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(data.analysis.matchingSkills)).toBe(true);
  });

  it("5. POST /api/generate with type: documents returns tailored deliverables", async () => {
    const req = createJsonRequest("http://localhost/api/generate", "POST", {
      type: "documents",
      job: mockJobApplication1,
      profile: mockUserProfile,
    });

    const res = await POST_GENERATE(req);
    expect(res.status).toBe(200);

    const data = await parseResponse<{
      documents: {
        tailoredResume?: string;
        coverLetter?: string;
        motivationLetter?: string;
        followUpEmail?: string;
      };
    }>(res);

    expect(data.documents).toBeDefined();
    expect(data.documents.tailoredResume).toContain("ALEX JOHNSON");
    expect(data.documents.coverLetter).toContain(mockJobApplication1.company);
    expect(data.documents.followUpEmail).toBeDefined();
  });

  it("6. POST /api/generate with type: star_flashcards returns structured STAR cards", async () => {
    const req = createJsonRequest("http://localhost/api/generate", "POST", {
      type: "star_flashcards",
      job: mockJobApplication1,
      profile: mockUserProfile,
    });

    const res = await POST_GENERATE(req);
    expect(res.status).toBe(200);

    const data = await parseResponse<{ cards: { question: string; situation: string; task: string; action: string; result: string }[] }>(res);
    expect(data.cards).toBeDefined();
    expect(Array.isArray(data.cards)).toBe(true);
    expect(data.cards.length).toBeGreaterThan(0);
    expect(data.cards[0].situation).toBeDefined();
    expect(data.cards[0].action).toBeDefined();
  });

  it("7. POST /api/generate with type: interview_questions returns categorized questions", async () => {
    const req = createJsonRequest("http://localhost/api/generate", "POST", {
      type: "interview_questions",
      job: mockJobApplication1,
      profile: mockUserProfile,
    });

    const res = await POST_GENERATE(req);
    expect(res.status).toBe(200);

    const data = await parseResponse<{ questions: { question: string; category: string; difficulty: string }[] }>(res);
    expect(data.questions).toBeDefined();
    expect(Array.isArray(data.questions)).toBe(true);
    expect(data.questions.length).toBeGreaterThan(0);
  });

  it("8. POST /api/generate with type: job_brief synthesizes role requirements and company summary", async () => {
    const req = createJsonRequest("http://localhost/api/generate", "POST", {
      type: "job_brief",
      job: mockJobApplication1,
    });

    const res = await POST_GENERATE(req);
    expect(res.status).toBe(200);

    const data = await parseResponse<{ brief: { summary: string; techStack: string[]; topRequirements: string[] } }>(res);
    expect(data.brief).toBeDefined();
    expect(typeof data.brief.summary).toBe("string");
    expect(Array.isArray(data.brief.techStack)).toBe(true);
  });

  it("9. POST /api/generate with type: salary_intel produces salary range estimate and negotiation advice", async () => {
    const req = createJsonRequest("http://localhost/api/generate", "POST", {
      type: "salary_intel",
      job: mockJobApplication1,
      profile: mockUserProfile,
    });

    const res = await POST_GENERATE(req);
    expect(res.status).toBe(200);

    const data = await parseResponse<{ salary: { estimateLow: number; estimateHigh: number; basis: string } }>(res);
    expect(data.salary).toBeDefined();
    expect(data.salary.estimateLow).toBeLessThanOrEqual(data.salary.estimateHigh);
    expect(data.salary.basis).toBeDefined();
  });

  it("10. Deterministic fallback generators produce valid, sanitized deliverables when LLM is offline", async () => {
    // Calling with empty/null LLM settings triggers fallback path
    const req = createJsonRequest("http://localhost/api/generate", "POST", {
      type: "match_analysis",
      job: mockJobApplication1,
      profile: mockUserProfile,
      llmSettings: { providerChain: [] },
    });

    const res = await POST_GENERATE(req);
    expect(res.status).toBe(200);

    const data = await parseResponse<{ analysis: { matchScore: number; matchingSkills: string[] } }>(res);
    expect(data.analysis.matchScore).toBeGreaterThanOrEqual(0);
    expect(data.analysis.matchingSkills.length).toBeGreaterThan(0);
  });

  it("11. LLM output sanitizer clamps out-of-bounds match scores (> 100 or < 0)", () => {
    const oversizedAnalysis = {
      matchScore: 999,
      matchingSkills: ["React"],
      missingSkills: [],
      strengths: [],
      recommendations: [],
      keyTermFrequency: [],
    };
    const cleaned = cleanSkillsGap(oversizedAnalysis);
    expect(cleaned?.matchScore).toBe(100);

    const negativeAnalysis = {
      ...oversizedAnalysis,
      matchScore: -50,
    };
    const cleanedNegative = cleanSkillsGap(negativeAnalysis);
    expect(cleanedNegative?.matchScore).toBe(0);
  });

  it("12. LLM output sanitizer swaps inverted salary estimates (where estimateLow > estimateHigh)", () => {
    const invertedSalary = {
      estimateLow: 250000,
      estimateHigh: 150000,
      basis: "market" as const,
      disclosedRange: null,
      factors: [],
      negotiationTips: [],
    };

    const cleaned = cleanSalaryIntel(invertedSalary);
    expect(cleaned?.estimateLow).toBe(150000);
    expect(cleaned?.estimateHigh).toBe(250000);
  });

  it("13. LLM output sanitizer enforces string limits on generated documents (max 20,000 chars)", () => {
    const hugeResume = "A".repeat(30000);
    const cleaned = cleanDocuments({ tailoredResume: hugeResume });
    expect(cleaned?.tailoredResume?.length).toBeLessThanOrEqual(20000);
  });

  it("14. Telemetry logging records model token counts and latency to usage_log", () => {
    usageRepo.log({
      agent: "generate",
      kind: "completion",
      provider: "mock_provider",
      model: "mock-model",
      status: "ok",
      promptTokens: 500,
      completionTokens: 250,
      latencyMs: 320,
      costEst: 0.005,
    });

    const totals = usageRepo.totals();
    expect(totals.calls).toBeGreaterThan(0);
    expect(totals.tokens).toBeGreaterThan(0);
  });

  it("15. Missing type returns 400 with BAD_BODY", async () => {
    const req = createJsonRequest("http://localhost/api/generate", "POST", {
      job: mockJobApplication1,
    });

    const res = await POST_GENERATE(req);
    expect(res.status).toBe(400);

    const body = await parseResponse<{ error: { code: string; message: string } | string }>(res);
    const msg = typeof body.error === "object" ? body.error.message : body.error;
    expect(msg).toContain("Missing generation type");
  });
});
