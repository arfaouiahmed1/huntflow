import { describe, it, expect, beforeEach } from "vitest";
import { resumeVariantsRepo, ResumeVariant } from "@/lib/db";

describe("Resume Variants Repository & Funnel Store", () => {
  beforeEach(() => {
    const list = resumeVariantsRepo.list();
    for (const v of list) {
      resumeVariantsRepo.remove(v.id);
    }
  });

  it("seeds default variants when store is empty", () => {
    resumeVariantsRepo.seedDefaults();
    const list = resumeVariantsRepo.list();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.some((v) => v.archetype.includes("Staff Frontend"))).toBe(true);
    expect(list.some((v) => v.archetype.includes("Distributed Systems"))).toBe(true);
  });

  it("upserts and retrieves custom tagged variants", () => {
    const custom: ResumeVariant = {
      id: "var-ai-eng",
      name: "Senior AI / LLM Engineer",
      archetype: "AI Platform",
      tag: "ai-eng",
      templateId: "technical-modern",
      content: {
        header: {
          name: "Test AI",
          title: "AI Engineer",
          email: "ai@test.com",
          phone: "+1 555-0100",
          location: "Remote",
          linkedin: "linkedin.com/in/test",
          github: "github.com/test",
          portfolio: "test.ai",
        },
        summary: "Specialist in RAG pipelines and LangGraph multi-agent architectures.",
        skills: ["PyTorch", "Python", "LangGraph", "Vector DBs"],
        experience: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    resumeVariantsRepo.upsert(custom);

    const found = resumeVariantsRepo.get("var-ai-eng");
    expect(found).toBeDefined();
    expect(found?.name).toBe("Senior AI / LLM Engineer");
    expect(found?.content.skills).toContain("LangGraph");
  });
});
