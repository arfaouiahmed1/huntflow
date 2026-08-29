"use client";

import { useEffect } from "react";

const MANIFEST_URL = "/api/dev-tools";
const DIAGNOSTICS_ATTRIBUTE = "data-dev-diagnostics";
const CONSOLE_EVENT_PREFIX = "[huntflow:dev-diagnostics]";

interface DevToolManifestEntry {
  readonly name: string;
  readonly src: string;
}

function injectToolScript(entry: DevToolManifestEntry): Promise<boolean> {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = entry.src;
    script.async = true;
    script.addEventListener("load", () => resolve(true));
    script.addEventListener("error", () => {
      console.warn(`${CONSOLE_EVENT_PREFIX} ${entry.name} failed to load`);
      resolve(false);
    });
    document.head.appendChild(script);
  });
}

/**
 * Renders nothing. Injects the development diagnostic tool scripts listed by
 * the dev-only `/api/dev-tools` manifest.
 *
 * Initialization requires every layer below:
 * 1. The root layout (a Server Component) renders this leaf only when
 *    `NODE_ENV === "development"` and `NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS !== "1"`.
 * 2. The runtime guard below re-checks the same contract (the tested
 *    specification lives in `./gate.ts`).
 * 3. The manifest route itself answers 404 outside development, so the tool
 *    bundles are unreachable in production even if this component ran.
 *
 * The tools load as classic scripts from node_modules via that route instead
 * of bundler imports: Turbopack follows dynamic-import edges unconditionally,
 * so any `import()` of these packages would leak them into production chunks.
 */
export function DevDiagnostics() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (process.env.NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS === "1") return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(MANIFEST_URL);
        if (!response.ok) throw new Error(`manifest request failed: ${response.status}`);
        const manifest: readonly DevToolManifestEntry[] = await response.json();
        if (cancelled) return;
        const outcomes = await Promise.all(manifest.map(injectToolScript));
        if (cancelled) return;
        const allActive = outcomes.length > 0 && outcomes.every((loaded) => loaded);
        document.documentElement.setAttribute(
          DIAGNOSTICS_ATTRIBUTE,
          allActive ? "active" : "partial",
        );
        console.info(CONSOLE_EVENT_PREFIX, {
          loaded: outcomes.filter((loaded) => loaded).length,
          requested: outcomes.length,
        });
      } catch (error) {
        if (!cancelled) {
          console.warn(`${CONSOLE_EVENT_PREFIX} unavailable`, error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
