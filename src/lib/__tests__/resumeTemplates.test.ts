import { describe, it, expect } from "vitest";
import {
  RESUME_TEMPLATES,
  templateMeta,
  templatesForKind,
  loadTemplateSource,
  renderTemplate,
  texToText,
  contentFromProfile,
} from "@/lib/pdf/resumeTemplates";
import { ResumeContent } from "@/types";

const content: ResumeContent = {
  header: {
    name: "Alex Rivera",
    title: "Senior Frontend Engineer",
    email: "alex@example.com",
    phone: "+1 555 0100",
    location: "Remote",
    linkedin: "linkedin.com/in/alex",
    github: "",
    portfolio: "",
  },
  summary: "Senior frontend engineer with 8 years building React apps at scale. Reduced load times 40%.",
  skills: ["React", "TypeScript", "Node.js"],
  experience: [
    { role: "Senior Frontend Engineer", company: "Acme Corp", duration: "2021 — Present", bullets: ["Led a team of 4", "Cut bundle size 45%"] },
    { role: "Frontend Engineer", company: "Beta Inc", duration: "2018 — 2021", bullets: ["Shipped 12 features"] },
  ],
  education: [{ degree: "BSc Computer Science", school: "State University", year: "2018" }],
  projects: [{ name: "Portfolio", tech: "Next.js", link: "alex.dev", bullets: ["Personal site"] }],
};

describe("template registry", () => {
  it("exposes ATS templates with the right kinds", () => {
    expect(RESUME_TEMPLATES.map((t) => t.id)).toEqual([
      "classic-ats",
      "modern-professional",
      "executive",
      "tabular-german",
      "modern-french",
      "nordic-clean",
      "creative-sidebar",
      "academic-cv",
      "minimal-clean",
      "technical-modern",
      "executive-elegant",
      "developer-dashboard",
      "academic-europass",
      "creative-portfolio",
      "letter-cover",
      "letter-motivation",
      "letter-anschreiben-de",
      "letter-motivation-fr",
      "letter-modern",
      "letter-minimal",
    ]);
    expect(templateMeta("classic-ats")?.atsScore).toBe(100);
    expect(templatesForKind("resume").length).toBe(10);
    expect(templatesForKind("cover_letter").map((t) => t.id)).toEqual([
      "letter-cover",
      "letter-modern",
      "letter-minimal",
    ]);
  });

  it("loads real .tex sources from disk", () => {
    const src = loadTemplateSource("classic-ats");
    expect(src).toContain("\\documentclass");
    expect(src).toContain("{{EXPERIENCE}}");
  });

  it("rejects unknown template ids", () => {
    expect(() => loadTemplateSource("nope")).toThrow(/Unknown resume template/);
  });
});

describe("renderTemplate", () => {
  it("substitutes every placeholder with escaped content", () => {
    const tex = renderTemplate("classic-ats", content);
    expect(tex).toContain("Alex Rivera");
    expect(tex).toContain("\\resumesection{Summary}");
    expect(tex).toContain("\\resumesection{Experience}");
    expect(tex).toContain("\\resumesection{Education}");
    expect(tex).toContain("\\resumesection{Skills}");
    expect(tex).not.toContain("{{");
  });

  it("escapes user content so it can never break LaTeX", () => {
    const nasty: ResumeContent = {
      ...content,
      summary: "100% faster & $50k saved _underscores_ {braces} # hash ~ tildes",
      skills: ["C++", "R&D"],
    };
    const tex = renderTemplate("classic-ats", nasty);
    expect(tex).toContain("100\\% faster");
    expect(tex).toContain("\\&");
    expect(tex).toContain("\\$50k");
    expect(tex).toContain("\\_underscores\\_");
    expect(tex).toContain("\\{braces\\}");
    expect(tex).toContain("\\#");
    expect(tex).toContain("\\textasciitilde{}");
    expect(tex).toContain("R\\&D");
    expect(tex).toContain("C++");
    expect(tex).not.toContain("{{SUMMARY}}");
  });

  it("skips empty sections entirely", () => {
    const tex = renderTemplate("classic-ats", {
      ...content,
      summary: "",
      projects: [],
      certifications: [],
      languages: [],
    });
    expect(tex).not.toContain("\\resumesection{Summary}");
    expect(tex).not.toContain("\\resumesection{Projects}");
    expect(tex).not.toContain("\\resumesection{Certifications}");
  });

  it("renders letters with paragraphs when kind is a letter", () => {
    const letter: ResumeContent = {
      header: content.header,
      recipient: "Hiring Manager\nAcme Corp",
      paragraphs: ["I am writing to express my interest.", "My experience with React matches your stack.", "I would love to chat."],
    };
    const tex = renderTemplate("letter-cover", letter);
    expect(tex).toContain("\\coverparagraph{");
    expect(tex).toContain("Dear Hiring Manager,");
    expect(tex).toContain("Sincerely,");
    expect(tex).not.toContain("{{");
  });
});

