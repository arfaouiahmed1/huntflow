import { describe, it, expect } from "vitest";
import { resolveTrapIndex, canRestoreFocus, FOCUSABLE_SELECTOR } from "./modalFocus";

describe("modalFocus trap math", () => {
  it("wraps forward Tab from the last control to the first", () => {
    expect(resolveTrapIndex({ activeIndex: 2, count: 3, shiftKey: false })).toBe(0);
  });

  it("lets forward Tab move naturally between interior controls", () => {
    expect(resolveTrapIndex({ activeIndex: 0, count: 3, shiftKey: false })).toBeNull();
    expect(resolveTrapIndex({ activeIndex: 1, count: 3, shiftKey: false })).toBeNull();
  });

  it("moves forward Tab from the dialog panel itself to the first control", () => {
    // The panel carries tabIndex={-1} and receives programmatic focus on
    // open; without this mapping Tab escapes the dialog (PR #22 finding).
    expect(resolveTrapIndex({ activeIndex: -1, count: 3, shiftKey: false })).toBe(0);
  });

  it("wraps Shift+Tab from the first control to the last", () => {
    expect(resolveTrapIndex({ activeIndex: 0, count: 3, shiftKey: true })).toBe(2);
  });

  it("moves Shift+Tab from the dialog panel itself to the last control", () => {
    expect(resolveTrapIndex({ activeIndex: -1, count: 4, shiftKey: true })).toBe(3);
  });

  it("lets Shift+Tab move naturally between interior controls", () => {
    expect(resolveTrapIndex({ activeIndex: 2, count: 3, shiftKey: true })).toBeNull();
  });

  it("wraps a single-control dialog onto itself in both directions", () => {
    expect(resolveTrapIndex({ activeIndex: 0, count: 1, shiftKey: false })).toBe(0);
    expect(resolveTrapIndex({ activeIndex: 0, count: 1, shiftKey: true })).toBe(0);
  });

  it("returns null with no focusable children so the caller holds panel focus", () => {
    expect(resolveTrapIndex({ activeIndex: -1, count: 0, shiftKey: false })).toBeNull();
    expect(resolveTrapIndex({ activeIndex: -1, count: 0, shiftKey: true })).toBeNull();
  });

  it("excludes the panel's own tabIndex=-1 from the focusable selector", () => {
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
  });
});

describe("modalFocus restore guard", () => {
  it("restores connected elements exposing focus()", () => {
    expect(canRestoreFocus({ focus: () => {}, isConnected: true })).toBe(true);
  });

  it("restores when isConnected is unknown (non-DOM trigger stub)", () => {
    expect(canRestoreFocus({ focus: () => {} })).toBe(true);
  });

  it("refuses detached triggers instead of throwing on close", () => {
    expect(canRestoreFocus({ focus: () => {}, isConnected: false })).toBe(false);
  });

  it("refuses nullish and non-focusable values", () => {
    expect(canRestoreFocus(null)).toBe(false);
    expect(canRestoreFocus(undefined)).toBe(false);
    expect(canRestoreFocus({})).toBe(false);
  });
});
