"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import Calendar from "@/components/ui/Calendar";

/**
 * Date picker field (replaces <input type="date">).
 *
 * A styled, read-only-looking trigger opens the Calendar popover; choosing a
 * day writes an ISO string. A clear affordance lets the user blank the value.
 */
export default function DateField({
  value,
  onChange,
  className,
  placeholder = "Pick a date…",
  minMonth,
  maxMonth,
}: {
  value?: string;
  onChange: (iso: string) => void;
  className?: string;
  placeholder?: string;
  minMonth?: string;
  maxMonth?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const display = value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5 text-xs outline-none transition-colors",
          "hover:border-line/60 focus:border-chartreuse/50",
          open && "border-chartreuse/50"
        )}
      >
        <span className={cn("flex min-w-0 items-center gap-2", value ? "text-paper" : "text-dim/70")}>
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-dim" />
          <span className="truncate">{display || placeholder}</span>
        </span>
        {value ? (
          <button
            type="button"
            aria-label="Clear date"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="grid h-4 w-4 shrink-0 place-items-center rounded text-dim transition-colors hover:text-[var(--coral)]"
          >
            <X className="h-3 w-3" />
          </button>
        ) : (
          <span />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5">
          <Calendar value={value ?? ""} onChange={onChange} minMonth={minMonth} maxMonth={maxMonth} />
        </div>
      )}
    </div>
  );
}