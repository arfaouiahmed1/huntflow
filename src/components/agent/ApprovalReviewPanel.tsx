"use client";

import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Send, ShieldAlert } from "lucide-react";
import { getApprovalDecision } from "@/lib/agents/approvalDecision";
import { Button } from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import PitchDiffEditor from "@/components/agent/PitchDiffEditor";

interface ApprovalReviewPanelProps {
  header: string;
  description?: string;
  stateLabel: string;
  acknowledgement: string;
  approveLabel: string;
  manualLabel: string;
  reviewPitch: string;
  onReviewPitchChange: (value: string) => void;
  submitAcknowledged: boolean;
  onSubmitAcknowledgedChange: (value: boolean) => void;
  isResuming: boolean;
  hasReviewThread: boolean;
  onApproveAndSubmit: () => void;
  onKeepPrefilled: () => void;
  onSkip: () => void;
  pitchActions?: ReactNode;
  textareaRows?: number;
  jobDescription?: string;
  customInstruction?: string;
  onCustomInstructionChange?: (instruction: string) => void;
}

export default function ApprovalReviewPanel({
  header,
  description,
  stateLabel,
  acknowledgement,
  approveLabel,
  manualLabel,
  reviewPitch,
  onReviewPitchChange,
  submitAcknowledged,
  onSubmitAcknowledgedChange,
  isResuming,
  hasReviewThread,
  onApproveAndSubmit,
  onKeepPrefilled,
  onSkip,
  pitchActions,
  textareaRows = 3,
  jobDescription,
  customInstruction,
  onCustomInstructionChange,
}: ApprovalReviewPanelProps) {
  void textareaRows;
  const decision = getApprovalDecision({
    hasReviewThread,
    submitAcknowledged,
    isResuming,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3 rounded-xl border-2 border-[var(--amber)]/50 bg-[var(--amber)]/10 p-4"
    >
      <div className="flex items-center justify-between border-b border-[var(--amber)]/20 pb-2.5">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold text-[var(--paper)]">
            <ShieldAlert className="h-4 w-4 text-[var(--amber)]" /> {header}
          </p>
          {description && <p className="mt-1 text-[10px] text-dim">{description}</p>}
        </div>
        <span className="rounded-full bg-[var(--amber)]/20 px-2 py-0.5 font-mono text-[9px] font-bold text-[var(--amber)]">
          {stateLabel}
        </span>
      </div>

      <div className="space-y-2">
        <PitchDiffEditor
          currentPitch={reviewPitch}
          onChange={onReviewPitchChange}
          jobDescription={jobDescription}
          customInstruction={customInstruction}
          onCustomInstructionChange={onCustomInstructionChange}
        />
        {pitchActions && <div className="flex flex-wrap gap-1.5 pt-1">{pitchActions}</div>}
      </div>

      <Checkbox
        checked={submitAcknowledged}
        onChange={onSubmitAcknowledgedChange}
        className="items-start text-[11px] leading-relaxed text-dim [&_span]:!text-dim"
        boxClassName="mt-0.5"
      >
        <span className="text-[11px] leading-relaxed text-dim">{acknowledgement}</span>
      </Checkbox>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={isResuming} disabled={!decision.canApproveAndSubmit} onClick={onApproveAndSubmit}>
          <Send className="h-3.5 w-3.5" /> {approveLabel}
        </Button>
        <Button size="sm" variant="outline" loading={isResuming} disabled={!decision.canKeepPrefilled} onClick={onKeepPrefilled}>
          <ExternalLink className="h-3.5 w-3.5" /> {manualLabel}
        </Button>
        <button
          type="button"
          disabled={isResuming}
          onClick={onSkip}
          className="ml-auto px-2 text-[11px] text-dim hover:text-[var(--coral)]"
        >
          Skip application
        </button>
      </div>
    </motion.div>
  );
}
