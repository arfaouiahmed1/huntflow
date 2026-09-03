"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Sparkles, Check, Plus, Target, TrendingUp } from "lucide-react";
import { JobApplication } from "@/types";
import { Button } from "@/components/ui/Button";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/ui/Toaster";
import ScoreRing from "@/components/match/ScoreRing";
import AIStatusBadge from "@/components/ui/AIStatusBadge";

function uniqueText(values: string[] | undefined): string[] {
  return Array.from(
    new Set((values || []).map((value) => value.trim()).filter(Boolean)),
  );
}

export default function MatchAnalysis({ job }: { job: JobApplication }) {
  const { generateMatchAnalysis } = useApp();
  const { error } = useToast();
  const [loading, setLoading] = useState(false);

  const analysis = job.skillsGap;
  const matchingSkills = uniqueText(analysis?.matchingSkills);
  const missingSkills = uniqueText(analysis?.missingSkills);
  const keyTermFrequency = useMemo(() => {
    const merged = new Map<string, { term: string; count: number; inResume: boolean }>();
    for (const k of analysis?.keyTermFrequency ?? []) {
      const term = typeof k?.term === "string" ? k.term.trim() : "";
      if (!term) continue;
      const existing = merged.get(term);
      if (existing) {
        existing.count += Number(k.count) || 0;
        existing.inResume = existing.inResume || Boolean(k.inResume);
      } else {
        merged.set(term, { term, count: Number(k.count) || 0, inResume: Boolean(k.inResume) });
      }
    }
    return Array.from(merged.values());
  }, [analysis]);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      await generateMatchAnalysis(job.id);
    } catch (e) {
      error(e instanceof Error ? e.message : "Match analysis failed — check your AI Engine settings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {!analysis ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] p-8 text-center">
          <Target className="mx-auto mb-3 h-8 w-8 text-[var(--chartreuse)]" />
          <h3 className="font-display text-sm font-semibold">Match Score & Skills Gap</h3>
          <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-dim">
            Run the AI engine to score how well your profile fits this role and surface missing skills.
          </p>
          <Button onClick={runAnalysis} loading={loading} className="mt-5">
            <Sparkles className="h-4 w-4" /> {loading ? "Analyzing…" : "Run Match Analysis"}
          </Button>
        </div>
      ) : (
        <>
          {/* Header Provenance & Re-run */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
            <AIStatusBadge
              source={analysis.source}
              provider={analysis.provider}
              model={analysis.model}
              timestamp={analysis.analyzedAt}
            />
            <Button variant="outline" size="sm" onClick={runAnalysis} loading={loading}>
              <Sparkles className="h-3.5 w-3.5" /> {loading ? "Analyzing…" : "Re-analyze"}
            </Button>
          </div>

          {/* Score + summary */}
          <div className="grid grid-cols-[auto_1fr] items-center gap-6">
            <ScoreRing score={analysis.matchScore} />
            <div>
              <h3 className="font-display text-sm font-semibold text-[var(--paper)]">Explainable fit</h3>
              <p className="mt-1 text-xs leading-relaxed text-dim">
                The score is measured from structured profile and job evidence. Generated text explains it; it does not determine hard constraints.
              </p>
              {analysis.fit && (
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--paper)]/75">
                  Deterministic fit band: {analysis.fit.replace("_", " ")}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--amber)]/20 bg-[var(--amber)]/[0.035] p-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--amber)]">
              <AlertTriangle className="h-3.5 w-3.5" /> Hard constraints
            </h4>
            {analysis.dealbreakers?.length ? (
              <ul className="space-y-1.5">
                {analysis.dealbreakers.map((constraint) => (
                  <li key={constraint} className="text-xs leading-relaxed text-[var(--paper)]/90">FAIL · {constraint}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs leading-relaxed text-dim">
                No explicit failure was detected. Unknown visa, language, clearance, or location requirements still need confirmation.
              </p>
            )}
          </div>

          {/* Matching skills */}
          <div>
            <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-dim">
              <Check className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> Evidence present
            </h4>
            <div className="flex flex-wrap gap-2">
              {matchingSkills.map((s, i) => (
                <motion.span
                  key={s}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--chartreuse)]/25 bg-[var(--chartreuse)]/10 px-3 py-1 text-xs font-medium text-[var(--chartreuse)]"
                >
                  <Check className="h-3 w-3" /> {s}
                </motion.span>
              ))}
            </div>
          </div>

          {/* Missing skills */}
          <div>
            <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-dim">
              <Plus className="h-3.5 w-3.5 text-[var(--coral)]" /> Missing from current evidence
            </h4>
            <div className="flex flex-wrap gap-2">
              {missingSkills.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--coral)]/25 bg-[var(--coral)]/10 px-3 py-1 text-xs font-medium text-[var(--coral)]"
                >
                  <Plus className="h-3 w-3" /> {s}
                </span>
              ))}
              {missingSkills.length === 0 && (
                <span className="text-xs text-dim">No missing skill term was identified in the current extraction.</span>
              )}
            </div>
          </div>

          {/* Key term frequency */}
          {keyTermFrequency.length > 0 && (
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-dim">
                Keyword Resonance
              </h4>
              <div className="space-y-2.5">
                {keyTermFrequency.map((k) => (
                  <div key={k.term} className="flex items-center gap-3">
                    <span className="w-36 truncate text-xs text-[var(--paper)]">{k.term}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: k.inResume ? "var(--chartreuse)" : "var(--coral)" }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, k.count * 14)}%` }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                      />
                    </div>
                    <span className="w-14 text-right font-mono text-[10px] text-dim">{k.count}x</span>
                    {k.inResume ? (
                      <span className="w-12 text-right text-[10px] font-semibold text-[var(--chartreuse)]">in res</span>
                    ) : (
                      <span className="w-12 text-right text-[10px] font-semibold text-[var(--coral)]">gap</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div>
            <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-dim">
              <TrendingUp className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> Recommended Moves
            </h4>
            <ul className="space-y-2">
              {analysis.recommendations.map((r, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex gap-2.5 rounded-xl border border-[var(--line)] bg-white/[0.02] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--paper)]/90"
                >
                  <span className="font-mono text-[var(--chartreuse)]">{String(i + 1).padStart(2, "0")}</span>
                  {r}
                </motion.li>
              ))}
            </ul>
          </div>

          <Button variant="ghost" size="sm" onClick={runAnalysis} loading={loading}>
            <Sparkles className="h-3.5 w-3.5" /> Re-run Analysis
          </Button>
        </>
      )}
    </div>
  );
}
