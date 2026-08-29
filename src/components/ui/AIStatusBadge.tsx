"use client";

import { Sparkles, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { AISourceType } from "@/types";

export interface AIStatusBadgeProps {
  source?: AISourceType;
  provider?: string;
  model?: string;
  timestamp?: string;
  size?: "sm" | "md";
  className?: string;
}

export default function AIStatusBadge({
  source = "heuristic_fallback",
  provider,
  model,
  timestamp,
  size = "md",
  className,
}: AIStatusBadgeProps) {
  const isLive = source === "live_llm";

  const formattedDate = timestamp
    ? new Date(timestamp).toLocaleDateString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-mono transition-all select-none",
        size === "sm" ? "px-2.5 py-0.5 text-[10px]" : "px-3 py-1 text-xs",
        isLive
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
          : "border-amber-500/30 bg-amber-500/10 text-amber-300",
        className
      )}
      title={
        isLive
          ? `Generated with live LLM (${provider ? `${provider}/` : ""}${model || "configured model"})${
              formattedDate ? ` at ${formattedDate}` : ""
            }`
          : "Calculated with local deterministic rules, not an LLM. Configure an AI provider in Settings and re-run to generate a live-AI result."
      }
    >
      {isLive ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <Sparkles className="h-3 w-3 text-emerald-400" />
          <span className="font-semibold tracking-wide">
            Live AI{model ? ` · ${model.split("/").pop()}` : ""}
          </span>
        </>
      ) : (
        <>
          <Cpu className="h-3 w-3 text-amber-400" />
          <span className="font-semibold tracking-wide">Deterministic rules</span>
          <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[9px] font-bold uppercase text-amber-200">
            Local
          </span>
        </>
      )}
    </div>
  );
}
