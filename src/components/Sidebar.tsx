"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  KanbanSquare,
  Bot,
  Settings,
  Crosshair,
  WifiOff,
  Activity,
  Users,
  Mail,
  CalendarClock,
  MessagesSquare,
  Archive,
  Radar,
  FileSignature,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Command Deck", icon: LayoutDashboard },
  { href: "/tracker", label: "Applications", icon: KanbanSquare },
  { href: "/resume", label: "Resume & CV Studio", icon: FileSignature },
  { href: "/jobs", label: "Job Finder", icon: Radar },
  { href: "/agent", label: "Auto-Apply Agent", icon: Bot },
  { href: "/assistant", label: "Assistant", icon: MessagesSquare },
  { href: "/vault", label: "My Info & Vault", icon: Archive },
  { href: "/network", label: "Network", icon: Users },
  { href: "/outreach", label: "Outreach", icon: Mail },
  { href: "/interviews", label: "Interviews", icon: CalendarClock },
  { href: "/settings", label: "Settings", icon: Settings },
];

function AgentStatus() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      fetch("/api/agent/health", { cache: "no-store" })
        .then((r) => !cancelled && setOnline(r.ok))
        .catch(() => !cancelled && setOnline(false));
    check();
    const t = setInterval(check, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        window.location.href = "/assistant";
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const state =
    online === null ? "checking" : online ? "online" : "offline";

  return (
    <div className="m-3 rounded-xl border border-line bg-white/[0.02] p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            state === "online" && "animate-pulse-dot bg-chartreuse",
            state === "offline" && "bg-coral",
            state === "checking" && "bg-dim"
          )}
        />
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim">
          {state === "online" ? "Agent Online" : state === "offline" ? "Agent Offline" : "Checking Agent…"}
        </p>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs leading-relaxed text-dim">
        {state === "online" ? (
          <>
            <Activity className="h-3 w-3 text-chartreuse" /> Scrapling engine armed — auto-apply ready.
          </>
        ) : state === "offline" ? (
          <>
            <WifiOff className="h-3 w-3 text-coral" /> Engine unreachable. Start it in scrapling-agent/.
          </>
        ) : (
          "Pinging the Scrapling engine…"
        )}
      </p>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[236px] flex-col border-r border-line bg-ink-soft/80 backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-3 px-6 pt-7 pb-8">
          <div className="relative grid h-10 w-10 place-items-center rounded-xl border border-[var(--chartreuse)]/40 bg-chartreuse/10">
            <Crosshair className="h-5 w-5 text-chartreuse" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse-dot rounded-full bg-chartreuse" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold tracking-wide">
              HUNT<span className="laser-text">FLOW</span>
            </p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-dim">
              Job Search OS
            </p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1.5 px-3 overflow-y-auto">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href}>
                <motion.div
                  whileHover={{ x: 3 }}
                  transition={{ type: "spring", stiffness: 400, damping: 26 }}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-chartreuse/10 text-chartreuse"
                      : "text-dim hover:bg-white/[0.04] hover:text-paper"
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-chartreuse"
                    />
                  )}
                  <Icon
                    className={cn(
                      "h-4.5 w-4.5 transition-colors",
                      active ? "text-chartreuse" : "text-dim group-hover:text-paper"
                    )}
                  />
                  {label}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        <AgentStatus />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-[var(--ink-soft)]/90 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="relative grid h-8 w-8 place-items-center rounded-lg border border-[var(--chartreuse)]/40 bg-chartreuse/10">
              <Crosshair className="h-4 w-4 text-chartreuse" />
            </div>
            <p className="font-display text-sm font-semibold tracking-wide">
              HUNT<span className="laser-text">FLOW</span>
            </p>
          </Link>
          <nav className="flex max-w-[calc(100vw-9rem)] items-center gap-0.5 overflow-x-auto">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  title={label}
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors",
                    active
                      ? "bg-chartreuse/15 text-chartreuse"
                      : "text-dim hover:bg-white/[0.05] hover:text-paper"
                  )}
                >
                  <Icon className="h-4.5 w-4.5" />
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
    </>
  );
}
