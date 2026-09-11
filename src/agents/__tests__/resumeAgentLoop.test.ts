import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runResumeAgentLoop,
  heuristicPatch,
  patchTexViaLLM,
  type AgentLoopEvent,
} from "@/agents/resumeAgent";
import { compileWithSynctex, PdfError } from "@/lib/pdf/compileLatex";
import { callLLM, resolveChain } from "@/lib/llm/router";
import { testProfile } from "./fixtures";

vi.mock("@/lib/pdf/compileLatex", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pdf/compileLatex")>();
  return {
    ...actual,
    compileWithSynctex: vi.fn(),
  };
});

vi.mock("@/lib/llm/router", () => ({
  callLLM: vi.fn(),
  callLLMJSON: vi.fn(),
  resolveChain: vi.fn().mockReturnValue([]),
}));

const mockCompileWithSynctex = vi.mocked(compileWithSynctex);
const mockCallLLM = vi.mocked(callLLM);
const mockResolveChain = vi.mocked(resolveChain);

const VALID_RESUME_TEX = `\\documentclass{article}
\\begin{document}
\\section{Summary}
Experienced systems engineer with 8 years building distributed platforms.
\\section{Experience}
Senior Software Engineer at CloudCorp.
\\section{Education}
B.S. in Computer Science.
\\section{Skills}
Go, TypeScript, Kubernetes, PostgreSQL
\\end{document}`;

beforeEach(() => {
  mockCompileWithSynctex.mockReset();
  mockCallLLM.mockReset();
  mockResolveChain.mockReset();
  mockResolveChain.mockReturnValue([]);
});

describe("heuristicPatch — Deterministic LaTeX Syntax Repair", () => {
  it("removes undefined control sequences", () => {
    const broken = "\\documentclass{article}\n\\begin{document}\n\\badcommand\nHello world\n\\end{document}";
    const logTail = "! Undefined control sequence.\nl.3 \\badcommand";
    const patched = heuristicPatch(broken, logTail);
    expect(patched).not.toContain("\\badcommand");
    expect(patched).toContain("Hello world");
  });

  it("removes \\undefined control sequence", () => {
    const broken = "\\documentclass{article}\n\\begin{document}\n\\undefined\nBody\n\\end{document}";
    const logTail = "! Undefined control sequence.\nl.3 \\undefined";
    const patched = heuristicPatch(broken, logTail);
    expect(patched).not.toContain("\\undefined");
    expect(patched).toContain("Body");
  });

  it("closes unclosed itemize environments", () => {
    const broken = "\\documentclass{article}\n\\begin{document}\n\\begin{itemize}\n\\item Led infrastructure team\n\\end{document}";
    const logTail = "! LaTeX Error: \\begin{itemize} on input line 3 ended by \\end{document}.";
    const patched = heuristicPatch(broken, logTail);
    expect(patched).toContain("\\end{itemize}");
    expect(patched).toContain("\\end{document}");
  });

  it("appends \\end{document} if missing", () => {
    const broken = "\\documentclass{article}\n\\begin{document}\nHello";
    const logTail = "! Emergency stop. File ended while scanning use of \\begin{document}.";
    const patched = heuristicPatch(broken, logTail);
    expect(patched).toContain("\\end{document}");
  });

  it("repairs missing closing braces", () => {
    const broken = "\\textbf{Bold title without close brace\n\\section{Experience}";
    const logTail = "! File ended while scanning use of \\textbf.";
    const patched = heuristicPatch(broken, logTail);
    expect((patched.match(/\{/g) || []).length).toBe((patched.match(/\}/g) || []).length);
  });
});

