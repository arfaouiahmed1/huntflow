"use client";

import React, { useState } from "react";
import { X, Search, CheckCircle2, AlertTriangle, Key, Wrench, Ban, Activity, ExternalLink } from "lucide-react";
import type { CrawlerSourcePublic, SourceHealthStatus } from "@/lib/crawler/contracts";
import { cn } from "@/lib/utils";

interface SourceHealthDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sources: CrawlerSourcePublic[];
  onToggleSource: (id: string, enabled: boolean) => Promise<void>;
  className?: string;
}

const HEALTH_GROUPS: {
  status: SourceHealthStatus;
  label: string;
  icon: React.ElementType;
  color: string;
  badgeClass: string;
}[] = [
  {
    status: "healthy",
    label: "Healthy & Active",
    icon: CheckCircle2,
    color: "text-emerald-400",
    badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  },
  {
    status: "degraded",
    label: "Degraded / Retrying",
    icon: AlertTriangle,
    color: "text-amber-400",
    badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  },
  {
    status: "unconfigured",
    label: "API Key Required",
    icon: Key,
    color: "text-sky-400",
    badgeClass: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  },
  {
    status: "manual_only",
    label: "Manual Tenant / Browser Assisted",
    icon: Wrench,
    color: "text-purple-400",
    badgeClass: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  },
  {
    status: "disabled",
    label: "Disabled (Canary Pending)",
    icon: Ban,
    color: "text-zinc-400",
    badgeClass: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
  },
];

export function SourceHealthDrawer({
  isOpen,
  onClose,
  sources,
  onToggleSource,
  className,
}: SourceHealthDrawerProps) {
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filtered = sources.filter((s) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.connector.toLowerCase().includes(q) ||
      s.regions.some((r) => r.toLowerCase().includes(q))
    );
  });

  const handleToggle = async (id: string, currentEnabled: boolean) => {
    setUpdatingId(id);
    try {
      await onToggleSource(id, !currentEnabled);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div
        className={cn(
          "w-full max-w-xl h-full bg-[var(--ink-card)] border-l border-[var(--line)] shadow-2xl flex flex-col p-6 space-y-6 overflow-hidden",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]">
              <Activity className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-[var(--paper)]">Source Network & Health</h2>
              <p className="text-xs text-[var(--paper-dim)]">
                {sources.length} total registered sources across 5 channels & 6 regions
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--paper-dim)] hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--paper-dim)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search source name, connector, region..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/[0.03] border border-[var(--line)] text-xs text-[var(--paper)] placeholder-[var(--paper-dim)] focus:border-[var(--chartreuse)] focus:outline-none transition-colors"
          />
        </div>

        {/* Grouped lists */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          {HEALTH_GROUPS.map((grp) => {
            const groupSources = filtered.filter((s) => {
              if (grp.status === "healthy") return s.health === "healthy" || (!s.health && s.enabled);
              if (grp.status === "disabled") return s.health === "disabled" || s.crawlPolicy === "disabled";
              return s.health === grp.status;
            });

            if (groupSources.length === 0) return null;
            const Icon = grp.icon;

            return (
              <div key={grp.status} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", grp.color)} />
                    <span className="text-xs font-semibold text-[var(--paper)]">{grp.label}</span>
                  </div>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-mono border", grp.badgeClass)}>
                    {groupSources.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {groupSources.map((source) => (
                    <div
                      key={source.id}
                      className="p-3.5 rounded-xl bg-white/[0.02] border border-[var(--line)] hover:border-white/15 transition-all space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">{source.name}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-[var(--paper-dim)]">
                              {source.channel}
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--paper-dim)] mt-0.5">
                            {source.description || `${source.connector} adapter`}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={updatingId === source.id}
                          onClick={() => handleToggle(source.id, source.enabled)}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all font-medium",
                            source.enabled
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : "bg-white/[0.04] text-[var(--paper-dim)] border border-transparent hover:text-white"
                          )}
                        >
                          {updatingId === source.id ? "..." : source.enabled ? "ENABLED" : "DISABLED"}
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] text-[var(--paper-dim)] border-t border-white/[0.04]">
                        <span>Regions: {source.regions.join(", ")}</span>
                        <span>•</span>
                        <span>Cadence: {source.cadenceMinutes}m</span>
                        {source.attribution?.url && (
                          <>
                            <span>•</span>
                            <a
                              href={source.attribution.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-0.5 text-sky-400 hover:underline"
                            >
                              <span>Feed</span>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default SourceHealthDrawer;
