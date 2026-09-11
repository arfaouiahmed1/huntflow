import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";
import { callLLMJSON, resolveChain } from "@/lib/llm/router";
import { searchVault, VaultSearchHit } from "@/lib/vault/search";

vi.mock("@/lib/llm/router", () => ({
  callLLMJSON: vi.fn(),
  resolveChain: vi.fn().mockReturnValue([{ apiKey: "mock-key", provider: "openai" }]),
}));

vi.mock("@/lib/vault/search", () => ({
  searchVault: vi.fn(),
}));

const mockCallLLMJSON = vi.mocked(callLLMJSON);
const mockResolveChain = vi.mocked(resolveChain);
const mockSearchVault = vi.mocked(searchVault);

const VALID_LATEX = `\\documentclass{article}
\\begin{document}
\\section{Experience}
Software Engineer at Acme Corp.
\\end{document}`;

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/resume/copilot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeVaultHit(overrides: Partial<VaultSearchHit> = {}): VaultSearchHit {
  return {
    docId: "doc-1",
    docName: "Production-Metrics-2024.md",
    chunkId: 1,
    chunkIndex: 0,
    text: "Reduced Kafka consumer lag by 80% under peak load of 150k events/sec.",
    score: 0.95,
    semanticScore: 0.92,
    lexicalScore: 0.98,
    rerankScore: 0.95,
    matchedTerms: ["kafka", "lag"],
    strategy: "hybrid",
    model: "text-embedding-3-small",
    provenance: {
      docName: "Production-Metrics-2024.md",
      chunkIndex: 0,
      similarity: 0.95,
      excerpt: "Reduced Kafka consumer lag by 80%",
    },
    ...overrides,
  };
}

beforeEach(() => {
  mockCallLLMJSON.mockReset();
  mockResolveChain.mockReset();
  mockResolveChain.mockReturnValue([{ apiKey: "mock-key", provider: "openai" } as never]);
  mockSearchVault.mockReset();
  mockSearchVault.mockResolvedValue([]);
});

