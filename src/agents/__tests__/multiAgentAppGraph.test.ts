import { describe, it, expect, vi } from "vitest";
import { runMultiAgentApp, streamMultiAgentApp, resumeMultiAgentApp } from "../multiAgentAppGraph";
import { UserProfile } from "@/types";

vi.mock("@/lib/agents/tools/multiAgentTools", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agents/tools/multiAgentTools")>(
    "@/lib/agents/tools/multiAgentTools",
  );
  return {
    ...actual,
    executeCompanyIntelTool: vi.fn().mockResolvedValue({
      success: true,
      atsType: "generic",
      cultureKeywords: ["product"],
      research: { sources: [], news: [], facts: [] },
    }),
    executeRegionalNormsTool: vi.fn().mockImplementation(async ({ region }: { region: string }) => ({
      rules: {
        name: region === "DE" ? "Germany" : region === "FR" ? "France" : "United States",
        recommendedTemplate: region === "DE" ? "tabular-german" : region === "FR" ? "modern-french" : "classic-ats",
      },
      meta: { searchPerformed: false, llmUsed: false },
    })),
    executePiiSanitizerTool: vi.fn().mockResolvedValue({
      hasRedactions: false,
      llmUsed: false,
      llmFindings: [],
      meta: { ssnHits: 0, dobHits: 0 },
    }),
    executeResumeCVTailorTool: vi.fn().mockImplementation(async ({ region }: { region: string }) => ({
      matchingSkills: ["React", "TypeScript"],
      missingSkills: ["GraphQL"],
      recommendedTemplate: region === "DE" ? "tabular-german" : region === "FR" ? "modern-french" : "classic-ats",
      llmUsed: false,
      vaultHitsCount: 0,
      cultureKeywords: [],
    })),
    executeLetterTailorTool: vi.fn().mockResolvedValue({
      salutation: "Dear Hiring Manager,",
      closing: "Sincerely,",
      letterKind: "cover_letter",
      llmUsed: false,
      companyResearch: null,
      meta: { searchPerformed: false, sourcesCount: 0 },
    }),
    executeInterviewPrepTool: vi.fn().mockResolvedValue({
      focusTopics: ["React architecture"],
      llmUsed: false,
      meta: { searchPerformed: false, sourcesCount: 0 },
    }),
    executeOutreachEmailTool: vi.fn().mockResolvedValue({ suggestedSubject: "Lead Frontend Developer" }),
    executeAtsAuditTool: vi.fn().mockResolvedValue({ overallScore: 82, keywordMatchRate: 80 }),
  };
});

vi.mock("@/lib/agents/executeApply", () => ({
  executeApply: vi.fn().mockResolvedValue({ status: "manual_required", fields: [], logs: [] }),
}));

const mockProfile: UserProfile = {
  name: "Jane Dev",
  targetTitle: "Senior Full Stack Engineer",
  email: "jane@example.com",
  phone: "+1 555-0199",
  location: "New York, NY",
  summary: "Senior Full Stack Engineer with 7 years of experience in React, Node.js, and TypeScript.",
  skills: ["React", "TypeScript", "Node.js", "GraphQL", "AWS", "Docker", "Tailwind CSS"],
  experience: [
    {
      id: "exp_1",
      company: "Acme Corp",
      role: "Senior Engineer",
      duration: "2021 - Present",
      bulletPoints: ["Led frontend architecture overhaul using Next.js and React 19.", "Reduced LCP by 40%."],
    },
  ],
  education: [
    {
      id: "edu_1",
      school: "MIT",
      degree: "B.S. Computer Science",
      year: "2018",
    },
  ],
};

const mockJob = {
  id: "job_test_123",
  title: "Lead Frontend Developer",
  company: "Stripe",
  url: "https://stripe.com/jobs/123",
  jobDescription: "Looking for a Lead Frontend Developer proficient in React, TypeScript, GraphQL, and AWS.",
};

