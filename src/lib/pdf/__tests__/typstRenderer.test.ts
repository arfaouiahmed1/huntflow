import { describe, it, expect } from "vitest";
import { renderTypstResume, escapeTypst } from "../typstRenderer";
import { ResumeContent } from "@/types";

describe("Typst Resume Typesetting Engine", () => {
  const sampleResume: ResumeContent = {
    header: {
      name: "Alex Dev",
      title: "Senior Full Stack Engineer",
      email: "alex@example.com",
      phone: "+1 555-0199",
      location: "San Francisco, CA",
      linkedin: "linkedin.com/in/alexdev",
      github: "github.com/alexdev",
      portfolio: "alexdev.io",
    },
    summary: "Senior software engineer with 8 years of experience building distributed systems.",
    skills: ["TypeScript", "React", "Go", "Kubernetes", "PostgreSQL"],
    experience: [
      {
        role: "Senior Engineer",
        company: "Stripe",
        duration: "2022 - Present",
        bullets: [
          "Architected payment webhook infrastructure processing $50M/day.",
          "Reduced p99 API latency from 450ms to 85ms.",
        ],
      },
    ],
    education: [
      {
        degree: "B.S. Computer Science",
        school: "UC Berkeley",
        year: "2018",
      },
    ],
    projects: [
      {
        name: "Huntflow",
        tech: "Next.js, LangGraph, SQLite",
        bullets: ["Private AI career workspace with local-first storage."],
      },
    ],
  };

  it("escapes special Typst syntax characters", () => {
    expect(escapeTypst("C# & C++")).toContain("C\\#");
    expect(escapeTypst("Salary: $150k")).toContain("\\$150k");
    expect(escapeTypst("Array<T>")).toContain("\\<T\\>");
    expect(escapeTypst("[INFO]")).toContain("\\[INFO\\]");
  });

  it("renders valid Typst markup containing header, summary, and experience", () => {
    const typst = renderTypstResume("classic-ats", sampleResume);

    expect(typst).toContain("Alex Dev");
    expect(typst).toContain("Senior Full Stack Engineer");
    expect(typst).toContain("Professional Summary");
    expect(typst).toContain("Technical Skills");
    expect(typst).toContain("Work Experience");
    expect(typst).toContain("Stripe");
    expect(typst).toContain("UC Berkeley");
    expect(typst).toContain("Huntflow");
    expect(typst).toContain("#set page(paper: \"a4\"");
  });

  it("supports German and French section titles for localized templates", () => {
    const deTypst = renderTypstResume("tabular-german", sampleResume);
    expect(deTypst).toContain("Berufserfahrung");
    expect(deTypst).toContain("Ausbildung");

    const frTypst = renderTypstResume("modern-french", sampleResume);
    expect(frTypst).toContain("Expérience Professionnelle");
    expect(frTypst).toContain("Formation");
  });
});
