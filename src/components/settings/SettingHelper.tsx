"use client";

import { useEffect, useId, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SettingHelper — a (?) affordance next to setting labels/headings.
 *
 * Shows a concise explainer on hover/focus (pointer + keyboard users) and
 * toggles as a dismissible popover on click/tap (touch users). Esc or an
 * outside click closes it. The bubble clamps itself into the viewport so it
 * never causes horizontal overflow on narrow screens.
 */
export default function SettingHelper({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  // Clamp the bubble into the viewport (390px phones included).
  useEffect(() => {
    if (!open) return;
    const wrap = wrapRef.current;
    const tip = tipRef.current;
    if (!wrap || !tip) return;
    const anchor = wrap.getBoundingClientRect();
    const width = Math.min(240, window.innerWidth - 16);
    const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 8));
    tip.style.width = `${width}px`;
    tip.style.left = `${left - anchor.left}px`;
  }, [open ]);

  return (
    <span ref={wrapRef} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label ? `What does “${label}” do?` : "What does this setting do?"}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(
          "ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-dim transition-colors",
          "hover:bg-white/[0.06] hover:text-[var(--chartreuse)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chartreuse)]/60",
          open && "bg-white/[0.06] text-[var(--chartreuse)]"
        )}
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <span
          ref={tipRef}
          role="tooltip"
          id={id}
          className="absolute top-full z-50 mt-1.5 rounded-xl border border-[var(--line)] bg-[var(--ink-deep)] px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-[var(--paper)] shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
        >
          {text}
        </span>
      )}
    </span>
  );
}
