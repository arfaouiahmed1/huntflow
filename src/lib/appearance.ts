export type AppearanceMode = "light" | "dark" | "system";
export type ResolvedTheme = Exclude<AppearanceMode, "system">;

export interface AppearancePreferences {
  mode: AppearanceMode;
  sidebarCollapsed: boolean;
}

export const APPEARANCE_STORAGE_KEY = "huntflow_appearance";
export const DEFAULT_APPEARANCE: AppearancePreferences = {
  mode: "system",
  sidebarCollapsed: false,
};

export function resolveTheme(mode: AppearanceMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === "system") return systemPrefersDark ? "dark" : "light";
  return mode;
}

export function parseAppearance(raw: string | null | undefined): AppearancePreferences {
  if (!raw) return DEFAULT_APPEARANCE;
  try {
    const parsed = JSON.parse(raw) as Partial<AppearancePreferences>;
    if (
      (parsed.mode === "light" || parsed.mode === "dark" || parsed.mode === "system") &&
      typeof parsed.sidebarCollapsed === "boolean"
    ) {
      return { mode: parsed.mode, sidebarCollapsed: parsed.sidebarCollapsed };
    }
  } catch {
    // Invalid local preferences should never block the workspace from rendering.
  }
  return DEFAULT_APPEARANCE;
}
