import { describe, it, expect } from "vitest";
import { jobsRepo } from "@/lib/db";
import type { JobApplication } from "@/types";
import {
  compileCheckTool,
  patchTexTool,
  readSelectionTool,
  retargetTool,
  runCopilotTool,
  searchVaultTool,
} from "./tools";
import type { CopilotToolContext } from "./tools";

const TEX = "\\documentclass{article}\n\\begin{document}\nHello world\n\\end{document}\n";

function ctx(overrides: Partial<CopilotToolContext> = {}): CopilotToolContext {
  return {
    resume: {
      header: { name: "A", title: "T", email: "", phone: "", location: "", linkedin: "", github: "", portfolio: "" },
      skills: ["React", "AWS", "Docker"],
    },
    tex: TEX,
    templateId: "classic-ats",
    ...overrides,
  };
}

describe("patch_tex", () => {
  it("applies exact single-match anchors", async () => {
    const r = await patchTexTool(ctx(), { edits: [{ anchor: "Hello world", replacement: "Hello patched" }] });
    expect(r.status).toBe("ok");
    expect(r.artifacts?.patchedTex as string).toContain("Hello patched");
    expect(r.next_actions.length).toBeGreaterThan(0);
  });

  it("skips missing and non-unique anchors with reasons, never half-applies silently", async () => {
    const r = await patchTexTool(ctx({ tex: "aaa\nbbb\naaa\n" }), {
      edits: [
        { anchor: "missing", replacement: "x" },
        { anchor: "aaa", replacement: "x" },
      ],
    });
    expect(r.status).toBe("error");
    expect(r.artifacts?.patchedTex).toBeNull();
    const skipped = r.artifacts?.skipped as { reason: string }[];
    expect(skipped.map((s) => s.reason).join("|")).toMatch(/not found|not unique/);
  });

  it("refuses preamble and shell-escape constructs", async () => {
    const r = await patchTexTool(ctx(), {
      edits: [{ anchor: "Hello world", replacement: "\\newcommand{\\evil}{1}" }],
    });
    expect(r.status).toBe("error");
    const skipped = r.artifacts?.skipped as { reason: string }[];
    expect(skipped[0].reason).toMatch(/refused/);
  });

  it("rejects empty edit lists and oversized batches", async () => {
    expect((await patchTexTool(ctx(), { edits: [] })).status).toBe("error");
    const big = Array.from({ length: 9 }, (_, i) => ({ anchor: `a${i}`, replacement: "x" }));
    expect((await patchTexTool(ctx(), { edits: big })).status).toBe("error");
  });
});

describe("read_selection", () => {
  it("captures quoted content with location", async () => {
    const r = await readSelectionTool(ctx(), { text: "Led migration", sourceLine: 42 });
    expect(r.status).toBe("ok");
    expect(r.artifacts?.sourceLine).toBe(42);
    expect(r.summary).toMatch(/line 42/);
  });

  it("falls back to context selection and truncates long quotes", async () => {
    const r = await readSelectionTool(ctx({ selection: { text: `x`.repeat(9000) } }), {});
    expect(r.status).toBe("ok");
    expect((r.artifacts?.text as string).length).toBeLessThanOrEqual(4000);
  });

  it("errors honestly with no selection anywhere", async () => {
    expect((await readSelectionTool(ctx(), {})).status).toBe("error");
  });
});

describe("search_vault", () => {
  it("rejects empty queries", async () => {
    expect((await searchVaultTool(ctx(), { query: "  " })).status).toBe("error");
  });

  it("returns ok with zero hits on an empty vault (no fabrication)", async () => {
    const r = await searchVaultTool(ctx(), { query: "zz-quixotic-nomatch-42" });
    expect(r.status).toBe("ok");
    expect(r.artifacts?.hits).toEqual([]);
    expect(r.summary).toMatch(/No vault passages/);
  });
});

describe("retarget", () => {
  function makeJob(id: string, jobDescription: string): JobApplication {
    return {
      id,
      title: "Platform Engineer",
      company: "Acme",
      location: "Remote",
      status: "wishlist",
      jobDescription,
      autoApplyStatus: "idle",
      autoApplyLogs: [],
      createdDate: "2026-09-01",
    };
  }

  it("errors without a job or target context", async () => {
    expect((await retargetTool(ctx(), {})).status).toBe("error");
  });

  it("re-ranks JD-mentioned skills first and reports missing terms", async () => {
    jobsRepo.upsert(makeJob("retarget-1", "We need Docker and Kubernetes experts. React required."));
    const r = await retargetTool(ctx(), { jobId: "retarget-1" });
    expect(r.status).toBe("ok");
    const updated = r.artifacts?.updatedResume as { skills: string[] };
    expect(updated.skills.slice(0, 2)).toEqual(expect.arrayContaining(["Docker", "React"]));
    expect(updated.skills.indexOf("AWS")).toBeGreaterThan(1);
    expect((r.artifacts?.missing as string[]).map((t) => t.toLowerCase())).toContain("kubernetes");
    jobsRepo.removeAll(true);
  });
});

describe("compile_check", () => {
  it("reports failure for uncompilable TeX without throwing", async () => {
    const r = await compileCheckTool(ctx(), { tex: "\\documentclass{article}\n\\begin{document}\nUnclosed" });
    expect(r.status).toBe("error");
    expect(r.summary.length).toBeGreaterThan(0);
    expect(Array.isArray((r.artifacts as Record<string, unknown>).parsedErrors)).toBe(true);
  });
});

describe("runCopilotTool dispatcher", () => {
  it("rejects unknown tools with the whitelist", async () => {
    const r = await runCopilotTool("delete_everything", ctx(), {});
    expect(r.status).toBe("error");
    expect(r.next_actions.join(" ")).toMatch(/search_vault/);
  });
});
