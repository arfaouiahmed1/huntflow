import { describe, it, expect } from "vitest";
import { getDb, migrate, resumeRepo } from "@/lib/db";
import type { ResumeDoc } from "@/types";

function makeDoc(id: string, overrides: Partial<ResumeDoc> = {}): ResumeDoc {
  return {
    id,
    name: "Studio Doc",
    kind: "resume",
    templateId: "classic-ats",
    tex: "\\documentclass{article}\n\\begin{document}Hi\\end{document}",
    source: "scratch",
    autoCompile: true,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("resume_docs compile metadata (additive migration)", () => {
  it("round-trips lastCompileToken/lastCompileAt/editorRev", () => {
    resumeRepo.upsert(
      makeDoc("meta-1", { lastCompileToken: "tok-1", lastCompileAt: "2026-09-10T00:00:00Z", editorRev: 4 })
    );
    const doc = resumeRepo.get("meta-1");
    expect(doc?.lastCompileToken).toBe("tok-1");
    expect(doc?.lastCompileAt).toBe("2026-09-10T00:00:00Z");
    expect(doc?.editorRev).toBe(4);
    resumeRepo.remove("meta-1");
  });

  it("defaults legacy rows without the new columns set", () => {
    // Simulate a pre-migration row: insert without the new columns so
    // column defaults apply, exactly as old installs upgrade in place.
    getDb()
      .prepare(
        `INSERT INTO resume_docs (id, name, kind, template_id, tex, source, auto_compile, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run("meta-legacy", "Legacy", "resume", "classic-ats", "tex", "scratch", 1, "2026-01-01", "2026-01-01");
    const doc = resumeRepo.get("meta-legacy");
    expect(doc?.editorRev).toBe(0);
    expect(doc?.lastCompileToken).toBeUndefined();
    expect(doc?.lastCompileAt).toBeUndefined();
    resumeRepo.remove("meta-legacy");
  });

  it("migrate() is idempotent with the new columns present", () => {
    expect(() => migrate(getDb())).not.toThrow();
    resumeRepo.upsert(makeDoc("meta-2", { editorRev: 1 }));
    expect(resumeRepo.get("meta-2")?.editorRev).toBe(1);
    expect(() => migrate(getDb())).not.toThrow();
    expect(resumeRepo.get("meta-2")?.editorRev).toBe(1);
    resumeRepo.remove("meta-2");
  });
});
