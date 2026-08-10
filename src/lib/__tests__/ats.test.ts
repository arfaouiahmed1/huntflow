import { describe, it, expect } from "vitest";
import { analyzeAts } from "@/lib/ats/analyze";
import { renderTemplate } from "@/lib/pdf/resumeTemplates";
import { ResumeContent } from "@/types";

const GOOD: ResumeContent = {
  header: { name: "Alex Rivera", title: "Senior Frontend Engineer", email: "alex@example.com", phone: "+1 555 0100", location: "Remote", linkedin: "", github: "", portfolio: "" },
  summary: "Senior frontend engineer. Led migration to React 18, reducing load times 40%.",
  skills: ["React", "TypeScript", "Node.js", "GraphQL", "AWS"],
  experience: [
    {
      role: "Senior Frontend Engineer",
      company: "Acme Corp",
      duration: "2021 — Present",
      bullets: [
        "Led a team of 4 engineers shipping a design system used by 40+ developers",
        "Cut bundle size 45% and improved Lighthouse scores from 60 to 95",
        "Built CI/CD pipeline reducing deploy time from 30 minutes to 5",
      ],
    },
  ],
  education: [{ degree: "BSc Computer Science", school: "State University", year: "2018" }],
};

const BAD: ResumeContent = {
  header: { name: "John", title: "", email: "", phone: "", location: "", linkedin: "", github: "", portfolio: "" },
  summary: "",
  skills: [],
  experience: [
    {
      role: "Worker",
      company: "Some Co",
      duration: "",
      bullets: ["Responsible for stuff", "Duties included things", "Hard-working team player"],
    },
  ],
  education: [],
};

describe("analyzeAts", () => {
  it("scores a strong resume high", () => {
    const tex = renderTemplate("classic-ats", GOOD);
    const report = analyzeAts(tex);
    expect(report.score).toBeGreaterThanOrEqual(75);
    expect(report.checks.find((c) => c.id === "contact")?.ok).toBe(true);
    expect(report.checks.find((c) => c.id === "metrics")?.ok).toBe(true);
    expect(report.checks.find((c) => c.id === "action_verbs")?.ok).toBe(true);
  });

  it("flags a weak resume", () => {
    const tex = renderTemplate("classic-ats", BAD);
    const report = analyzeAts(tex);
    expect(report.score).toBeLessThan(50);
    expect(report.checks.find((c) => c.id === "contact")?.ok).toBe(false);
    expect(report.checks.find((c) => c.id === "filler")?.ok).toBe(false);
    expect(report.checks.find((c) => c.id === "metrics")?.ok).toBe(false);
  });

  it("measures JD keyword coverage when a job description is supplied", () => {
    const tex = renderTemplate("classic-ats", GOOD);
    const report = analyzeAts(tex, "We need a senior React and TypeScript engineer with GraphQL and AWS experience.");
    expect(report.keywords.length).toBeGreaterThan(0);
    const react = report.keywords.find((k) => k.term.toLowerCase().includes("react"));
    expect(react?.inResume).toBe(true);
    expect(report.checks.some((c) => c.id === "keywords")).toBe(true);
  });

  it("flags layout breakers (tables/images)", () => {
    const tex = renderTemplate("classic-ats", GOOD) + "\\begin{tabular}{ll} a & b \\end{tabular}";
    const report = analyzeAts(tex);
    expect(report.checks.find((c) => c.id === "layout")?.ok).toBe(false);
  });

  it("estimates pages from word count", () => {
    const tex = renderTemplate("classic-ats", GOOD);
    expect(analyzeAts(tex).estimatedPages).toBeGreaterThanOrEqual(1);
  });
});
