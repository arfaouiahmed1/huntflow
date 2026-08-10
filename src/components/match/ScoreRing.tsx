"use client";

import { motion } from "framer-motion";
import { palette, tint } from "@/lib/theme";

export default function ScoreRing({ score }: { score: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = score >= 85 ? palette.chartreuse : score >= 70 ? palette.amber : palette.coral;

  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 110 110" className="h-32 w-32 -rotate-90">
        <circle cx="55" cy="55" r={r} fill="none" stroke={tint(palette.paper, 0.06)} strokeWidth="9" />
        <motion.circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="font-mono text-3xl font-bold tabular-nums" style={{ color }}>
            {score}
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-dim">match</p>
        </div>
      </div>
    </div>
  );
}
