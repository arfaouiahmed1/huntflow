import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const sampleContent = {
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
  skills: ["TypeScript", "React", "Go"],
  experience: [
    {
      role: "Senior Engineer",
      company: "Stripe",
      duration: "2022 - Present",
      bullets: ["Architected payment webhook infrastructure."],
    },
  ],
  education: [{ degree: "B.S. Computer Science", school: "UC Berkeley", year: "2018" }],
  projects: [],
};

function postJson(body: unknown) {
  return new NextRequest("http://localhost/api/resume/compile-typst", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/resume/compile-typst contract", () => {
  it("returns ok + typst markup + render duration for valid content", async () => {
    const res = await POST(postJson({ templateId: "classic-ats", content: sampleContent }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(typeof data.typstMarkup).toBe("string");
    expect(data.typstMarkup as string).toContain("Alex Dev");
    expect(data.templateId).toBe("classic-ats");
    expect(typeof data.durationMs).toBe("number");
    // Markup endpoint: never advertises a compiled PDF payload.
    expect("pdfBase64" in data).toBe(false);
  });

  it("defaults the template when templateId is omitted", async () => {
    const res = await POST(postJson({ content: sampleContent }));
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.templateId).toBe("classic-ats");
  });

  it("rejects requests without resume content", async () => {
    const res = await POST(postJson({ templateId: "classic-ats" }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok).toBe(false);
  });
});
