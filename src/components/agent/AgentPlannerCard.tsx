"use client";

import { motion } from "framer-motion";
import {
  Search,
  Scale,
  ShieldCheck,
  FileSignature,
  Mail,
  Radar,
  DollarSign,
  Send,
  BadgeCheck,
  MousePointerClick,
  Sparkles,
  CheckCircle2,
  Loader2,
  Clock,
  AlertTriangle,
  XCircle,
  Building2,
  Globe2,
  Code2,
} from "lucide-react";
import { CompanyResearch } from "@/types";
import { cn } from "@/lib/utils";

export type AgentStepStatus = "queued" | "running" | "done" | "warn" | "fail";

export interface CompanyInvestigation {
  company: string;
  stage?: string;
  summary?: string;
  atsType?: string;
  salaryEstimate?: string;
  techStack?: string[];
  research?: CompanyResearch;
}

export const AGENT_STEPS: { id: string; label: string; icon: typeof Search }[] = [
  { id: "companyIntel", label: "Company Intel", icon: Search },
  { id: "regionalNorms", label: "Regional Norms", icon: Scale },
  { id: "piiSanitizer", label: "PII Guard", icon: ShieldCheck },
  { id: "resumeCVTailor", label: "Resume / CV Tailor", icon: FileSignature },
  { id: "letterTailor", label: "Cover Letter", icon: Mail },
  { id: "interviewPrep", label: "Interview Prep", icon: Radar },
  { id: "salaryIntel", label: "Salary Intel", icon: DollarSign },
  { id: "outreachEmail", label: "Outreach", icon: Send },
  { id: "atsAudit", label: "ATS Audit", icon: BadgeCheck },
  { id: "autoApplyExecution", label: "Apply Execution", icon: MousePointerClick },
  { id: "orchestratorGate", label: "Gate", icon: Sparkles },
];

const STATUS_META: Record<
  AgentStepStatus,
  { ring: string; textColor: string; chip: string }
> = {
  queued: {
    ring: "border-[var(--line)] bg-white/[0.02] text-dim",
    textColor: "text-dim",
    chip: "text-dim/40",
  },
  running: {
    ring: "border-[var(--chartreuse)] bg-[var(--chartreuse)]/20 text-[var(--chartreuse)]",
    textColor: "text-[var(--chartreuse)]",
    chip: "text-[var(--chartreuse)] animate-pulse",
  },
  done: {
    ring: "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]",
    textColor: "text-[var(--paper)]",
    chip: "text-dim",
  },
  warn: {
    ring: "border-[var(--amber)]/50 bg-[var(--amber)]/10 text-[var(--amber)]",
    textColor: "text-[var(--amber)]",
    chip: "text-[var(--amber)]",
  },
  fail: {
    ring: "border-[var(--coral)]/50 bg-[var(--coral)]/10 text-[var(--coral)]",
    textColor: "text-[var(--coral)]",
    chip: "text-[var(--coral)]",
  },
};

function StepIcon({ status }: { status: AgentStepStatus }) {
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  if (status === "done") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === "warn") return <AlertTriangle className="h-3.5 w-3.5" />;
  if (status === "fail") return <XCircle className="h-3.5 w-3.5" />;
  return <Clock className="h-3 w-3" />;
}

interface AgentPlannerCardProps {
  investigation?: CompanyInvestigation;
  /** Per-node status keyed by graph node id; missing ids render as queued. */
  stepStatuses?: Record<string, AgentStepStatus>;
  /** Human-readable failure reasons keyed by graph node id. */
  stepReasons?: Record<string, string>;
  /** Compatibility inputs for callers that do not provide explicit graph statuses. */
  currentStepId?: string;
  completedStepIds?: string[];
  interruptedStepId?: string;
  className?: string;
}

function deriveStepStatuses(
  currentStepId?: string,
  completedStepIds?: string[],
  interruptedStepId?: string
): Record<string, AgentStepStatus> {
  const statuses: Record<string, AgentStepStatus> = {};
  for (const id of completedStepIds ?? []) statuses[id] = "done";
  if (interruptedStepId) statuses[interruptedStepId] = "warn";
  if (currentStepId) statuses[currentStepId] = "running";
  return statuses;
}

