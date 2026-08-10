"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { STARCard } from "@/types";
import { cn } from "@/lib/utils";
import { tint } from "@/lib/theme";

const difficultyColors = {
  easy: "text-[var(--chartreuse)]",
  medium: "text-[var(--amber)]",
  hard: "text-[var(--coral)]",
};

export default function Flashcard({ card, study }: { card: STARCard; study?: boolean }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className="h-[340px] cursor-pointer [perspective:1200px]"
      onClick={() => setFlipped((f) => !f)}
    >
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Front */}
        <div className="absolute inset-0 flex flex-col justify-between overflow-hidden rounded-2xl border border-[var(--line)] bg-gradient-to-br from-[var(--ink-card)] to-[var(--ink)] p-6 [backface-visibility:hidden]">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">
              {study ? "STAR · Flip to reveal" : "Question"}
            </span>
            <span className={cn("font-mono text-[10px] font-bold uppercase", difficultyColors[card.difficulty || "medium"])}>
              {card.difficulty}
            </span>
          </div>
          <div>
            <p className="font-display text-lg font-medium leading-snug text-[var(--paper)]">
              {card.question}
            </p>
            <p className="mt-4 font-mono text-[11px] text-dim">
              {card.status === "mastered" ? "✓ mastered" : card.status === "learning" ? "◌ learning" : "· unstudied"}
            </p>
          </div>
        </div>

        {/* Back */}
        <div className="absolute inset-0 overflow-y-auto rounded-2xl border border-[var(--chartreuse)]/30 bg-ink-leaf p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <div className="space-y-4">
            {(
              [
                ["S", "Situation", card.situation, "var(--sky)"],
                ["T", "Task", card.task, "var(--violet)"],
                ["A", "Action", card.action, "var(--chartreuse)"],
                ["R", "Result", card.result, "var(--amber)"],
              ] as const
            ).map(([letter, label, text, color]) => (
              <div key={label}>
                <p className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color }}>
                  <span
                    className="grid h-5 w-5 place-items-center rounded font-mono text-[9px]"
                    style={{ background: tint(color, 0.1), color }}
                  >
                    {letter}
                  </span>
                  {label}
                </p>
                <p className="text-xs leading-relaxed text-[var(--paper)]/90">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
