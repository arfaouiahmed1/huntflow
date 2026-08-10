"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Layers, Sparkles, RotateCcw, Check, RefreshCw, ArrowLeft, ArrowRight } from "lucide-react";
import { JobApplication, STARCard } from "@/types";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import Flashcard from "@/components/flashcards/Flashcard";
import { cn } from "@/lib/utils";

export default function FlashcardsPanel({ job }: { job: JobApplication }) {
  const { generateSTARCards, updateCardStatus } = useApp();
  const { error } = useToast();
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"browse" | "study">("browse");

  const cards: STARCard[] = job.starFlashcards || [];
  const current = cards[index];

  const run = async () => {
    setLoading(true);
    try {
      await generateSTARCards(job.id);
      setIndex(0);
    } catch (e) {
      error(e instanceof Error ? e.message : "Card generation failed — check your AI Engine settings.");
    } finally {
      setLoading(false);
    }
  };

  const mark = (status: "learning" | "mastered") => {
    if (!current) return;
    updateCardStatus(job.id, current.id, status);
  };

  const progress = cards.filter((c) => c.status === "mastered").length;

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--line)] p-8 text-center">
        <Layers className="mx-auto mb-3 h-8 w-8 text-[var(--chartreuse)]" />
        <h3 className="font-display text-sm font-semibold">STAR Interview Flashcards</h3>
        <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-dim">
          Generate Situation-Task-Action-Result cards from this job description, then study them like a pro.
        </p>
        <Button onClick={run} loading={loading} className="mt-5">
          <Sparkles className="h-4 w-4" /> {loading ? "Generating…" : "Generate Flashcards"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setMode("browse")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              mode === "browse" ? "bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]" : "text-dim hover:text-[var(--paper)]"
            )}
          >
            Browse
          </button>
          <button
            onClick={() => setMode("study")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              mode === "study" ? "bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]" : "text-dim hover:text-[var(--paper)]"
            )}
          >
            Study Mode
          </button>
        </div>
        <Button variant="ghost" size="sm" onClick={run} loading={loading}>
          <RefreshCw className="h-3.5 w-3.5" /> Regenerate
        </Button>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
          <motion.div
            className="h-full rounded-full bg-[var(--chartreuse)]"
            animate={{ width: `${(progress / cards.length) * 100}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 30 }}
          />
        </div>
        <span className="font-mono text-[10px] text-dim">
          {progress}/{cards.length} mastered
        </span>
      </div>

      {/* Card */}
      <Flashcard key={current.id} card={current} study={mode === "study"} />

      {/* Controls */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--line)] text-dim transition-colors hover:border-[var(--chartreuse)]/40 hover:text-[var(--chartreuse)] disabled:pointer-events-none disabled:opacity-30"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {mode === "study" && (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => mark("learning")}
              className={cn(current?.status === "learning" && "text-[var(--amber)]")}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Still learning
            </Button>
            <Button
              size="sm"
              onClick={() => mark("mastered")}
              className={cn(current?.status === "mastered" && "opacity-60")}
            >
              <Check className="h-3.5 w-3.5" /> Mastered
            </Button>
          </div>
        )}

        <button
          onClick={() => setIndex((i) => Math.min(cards.length - 1, i + 1))}
          disabled={index === cards.length - 1}
          className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--line)] text-dim transition-colors hover:border-[var(--chartreuse)]/40 hover:text-[var(--chartreuse)] disabled:pointer-events-none disabled:opacity-30"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <p className="text-center font-mono text-[10px] text-dim">
        card {index + 1} / {cards.length}
      </p>
    </div>
  );
}
