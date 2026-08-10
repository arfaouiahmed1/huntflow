import { describe, it, expect, vi, beforeEach } from "vitest";
import { runResumeAgent, parseResumeTextFallback } from "@/agents/resumeAgent";
import { callLLMJSON, resolveChain } from "@/lib/llm/router";
import { testProfile } from "./fixtures";
import { ResumeContent } from "@/types";

vi.mock("@/lib/llm/router", () => ({
  callLLMJSON: vi.fn(),
  resolveChain: vi.fn(),
}));

const mockCallLLMJSON = vi.mocked(callLLMJSON);
const mockResolveChain = vi.mocked(resolveChain);

beforeEach(() => {
  mockCallLLMJSON.mockReset();
  mockResolveChain.mockReset();
  mockResolveChain.mockReturnValue([]);
});

function baseInput(overrides: Partial<Parameters<typeof runResumeAgent>[0]> = {}) {
  return {
    task: "draft" as const,
    kind: "resume" as const,
    templateId: "classic-ats",
    profile: testProfile,
    llmSettings: null,
    ...overrides,
  };
}

const llmContent: ResumeContent = {
  header: { name: "Jane Dev", title: "Senior Frontend Engineer", email: "jane@dev.io", phone: "555-0100", location: "Berlin", linkedin: "", github: "", portfolio: "" },
  summary: "Senior frontend engineer who led design-system work at scale.",
  skills: ["React", "TypeScript"],
  experience: [{ role: "Senior Engineer", company: "Acme", duration: "2022-2025", bullets: ["Led the frontend platform team, cutting bundle size 40%"] }],
};

describe("runResumeAgent — draft", () => {
  it("returns rendered tex for a letter and honors template choice", async () => {
    const res = await runResumeAgent(baseInput({ kind: "cover_letter", templateId: "letter-cover" }));
    expect(res.task).toBe("draft");
    expect(res.tex).toContain("\\documentclass");
    expect(res.tex).toContain("\\coverparagraph{");
    expect(res.content.paragraphs?.length).toBeGreaterThan(0);
    expect(res.tex).not.toContain("{{");
  });

  it("uses the LLM result when a provider is configured", async () => {
    mockResolveChain.mockReturnValue([{ id: "openrouter", enabled: true, apiKey: "sk-test" } as never]);
    mockCallLLMJSON.mockResolvedValue(llmContent as never);
    const res = await runResumeAgent(baseInput({}));
    expect(res.content.skills).toEqual(["React", "TypeScript"]);
    expect(res.content.experience?.[0].bullets[0]).toContain("40%");
    expect(res.tex).toContain("Jane Dev");
  });

  it("falls back deterministically when no provider is available", async () => {
    mockResolveChain.mockReturnValue([]);
    const res = await runResumeAgent(baseInput({}));
    expect(res.content.experience?.length).toBe(testProfile.experience.length);
    expect(res.notes?.[0]).toMatch(/No provider/);
  });

  it("draft with a target job passes the job into the prompt", async () => {
    mockResolveChain.mockReturnValue([{ id: "openrouter", enabled: true, apiKey: "sk-test" } as never]);
    mockCallLLMJSON.mockResolvedValue(llmContent as never);
    await runResumeAgent(baseInput({ job: { title: "Frontend Engineer", company: "Acme", jobDescription: "React + TypeScript" } }));
    const user = mockCallLLMJSON.mock.calls[0][0].user;
    expect(user).toContain("Acme");
    expect(mockCallLLMJSON.mock.calls[0][0].agent).toBe("resume_draft");
  });
});

describe("runResumeAgent — improve / tailor / ats / parse_pdf", () => {
  it("improve returns current content when the LLM is unavailable", async () => {
    mockResolveChain.mockReturnValue([]);
    const current: ResumeContent = { header: llmContent.header, summary: "old summary", skills: ["React"] };
    const res = await runResumeAgent(baseInput({ task: "improve", current }));
    expect(res.content.summary).toBe("old summary");
  });

  it("tailor reorders skills by JD relevance without a provider", async () => {
    mockResolveChain.mockReturnValue([]);
    const current: ResumeContent = { header: llmContent.header, summary: "s", skills: ["AWS", "React", "Docker"] };
    const res = await runResumeAgent(
      baseInput({ task: "tailor", current, job: { title: "React Engineer", company: "X", jobDescription: "We use React and TypeScript. Docker is a bonus." } })
    );
    expect(res.content.skills?.indexOf("React")).toBeLessThan(res.content.skills?.indexOf("AWS") ?? 99);
    expect(res.content.skills).toContain("Docker");
  });

  it("ats returns a report without touching the network", async () => {
    mockResolveChain.mockReturnValue([]);
    const res = await runResumeAgent(baseInput({ task: "ats", current: llmContent }));
    expect(res.ats?.score).toBeGreaterThanOrEqual(0);
    expect(res.ats?.checks.length).toBeGreaterThan(0);
  });

  it("parse_pdf uses the LLM when available", async () => {
    mockResolveChain.mockReturnValue([{ id: "openrouter", enabled: true, apiKey: "sk-test" } as never]);
    mockCallLLMJSON.mockResolvedValue(llmContent as never);
    const res = await runResumeAgent(baseInput({ task: "parse_pdf", extractedText: "Jane Dev\nSenior Frontend Engineer\njane@dev.io\nEXPERIENCE\nLed the platform team" }));
    expect(res.content.header.name).toBe("Jane Dev");
    expect(mockCallLLMJSON.mock.calls[0][0].agent).toBe("resume_parse");
  });

  it("parse_pdf falls back to the heuristic parser", async () => {
    mockResolveChain.mockReturnValue([]);
    const res = await runResumeAgent(
      baseInput({
        task: "parse_pdf",
        extractedText: "Jane Dev\nSenior Frontend Engineer\njane@dev.io\n+1 555-0100\nlinkedin.com/in/janedev\n\nSUMMARY\n6 years shipping React products\n\nEXPERIENCE\nSenior Engineer, Acme\n\nSKILLS\nReact, TypeScript, Node.js\n\nEDUCATION\nBSc CS, TU Berlin",
      })
    );
    expect(res.content.header.name).toBe("Jane Dev");
    expect(res.content.header.email).toBe("jane@dev.io");
    expect(res.content.skills).toContain("React");
    expect(res.notes?.[0]).toMatch(/No provider/);
  });
});

describe("parseResumeTextFallback", () => {
  it("extracts contact details and sections", () => {
    const c = parseResumeTextFallback("Jane Dev\nEngineer\njane@dev.io\n+49 30 12345678\nSUMMARY\nLoves React\nSKILLS\nReact, TypeScript\nEXPERIENCE\nSenior Engineer, Acme Corp");
    expect(c.header.email).toBe("jane@dev.io");
    expect(c.header.phone).toContain("+49");
    expect(c.summary).toContain("Loves React");
    expect(c.experience?.[0]?.role).toContain("Senior Engineer");
  });
});
