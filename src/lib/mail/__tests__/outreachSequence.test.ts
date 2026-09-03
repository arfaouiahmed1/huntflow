import { describe, it, expect } from "vitest";
import { generateOutreachSequence } from "../outreachSequence";
import { POST } from "@/app/api/mail/outreach-sequence/route";
import { NextRequest } from "next/server";

describe("Multi-Stage Outreach Sequence Engine", () => {
  const job = {
    company: "Linear",
    title: "Product Engineer",
    jobDescription: "Building issue tracking tools with high performance React and TypeScript.",
  };

  const candidate = {
    name: "Jane Developer",
    summary: "Product engineer with 6 years experience in React, TypeScript, and state management.",
    topSkills: ["React", "TypeScript", "UI Architecture"],
  };

  it("generates 3 cohesive stages with ascending delay days (0, 4, 10)", () => {
    const plan = generateOutreachSequence(job, candidate);

    expect(plan.stages.length).toBe(3);
    expect(plan.stages[0].stage).toBe("day_0_connect");
    expect(plan.stages[0].delayDays).toBe(0);

    expect(plan.stages[1].stage).toBe("day_4_value_nudge");
    expect(plan.stages[1].delayDays).toBe(4);

    expect(plan.stages[2].stage).toBe("day_10_proof_followup");
    expect(plan.stages[2].delayDays).toBe(10);
    expect(plan.totalEstimatedDurationDays).toBe(10);
  });

  it("includes personalized hooks with company and skill names", () => {
    const plan = generateOutreachSequence(job, candidate, "Series B funding");

    expect(plan.targetCompany).toBe("Linear");
    expect(plan.targetRole).toBe("Product Engineer");

    const stage1 = plan.stages[0];
    expect(stage1.body).toContain("Linear");
    expect(stage1.body).toContain("Product Engineer");
    expect(stage1.body).toContain("React, TypeScript");

    const stage2 = plan.stages[1];
    expect(stage2.body).toContain("Series B funding");
  });

  it("handles API route POST request correctly", async () => {
    const req = new NextRequest("http://localhost:3000/api/mail/outreach-sequence", {
      method: "POST",
      body: JSON.stringify({
        job: { company: "Vercel", title: "Frontend Engineer", jobDescription: "Next.js engineer" },
        profile: { name: "Alice", skills: ["Next.js", "React"] },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.plan.stages.length).toBe(3);
  });
});
