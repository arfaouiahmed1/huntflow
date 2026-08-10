import { describe, it, expect } from "vitest";
import { resumeRepo, settingsRepo } from "@/lib/db";
import { ResumeDoc, ResumeContent } from "@/types";

function makeDoc(id: string, overrides: Partial<ResumeDoc> = {}): ResumeDoc {
  return {
    id,
    name: "Frontend Resume",
    kind: "resume",
    templateId: "classic-ats",
    tex: "\\documentclass{article}\n\\begin{document}Hello\\end{document}",
    source: "scratch",
    autoCompile: true,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("resumeRepo", () => {
  it("upserts, lists, gets and counts", () => {
    resumeRepo.upsert(makeDoc("r1"));
    resumeRepo.upsert(makeDoc("r2", { kind: "cover_letter", name: "Cover" }));
    expect(resumeRepo.count()).toBe(2);
    expect(resumeRepo.get("r1")?.tex).toContain("documentclass");
    const list = resumeRepo.list();
    expect(list.map((d) => d.id).sort()).toEqual(["r1", "r2"]);
  });

  it("upsert updates an existing row in place", () => {
    resumeRepo.upsert(makeDoc("r1", { name: "Renamed", autoCompile: false }));
    const doc = resumeRepo.get("r1");
    expect(doc?.name).toBe("Renamed");
    expect(doc?.autoCompile).toBe(false);
  });

  it("round-trips structured content", () => {
    const content: ResumeContent = {
      header: { name: "Alex Rivera", title: "Frontend Engineer", email: "a@x.com", phone: "", location: "Remote", linkedin: "", github: "", portfolio: "" },
      summary: "Senior frontend engineer.",
      skills: ["React", "TypeScript"],
      experience: [{ role: "SWE", company: "Acme", duration: "2020-2023", bullets: ["Shipped x", "Cut load 40%"] }],
      paragraphs: ["Para one.", "Para two."],
    };
    resumeRepo.upsert(makeDoc("r3", { content }));
    expect(resumeRepo.get("r3")?.content?.skills).toEqual(["React", "TypeScript"]);
    expect(resumeRepo.get("r3")?.content?.paragraphs).toEqual(["Para one.", "Para two."]);
  });

  it("remove deletes the row", () => {
    resumeRepo.remove("r3");
    expect(resumeRepo.get("r3")).toBeNull();
  });

  it("tolerates corrupt content JSON", () => {
    resumeRepo.upsert(makeDoc("r4"));
    settingsRepo.set("_corrupt", "x");
    resumeRepo.remove("r4");
    /* content column is null → content undefined, not a crash */
    expect(resumeRepo.get("r4")).toBeNull();
  });
});
