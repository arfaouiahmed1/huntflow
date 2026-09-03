import { describe, it, expect } from "vitest";
import { compileCandidateDossier } from "../dossierCompiler";
import { ResumeContent } from "@/types";

describe("Candidate Dossier Compiler", () => {
  const sampleResume: ResumeContent = {
    header: {
      name: "Jane Smith",
      title: "Staff Distributed Systems Engineer",
      email: "jane@example.com",
      phone: "+1 555-0123",
      location: "Seattle, WA",
      linkedin: "linkedin.com/in/janesmith",
      github: "github.com/janesmith",
      portfolio: "janesmith.dev",
    },
    skills: ["Go", "Distributed Systems", "Raft", "Kubernetes"],
    experience: [
      {
        role: "Staff Engineer",
        company: "Datadog",
        duration: "2021 - Present",
        bullets: ["Built high-throughput log ingestion engine."],
      },
    ],
  };

  it("compiles multi-page dossier with resume, cover letter, and case studies", () => {
    const result = compileCandidateDossier({
      resumeContent: sampleResume,
      coverLetter: {
        salutation: "Dear Hiring Manager,",
        body: "I am writing to express strong interest in the Staff Systems Engineer role.",
        closing: "Best regards,",
        targetCompany: "Cloudflare",
        targetRole: "Staff Systems Engineer",
      },
      caseStudies: [
        {
          title: "Multi-Region Distributed Consensus Platform",
          role: "Lead Architect",
          techStack: ["Go", "Raft", "gRPC"],
          architectureOverview: "Engineered zero-downtime consensus replication layer across 3 AWS regions.",
          metrics: ["99.999% availability achieved", "1.2M writes/sec throughput", "p99 latency < 12ms"],
          vaultAnchor: "projects.md#1",
        },
      ],
    });

    expect(result.estimatedPages).toBeGreaterThanOrEqual(3);
    expect(result.typstMarkup).toContain("Jane Smith");
    expect(result.typstMarkup).toContain("Regarding: Staff Systems Engineer at Cloudflare");
    expect(result.typstMarkup).toContain("Technical Case Studies & System Architecture");
    expect(result.typstMarkup).toContain("Multi-Region Distributed Consensus Platform");
    expect(result.typstMarkup).toContain("99.999% availability achieved");
    expect(result.typstMarkup).toContain("#pagebreak()");
  });
});
