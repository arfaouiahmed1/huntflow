"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CheckCircle2, AlertTriangle, Info, XCircle, ShieldAlert, Trash2, Check, ExternalLink } from "lucide-react";
import { NotificationItem } from "@/types";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toaster";
import { toErrorMessage } from "@/lib/errors";

const KIND_CONFIG: Record<NotificationItem["kind"], { color: string; bg: string; icon: typeof Info }> = {
  info: { color: "text-[var(--sky)]", bg: "bg-[var(--sky)]/10 border-[var(--sky)]/30", icon: Info },
  success: { color: "text-[var(--chartreuse)]", bg: "bg-[var(--chartreuse)]/10 border-[var(--chartreuse)]/30", icon: CheckCircle2 },
  warning: { color: "text-[var(--amber)]", bg: "bg-[var(--amber)]/10 border-[var(--amber)]/30", icon: AlertTriangle },
  error: { color: "text-[var(--coral)]", bg: "bg-[var(--coral)]/10 border-[var(--coral)]/30", icon: XCircle },
  review: { color: "text-[var(--violet)]", bg: "bg-[var(--violet)]/10 border-[var(--violet)]/30", icon: ShieldAlert },
};
function getFocusable(c: HTMLElement | null): HTMLElement[] {
  if (!c) return [];
  return Array.from(c.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')).filter((el) => el.offsetParent !== null || el === document.activeElement);
}
export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const { error: toastError } = useToast();
  useEffect(() => {
    let ignore = false;
    const poll = () => {
      fetch("/api/notifications").then((res) => (res.ok ? res.json() : null)).then((data) => {
        if (!ignore && data && Array.isArray(data.notifications)) setNotifications(data.notifications);
      }).catch((err) => { if (!ignore) toastError(`Notifications unavailable: ${toErrorMessage(err)}`); });
    };
    poll();
    const interval = setInterval(poll, 10_000);
    return () => { ignore = true; clearInterval(interval); };
  }, [toastError]);
  useEffect(() => {
    const handle = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);
  useEffect(() => {
    if (!open) {
      if (prevFocusRef.current && (document.activeElement === document.body || panelRef.current?.contains(document.activeElement))) prevFocusRef.current.focus?.();
      prevFocusRef.current = null;
      return;
    }
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    const id = requestAnimationFrame(() => {
      const f = getFocusable(panelRef.current);
      if (f.length) f[0].focus(); else panelRef.current?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); triggerRef.current?.focus(); return; }
      if (e.key === "Tab" && panelRef.current) {
        const f = getFocusable(panelRef.current);
        if (f.length === 0) { e.preventDefault(); return; }
        const first = f[0], last = f[f.length - 1];
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(id); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const filtered = filter === "all" ? notifications : notifications.filter((n) => !n.read);
  const markRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try { const res = await fetch(`/api/notifications/${id}`, { method: "PATCH" }); if (!res.ok) throw new Error(`Mark read ${res.status}`); } catch (err) { toastError(`Failed to mark read: ${toErrorMessage(err)}`); }
  };
  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try { const res = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "markAllRead" }) }); if (!res.ok) throw new Error(`Mark all ${res.status}`); } catch (err) { toastError(`Failed to mark all read: ${toErrorMessage(err)}`); }
  };
  const clearAll = async () => {
    setNotifications([]);
    try { const res = await fetch("/api/notifications", { method: "DELETE" }); if (!res.ok) throw new Error(`Clear ${res.status}`); } catch (err) { toastError(`Failed to clear: ${toErrorMessage(err)}`); }
  };
  const deleteOne = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try { const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" }); if (!res.ok) throw new Error(`Delete ${res.status}`); } catch (err) { toastError(`Failed to delete: ${toErrorMessage(err)}`); }
  };
  return (
    <div ref={dropdownRef} className="relative">
      <button ref={triggerRef} onClick={() => setOpen((p) => !p)} className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-dim transition-colors hover:bg-white/[0.05] hover:text-[var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chartreuse)]/60", open && "bg-white/[0.05] text-[var(--chartreuse)]")} aria-label="Notifications" aria-expanded={open} aria-haspopup="dialog">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--chartreuse)] font-mono text-[9px] font-bold text-black shadow-sm">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div aria-hidden="true" onClick={() => setOpen(false)} className="fixed inset-0 z-40" />
            <motion.div ref={panelRef} role="dialog" aria-modal="true" aria-label="Notifications" tabIndex={-1} initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }} transition={{ duration: 0.15 }} className={cn("fixed z-50 overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--ink-card)] shadow-2xl backdrop-blur-xl focus:outline-none", "left-[max(0.5rem,env(safe-area-inset-left))] right-[max(0.5rem,env(safe-area-inset-right))] top-[calc(3.5rem+env(safe-area-inset-top))] w-auto", "max-h-[calc(100dvh-4rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-h-[min(70vh,calc(100dvh-4rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))]", "lg:left-[max(260px,calc(260px+env(safe-area-inset-left)))] lg:right-auto lg:top-[calc(4rem+env(safe-area-inset-top))] lg:w-[min(24rem,calc(100vw-1.5rem-env(safe-area-inset-left)-env(safe-area-inset-right)))]", "lg:max-h-[min(70vh,calc(100dvh-5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))]")}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-white/[0.02] px-4 py-3">
                <div className="flex items-center gap-2"><Bell className="h-4 w-4 text-[var(--chartreuse)]" /><span className="text-xs font-bold text-[var(--paper)]">Notifications</span>{unreadCount > 0 && <span className="rounded-full bg-[var(--chartreuse)]/20 px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--chartreuse)]">{unreadCount} new</span>}</div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && <button onClick={markAllRead} className="flex items-center gap-1 text-[10px] font-medium text-dim hover:text-[var(--chartreuse)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chartreuse)]/60 rounded"><Check className="h-3 w-3" /> Mark all read</button>}
                  {notifications.length > 0 && <button onClick={clearAll} className="text-dim hover:text-[var(--coral)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--coral)]/60 rounded p-1" title="Clear all" aria-label="Clear all notifications"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              </div>
              <div className="flex border-b border-[var(--line)] px-3 py-1.5 text-[11px]">
                <button onClick={() => setFilter("all")} className={cn("rounded-lg px-2.5 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chartreuse)]/60", filter === "all" ? "bg-white/10 text-[var(--paper)]" : "text-dim hover:text-[var(--paper)]")}>All ({notifications.length})</button>
                <button onClick={() => setFilter("unread")} className={cn("rounded-lg px-2.5 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chartreuse)]/60", filter === "unread" ? "bg-white/10 text-[var(--paper)]" : "text-dim hover:text-[var(--paper)]")}>Unread ({unreadCount})</button>
              </div>
              <div className="grid grid-cols-1 divide-y divide-[var(--line)]/40">
                {filtered.length === 0 ? <div className="py-8 text-center text-xs text-dim">{filter === "unread" ? "No unread notifications" : "No notifications yet"}</div> : filtered.map((item) => {
                  const conf = KIND_CONFIG[item.kind] || KIND_CONFIG.info;
                  const Icon = conf.icon;
                  return (
                    <div key={item.id} onClick={() => !item.read && markRead(item.id)} className={cn("group relative flex items-start gap-3 p-3.5 transition-colors hover:bg-white/[0.03]", !item.read && "bg-[var(--chartreuse)]/[0.02]")}>
                      <div className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border", conf.bg)}><Icon className={cn("h-3.5 w-3.5", conf.color)} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1"><p className={cn("truncate text-xs font-semibold", item.read ? "text-[var(--paper)]/80" : "text-[var(--paper)]")}>{item.title}</p><span className="shrink-0 font-mono text-[9px] text-dim">{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-dim break-words">{item.message}</p>
                        {item.link && <a href={item.link} className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--sky)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sky)]/60 rounded">View details <ExternalLink className="h-2.5 w-2.5" /></a>}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); deleteOne(item.id); }} className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 p-1 text-dim hover:text-[var(--coral)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--coral)]/60 rounded" aria-label="Delete notification"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