export default function AgentPlannerCard({
  investigation,
  stepStatuses,
  stepReasons,
  currentStepId,
  completedStepIds,
  interruptedStepId,
  className,
}: AgentPlannerCardProps) {
  const effectiveStatuses = stepStatuses ?? deriveStepStatuses(currentStepId, completedStepIds, interruptedStepId);
  const doneCount = AGENT_STEPS.filter((s) => (effectiveStatuses[s.id] ?? "queued") === "done").length;

  return (
    <div
      className={cn(
        "space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)] p-5 shadow-xl",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="relative grid h-8 w-8 place-items-center rounded-lg border border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10">
            <Sparkles className="h-4 w-4 text-[var(--chartreuse)]" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-[var(--paper)]">Pipeline steps</h3>
            <p className="text-[10px] text-dim">Live status for every supervised agent node</p>
          </div>
        </div>
        <span className="rounded-full border border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 px-2.5 py-0.5 font-mono text-[9px] font-bold text-[var(--chartreuse)]">
          {doneCount}/{AGENT_STEPS.length} done
        </span>
      </div>

      {investigation && (
        <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--ink-card)]/[0.4] p-3.5">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--paper)]">
            <span className="flex items-center gap-1.5 text-[var(--sky)]">
              <Building2 className="h-4 w-4" /> {investigation.company} context
            </span>
            {investigation.stage && (
              <span className="rounded-md bg-[var(--ink-deep)]/[0.06] px-2 py-0.5 font-mono text-[9px] text-dim">
                {investigation.stage}
              </span>
            )}
          </div>

          {investigation.summary && (
            <p className="text-xs leading-relaxed text-dim">{investigation.summary}</p>
          )}

          {investigation.research && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/[0.05] px-2 py-1 font-mono text-[8px] uppercase text-[var(--chartreuse)]">
                {investigation.research.status} · {investigation.research.sources.length} sources
              </span>
              <span className="rounded-full border border-[var(--line)] px-2 py-1 font-mono text-[8px] uppercase text-dim">
                {investigation.research.news.length} recent news
              </span>
              {investigation.research.sources.slice(0, 5).map((source) => (
                <a
                  key={source.id}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-[var(--line)] px-2 py-1 font-mono text-[8px] text-dim transition-colors hover:text-[var(--paper)]"
                >
                  [{source.id}] {source.publisher}
                </a>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            {investigation.atsType && (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--ink-deep)]/[0.05] p-2">
                <Globe2 className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
                <div>
                  <span className="block text-[9px] text-dim">ATS Platform</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--paper)]">
                    {investigation.atsType}
                  </span>
                </div>
              </div>
            )}

            {investigation.salaryEstimate && (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--ink-deep)]/[0.05] p-2">
                <DollarSign className="h-3.5 w-3.5 text-[var(--amber)]" />
                <div>
                  <span className="block text-[9px] text-dim">Local Compensation Benchmark</span>
                  <span className="text-[11px] font-semibold text-[var(--chartreuse)]">
                    {investigation.salaryEstimate}
                  </span>
                </div>
              </div>
            )}
          </div>

          {investigation.techStack && investigation.techStack.length > 0 && (
            <div>
              <span className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-dim">
                <Code2 className="h-3 w-3 text-[var(--sky)]" /> Detected Tech Stack
              </span>
              <div className="flex flex-wrap gap-1">
                {Array.from(new Set(investigation.techStack)).map((tech) => (
                  <span
                    key={tech}
                    className="rounded-md border border-[var(--line)] bg-[var(--ink-deep)]/[0.06] px-2 py-0.5 font-mono text-[9px] text-[var(--paper)]"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ol className="divide-y divide-[var(--line)]/40 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--ink-deep)]/[0.04]">
        {AGENT_STEPS.map((step) => {
          const status = effectiveStatuses[step.id] ?? "queued";
          const meta = STATUS_META[status];
          const reason = stepReasons?.[step.id];

          return (
            <motion.li
              key={step.id}
              initial={false}
              className={cn(
                "flex items-center justify-between gap-3 p-2.5 transition-colors text-xs",
                status === "running" && "bg-[var(--chartreuse)]/[0.07]",
                status === "warn" && "bg-[var(--amber)]/[0.06]",
                status === "fail" && "bg-[var(--coral)]/[0.06]"
              )}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-lg border",
                    meta.ring
                  )}
                >
                  <StepIcon status={status} />
                </span>
                <div className="min-w-0">
                  <span className={cn("block truncate font-semibold", meta.textColor)}>{step.label}</span>
                  {status === "fail" && reason && <span className="block break-words text-[10px] font-normal text-[var(--coral)]/90">{reason}</span>}
                </div>
              </div>
              <span
                className={cn("shrink-0 font-mono text-[9px] font-bold uppercase tracking-wider", meta.chip)}
              >
                {status}
              </span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
