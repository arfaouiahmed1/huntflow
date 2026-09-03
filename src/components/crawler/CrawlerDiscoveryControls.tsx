"use client";

import React, { useState } from "react";
import { Play, Activity, BookmarkPlus, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import CrawlerChannelBar, { type ChannelKey } from "./CrawlerChannelBar";
import CrawlerFacetedFilters from "./CrawlerFacetedFilters";
import SourceHealthDrawer from "./SourceHealthDrawer";
import type { CrawlerFacetFilters, CrawlerSourcePublic } from "@/lib/crawler/contracts";
import { applySourceFilters, parseSourceCatalog, type SourceFilterSelection, type TaxonomySource } from "@/lib/sourceTaxonomy";

interface Props {
  keyword: string;
  onKeywordChange: (v: string) => void;
  channel?: ChannelKey;
  onChannelChange?: (ch: ChannelKey) => void;
  facets?: CrawlerFacetFilters;
  onFacetsChange?: (f: CrawlerFacetFilters) => void;
  onClearFacets?: () => void;
  crawlLimit: number;
  onCrawlLimitChange: (v: number) => void;
  sources: CrawlerSourcePublic[];
  onToggleSource?: (id: string, enabled: boolean) => Promise<void>;
  onStart: () => void;
  onSaveSearch?: () => void;
  crawling: boolean;
  checked: boolean;
  offline: boolean;
  onOpenCompanyDiscovery?: () => void;
  // Backward compatibility props
  selection?: unknown;
  onSelectionChange?: (sel: unknown) => void;
  selectedIds?: Set<string>;
  onDirectAtsCrawl?: (companies?: string[]) => void;
  onWithoutWhiteboardsCrawl?: () => void;
}

function toTaxonomySources(raw: unknown[]): readonly TaxonomySource[] {
  const parsed = parseSourceCatalog({ sources: raw });
  if (parsed.sources.length > 0) return parsed.sources;
  return (raw as Record<string, unknown>[])
    .filter((s) => s.id && s.name)
    .map((s) => ({
      id: String(s.id),
      name: String(s.name),
      sourceType: (s.sourceType as TaxonomySource["sourceType"]) ?? "general",
      markets: (s.markets as TaxonomySource["markets"]) ?? ["global"],
      experience: (s.experience as TaxonomySource["experience"]) ?? "all",
      workMode: (s.workMode as TaxonomySource["workMode"]) ?? "all",
      enabledByDefault: Boolean(s.enabledByDefault ?? true),
    }));
}

export function useFilteredSources<T extends { id: string }>(sources: T[], selection?: unknown): T[] {
  if (!selection || typeof selection !== "object") return sources;
  const catalog = toTaxonomySources(sources);
  const filtered = applySourceFilters(catalog, selection as SourceFilterSelection);
  const filteredIds = new Set(filtered.map((s) => s.id));
  return sources.filter((s) => filteredIds.has(s.id));
}

export default function CrawlerDiscoveryControls({
  keyword,
  onKeywordChange,
  channel = "all",
  onChannelChange,
  facets = {},
  onFacetsChange,
  onClearFacets,
  crawlLimit,
  onCrawlLimitChange,
  sources,
  onToggleSource,
  onStart,
  onSaveSearch,
  crawling,
  checked: _checked,
  offline: _offline,
  onOpenCompanyDiscovery,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeSourcesCount = sources.filter((s) => s.enabled && s.health !== "disabled").length;

  return (
    <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--ink-card)]/70 p-6 space-y-5">
      {/* Top Channel Bar */}
      <CrawlerChannelBar
        activeChannel={channel}
        onSelectChannel={(ch) => onChannelChange?.(ch)}
        sources={sources}
        onOpenCompanyDiscovery={() => onOpenCompanyDiscovery?.()}
      />

      {/* Search Input, Result Limit, and Run Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--paper-dim)]" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !crawling) onStart();
            }}
            placeholder="Role title, skills, or target company (e.g. Distributed Systems, Rust, Stripe)..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-[var(--line)] text-sm text-[var(--paper)] placeholder-[var(--paper-dim)] focus:border-[var(--chartreuse)] focus:outline-none transition-colors"
          />
        </div>

        {/* Limit selector */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--line)] bg-white/[0.02]">
          <span className="text-[11px] text-[var(--paper-dim)] font-mono">Limit:</span>
          <select
            value={crawlLimit}
            onChange={(e) => onCrawlLimitChange(Number(e.target.value))}
            className="bg-transparent text-xs text-[var(--paper)] font-mono focus:outline-none cursor-pointer"
          >
            <option value={20} className="bg-[var(--ink-card)]">20</option>
            <option value={50} className="bg-[var(--ink-card)]">50</option>
            <option value={100} className="bg-[var(--ink-card)]">100</option>
            <option value={150} className="bg-[var(--ink-card)]">150</option>
          </select>
        </div>

        {/* Sources Health Drawer Trigger */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-[var(--line)] bg-white/[0.02] text-[var(--paper)] hover:text-white hover:border-white/20 transition-all"
        >
          <Activity className="h-3.5 w-3.5 text-emerald-400" />
          <span>Sources ({activeSourcesCount})</span>
        </button>

        {/* Save Search Button */}
        {onSaveSearch && (
          <Button
            type="button"
            variant="outline"
            onClick={onSaveSearch}
            className="gap-1.5 text-xs text-[var(--paper)] hover:text-white border-[var(--line)] hover:border-white/20"
          >
            <BookmarkPlus className="h-3.5 w-3.5 text-sky-400" />
            <span className="hidden sm:inline">Save Search</span>
          </Button>
        )}

        {/* Run Crawl Button */}
        <Button
          type="button"
          onClick={onStart}
          disabled={crawling}
          className="gap-2 bg-[var(--chartreuse)] text-black hover:bg-[var(--chartreuse)]/90 font-semibold text-xs px-5 py-2.5 rounded-xl transition-all shadow-sm"
        >
          {crawling ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-black" />
              <span>Crawling Network...</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 fill-black text-black" />
              <span>Run Discovery</span>
            </>
          )}
        </Button>
      </div>

      {/* Faceted Filters */}
      {onFacetsChange && (
        <CrawlerFacetedFilters
          filters={facets}
          onChange={onFacetsChange}
          onClear={() => onClearFacets?.()}
        />
      )}

      {/* Source Health Drawer */}
      <SourceHealthDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sources={sources}
        onToggleSource={async (id, enabled) => {
          if (onToggleSource) await onToggleSource(id, enabled);
        }}
      />
    </section>
  );
}
