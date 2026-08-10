import { describe, it, expect } from "vitest";
import { runEmployerSimulator, employerReviewFallback } from "../employerSimulatorAgent";
import { UserProfile, JobApplication } from "@/types";

const mockProfile: UserProfile = {
  name: "Jane Dev",
  targetTitle: "Senior Full Stack Engineer",
  email: "jane@example.com",
  phone: "+1 555-0199",
  location: "Remote / Berlin",
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

const mockJob: JobApplication = {
  id: "job_sim_123",
  title: "Lead Frontend Developer",
  company: "Stripe",
  location: "Remote",
  status: "wishlist",
  jobDescription: "Looking for a Lead Frontend Developer proficient in React, TypeScript, GraphQL, and AWS.",
  createdDate: new Date().toISOString(),
};

describe("Employer Simulator Agent", () => {
  it("computes deterministic fallback review metrics when offline", () => {
    const review = employerReviewFallback(mockJob, mockProfile);
    expect(review.acceptanceProbability).toBeGreaterThan(50);
    expect(review.atsPassScore).toBeGreaterThan(50);
    expect(review.verdict).toBeDefined();
    expect(review.strengths.length).toBeGreaterThan(0);
    expect(review.actionableFixes.length).toBeGreaterThan(0);
  });

  it("runs the full employer simulation reviewer engine", async () => {
    const review = await runEmployerSimulator({
      job: mockJob,
      profile: mockProfile,
    });

    expect(review.acceptanceProbability).toBeGreaterThanOrEqual(20);
    expect(review.atsPassScore).toBeGreaterThanOrEqual(20);
    expect(["interview_likely", "possible_callback", "likely_reject"]).toContain(review.verdict);
    expect(review.reviewedAt).toBeDefined();
  });
});