describe("MultiAgentAppGraph Engine", () => {
  it("runs the full 11-agent pipeline for US region", async () => {
    const res = await runMultiAgentApp({
      job: mockJob,
      profile: mockProfile,
      targetRegion: "US",
      submit: false,
      minMatch: 60,
    });

    expect(res.threadId).toBeDefined();
    expect(res.atsScore).toBeGreaterThan(0);
    expect(res.matchingSkills).toContain("React");
    expect(res.recommendedTemplate).toBe("classic-ats");
    expect(res.logs.length).toBeGreaterThanOrEqual(10);
  });

  it("runs the pipeline for German (DE) region and selects DACH template", async () => {
    const res = await runMultiAgentApp({
      job: mockJob,
      profile: mockProfile,
      targetRegion: "DE",
      submit: false,
      minMatch: 60,
    });

    expect(res.recommendedTemplate).toBe("tabular-german");
    expect(res.logs.some((l) => l.message.includes("Germany"))).toBe(true);
  });

  it("runs the pipeline for French (FR) region and selects French template", async () => {
    const res = await runMultiAgentApp({
      job: mockJob,
      profile: mockProfile,
      targetRegion: "FR",
      submit: false,
      minMatch: 60,
    });

    expect(res.recommendedTemplate).toBe("modern-french");
  });

  it("keeps an ATS score below a legacy minMatch value informational and pauses for human review", async () => {
    const res = await runMultiAgentApp({
      job: { ...mockJob, id: `job-low-score-${Date.now()}` },
      profile: mockProfile,
      targetRegion: "US",
      submit: false,
      minMatch: 101,
    });

    expect(res.atsScore).toBeLessThan(101);
    expect(res.status).toBe("manual_required");
    expect(res.logs.some((log) => log.message.toLowerCase().includes("below threshold"))).toBe(false);
    expect(res.logs.some((log) => log.message.includes("Human review requested"))).toBe(true);
  });

  it("streams multi-agent events via streamMultiAgentApp", async () => {
    const events: string[] = [];
    const res = await streamMultiAgentApp(
      {
        job: mockJob,
        profile: mockProfile,
        targetRegion: "US",
        submit: false,
        minMatch: 60,
      },
      (ev) => {
        events.push(ev.kind);
      }
    );

    expect(res.threadId).toBeDefined();
    expect(events).toContain("node_finish");
    expect(events).toContain("complete");
  });

  it("supports Human-in-the-Loop review and resumption via resumeMultiAgentApp", async () => {
    const threadId = `test_hitl_${Date.now()}`;
    const initialRun = await runMultiAgentApp({
      job: mockJob,
      profile: mockProfile,
      targetRegion: "US",
      submit: false,
      minMatch: 30,
      threadId,
    });

    expect(initialRun.status).toBe("manual_required");

    // Resume with approved pitch
    const resumed = await resumeMultiAgentApp(threadId, {
      approved: true,
      submit: true,
      editedPitch: "Approved custom tailored pitch for Stripe role.",
    });

    expect(resumed.tailoredPitch).toContain("Approved custom tailored pitch");
    expect(resumed.status).toBeDefined();
  });

  it("formats salary estimates in correct regional currency", async () => {
    const { executeSalaryIntelTool } = await import("@/lib/agents/tools/multiAgentTools");

    const tnRes = await executeSalaryIntelTool({
      jobTitle: "Senior AI Engineer",
      company: "Instadeep",
      location: "Tunis, Tunisia",
      region: "TN",
    });
    expect(tnRes.estimatedRange).toContain("TND");

    const deRes = await executeSalaryIntelTool({
      jobTitle: "Lead Frontend Engineer",
      company: "Zalando",
      location: "Berlin, Germany",
      region: "DE",
    });
    expect(deRes.estimatedRange).toContain("EUR");

    const ukRes = await executeSalaryIntelTool({
      jobTitle: "Staff Software Engineer",
      company: "Monzo",
      location: "London, UK",
      region: "UK",
    });
    expect(ukRes.estimatedRange).toContain("GBP");
  });

  it("provides localized template recommendations with clear rationale", async () => {
    const { getRecommendedTemplate } = await import("@/lib/pdf/resumeTemplates");

    const dach = getRecommendedTemplate("DE", "cv");
    expect(dach.id).toBe("tabular-german");
    expect(dach.recommendationReason).toContain("Germany");

    const french = getRecommendedTemplate("FR", "cv");
    expect(french.id).toBe("modern-french");

    const usTech = getRecommendedTemplate("US", "resume");
    expect(usTech.id).toBe("classic-ats");
    expect(usTech.fontFamily).toBeDefined();
  });

  it("persists notifications in notificationsRepo", async () => {
    const { notificationsRepo } = await import("@/lib/db");

    const item = notificationsRepo.add({
      title: "Review Required",
      message: "Application for Stripe paused for human review.",
      kind: "review",
    });

    expect(item.id).toBeDefined();
    expect(item.read).toBe(false);

    const list = notificationsRepo.list();
    expect(list.some((n) => n.id === item.id)).toBe(true);

    notificationsRepo.markRead(item.id);
    const updatedList = notificationsRepo.list();
    const found = updatedList.find((n) => n.id === item.id);
    expect(found?.read).toBe(true);
  });
});
