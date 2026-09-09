"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { FOCUSABLE_SELECTOR, canRestoreFocus, resolveTrapIndex } from "./modalFocus";

export default function Modal({
  open,
  onClose,
  children,
  title,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", handler);

    // Scroll lock: prevent background scroll while the dialog is open.
    const prevOverflow = document.body.style.overflow;
    if (open) document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Focus lifecycle: move focus into the dialog on open, trap Tab inside it,
  // and restore focus to the trigger on close *or* unmount. Callers mount
  // the dialog conditionally (`{open && <Modal open .../>}`), so the panel
  // often unmounts without `open` ever flipping to false — the effect
  // cleanup below covers that path too.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => {
      const prev = previouslyFocused.current;
      previouslyFocused.current = null;
      if (canRestoreFocus(prev)) {
        try {
          prev.focus();
        } catch {
          // Trigger detached mid-dialog: leave focus where it is.
        }
      }
    };
  }, [open]);

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (items.length === 0) {
      // Nothing to cycle through: hold focus on the panel itself.
      e.preventDefault();
      panelRef.current.focus();
      return;
    }
    const activeIndex = Array.prototype.indexOf.call(items, document.activeElement);
    const target = resolveTrapIndex({ activeIndex, count: items.length, shiftKey: e.shiftKey });
    if (target !== null) {
      e.preventDefault();
      items[target]?.focus();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === "string" ? title : "Dialog"}
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-12 backdrop-blur-sm sm:pt-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            onKeyDown={trapTab}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "glass relative w-full rounded-2xl shadow-2xl outline-none",
              wide ? "max-w-3xl" : "max-w-lg"
            )}
          >
            {title && (
              <div className="flex items-center justify-between border-b border-line px-6 py-4">
                <div className="font-display text-sm font-semibold">{title}</div>
                <button
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="grid h-8 w-8 place-items-center rounded-lg text-dim transition-colors hover:bg-white/5 hover:text-paper"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="p-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
