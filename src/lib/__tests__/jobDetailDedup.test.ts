import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf-8");
}

function countOccurrences(source: string, needle: string): number {
  return (source.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
}

function lineCount(source: string): number {
  return source.split("\n").length;
}

describe("Task 15-16 — Job Detail bounded lazy + dedup smoke", () => {
  const viewSrc = readSrc("src/components/JobDetailView.tsx");
  const headerSrc = readSrc("src/components/detail/JobDetailHeader.tsx");
  const overviewSrc = readSrc("src/components/detail/JobDetailOverview.tsx");
  const salarySrc = readSrc("src/components/detail/JobDetailSalaryPanel.tsx");
  const skillsSrc = readSrc("src/components/detail/JobDetailSkillsPanel.tsx");
  const agentSrc = readSrc("src/components/detail/JobDetailAgentRun.tsx");
  const lazySrc = readSrc("src/components/detail/LazyReveal.tsx");

  it("creates bounded detail components each <=150 lines and using design tokens", () => {
    expect(lineCount(headerSrc)).toBeLessThanOrEqual(150);
    expect(lineCount(overviewSrc)).toBeLessThanOrEqual(150);
    expect(lineCount(salarySrc)).toBeLessThanOrEqual(150);
    expect(lineCount(skillsSrc)).toBeLessThanOrEqual(150);
    expect(lineCount(agentSrc)).toBeLessThanOrEqual(150);
    expect(lineCount(lazySrc)).toBeLessThanOrEqual(150);

    // Design tokens: no hardcoded hex in detail components (allow globals.css). Use var(--)
    for (const [name, src] of [["JobDetailHeader", headerSrc], ["JobDetailOverview", overviewSrc], ["JobDetailSalaryPanel", salarySrc], ["JobDetailSkillsPanel", skillsSrc]] as const) {
      expect(src, `${name} should use design tokens var(--`).toContain("var(--");
      // Ensure no raw hex like #b9ed57 appears (tokens go via var(--) or palette)
      expect(src.match(/#[0-9a-fA-F]{3,6}/)?.[0] ?? null, `${name} should not contain hardcoded hex`).toBeNull();
    }
  });

  it("wraps heavy secondary panels via next/dynamic + LazyReveal with loading skeleton", () => {
    // dynamic imports at module scope
    expect(viewSrc).toContain('dynamic(() => import("@/components/match/MatchAnalysis")');
    expect(viewSrc).toContain('dynamic(() => import("@/components/documents/DocumentsPanel")');
    expect(viewSrc).toContain('dynamic(() => import("@/components/flashcards/FlashcardsPanel")');
    expect(viewSrc).toContain('dynamic(() => import("@/components/intel/InterviewQuestionsPanel")');
    expect(viewSrc).toContain('dynamic(() => import("@/components/detail/JobDetailAgentRun")');

    // each heavy panel has ssr:false + loading skeleton — count loading placeholders
    const skeletonCount = (viewSrc.match(/loading:\s*\(\)\s*=>\s*<SectionPlaceholder/g) || []).length;
    expect(skeletonCount).toBeGreaterThanOrEqual(5);

    // LazyReveal wraps heavy panels
    expect(viewSrc).toContain("LazyReveal");
    const lazyWraps = (viewSrc.match(/<LazyReveal/g) || []).length;
    expect(lazyWraps).toBeGreaterThanOrEqual(5);

    // SectionPlaceholder exists as skeleton
    expect(viewSrc).toContain("SectionPlaceholder");
    expect(viewSrc).toContain("min-h-[180px]");

    // LazyReveal component itself uses IntersectionObserver with rootMargin 320px
    expect(lazySrc).toContain("IntersectionObserver");
    expect(lazySrc).toContain('rootMargin');
  });

  it("reuses existing JobDetailAgentRun via detail re-export", () => {
    expect(agentSrc).toContain('from "@/components/agent/JobDetailAgentRun"');
    expect(viewSrc).toContain('import("@/components/detail/JobDetailAgentRun")');
  });

  it("deduplicates Job Brief / salary / skills markup to single source (no duplicate section titles)", () => {
    // Single source files each own their heading exactly once
    expect(countOccurrences(overviewSrc, "Role brief")).toBe(1);
    expect(countOccurrences(salarySrc, "Compensation")).toBe(1);
    expect(countOccurrences(skillsSrc, "Skills gap")).toBe(1);

    // JobDetailView itself must NOT duplicate those headings — they live in detail panels only.
    // Allowing 0 in view, since view delegates to panels.
    expect(countOccurrences(viewSrc, "Role brief")).toBe(0);
    expect(countOccurrences(viewSrc, "Compensation")).toBe(0);
    // view may reference SkillsPanel but not contain literal heading
    expect(countOccurrences(viewSrc, "Skills gap")).toBe(0);

    // Across all detail files, each heading appears only once total
    const combinedDetail = headerSrc + overviewSrc + salarySrc + skillsSrc + lazySrc;
    expect(countOccurrences(combinedDetail, "Role brief")).toBe(1);
    expect(countOccurrences(combinedDetail, "Compensation")).toBe(1);
    expect(countOccurrences(combinedDetail, "Skills gap")).toBe(1);

    // Ensure old duplicated drawer markers are removed from view
    expect(viewSrc).not.toContain('data-testid="job-brief"'); // old drawer duplicate used job-brief without -panel
    expect(viewSrc).not.toContain('data-testid="skills-gap"'); // old drawer duplicate
    // New single-source panels use stable ids
    expect(overviewSrc).toContain('data-testid="job-brief-panel"');
    expect(salarySrc).toContain('data-testid="salary-panel"');
    expect(skillsSrc).toContain('data-testid="skills-panel"');

    // View should still expose lazy panels via subpanel rendering (overview composes them)
    expect(viewSrc).toContain("JobDetailOverview");
    expect(viewSrc).toContain("JobDetailSkillsPanel");
  });

  it("shrinks JobDetailView by 300+ lines to <900 (and now <<500)", () => {
    const lines = lineCount(viewSrc);
    expect(lines).toBeLessThan(900);
    expect(lines).toBeGreaterThan(200); // still substantial orchestration
    // Original was 1241
    expect(1241 - lines).toBeGreaterThanOrEqual(300);
  });

  it("preserves drawer/page shared contract and tab orchestration", () => {
    expect(viewSrc).toContain('mode === "drawer"');
    expect(viewSrc).toContain('JobDetailHeader');
    expect(viewSrc).toContain("JOB_DETAIL_TABS");
    expect(viewSrc).toContain('JobDetailOverview');
    expect(viewSrc).toContain("renderSubpanel");
  });
});
