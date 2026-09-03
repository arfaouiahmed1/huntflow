"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from "react";
import { Layers, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { ResumeVariant } from "@/lib/db";
import { cn } from "@/lib/utils";

interface VariantFunnelStat {
  variantId: string;
  name: string;
  archetype: string;
  tag: string;
  templateId: string;
  totalApplications: number;
  screeningCount: number;
  offerCount: number;
  conversionRate: number;
}

interface ResumeVariantsManagerProps {
  onSelectVariant?: (variant: ResumeVariant) => void;
  className?: string;
}

export default function ResumeVariantsManager({
  onSelectVariant,
  className,
}: ResumeVariantsManagerProps) {
  const { success, error } = useToast();
  const [variants, setVariants] = useState<ResumeVariant[]>([]);
  const [funnel, setFunnel] = useState<VariantFunnelStat[]>([]);

  const loadVariants = async () => {
    try {
      const res = await fetch("/api/resume/variants");
      if (res.ok) {
        const data = await res.json();
        setVariants(data.variants || []);
        setFunnel(data.funnelAnalytics || []);
      }
    } catch {
      // safe fallback
    }
  };

  useEffect(() => {
    void loadVariants();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/resume/variants?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) {
        setVariants((prev) => prev.filter((v) => v.id !== id));
        success(`Removed variant "${name}".`);
      }
    } catch (err) {
      error(err instanceof Error ? err.message : "Failed to delete variant");
    }
  };

  return (
    <div className={cn("space-y-6 rounded-[1.5rem] border border-[var(--line)] bg-[var(--ink-card)]/60 p-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div>
          <h4 className="font-display text-sm font-semibold text-[var(--paper)]">
            Resume Variant Portfolio &amp; Conversion Funnels
          </h4>
          <p className="text-xs text-dim">
            Track performance &amp; callback win-rates across different career archetypes.
          </p>
        </div>
        <span className="rounded-full border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 px-3 py-1 font-mono text-[11px] font-bold text-[var(--chartreuse)]">
          {variants.length} Master Archetypes
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {variants.map((v) => {
          const stat = funnel.find((f) => f.variantId === v.id);
          return (
            <div key={v.id} className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-5 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--chartreuse)]">
                      {v.archetype}
                    </span>
                    <h5 className="text-sm font-bold text-[var(--paper)] mt-0.5">{v.name}</h5>
                  </div>
                  <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] font-mono text-dim">
                    {v.templateId}
                  </span>
                </div>

                <p className="mt-2 text-xs text-dim line-clamp-2">
                  {v.content?.summary || "No summary provided"}
                </p>
              </div>

              <div className="space-y-3 pt-2 border-t border-[var(--line)]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-dim">Screening Win-Rate:</span>
                  <span className="font-display font-bold text-[var(--chartreuse)]">
                    {stat?.conversionRate ?? 0}% ({stat?.screeningCount ?? 0}/{stat?.totalApplications ?? 0})
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSelectVariant?.(v)}
                    className="flex-1 text-xs"
                  >
                    <Layers className="h-3.5 w-3.5" /> Load into Editor
                  </Button>
                  <button
                    onClick={() => handleDelete(v.id, v.name)}
                    className="rounded-lg p-2 text-dim hover:bg-[var(--coral)]/10 hover:text-[var(--coral)] transition-colors cursor-pointer"
                    title="Delete variant"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
