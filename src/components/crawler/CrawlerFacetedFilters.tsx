"use client";

import React from "react";
import { Filter, X, DollarSign, Globe, Briefcase, Award, Shield } from "lucide-react";
import type { CrawlerFacetFilters, CrawlerRegion, SeniorityLevel, WorkMode } from "@/lib/crawler/contracts";
import { CRAWLER_REGIONS } from "@/lib/crawler/contracts";
import { cn } from "@/lib/utils";

interface FacetedFiltersProps {
  filters: CrawlerFacetFilters;
  onChange: (next: CrawlerFacetFilters) => void;
  onClear: () => void;
  className?: string;
}

const REGION_LABELS: Record<CrawlerRegion, string> = {
  global: "Global",
  americas: "Americas",
  europe: "Europe",
  mena: "MENA (incl. Tunisia)",
  africa: "Africa",
  apac: "APAC",
};

const WORK_MODES: { value: WorkMode; label: string }[] = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

const SENIORITIES: { value: SeniorityLevel; label: string }[] = [
  { value: "intern", label: "Intern" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid level" },
  { value: "senior", label: "Senior" },
  { value: "staff", label: "Staff" },
  { value: "lead", label: "Lead" },
  { value: "principal", label: "Principal" },
];

const POPULAR_TECH_TAGS = [
  "TypeScript", "React", "Node.js", "Python", "Go", "Rust", "PostgreSQL", "AWS", "Kubernetes", "LLM",
];

export function CrawlerFacetedFilters({ filters, onChange, onClear, className }: FacetedFiltersProps) {
  const activeCount =
    (filters.regions?.length ?? 0) +
    (filters.workModes?.length ?? 0) +
    (filters.seniorities?.length ?? 0) +
    (filters.techTags?.length ?? 0) +
    (filters.visaSignals?.length ?? 0) +
    (filters.salaryMin ? 1 : 0);

  const toggleRegion = (region: CrawlerRegion) => {
    const current = filters.regions || [];
    const next = current.includes(region) ? current.filter((r) => r !== region) : [...current, region];
    onChange({ ...filters, regions: next.length > 0 ? next : undefined });
  };

  const toggleWorkMode = (mode: WorkMode) => {
    const current = filters.workModes || [];
    const next = current.includes(mode) ? current.filter((m) => m !== mode) : [...current, mode];
    onChange({ ...filters, workModes: next.length > 0 ? next : undefined });
  };

  const toggleSeniority = (level: SeniorityLevel) => {
    const current = filters.seniorities || [];
    const next = current.includes(level) ? current.filter((s) => s !== level) : [...current, level];
    onChange({ ...filters, seniorities: next.length > 0 ? next : undefined });
  };

  const toggleTechTag = (tag: string) => {
    const current = filters.techTags || [];
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
    onChange({ ...filters, techTags: next.length > 0 ? next : undefined });
  };

  const toggleVisa = () => {
    const isExplicit = filters.visaSignals?.includes("explicit");
    onChange({
      ...filters,
      visaSignals: isExplicit ? undefined : ["explicit", "likely"],
    });
  };

  return (
    <div className={cn("space-y-4 p-4 rounded-2xl bg-white/[0.015] border border-[var(--line)]", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--paper)]">
          <Filter className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
          <span>Faceted Filters</span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-[var(--chartreuse)]/20 text-[var(--chartreuse)]">
              {activeCount} active
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 text-[11px] text-[var(--paper-dim)] hover:text-white transition-colors"
          >
            <X className="h-3 w-3" />
            <span>Clear filters</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Regions */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-[var(--paper-dim)] flex items-center gap-1.5">
            <Globe className="h-3 w-3 text-sky-400" />
            <span>Region</span>
          </label>
          <div className="flex flex-wrap gap-1">
            {CRAWLER_REGIONS.map((r) => {
              const active = filters.regions?.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleRegion(r)}
                  className={cn(
                    "px-2 py-1 rounded-lg text-[11px] font-medium transition-all",
                    active
                      ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                      : "bg-white/[0.03] text-[var(--paper-dim)] hover:text-white hover:bg-white/[0.06] border border-transparent"
                  )}
                >
                  {REGION_LABELS[r]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Work Mode */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-[var(--paper-dim)] flex items-center gap-1.5">
            <Briefcase className="h-3 w-3 text-emerald-400" />
            <span>Work Mode</span>
          </label>
          <div className="flex flex-wrap gap-1">
            {WORK_MODES.map((m) => {
              const active = filters.workModes?.includes(m.value);
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => toggleWorkMode(m.value)}
                  className={cn(
                    "px-2 py-1 rounded-lg text-[11px] font-medium transition-all",
                    active
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-white/[0.03] text-[var(--paper-dim)] hover:text-white hover:bg-white/[0.06] border border-transparent"
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Seniority */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-[var(--paper-dim)] flex items-center gap-1.5">
            <Award className="h-3 w-3 text-amber-400" />
            <span>Seniority</span>
          </label>
          <div className="flex flex-wrap gap-1">
            {SENIORITIES.map((s) => {
              const active = filters.seniorities?.includes(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleSeniority(s.value)}
                  className={cn(
                    "px-2 py-1 rounded-lg text-[11px] font-medium transition-all",
                    active
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      : "bg-white/[0.03] text-[var(--paper-dim)] hover:text-white hover:bg-white/[0.06] border border-transparent"
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Visa & Salary Signals */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-[var(--paper-dim)] flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-purple-400" />
            <span>Visa & Compensation</span>
          </label>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={toggleVisa}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1",
                filters.visaSignals?.includes("explicit")
                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                  : "bg-white/[0.03] text-[var(--paper-dim)] hover:text-white hover:bg-white/[0.06] border border-transparent"
              )}
            >
              <Shield className="h-3 w-3" />
              <span>Visa Sponsorship</span>
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...filters, salaryMin: filters.salaryMin ? undefined : 120000 })}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1",
                filters.salaryMin
                  ? "bg-[var(--chartreuse)]/20 text-[var(--chartreuse)] border border-[var(--chartreuse)]/40"
                  : "bg-white/[0.03] text-[var(--paper-dim)] hover:text-white hover:bg-white/[0.06] border border-transparent"
              )}
            >
              <DollarSign className="h-3 w-3" />
              <span>$120k+ USD</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tech tags bar */}
      <div className="pt-2 border-t border-white/[0.04] flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-[var(--paper-dim)] font-mono mr-1">Skills:</span>
        {POPULAR_TECH_TAGS.map((tag) => {
          const active = filters.techTags?.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTechTag(tag)}
              className={cn(
                "px-2 py-0.5 rounded-md text-[10px] font-mono transition-all",
                active
                  ? "bg-[var(--chartreuse)] text-black font-semibold"
                  : "bg-white/[0.04] text-[var(--paper-dim)] hover:text-white hover:bg-white/[0.08]"
              )}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CrawlerFacetedFilters;
