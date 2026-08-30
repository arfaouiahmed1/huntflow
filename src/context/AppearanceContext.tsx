"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
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

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setAppearance] = useState<AppearancePreferences>(DEFAULT_APPEARANCE);
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setAppearance(parseAppearance(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)));
    setHydrated(true);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystemPrefersDark(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const resolvedTheme = resolveTheme(appearance.mode, systemPrefersDark);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
  }, [appearance, hydrated, resolvedTheme]);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      appearance,
      resolvedTheme,
      setMode: (mode) => setAppearance((current) => ({ ...current, mode })),
      setSidebarCollapsed: (sidebarCollapsed) =>
        setAppearance((current) => ({ ...current, sidebarCollapsed })),
      toggleSidebar: () =>
        setAppearance((current) => ({ ...current, sidebarCollapsed: !current.sidebarCollapsed })),
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
