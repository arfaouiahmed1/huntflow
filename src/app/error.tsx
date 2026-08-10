"use client";

import { useEffect } from "react";

/** Root error boundary — catches render errors in the whole app. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled app error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--ink)] p-6">
      <div className="max-w-md rounded-2xl border border-[var(--coral)]/30 bg-[var(--ink-card)]/70 p-8 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--coral)]">System fault</p>
        <h1 className="mt-3 font-display text-2xl font-bold text-[var(--paper)]">Something went wrong.</h1>
        <p className="mt-2 text-sm leading-relaxed text-dim">
          The command deck hit an unexpected error. Your data is safe — this is a render fault, not a data problem.
        </p>
        <button
          onClick={reset}
          className="mt-6 rounded-xl bg-[var(--chartreuse)] px-5 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-chartreuse-bright"
        >
          Reload the deck
        </button>
      </div>
    </div>
  );
}
