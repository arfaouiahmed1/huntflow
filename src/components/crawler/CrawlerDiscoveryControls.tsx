"use client";

import { CircleCheck, CircleX, Play, ServerCog } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import {
  applySourceFilters,
  DEFAULT_FILTER_SELECTION,
  getExperienceOptions,
  getMarketOptions,
  getSourceTypeOptions,
  getWorkModeOptions,
  parseSourceCatalog,
  type MarketSelection,
  type SourceFilterSelection,
  type SourceTypeSelection,
  type TaxonomySource,
} from "@/lib/sourceTaxonomy";

export type CrawlerSourceForControls = {
  id: string;
  name: string;
  category: string;
  type: "static" | "stealth" | "posts";
  url: string;
  sourceType?: string;
  markets?: string[];
  experience?: string;
  workMode?: string;
  enabledByDefault: boolean;
  note?: string;
};

interface Props {
  keyword: string;
  onKeywordChange: (v: string) => void;
  crawlLimit: number;
  onCrawlLimitChange: (v: number) => void;
  selection: SourceFilterSelection;
  onSelectionChange: (next: SourceFilterSelection) => void;
  sources: CrawlerSourceForControls[];
  selectedIds: Set<string>;
  onToggleSource: (id: string) => void;
  onStart: () => void;
  crawling: boolean;
  checked: boolean;
  offline: boolean;
}

function toTaxonomySources(raw: CrawlerSourceForControls[]): readonly TaxonomySource[] {
  // Use parseSourceCatalog as boundary so malformed entries don't crash filter
  const parsed = parseSourceCatalog({ sources: raw });
  if (parsed.sources.length > 0) return parsed.sources;
  // Fallback: map raw directly when parse fails but fields are present
  return raw
    .filter((s) => s.id && s.name)
    .map((s) => ({
      id: s.id,
      name: s.name,
      sourceType: (s.sourceType as TaxonomySource["sourceType"]) ?? "general",
      markets: (s.markets as TaxonomySource["markets"]) ?? ["global"],
      experience: (s.experience as TaxonomySource["experience"]) ?? "all",
      workMode: (s.workMode as TaxonomySource["workMode"]) ?? "all",
      enabledByDefault: s.enabledByDefault,
    }));
}

export function useFilteredSources(sources: CrawlerSourceForControls[], selection: SourceFilterSelection) {
  const catalog = toTaxonomySources(sources);
  const filtered = applySourceFilters(catalog, selection);
  const filteredIds = new Set(filtered.map((s) => s.id));
  const visible = sources.filter((s) => filteredIds.has(s.id));
  // When catalog empty (offline/no sources yet), show raw sources unfiltered
  if (catalog.length === 0 && sources.length > 0) return sources;
  return visible;
}

