"use client";

import { useEffect } from "react";

/** Route-group error boundary for the authenticated (sidebar) section. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled app-section error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-[var(--coral)]/30 bg-[var(--ink-card)]/70 p-8 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--coral)]">Section fault</p>
        <h1 className="mt-3 font-display text-xl font-bold text-[var(--paper)]">This section hit an error.</h1>
        <p className="mt-2 text-sm leading-relaxed text-dim">
          The fault is isolated here — your other panels keep working.
        </p>
        <button
          onClick={reset}
          className="mt-6 rounded-xl bg-[var(--chartreuse)] px-5 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-chartreuse-bright"
        >
          Retry this section
        </button>
      </div>
    </div>
  );
}
