"use client";

import { AlertTriangle, CheckCircle2, Loader2, Play, XCircle } from "lucide-react";
import { JobApplication } from "@/types";
import { Button } from "@/components/ui/Button";
import { RegionCode } from "@/lib/agents/regionalNorms";
import AgentPlannerCard, { AGENT_STEPS } from "@/components/agent/AgentPlannerCard";
import ApprovalReviewPanel from "@/components/agent/ApprovalReviewPanel";
import AgentRawLogPanel from "@/components/agent/AgentRawLogPanel";
import AgentReasoningTimeline from "@/components/agent/AgentReasoningTimeline";
import { type AgentRunOutcome, useAgentRunController } from "@/components/agent/useAgentRunController";
import { cn } from "@/lib/utils";

export type { AgentRunOutcome } from "@/components/agent/useAgentRunController";

interface AgentRunMonitorProps {
  job: JobApplication;
  submit: boolean;
  region: RegionCode;
  onFinished?: (outcome: AgentRunOutcome) => void;
}

export default function AgentRunMonitor({ job, submit, region, onFinished }: AgentRunMonitorProps) {
  const controller = useAgentRunController({ job, submit, region, onFinished });
  const pausedForReview = !controller.running && controller.terminalStatus === "manual_required";
  const doneCount = AGENT_STEPS.filter((step) => (controller.stepStatuses[step.id] ?? "queued") === "done").length;
  const failed = controller.terminalStatus === "failed";

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "grid h-9 w-9 place-items-center rounded-xl border",
              controller.running
                ? "border-[var(--chartreuse)]/50 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                : failed
                  ? "border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)]"
                  : controller.terminalStatus === "applied"
                    ? "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                    : "border-[var(--line)] bg-white/[0.03] text-dim"
            )}
          >
            {controller.running ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
            ) : controller.terminalStatus === "applied" ? (
              <CheckCircle2 className="h-4.5 w-4.5" />
            ) : failed ? (
              <XCircle className="h-4.5 w-4.5" />
            ) : (
              <Play className="h-4.5 w-4.5" />
            )}
          </span>
          <div>
            <p className="text-sm font-bold text-[var(--paper)]">Run view — {job.title}</p>
            <p className="text-[11px] text-dim">
              {controller.running
                ? `${doneCount}/${AGENT_STEPS.length} steps done · live`
                : controller.terminalStatus
                  ? `Last outcome: ${controller.terminalStatus.replace(/_/g, " ")}`
                  : "Idle — launch the supervised pipeline below."}
            </p>
          </div>
        </div>
        <Button onClick={controller.runPipeline} loading={controller.running} disabled={controller.running}>
          <Play className="h-4 w-4" /> Run supervised pipeline
        </Button>
      </div>

      <AgentReasoningTimeline entries={controller.reasoning} running={controller.running} />
      <AgentPlannerCard stepStatuses={controller.stepStatuses} stepReasons={controller.stepReasons} />

      {!controller.running && controller.terminalStatus && (
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-xs font-semibold",
            controller.terminalStatus === "applied"
              ? "border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/[0.07] text-[var(--chartreuse)]"
              : controller.terminalStatus === "manual_required"
                ? "border-[var(--amber)]/30 bg-[var(--amber)]/[0.07] text-[var(--amber)]"
                : "border-[var(--coral)]/30 bg-[var(--coral)]/[0.07] text-[var(--coral)]"
          )}
        >
          {controller.terminalStatus === "applied" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          Outcome: {controller.terminalStatus.replace(/_/g, " ")}
        </div>
      )}

      {pausedForReview && (
        <ApprovalReviewPanel
          header="Human review gate — the agent is paused"
          stateLabel="Awaiting you"
          acknowledgement="I reviewed the field plan and understand the next action may submit this application."
          approveLabel="Approve & submit"
          manualLabel="Keep prefilled"
          reviewPitch={controller.reviewPitch}
          onReviewPitchChange={controller.setReviewPitch}
          submitAcknowledged={controller.submitAcknowledged}
          onSubmitAcknowledgedChange={controller.setSubmitAcknowledged}
          isResuming={controller.resuming}
          hasReviewThread={Boolean(controller.threadId)}
          onApproveAndSubmit={() => controller.resumePipeline(true, true)}
          onKeepPrefilled={() => controller.resumePipeline(true, false)}
          onSkip={() => controller.resumePipeline(false, false)}
        />
      )}

      <AgentRawLogPanel logs={controller.logs} running={controller.running} />
    </section>
  );
}