describe("every template renders", () => {
  const fullResume: ResumeContent = {
    header: {
      name: "Alex Rivera",
      title: "Senior Frontend Engineer",
      email: "alex@example.com",
      phone: "+1 555 0100",
      location: "Remote",
      linkedin: "linkedin.com/in/alex",
      github: "github.com/alex",
      portfolio: "alex.dev",
    },
    summary: "Senior frontend engineer with 8 years building React apps at scale.",
    skills: ["React", "TypeScript", "Node.js", "GraphQL"],
    experience: [
      { role: "Senior Frontend Engineer", company: "Acme Corp", duration: "2021 — Present", bullets: ["Led a team of 4", "Cut bundle size 45%"] },
    ],
    education: [{ degree: "BSc Computer Science", school: "State University", year: "2018" }],
    projects: [{ name: "Portfolio", tech: "Next.js", link: "alex.dev", bullets: ["Personal site"] }],
    certifications: [{ name: "AWS Certified", issuer: "Amazon", year: "2023" }],
    languages: [
      { name: "English", level: "Native" },
      { name: "French", level: "B2" },
    ],
  };
  const letter: ResumeContent = {
    header: fullResume.header,
    recipient: "Hiring Manager\nAcme Corp",
    paragraphs: ["I am writing to express my interest.", "I would love to chat."],
  };

  it("renders every registered template with a documentclass and no leftover placeholders", () => {
    for (const t of RESUME_TEMPLATES) {
      const isLetterKind = t.kinds.includes("cover_letter") || t.kinds.includes("motivation_letter");
      const tex = renderTemplate(t.id, isLetterKind ? letter : fullResume);
      expect(tex, `${t.id} must contain \\documentclass`).toContain("\\documentclass");
      expect(tex, `${t.id} must have no unresolved {{placeholders}}`).not.toContain("{{");
    }
  });

  it("spot-checks template-specific markers", () => {
    expect(renderTemplate("minimal-clean", fullResume)).toContain("0F766E");
    expect(renderTemplate("technical-modern", fullResume)).toContain("MakeUppercase");
    expect(renderTemplate("executive-elegant", fullResume)).toContain("mathptmx");
    expect(renderTemplate("developer-dashboard", fullResume)).toContain("\\begin{minipage}");
    expect(renderTemplate("developer-dashboard", fullResume)).toContain("sidebg");
    expect(renderTemplate("academic-europass", fullResume)).toContain("Publications \\& Awards");
    expect(renderTemplate("creative-portfolio", fullResume)).toContain("7C3AED");
    expect(renderTemplate("letter-modern", letter)).toContain("\\rule{\\textwidth}{1.4pt}");
    expect(renderTemplate("letter-minimal", letter)).toContain("margin=1in");
  });
});

describe("texToText", () => {
  it("converts LaTeX to approximate plain text", () => {
    const tex = renderTemplate("classic-ats", content);
    const text = texToText(tex);
    expect(text.toLowerCase()).toContain("alex rivera");
    expect(text.toLowerCase()).toContain("experience");
    expect(text.toLowerCase()).toContain("react");
    expect(text).not.toContain("\\");
    expect(text).not.toContain("{");
  });
});

describe("contentFromProfile", () => {
  it("maps a user profile into resume content", () => {
    const profile = {
      name: "Alex Rivera",
      email: "a@b.com",
      phone: "555",
      location: "Berlin",
      summary: "S",
      targetTitle: "Frontend",
      skills: ["React"],
      experience: [{ role: "SWE", company: "X", duration: "2020-2022", bulletPoints: ["b1"] }],
      education: [{ degree: "BSc", school: "U", year: "2016" }],
      linkedin: "in/alex",
      github: "alex",
      portfolio: "",
    };
    const c = contentFromProfile(profile, "resume");
    expect(c.experience?.[0].bullets).toEqual(["b1"]);
    expect(c.header.linkedin).toBe("in/alex");
    const letter = contentFromProfile(profile, "cover_letter");
    expect(letter.paragraphs?.length).toBeGreaterThan(0);
  });
});
