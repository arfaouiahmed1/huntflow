"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Month-grid calendar (replaces the native <input type="date"> popup).
 *
 * Styled to match the app's dark theme. Builds the current month's grid and
 * lets the user pick a day; clicking the selected day again clears it. Clamp
 * to a 10-year window around today so the controls stay predictable.
 */
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function sameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function Calendar({
  value,
  onChange,
  minMonth,
  maxMonth,
}: {
  /** Selected ISO date string (YYYY-MM-DD) or empty. */
  value: string;
  onChange: (iso: string) => void;
  /** Optional YYYY-MM clamp boundaries. */
  minMonth?: string;
  maxMonth?: string;
}) {
  const today = useMemo(() => new Date(), []);
  const parsed = value ? new Date(`${value}T00:00:00`) : new Date();

  const [view, setView] = useState(() => {
    const d = value ? new Date(`${value}T00:00:00`) : new Date();
    if (Number.isNaN(d.getTime())) return new Date();
    return d;
  });

  const year = view.getFullYear();
  const month = view.getMonth();

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Zero-pad the leading offset so days always land on the correct weekday.
    const total = startWeekday + daysInMonth;
    const grid = new Array(total).fill(null).map((_, i) => {
      const day = i - startWeekday + 1;
      return day >= 1 ? new Date(year, month, day) : null;
    });
    return grid;
  }, [year, month]);

  const prevDisabled = minMonth
    ? `${year}-${String(month).padStart(2, "0")}` <= minMonth
    : false;
  const nextDisabled = maxMonth
    ? `${year}-${String(month).padStart(2, "0")}` >= maxMonth
    : false;

  const shift = (dir: -1 | 1) => {
    setView((v) => new Date(v.getFullYear(), v.getMonth() + dir, 1));
  };

  const pick = (d: Date) => {
    if (sameDay(d, parsed)) {
      onChange("");
      return;
    }
    onChange(toISODate(d));
  };

  return (
    <div className="w-64 select-none rounded-xl border border-[var(--line)] bg-[var(--ink-soft)] p-3 text-paper shadow-2xl">
      {/* Month / year header */}
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shift(-1)}
          disabled={prevDisabled}
          className="grid h-7 w-7 place-items-center rounded-lg text-dim transition-colors hover:bg-white/[0.05] hover:text-[var(--paper)] disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="font-display text-xs font-semibold capitalize">
          {view.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </p>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => shift(1)}
          disabled={nextDisabled}
          className="grid h-7 w-7 place-items-center rounded-lg text-dim transition-colors hover:bg-white/[0.05] hover:text-[var(--paper)] disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {DAYS.map((d) => (
          <span key={d} className="grid h-6 place-items-center text-[9px] font-semibold uppercase tracking-wide text-dim">
            {d}
          </span>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const isToday = sameDay(d, today);
          const isSelected = sameDay(d, parsed);
          const isPast = d < new Date(today.getFullYear(), today.getMonth(), today.getDate());
          return (
            <button
              key={i}
              type="button"
              onClick={() => pick(d)}
              className={cn(
                "grid h-7 w-7 place-items-center rounded-lg text-[11px] font-medium transition-colors",
                isSelected
                  ? "bg-[var(--chartreuse)] text-ink"
                  : isToday
                    ? "border border-[var(--chartreuse)]/40 text-[var(--chartreuse)] hover:bg-white/[0.05]"
                    : "text-paper/90 hover:bg-white/[0.05]",
                isPast && !isSelected && "text-dim/50"
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}