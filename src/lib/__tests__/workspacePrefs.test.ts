import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_PREFS,
  parseWorkspacePrefs,
  sendDesktopNotification,
} from "@/lib/workspacePrefs";

describe("workspace prefs", () => {
  it("returns defaults for empty or malformed storage", () => {
    expect(parseWorkspacePrefs(null)).toEqual(DEFAULT_WORKSPACE_PREFS);
    expect(parseWorkspacePrefs("not-json")).toEqual(DEFAULT_WORKSPACE_PREFS);
    expect(parseWorkspacePrefs("42")).toEqual(DEFAULT_WORKSPACE_PREFS);
  });

  it("accepts a complete persisted preference", () => {
    expect(
      parseWorkspacePrefs(
        JSON.stringify({
          trackerView: "table",
          trackerSort: "match",
          jobsView: "matrix",
          crawlLimit: 100,
          showThumbnails: false,
          compactDensity: true,
          desktopNotifications: true,
        })
      )
    ).toEqual({
      trackerView: "table",
      trackerSort: "match",
      jobsView: "matrix",
      crawlLimit: 100,
      showThumbnails: false,
      compactDensity: true,
      desktopNotifications: true,
    });
  });

  it("falls back per field so one bad value never wipes the rest", () => {
    expect(
      parseWorkspacePrefs(JSON.stringify({ trackerView: "kanban", trackerSort: "match", crawlLimit: 7 }))
    ).toEqual({ ...DEFAULT_WORKSPACE_PREFS, trackerSort: "match" });
  });

  it("never fires desktop notifications without the stored opt-in (node has no Notification API)", async () => {
    await expect(sendDesktopNotification("t", "b")).resolves.toBe("unsupported");
  });
});