describe("patchTexViaLLM", () => {
  it("uses LLM repair when provider is configured and output is valid LaTeX", async () => {
    mockResolveChain.mockReturnValueOnce([{ provider: "openai", model: "gpt-4o", apiKey: "mock-key" } as never]);
    mockCallLLM.mockResolvedValueOnce({
      text: "```latex\n\\documentclass{article}\n\\begin{document}\nRepaired LaTeX by LLM\n\\end{document}\n```",
      providerId: "openai",
      model: "gpt-4o",
      attempts: 1,
    });

    const badTex = "\\documentclass{article}\n\\begin{document}\nBroken";
    const logTail = "! Undefined control sequence.";
    const patched = await patchTexViaLLM(badTex, logTail);

    expect(patched).toContain("Repaired LaTeX by LLM");
    expect(patched).not.toContain("```");
    expect(patched).toContain("\\begin{document}");
  });

  it("falls back to heuristicPatch when no LLM provider is configured", async () => {
    mockResolveChain.mockReturnValueOnce([]);
    const badTex = "\\documentclass{article}\n\\begin{document}\n\\badcommand\nContent\n\\end{document}";
    const logTail = "! Undefined control sequence.\nl.3 \\badcommand";
    const patched = await patchTexViaLLM(badTex, logTail);

    expect(patched).not.toContain("\\badcommand");
    expect(patched).toContain("Content");
  });
});

describe("runResumeAgentLoop — Self-Healing Compilation & SSE Event Stream", () => {
  it("compiles cleanly on first attempt with initialTex and emits complete event stream", async () => {
    mockCompileWithSynctex.mockResolvedValueOnce({
      pdf: Buffer.from("%PDF-1.4 simulated"),
      token: "test-token-123",
      logTail: "Output written on doc.pdf (1 page).",
    });

    const events: AgentLoopEvent[] = [];
    const result = await runResumeAgentLoop(
      {
        task: "draft",
        kind: "resume",
        templateId: "classic-ats",
        profile: testProfile,
        initialTex: VALID_RESUME_TEX,
      },
      (ev) => events.push(ev)
    );

    expect(result.approved).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.token).toBe("test-token-123");

    // Verifies full SSE event progression
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain("draft");
    expect(eventTypes).toContain("latex_log");
    expect(eventTypes).toContain("ats_score");
    expect(eventTypes).toContain("done");

    // ATS report computed
    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent?.ats?.score).toBeGreaterThan(0);
  });

  it("self-heals on compilation failure: patches LaTeX and succeeds on retry", async () => {
    const brokenTex = "\\documentclass{article}\n\\begin{document}\n\\badcommand\n\\begin{itemize}\n\\item Shipped systems\n\\end{document}";

    // First attempt fails with undefined command and unclosed itemize
    mockCompileWithSynctex.mockRejectedValueOnce(
      new PdfError("Compile error", "! Undefined control sequence.\nl.3 \\badcommand")
    );

    // Second attempt succeeds after heuristic repair
    mockCompileWithSynctex.mockResolvedValueOnce({
      pdf: Buffer.from("%PDF-1.4 simulated"),
      token: "healed-token-456",
      logTail: "Output written on doc.pdf (1 page).",
    });

    const events: AgentLoopEvent[] = [];
    const result = await runResumeAgentLoop(
      {
        task: "draft",
        kind: "resume",
        templateId: "classic-ats",
        profile: testProfile,
        initialTex: brokenTex,
        maxPatches: 2,
      },
      (ev) => events.push(ev)
    );

    expect(result.attempts).toBe(2);
    expect(result.token).toBe("healed-token-456");

    // Verifies patch event occurred
    const patchEvents = events.filter((e) => e.type === "patch");
    expect(patchEvents.length).toBe(1);
    expect(patchEvents[0].attempt).toBe(1);
    expect(result.tex).not.toContain("\\badcommand");
  });

  it("stops at maxPatches limit if syntax errors cannot be resolved", async () => {
    const unfixableTex = "\\documentclass{article}\n\\begin{document}\nBroken syntax that always fails";

    mockCompileWithSynctex.mockRejectedValue(
      new PdfError("Fatal compile failure", "! Fatal error occurred, no output PDF file produced!")
    );

    const events: AgentLoopEvent[] = [];
    const result = await runResumeAgentLoop(
      {
        task: "draft",
        kind: "resume",
        templateId: "classic-ats",
        profile: testProfile,
        initialTex: unfixableTex,
        maxPatches: 1,
      },
      (ev) => events.push(ev)
    );

    expect(result.attempts).toBe(2); // Initial attempt 0 + 1 patch retry
    expect(result.approved).toBe(false);

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.message).toContain("Fatal compile failure");
  });
});
