"use client";

import React from "react";
import { Building2, Globe, Sparkles, Layers, Search } from "lucide-react";
import type { CrawlerSourcePublic } from "@/lib/crawler/contracts";
import { cn } from "@/lib/utils";

export type ChannelKey = "all" | "ats" | "aggregator" | "without_whiteboards";

export interface ChannelItem {
  key: ChannelKey;
  label: string;
  description: string;
  icon: React.ElementType;
  count: number;
}

interface CrawlerChannelBarProps {
  activeChannel: ChannelKey;
  onSelectChannel: (channel: ChannelKey) => void;
  sources: CrawlerSourcePublic[];
  curatedCount?: number;
  onOpenCompanyDiscovery: () => void;
  className?: string;
}

export function CrawlerChannelBar({
  activeChannel,
  onSelectChannel,
  sources,
  curatedCount,
  onOpenCompanyDiscovery,
  className,
}: CrawlerChannelBarProps) {
  // Compute live healthy / enabled counts per channel from sources array
  const healthySources = sources.filter((s) => s.enabled && s.health !== "disabled");
  const totalCount = healthySources.length;
  const atsCount = healthySources.filter((s) => s.channel === "ats").length;
  const aggregatorCount = healthySources.filter(
    (s) => s.channel === "aggregator" || s.channel === "regional"
  ).length;
  const communityCount = healthySources.filter((s) => s.channel === "community").length;
  const effectiveCuratedCount = curatedCount !== undefined ? curatedCount : communityCount;

  const channels: ChannelItem[] = [
    {
      key: "all",
      label: "All public feeds",
      description: "Unified cross-network search",
      icon: Globe,
      count: totalCount,
    },
    {
      key: "ats",
      label: "Company career systems",
      description: "Direct Greenhouse, Lever & Ashby feeds",
      icon: Building2,
      count: atsCount,
    },
    {
      key: "aggregator",
      label: "Remote & global boards",
      description: "Arbeitnow, Jobicy, Remotive & regional feeds",
      icon: Layers,
      count: aggregatorCount,
    },
    {
      key: "without_whiteboards",
      label: "Interview-friendly",
      description: "Curated take-home & discussion processes",
      icon: Sparkles,
      count: effectiveCuratedCount,
    },
  ];

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-white/[0.02] border border-[var(--line)]">
          {channels.map((ch) => {
            const Icon = ch.icon;
            const isActive = activeChannel === ch.key;
            return (
              <button
                key={ch.key}
                type="button"
                onClick={() => onSelectChannel(ch.key)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all",
                  isActive
                    ? "bg-[var(--chartreuse)] text-black shadow-sm font-semibold"
                    : "text-[var(--paper-dim)] hover:text-white hover:bg-white/[0.04]"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", isActive ? "text-black" : "text-[var(--paper-dim)]")} />
                <span>{ch.label}</span>
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded-md text-[10px] font-mono",
                    isActive ? "bg-black/15 text-black" : "bg-white/[0.06] text-[var(--paper-dim)]"
                  )}
                >
                  {ch.count}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onOpenCompanyDiscovery}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border border-[var(--line)] bg-white/[0.02] text-[var(--paper)] hover:text-white hover:border-[var(--chartreuse)]/50 hover:bg-[var(--chartreuse)]/5 transition-all"
        >
          <Search className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
          <span>Find a company</span>
        </button>
      </div>
    </div>
  );
}

export default CrawlerChannelBar;
