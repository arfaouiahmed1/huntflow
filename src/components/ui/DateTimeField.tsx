"use client";

/* eslint-disable react-hooks/preserve-manual-memoization */

import { useEffect, useRef, useState, useMemo } from "react";
import { Calendar as CalendarIcon, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import Calendar from "@/components/ui/Calendar";
import Select from "@/components/ui/Select";

/**
 * Themed datetime field (replaces native <input type="datetime-local">).
 * Combines DateField's Calendar popover with themed Select controls for hour/minute.
 * Styled to match Select: bg-white/[0.03] border-line, dark popover.
 */
export default function DateTimeField({
  value,
  onChange,
  className,
  placeholder = "Pick date & time…",
  disabled = false,
}: {
  value: string; // "YYYY-MM-DDTHH:mm" or "" or ISO string
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
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

  // Normalize value: accept ISO string or "YYYY-MM-DDTHH:mm"
  const normalized = useMemo(() => {
    if (!value) return "";
    // If value contains T, keep as is trimmed to 16
    if (value.includes("T")) return value.slice(0, 16);
    try {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    } catch {}
    return value;
  }, [value]);

  const datePart = normalized ? normalized.split("T")[0] : "";
  const timePart = normalized ? normalized.split("T")[1] ?? "" : "";
  const [hourStr, minuteStr] = timePart ? timePart.split(":") : ["09", "00"];
  const hour = hourStr ?? "09";
  const minute = minuteStr ?? "00";

  const display = useMemo(() => {
    if (!normalized) return "";
    try {
      const d = new Date(`${normalized}:00`);
      if (Number.isNaN(d.getTime())) return normalized.replace("T", " · ");
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " · " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return normalized.replace("T", " · ");
    }
  }, [normalized]);

  const updateDate = (isoDate: string) => {
    if (!isoDate) {
      onChange("");
      return;
    }
    const t = timePart || "09:00";
    onChange(`${isoDate}T${t}`);
  };

  const updateTime = (h: string, m: string) => {
    const d = datePart || new Date().toISOString().slice(0, 10);
    const hh = h.padStart(2, "0");
    const mm = m.padStart(2, "0");
    onChange(`${d}T${hh}:${mm}`);
  };

  // Hour options 00-23
  const hourOpts = Array.from({ length: 24 }, (_, i) => {
    const v = String(i).padStart(2, "0");
    return { value: v, label: v };
  });
  // Allow any minute value — if current minute not in standard set, add it
  const minuteOptions = useMemo(() => {
    const base = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
    const set = new Set(base);
    if (minute && !set.has(minute)) base.push(minute);
    return base.sort().map((v) => ({ value: v, label: v }));
  }, [minute]);

  return (
    <div className={cn("relative", className)} ref={ref}>
      <div
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5 text-xs outline-none transition-colors select-none",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-line/60",
          open && "border-chartreuse/50"
        )}
      >
        <span className={cn("flex min-w-0 items-center gap-2", normalized ? "text-paper" : "text-dim/70")}>
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-dim" />
          <span className="truncate">{display || placeholder}</span>
          {normalized && <Clock className="h-3 w-3 shrink-0 text-dim/70" />}
        </span>
        <span className="flex items-center gap-1">
          {normalized ? (
            <button
              type="button"
              aria-label="Clear datetime"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="grid h-5 w-5 shrink-0 place-items-center rounded text-dim transition-colors hover:text-[var(--coral)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </span>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 rounded-xl border border-[var(--line)] bg-[var(--ink-soft)] p-3 shadow-2xl">
          <Calendar value={datePart} onChange={updateDate} />
          <div className="mt-3 flex items-center gap-2 border-t border-[var(--line)] pt-3">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim">
              <Clock className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> Time
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <Select value={hour} onChange={(v) => updateTime(v, minute)} options={hourOpts} ariaLabel="Hour" className="w-20" />
              <span className="text-dim">:</span>
              <Select value={minute} onChange={(v) => updateTime(hour, v)} options={minuteOptions} ariaLabel="Minute" className="w-20" />
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-dim/70">Pick a day, then adjust hour & minute. Clear to leave unscheduled.</p>
        </div>
      )}
    </div>
  );
}