export default function CrawlerDiscoveryControls({
  keyword,
  onKeywordChange,
  crawlLimit,
  onCrawlLimitChange,
  selection,
  onSelectionChange,
  sources,
  selectedIds,
  onToggleSource,
  onStart,
  crawling,
  checked,
  offline,
}: Props) {
  const sourceTypeOptions = getSourceTypeOptions();
  const marketOptions = getMarketOptions();
  const experienceOptions = getExperienceOptions();
  const workModeOptions = getWorkModeOptions();

  const visibleSources = useFilteredSources(sources, selection);
  const selectedInView = visibleSources.filter((s) => selectedIds.has(s.id)).length;
  const totalSelected = selectedIds.size;
  const hasZeroResult = sources.length > 0 && visibleSources.length === 0;

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
      <div className="flex items-center gap-2">
        <ServerCog className="h-4 w-4 text-[var(--chartreuse)]" />
        <h2 className="text-sm font-semibold text-[var(--paper)]">New crawl</h2>
        <span className="text-[11px] text-dim">No run starts until you press Start crawl.</span>
      </div>

      <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1fr)_150px_150px_150px_150px_100px_auto] sm:items-end">
        <label className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Search terms</span>
          <input
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder="AI engineer, LangGraph, RAG"
            className="h-10 w-full rounded-xl border border-[var(--line)] bg-black/20 px-3 text-sm text-[var(--paper)] outline-none transition-colors focus:border-[var(--chartreuse)]/50"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Source type</span>
          <Select
            value={selection.sourceType}
            onChange={(v: string) => onSelectionChange({ ...selection, sourceType: v as SourceTypeSelection })}
            options={sourceTypeOptions.map((o) => ({ value: o.value, label: o.label }))}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Market / location</span>
          <Select
            value={selection.market}
            onChange={(v: string) => onSelectionChange({ ...selection, market: v as MarketSelection })}
            options={marketOptions.map((o) => ({ value: o.value, label: o.label }))}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Experience</span>
          <Select
            value={selection.experience}
            onChange={(v: string) => onSelectionChange({ ...selection, experience: v as never })}
            options={experienceOptions.map((o) => ({ value: o.value, label: o.label }))}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Work mode</span>
          <Select
            value={selection.workMode}
            onChange={(v: string) => onSelectionChange({ ...selection, workMode: v as never })}
            options={workModeOptions.map((o) => ({ value: o.value, label: o.label }))}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Result cap</span>
          <input
            type="number"
            min={1}
            max={150}
            value={crawlLimit}
            onChange={(e) => onCrawlLimitChange(Math.min(150, Math.max(1, Number(e.target.value) || 1)))}
            className="h-10 w-full rounded-xl border border-[var(--line)] bg-black/20 px-3 font-mono text-sm text-[var(--paper)]"
          />
        </label>

        <Button onClick={onStart} loading={crawling} disabled={!checked || offline} className="h-10 px-5 lg:mt-auto">
          <Play className="h-4 w-4" /> {crawling ? "Crawling…" : "Start crawl"}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[10px] text-dim">
        <span>
          {visibleSources.length} visible
        </span>
        <span className="opacity-40">·</span>
        <span>
          {selectedInView} selected in view
        </span>
        <span className="opacity-40">·</span>
        <span>{totalSelected} selected total</span>
        {selection.sourceType !== DEFAULT_FILTER_SELECTION.sourceType ||
        selection.market !== DEFAULT_FILTER_SELECTION.market ||
        selection.experience !== DEFAULT_FILTER_SELECTION.experience ||
        selection.workMode !== DEFAULT_FILTER_SELECTION.workMode ? (
          <button
            type="button"
            onClick={() => onSelectionChange(DEFAULT_FILTER_SELECTION)}
            className="ml-2 rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--paper)] hover:border-[var(--chartreuse)]/40"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <div className="mt-5 border-t border-[var(--line)] pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Sources in this view</p>
          <span className="font-mono text-[10px] text-dim">{selectedInView} selected</span>
        </div>

        {hasZeroResult ? (
          <div className="rounded-xl border border-dashed border-[var(--line)] bg-black/10 p-8 text-center">
            <p className="text-sm font-semibold text-[var(--paper)]">No boards match these filters</p>
            <p className="mt-1 text-xs text-dim">Try broadening Source type or Market. Your previously selected sources stay selected when they are hidden.</p>
            <button
              type="button"
              onClick={() => onSelectionChange(DEFAULT_FILTER_SELECTION)}
              className="mt-3 rounded-xl border border-[var(--line)] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-[var(--paper)] hover:border-[var(--chartreuse)]/40"
            >
              Show all sources
            </button>
          </div>
        ) : (
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {visibleSources.map((source) => {
              const selected = selectedIds.has(source.id);
              return (
                <button
                  key={source.id}
                  onClick={() => onToggleSource(source.id)}
                  data-testid="source-card"
                  data-source-id={source.id}
                  data-selected={selected ? "true" : "false"}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${selected ? "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/5" : "border-[var(--line)] bg-black/10 opacity-65 hover:opacity-100"}`}
                  title={source.note || source.url}
                >
                  {selected ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--chartreuse)]" /> : <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-dim" />}
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-[var(--paper)]">{source.name}</span>
                    <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-wider text-dim">
                      {(source.sourceType as string) ?? source.type} · {Array.isArray(source.markets) ? source.markets.join("/") : source.category} · {source.experience ?? "all"} · {source.workMode ?? "all"}
                    </span>
                  </span>
                </button>
              );
            })}
            {visibleSources.length === 0 && <p className="text-xs text-dim">Source controls appear when the agent is online.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
