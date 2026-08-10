"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MessagesSquare, Sparkles, RefreshCw, ChevronDown, Lightbulb, Target, Plus } from "lucide-react";
import { JobApplication, InterviewQuestion } from "@/types";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { toErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const catColor: Record<InterviewQuestion["category"], string> = {
  technical: "var(--sky)",
  behavioral: "var(--violet)",
  culture: "var(--amber)",
};

const diffColor: Record<InterviewQuestion["difficulty"], string> = {
  easy: "text-[var(--chartreuse)]",
  medium: "text-[var(--amber)]",
  hard: "text-[var(--coral)]",
};

/** How many questions are revealed at once; the rest stay hidden behind "Load more". */
const PAGE_SIZE = 4;

export default function InterviewQuestionsPanel({ job }: { job: JobApplication }) {
  const { generateInterviewQuestions } = useApp();
  const { error: errToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [revealCount, setRevealCount] = useState(PAGE_SIZE);

  const questions = job.interviewQuestions || [];
  const visible = questions.slice(0, revealCount);
  const hidden = questions.length - visible.length;

  const run = async () => {
    setLoading(true);
    try {
      await generateInterviewQuestions(job.id);
      setRevealCount(PAGE_SIZE);
      setOpenId(null);
    } catch (e) {
      errToast(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  if (questions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--line)] p-8 text-center">
        <MessagesSquare className="mx-auto mb-3 h-8 w-8 text-[var(--violet)]" />
        <h3 className="font-display text-sm font-semibold">Mock Interview Questions</h3>
        <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-dim">
          Technical deep-dives, behavioral STARs, and culture-fit questions you&apos;ll likely face.
        </p>
        <Button onClick={run} loading={loading} className="mt-5">
          <Sparkles className="h-4 w-4" /> {loading ? "Designing…" : "Generate Questions"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">
          {questions.length} questions · 3 technical · 2 behavioral · 1 culture
        </p>
        <Button variant="ghost" size="sm" onClick={run} loading={loading}>
          <RefreshCw className="h-3.5 w-3.5" /> Regenerate
        </Button>
      </div>

      {visible.map((q, i) => (
        <motion.div
          key={q.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70"
        >
          <button
            onClick={() => setOpenId(openId === q.id ? null : q.id)}
            className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-white/[0.02]"
          >
            <span
              className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg font-mono text-[10px] font-bold"
              style={{ background: `${catColor[q.category]}1a`, color: catColor[q.category] }}
            >
              {q.category === "technical" ? "T" : q.category === "behavioral" ? "B" : "C"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug text-[var(--paper)]">{q.question}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className={cn("text-[10px] font-bold uppercase", diffColor[q.difficulty])}>{q.difficulty}</span>
                <span className="text-[10px] capitalize text-dim">{q.category}</span>
              </div>
            </div>
            <ChevronDown
              className={cn("mt-1 h-4 w-4 shrink-0 text-dim transition-transform", openId === q.id && "rotate-180")}
            />
          </button>

          {openId === q.id && (
            <div className="space-y-3 border-t border-[var(--line)] px-4 py-4">
              <div className="flex gap-2.5">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[var(--amber)]" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-dim">Prep Tip</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--paper)]/85">{q.hint}</p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-[var(--chartreuse)]" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-dim">Strong Answer Covers</p>
                  <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-[var(--paper)]/85">{q.idealAnswer}</p>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      ))}

      {hidden > 0 && (
        <button
          onClick={() => setRevealCount((c) => c + PAGE_SIZE)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--line)] py-3 text-xs font-semibold text-dim transition-colors hover:border-[var(--chartreuse)]/40 hover:text-[var(--paper)]"
        >
          <Plus className="h-4 w-4" /> Load {Math.min(hidden, PAGE_SIZE)} more question
          {Math.min(hidden, PAGE_SIZE) === 1 ? "" : "s"} ({hidden} hidden)
        </button>
      )}
    </div>
  );
}
