"use client";

import { useState } from "react";
import { Building2, Check, ExternalLink, Loader2, Play, Search, Sparkles, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";

interface CompanyDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIngestCompany: (companyToken: string, provider: string, companyName: string) => Promise<void>;
}

interface DiscoveryResult {
  ok: boolean;
  provider: string;
  boardToken: string;
  activeJobsCount: number;
  sampleJobs?: Array<{ title: string; company: string; location?: string }>;
}

export default function CompanyDiscoveryModal({
  isOpen,
  onClose,
  onIngestCompany,
}: CompanyDiscoveryModalProps) {
  const { success, error: errToast } = useToast();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [result, setResult] = useState<DiscoveryResult | null>(null);

  if (!isOpen) return null;

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/crawl/sources/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setResult(data);
      } else {
        errToast(data.error || "Could not detect active ATS board for this company.");
      }
    } catch (err) {
      errToast(err instanceof Error ? err.message : "Discovery request failed");
    } finally {
      setLoading(false);
    }
  };

  const handleIngest = async () => {
    if (!result) return;
    setIngesting(true);
    try {
      await onIngestCompany(result.boardToken, result.provider, query.trim());
      success(`Ingested ${result.activeJobsCount} active roles from ${result.provider.toUpperCase()}!`);
      onClose();
    } catch (err) {
      errToast(err instanceof Error ? err.message : "Failed to ingest company roles");
    } finally {
      setIngesting(false);
    }
  };

  const QUICK_COMPANIES = ["Anthropic", "Stripe", "Supabase", "Linear", "Datadog", "Vercel", "Figma", "OpenAI", "Mistral"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl border border-[var(--line)] bg-[var(--ink-card)] p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-start justify-between border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-400">
              <Zap className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display text-base font-bold text-[var(--paper)]">
                Discover &amp; Ingest Target Company ATS Board
              </h3>
              <p className="text-xs text-dim">
                Enter any tech company or career page URL to detect its live Greenhouse, Lever, or Ashby feed.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-dim hover:bg-white/5 hover:text-[var(--paper)] cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="e.g. 'Anthropic', 'Linear', 'https://boards.greenhouse.io/stripe'..."
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-line bg-white/[0.03] text-xs text-paper outline-none placeholder:text-dim/70 focus:border-sky-500/50"
              />
            </div>
            <Button onClick={handleSearch} loading={loading} disabled={!query.trim()} className="h-11 px-5">
              Discover
            </Button>
          </div>

          {/* Quick company pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-dim">Quick Presets:</span>
            {QUICK_COMPANIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setQuery(c);
                  setTimeout(handleSearch, 50);
                }}
                className="rounded-full border border-[var(--line)] bg-white/[0.02] px-2.5 py-0.5 text-[11px] text-dim hover:border-sky-500/40 hover:text-sky-300 transition-colors cursor-pointer"
              >
                {c}
              </button>
            ))}
          </div>

          {/* Result Card */}
          {result && (
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.04] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-sky-500/20 px-2.5 py-1 font-mono text-[10px] font-bold text-sky-400 uppercase">
                    {result.provider} ATS
                  </span>
                  <span className="font-bold text-sm text-[var(--paper)]">Board: {result.boardToken}</span>
                </div>
                <span className="font-mono text-xs font-semibold text-[var(--chartreuse)]">
                  {result.activeJobsCount} Active Roles Found
                </span>
              </div>

              {result.sampleJobs && result.sampleJobs.length > 0 && (
                <div className="space-y-1.5 border-t border-sky-500/20 pt-3 text-xs">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dim">Sample Roles:</p>
                  {result.sampleJobs.map((j, i) => (
                    <div key={i} className="flex items-center justify-between text-dim">
                      <span className="text-[var(--paper)] font-medium truncate">{j.title}</span>
                      <span className="text-[10px] shrink-0 font-mono">{j.location || "Remote"}</span>
                    </div>
                  ))}
                </div>
              )}

              <Button
                onClick={handleIngest}
                loading={ingesting}
                disabled={result.activeJobsCount === 0}
                className="w-full gap-2 shadow-[0_4px_20px_rgba(56,189,248,0.25)]"
              >
                <Zap className="h-4 w-4" /> Ingest All {result.activeJobsCount} Role(s) Now
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