describe("POST /api/resume/copilot — Raw TeX Copilot & Agent Grounding", () => {
  it("rejects request without message with 400 status", async () => {
    const req = makePostRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("message is required");
  });

  it("handles raw .tex input and returns sanitized full-file LaTeX", async () => {
    mockCallLLMJSON.mockResolvedValueOnce({
      reply: "I've quantified your experience with Google XYZ metrics.",
      actionSummary: "Quantified 3 bullet points with latency and revenue impact.",
      tex: `\\documentclass{article}
\\begin{document}
\\section{Experience}
Spearheaded payment pipeline redesign, cutting p99 latency by 42% ($2M annual savings).
\\end{document}`,
    });

    const req = makePostRequest({
      message: "Quantify my bullet points",
      tex: VALID_LATEX,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.reply).toContain("quantified your experience");
    expect(data.actionSummary).toContain("Quantified 3 bullet points");
    expect(data.tex).toContain("cutting p99 latency by 42%");
    expect(data.tex).toContain("\\end{document}");
  });

  it("strips markdown fences and appends \\end{document} when missing", async () => {
    mockCallLLMJSON.mockResolvedValueOnce({
      reply: "Updated LaTeX document.",
      actionSummary: "Formatted layout.",
      tex: "```latex\n\\documentclass{article}\n\\begin{document}\nClean Content without explicit end",
    });

    const req = makePostRequest({
      message: "Make clean",
      tex: VALID_LATEX,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(data.tex).not.toContain("```");
    expect(data.tex).toContain("\\begin{document}");
    expect(data.tex).toContain("Clean Content without explicit end");
    expect(data.tex).toContain("\\end{document}");
  });

  it("falls back to inputTex if LLM returns empty or truncated tex", async () => {
    mockCallLLMJSON.mockResolvedValueOnce({
      reply: "No structural edits required.",
      actionSummary: "Kept original buffer.",
      tex: "",
    });

    const req = makePostRequest({
      message: "Check for typos",
      tex: VALID_LATEX,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.tex).toBe(VALID_LATEX);
  });

  it("injects target job context and typed Vault snippets into prompt", async () => {
    mockSearchVault.mockResolvedValueOnce([makeVaultHit()]);

    mockCallLLMJSON.mockResolvedValueOnce({
      reply: "Tailored for Stripe Staff role using production metrics.",
      actionSummary: "Aligned with Kafka streaming requirements.",
      tex: VALID_LATEX,
    });

    const req = makePostRequest({
      message: "Tailor my resume for Stripe",
      tex: VALID_LATEX,
      targetJob: {
        title: "Staff Distributed Systems Engineer",
        company: "Stripe",
        description: "Looking for experts in Kafka distributed event streaming and high availability.",
      },
    });

    await POST(req);

    expect(mockSearchVault).toHaveBeenCalledWith("Tailor my resume for Stripe", 4);
    expect(mockCallLLMJSON).toHaveBeenCalledTimes(1);

    const callArgs = mockCallLLMJSON.mock.calls[0][0];
    const prompt = callArgs.user;

    expect(prompt).toContain("TARGET JOB CONTEXT:");
    expect(prompt).toContain("Staff Distributed Systems Engineer");
    expect(prompt).toContain("Stripe");
    expect(prompt).toContain("Kafka distributed event streaming");
    expect(prompt).toContain("VAULT KNOWLEDGE SNIPPETS");
    expect(prompt).toContain("Production-Metrics-2024.md");
    expect(prompt).toContain("Reduced Kafka consumer lag by 80%");
  });

  it("normalizes {sender, text} shape history and slices to last 6 items", async () => {
    mockCallLLMJSON.mockResolvedValueOnce({
      reply: "Shortened the summary section.",
      actionSummary: "Reduced summary to 3 concise lines.",
      tex: VALID_LATEX,
    });

    const historyItems = [
      { sender: "user", text: "Old message 1" },
      { sender: "assistant", text: "Old reply 1" },
      { sender: "user", text: "Old message 2" },
      { sender: "assistant", text: "Old reply 2" },
      { sender: "user", text: "Recent message 1" },
      { sender: "assistant", text: "Recent reply 1" },
      { sender: "user", text: "Can you review my summary?" },
      { sender: "assistant", text: "Your summary is currently 6 lines long." },
    ];

    const req = makePostRequest({
      message: "Make it even shorter",
      tex: VALID_LATEX,
      history: historyItems,
    });

    await POST(req);

    const callArgs = mockCallLLMJSON.mock.calls[0][0];
    const prompt = callArgs.user;

    expect(prompt).toContain("RECENT CONVERSATION HISTORY:");
    expect(prompt).toContain("User: Can you review my summary?");
    expect(prompt).toContain("Assistant: Your summary is currently 6 lines long.");
    // Sliced to last 6 items: "Old message 1" should be omitted
    expect(prompt).not.toContain("Old message 1");
  });

  it("swallows vault search exceptions and continues successfully without failing the request", async () => {
    mockSearchVault.mockRejectedValueOnce(new Error("Database disk I/O error in vector index"));

    mockCallLLMJSON.mockResolvedValueOnce({
      reply: "Reviewed resume successfully.",
      actionSummary: "Polished wording.",
      tex: VALID_LATEX,
    });

    const req = makePostRequest({
      message: "Polish phrasing",
      tex: VALID_LATEX,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.tex).toBe(VALID_LATEX);
  });

  it("handles legacy structured ResumeContent payload by rendering LaTeX", async () => {
    mockCallLLMJSON.mockResolvedValueOnce({
      reply: "Updated your skills list.",
      actionSummary: "Added Docker and Kubernetes.",
      updatedResume: {
        header: {
          name: "Alex Rivera",
          title: "Senior SRE",
          email: "alex@rivera.dev",
          phone: "555-1234",
          location: "NYC",
          linkedin: "",
          github: "",
          portfolio: "",
        },
        summary: "Cloud and Kubernetes infrastructure engineer.",
        skills: ["Kubernetes", "Docker", "Go", "Terraform"],
        experience: [],
        education: [],
        projects: [],
      },
    });

    const req = makePostRequest({
      message: "Add Kubernetes and Docker",
      resume: {
        header: { name: "Alex Rivera", title: "SRE", email: "alex@rivera.dev", phone: "", location: "", linkedin: "", github: "", portfolio: "" },
        skills: ["Go"],
      },
      templateId: "classic-ats",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.updatedResume.skills).toContain("Kubernetes");
    expect(data.tex).toContain("\\documentclass");
    expect(data.tex).toContain("Alex Rivera");
  });

  it("handles offline mode gracefully when no LLM provider is configured", async () => {
    mockResolveChain.mockReturnValueOnce([]);

    const req = makePostRequest({
      message: "Quantify my bullet points",
      tex: "\\documentclass{article}\\begin{document}\\item Managed deployments\\end{document}",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.reply).toContain("offline mode");
    expect(data.tex).toContain("Managed deployments");
  });
});
