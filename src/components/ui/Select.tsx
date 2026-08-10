"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reusable, theme-consistent select dropdown (replaces native <select>).
 *
 * Matches the visual language of StatusSelect: a styled trigger that opens a
 * floating menu of options. Unlike native <select>, it renders identically
 * across all browsers instead of falling back to the OS widget.
 */
export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
  /** Render a colored dot ahead of the label (like StatusSelect). */
  dot?: string;
}

export default function Select<T extends string = string>({
  value,
  onChange,
  options,
  className,
  menuClassName,
  placeholder = "Select…",
  disabled = false,
  ariaLabel,
  align = "left",
}: {
  value: T | undefined;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  className?: string;
  menuClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const active = options.find((o) => o.value === value);

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

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5 text-xs text-paper outline-none transition-colors",
          "hover:border-line/60 focus:border-chartreuse/50",
          disabled && "cursor-not-allowed opacity-50",
          open && "border-chartreuse/50"
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {active?.dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: active.dot }} />}
          <span className={cn("truncate", active ? "text-paper" : "text-dim/70")}>
            {active ? active.label : placeholder}
          </span>
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-dim transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          id={`${id}-menu`}
          className={cn(
            "absolute top-full z-50 mt-1.5 max-h-64 w-full min-w-[10rem] overflow-auto rounded-xl border border-[var(--line)] bg-[var(--ink-soft)] p-1 shadow-2xl",
            align === "right" ? "right-0" : "left-0",
            menuClassName
          )}
        >
          {options.map((o) => {
            const activeOpt = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={activeOpt}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors hover:bg-white/[0.05]",
                  activeOpt ? "text-[var(--paper)]" : "text-dim hover:text-[var(--paper)]"
                )}
              >
                {o.dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: o.dot }} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block truncate text-[10px] text-dim/70">{o.hint}</span>}
                </span>
                {activeOpt && <Check className="h-3 w-3 shrink-0 text-[var(--chartreuse)]" />}
              </button>
            );
          })}
          {options.length === 0 && <p className="px-2.5 py-2 text-xs text-dim/70">No options</p>}
        </div>
      )}
    </div>
  );
}