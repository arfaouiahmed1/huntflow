"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { ApplicationStatus } from "@/types";
import { cn } from "@/lib/utils";
import { statusConfig, STATUS_ORDER } from "@/components/ui/StatusBadge";

export default function StatusSelect({
  status,
  onChange,
  size = "md",
  align = "left",
}: {
  status: ApplicationStatus;
  onChange: (s: ApplicationStatus) => void;
  size?: "sm" | "md";
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const c = statusConfig[status];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="Change status"
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-full border font-medium transition-all hover:brightness-125 active:scale-95",
          c.bg,
          c.text,
          size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10px]"
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.dot }} />
        {c.label}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className={cn(
            "absolute top-full z-50 mt-1.5 w-44 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--ink-soft)] p-1 shadow-2xl",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {STATUS_ORDER.map((s) => {
            const o = statusConfig[s];
            const active = s === status;
            return (
              <button
                key={s}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(s);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition-colors hover:bg-white/[0.05]",
                  active ? "text-[var(--paper)]" : "text-dim hover:text-[var(--paper)]"
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: o.dot }} />
                <span className="flex-1">{o.label}</span>
                {active && <Check className="h-3 w-3 text-[var(--chartreuse)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
