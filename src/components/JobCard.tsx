"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Bot, Clock, ArrowUpRight, Bell, GripVertical, Globe } from "lucide-react";
import { JobApplication } from "@/types";
import { cn, relativeDays, scoreColor } from "@/lib/utils";
import { companyLogoUrl } from "@/lib/companyLogo";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/ui/Toaster";
import StatusSelect from "@/components/ui/StatusSelect";
import { statusConfig } from "@/components/ui/StatusBadge";
import { palette, tint } from "@/lib/theme";

const AVATAR_TONES = [palette.chartreuse, palette.sky, palette.violet, palette.amber, palette.coral];

export default function JobCard({
  job,
  onOpen,
  index,
}: {
  job: JobApplication;
  onOpen: (id: string) => void;
  index: number;
}) {
  const { updateApplication } = useApp();
  const { success } = useToast();
  const [logoFailed, setLogoFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const days = relativeDays(job.appliedDate || job.createdDate);
  const deadline = relativeDays(job.deadline);
  const autoApplied = job.autoApplyStatus === "applied";
  const tone = AVATAR_TONES[(job.company.length + index) % AVATAR_TONES.length];
  const logo = logoFailed ? null : companyLogoUrl(job.company, job.url);

  const today = new Date().toISOString().slice(0, 10);
  const followUpOverdue = Boolean(job.followUpDue && job.followUpDue <= today && job.status !== "offer" && job.status !== "rejected");
  const followUpDays = relativeDays(job.followUpDue);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ delay: index * 0.04, type: "spring", stiffness: 350, damping: 30 }}
      onClick={() => onOpen(job.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(job.id);
        }
      }}
      role="button"
      tabIndex={0}
      whileHover={{ y: -3 }}
      className={cn(
        "group relative w-full cursor-grab rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/80 p-4 text-left transition-colors hover:border-[var(--chartreuse)]/40 hover:shadow-[var(--shadow-float)] active:cursor-grabbing",
        dragging && "opacity-40"
      )}
    >
      <div
        draggable
        onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
          e.dataTransfer.setData("application/job-id", job.id);
          e.dataTransfer.effectAllowed = "move";
          setDragging(true);
        }}
        onDragEnd={() => setDragging(false)}
        onDragOver={(e) => e.preventDefault()}
      >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {logo ? (
            <img
              src={logo}
              alt={`${job.company} logo`}
              onError={() => setLogoFailed(true)}
              className="h-10 w-10 shrink-0 rounded-xl border border-[var(--line)] object-cover"
            />
          ) : (
            <div
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border font-display text-sm font-bold"
              style={{ borderColor: tint(tone, 0.25), background: tint(tone, 0.08), color: tone }}
            >
              {job.company.charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--paper)]">{job.title}</p>
            <p className="truncate text-xs text-dim">{job.company}</p>
          </div>
        </div>
        {typeof job.matchScore === "number" && (
          <span
            className="font-mono text-sm font-bold tabular-nums"
            style={{ color: scoreColor(job.matchScore) }}
          >
            {job.matchScore}%
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 text-[11px] text-dim">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" /> {job.location}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> {days}
        </span>
      </div>

      {job.deadline && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px]">
          <span className={cn("font-mono", (deadline?.startsWith("-") || deadline === "Today") ? "text-[var(--coral)]" : "text-dim")}>
            {deadline && `Deadline: ${deadline}`}
          </span>
        </div>
      )}

      {job.followUpDue && !followUpOverdue && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px]">
          <Bell className="h-3 w-3 text-[var(--amber)]" />
          <span className={cn("font-mono", "text-[var(--amber)]")}>
            {followUpDays && `Follow-up ${followUpDays}`}
          </span>
        </div>
      )}
      {followUpOverdue && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-1.5 py-0.5 text-[10px] font-bold">
          <Bell className="h-3 w-3 text-[var(--coral)]" />
          <span className="font-mono text-[var(--coral)]">Follow-up {followUpDays && followUpDays.startsWith("-") ? `(${followUpDays.slice(1)} late)` : "due"}</span>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <StatusSelect
          status={job.status}
          size="sm"
          onChange={(s) => {
            updateApplication(job.id, { status: s });
            success(`Moved to ${statusConfig[s].label}.`);
          }}
        />
        <div className="flex items-center gap-2">
          {autoApplied && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--chartreuse)]">
              <Bot className="h-3 w-3" /> AUTO
            </span>
          )}
          <GripVertical className="h-3.5 w-3.5 text-dim/40" />
          <ArrowUpRight className="h-3.5 w-3.5 -translate-x-1 text-dim opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-hover:text-[var(--chartreuse)]" />
        </div>
      </div>
      </div>
    </motion.div>
  );
}
