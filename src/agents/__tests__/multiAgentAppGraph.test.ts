import { describe, it, expect } from "vitest";
import { runMultiAgentApp } from "../multiAgentAppGraph";
import { UserProfile } from "@/types";

const mockProfile: UserProfile = {
  name: "Jane Dev",
  title: "Senior Full Stack Engineer",
  email: "jane@example.com",
  phone: "+1 555-0199",
  location: "New York, NY",
  summary: "Senior Full Stack Engineer with 7 years of experience in React, Node.js, and TypeScript.",
  skills: ["React", "TypeScript", "Node.js", "GraphQL", "AWS", "Docker", "Tailwind CSS"],
  experience: [
    {
      company: "Acme Corp",
      role: "Senior Engineer",
      period: "2021 - Present",
      bullets: ["Led frontend architecture overhaul using Next.js and React 19.", "Reduced LCP by 40%."],
    },
  ],
  education: [
    {
      institution: "MIT",
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
});
