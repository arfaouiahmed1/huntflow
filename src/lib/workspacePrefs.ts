/**
 * Workspace display & default-view preferences.
 *
 * Pure localStorage-backed state (no backend API): defaults for the tracker
 * and discovery views, the default crawl result limit, visual-proof
 * thumbnails, compact density, and desktop notifications.
 *
 * Effects are applied in two ways:
 *  - tracker/jobs pages read the stored prefs on mount (client effect, so no
 *    hydration mismatch) and use them as their initial view/sort/limit;
 *  - `applyWorkspacePrefsToDom` mirrors thumbnails/density onto
 *    `document.documentElement` datasets consumed by globals.css rules.
 */

export type TrackerView = "board" | "table" | "deck";
export type JobsView = "deck" | "matrix";
export type TrackerSort = "newest" | "oldest" | "match" | "company" | "applied" | "followUp";

export interface WorkspacePrefs {
  trackerView: TrackerView;
  trackerSort: TrackerSort;
  jobsView: JobsView;
  /** Default discovery result limit offered on /jobs. */
  crawlLimit: number;
  /** Show listing-proof thumbnails (job cards + detail proof blocks). */
  showThumbnails: boolean;
  /** Tighter panel padding app-wide via `[data-density="compact"]`. */
  compactDensity: boolean;
  /** Allow desktop (OS-level) notifications for crawl/apply events. */
  desktopNotifications: boolean;
}

export const WORKSPACE_PREFS_KEY = "huntflow_workspace_prefs";
export const WORKSPACE_PREFS_EVENT = "huntflow:workspace-prefs-change";

export const CRAWL_LIMIT_OPTIONS = [25, 50, 100, 200] as const;

export const DEFAULT_WORKSPACE_PREFS: WorkspacePrefs = {
  trackerView: "board",
  trackerSort: "newest",
  jobsView: "deck",
  crawlLimit: 50,
  showThumbnails: true,
  compactDensity: false,
  desktopNotifications: false,
};

const TRACKER_VIEWS: TrackerView[] = ["board", "table", "deck"];
const JOBS_VIEWS: JobsView[] = ["deck", "matrix"];
const TRACKER_SORTS: TrackerSort[] = ["newest", "oldest", "match", "company", "applied", "followUp"];

function asOne<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

/** Merge-partial parse: every field falls back independently so one bad value never wipes the rest. */
export function parseWorkspacePrefs(raw: string | null | undefined): WorkspacePrefs {
  if (!raw) return { ...DEFAULT_WORKSPACE_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspacePrefs>;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_WORKSPACE_PREFS };
    return {
      trackerView: asOne(parsed.trackerView, TRACKER_VIEWS, DEFAULT_WORKSPACE_PREFS.trackerView),
      trackerSort: asOne(parsed.trackerSort, TRACKER_SORTS, DEFAULT_WORKSPACE_PREFS.trackerSort),
      jobsView: asOne(parsed.jobsView, JOBS_VIEWS, DEFAULT_WORKSPACE_PREFS.jobsView),
      crawlLimit:
        typeof parsed.crawlLimit === "number" && (CRAWL_LIMIT_OPTIONS as readonly number[]).includes(parsed.crawlLimit)
          ? parsed.crawlLimit
          : DEFAULT_WORKSPACE_PREFS.crawlLimit,
      showThumbnails: typeof parsed.showThumbnails === "boolean" ? parsed.showThumbnails : DEFAULT_WORKSPACE_PREFS.showThumbnails,
      compactDensity: typeof parsed.compactDensity === "boolean" ? parsed.compactDensity : DEFAULT_WORKSPACE_PREFS.compactDensity,
      desktopNotifications:
        typeof parsed.desktopNotifications === "boolean"
          ? parsed.desktopNotifications
          : DEFAULT_WORKSPACE_PREFS.desktopNotifications,
    };
  } catch {
    return { ...DEFAULT_WORKSPACE_PREFS };
  }
}

export function getStoredWorkspacePrefs(): WorkspacePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_WORKSPACE_PREFS };
  try {
    return parseWorkspacePrefs(window.localStorage.getItem(WORKSPACE_PREFS_KEY));
  } catch {
    return { ...DEFAULT_WORKSPACE_PREFS };
  }
}

/** Mirror prefs onto <html> datasets consumed by globals.css. Safe to call on the server (no-op). */
export function applyWorkspacePrefsToDom(prefs: WorkspacePrefs): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.thumbs = prefs.showThumbnails ? "on" : "off";
  document.documentElement.dataset.density = prefs.compactDensity ? "compact" : "comfortable";
}

/** Merge a patch into storage, mirror to the DOM, and notify other tabs/hooks. */
export function saveWorkspacePrefs(patch: Partial<WorkspacePrefs>): WorkspacePrefs {
  const next = { ...getStoredWorkspacePrefs(), ...patch };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(WORKSPACE_PREFS_KEY, JSON.stringify(next));
    } catch {
      // Quota/privacy failures keep the in-memory value; UI still updates.
    }
    window.dispatchEvent(new Event(WORKSPACE_PREFS_EVENT));
  }
  applyWorkspacePrefsToDom(next);
  return next;
}

export type DesktopNotifyResult = "sent" | "disabled" | "denied" | "unsupported";

/**
 * Fire an OS-level notification only when the user enabled them in Settings
 * and the browser already granted permission (never prompts from background
 * flows — pass `requestPermission: true` from an explicit click to prompt).
 */
export async function sendDesktopNotification(
  title: string,
  body: string,
  opts?: { requestPermission?: boolean }
): Promise<DesktopNotifyResult> {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  if (!getStoredWorkspacePrefs().desktopNotifications) return "disabled";
  try {
    if (Notification.permission === "granted") {
      new Notification(title, { body });
      return "sent";
    }
    if (opts?.requestPermission && Notification.permission === "default") {
      const verdict = await Notification.requestPermission();
      if (verdict === "granted") {
        new Notification(title, { body });
        return "sent";
      }
      return "denied";
    }
    return "denied";
  } catch {
    return "unsupported";
  }
}
