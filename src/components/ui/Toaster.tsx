"use client";

import React, { createContext, useContext, useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, XCircle, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { rawPalette } from "@/lib/theme";

type ToastKind = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextType {
  toast: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  celebrate: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const icons: Record<ToastKind, { icon: LucideIcon; color: string }> = {
  success: { icon: CheckCircle2, color: "text-[var(--chartreuse)]" },
  error: { icon: XCircle, color: "text-[var(--coral)]" },
  info: { icon: Info, color: "text-[var(--sky)]" },
  warning: { icon: AlertTriangle, color: "text-[var(--amber)]" },
};

export function ToasterProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, kind, message }]);
      setTimeout(() => remove(id), 4200);
    },
    [remove]
  );

  const celebrate = useCallback(() => {
    const colors = [
      rawPalette.chartreuse,
      rawPalette.amber,
      rawPalette.sky,
      rawPalette.violet,
      rawPalette.coral,
    ];
    // Lazy-load the confetti lib only when a celebration actually fires,
    // keeping it out of the initial bundle.
    void import("canvas-confetti").then(({ default: confetti }) => {
      confetti({ particleCount: 90, spread: 75, origin: { y: 0.7 }, colors });
      setTimeout(() => {
        confetti({ particleCount: 50, angle: 60, spread: 60, origin: { x: 0 }, colors });
        confetti({ particleCount: 50, angle: 120, spread: 60, origin: { x: 1 }, colors });
      }, 180);
    });
  }, []);

  const api: ToastContextType = {
    toast,
    success: (m) => toast("success", m),
    error: (m) => toast("error", m),
    info: (m) => toast("info", m),
    warn: (m) => toast("warning", m),
    celebrate,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[200] flex w-80 flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => {
            const c = icons[t.kind];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, x: 60, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className="glass pointer-events-auto flex items-start gap-3 rounded-xl p-3.5 shadow-2xl"
              >
                <c.icon className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", c.color)} />
                <p className="flex-1 text-xs leading-relaxed text-[var(--paper)]">{t.message}</p>
                <button onClick={() => remove(t.id)} className="text-dim transition-colors hover:text-[var(--paper)]">
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToasterProvider");
  return ctx;
};
