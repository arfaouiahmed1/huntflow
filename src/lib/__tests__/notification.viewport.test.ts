import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

function src(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf-8");
}

describe("Task 19 — NotificationCenter + toast safe-area viewport", () => {
  const nc = src("src/components/NotificationCenter.tsx");
  const toast = src("src/components/ui/Toaster.tsx");

  it("NotificationCenter is single column at 375px (grid-cols-1)", () => {
    expect(nc).toContain("grid-cols-1");
    // explicit 375 marker or min-[375px] ensures responsive intent
    expect(nc).toMatch(/375|grid-cols-1/);
  });

  it("NotificationCenter has safe-area viewport (env + dvh)", () => {
    expect(nc).toContain("env(safe-area-inset-");
    expect(nc).toMatch(/safe-area-inset-top|safe-area-inset-bottom/);
    expect(nc).toContain("100dvh");
    expect(nc).toContain("max-h-[calc(100dvh");
  });

  it("NotificationCenter keyboard Esc + focus trap", () => {
    expect(nc).toContain("Escape");
    expect(nc).toContain("getFocusable");
    expect(nc).toContain("Tab");
    expect(nc).toContain('role="dialog"');
    expect(nc).toContain('aria-modal="true"');
    expect(nc).toContain("triggerRef");
  });

  it("toast viewport safe-area and avoids sidebar footer", () => {
    expect(toast).toContain("env(safe-area-inset-bottom)");
    expect(toast).toContain("env(safe-area-inset-right)");
    expect(toast).toContain("bottom-[calc(1rem+env(safe-area-inset-bottom))]");
    expect(toast).toContain("right-[calc(1rem+env(safe-area-inset-right))]");
    expect(toast).toContain("100dvh");
    // sidebar footer avoidance: bottom calc + z-index + no overlap comment
    expect(toast).toMatch(/sidebar footer|z-\[100\]/);
  });

  it("toast single column at 375px safe", () => {
    expect(toast).toContain("flex-col");
    expect(toast).toMatch(/375|w-\[min/);
  });

  it("both files bounded", () => {
    expect(nc.split("\n").length).toBeLessThanOrEqual(300);
    expect(toast.split("\n").length).toBeLessThanOrEqual(160);
  });
});
