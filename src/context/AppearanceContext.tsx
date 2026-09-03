"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  parseAppearance,
  resolveTheme,
  type AppearanceMode,
  type AppearancePreferences,
  type ResolvedTheme,
} from "@/lib/appearance";

interface AppearanceContextValue {
  appearance: AppearancePreferences;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: AppearanceMode) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

const AppearanceContext = createContext<AppearanceContextValue | undefined>(undefined);
const APPEARANCE_CHANGE_EVENT = "huntflow:appearance-change";

let cachedAppearanceRaw: string | null | undefined;
let cachedAppearance = DEFAULT_APPEARANCE;

function getAppearanceSnapshot(): AppearancePreferences {
  const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
  if (raw !== cachedAppearanceRaw) {
    cachedAppearanceRaw = raw;
    cachedAppearance = parseAppearance(raw);
  }
  return cachedAppearance;
}

function subscribeAppearance(onStoreChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === APPEARANCE_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(APPEARANCE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(APPEARANCE_CHANGE_EVENT, onStoreChange);
  };
}

function persistAppearance(next: AppearancePreferences) {
  const raw = JSON.stringify(next);
  cachedAppearanceRaw = raw;
  cachedAppearance = next;
  window.localStorage.setItem(APPEARANCE_STORAGE_KEY, raw);
  window.dispatchEvent(new Event(APPEARANCE_CHANGE_EVENT));
}

function subscribeSystemTheme(onStoreChange: () => void): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function getSystemThemeSnapshot(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const appearance = useSyncExternalStore(subscribeAppearance, getAppearanceSnapshot, () => DEFAULT_APPEARANCE);
  const systemPrefersDark = useSyncExternalStore(subscribeSystemTheme, getSystemThemeSnapshot, () => false);

  const resolvedTheme = resolveTheme(appearance.mode, systemPrefersDark);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      appearance,
      resolvedTheme,
      setMode: (mode) => persistAppearance({ ...appearance, mode }),
      setSidebarCollapsed: (sidebarCollapsed) => persistAppearance({ ...appearance, sidebarCollapsed }),
      toggleSidebar: () => persistAppearance({ ...appearance, sidebarCollapsed: !appearance.sidebarCollapsed }),
    }),
    [appearance, resolvedTheme],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance must be used inside AppearanceProvider");
  return value;
}
