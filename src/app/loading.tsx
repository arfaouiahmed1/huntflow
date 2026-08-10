/** Root loading state — shown during the first app hydration/route load. */
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--ink)]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-2 w-2 animate-pulse-dot rounded-full bg-[var(--chartreuse)]" />
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">Booting huntflow…</p>
      </div>
    </div>
  );
}
