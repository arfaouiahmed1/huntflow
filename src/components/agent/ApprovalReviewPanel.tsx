"use client";

import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { Edit3, ExternalLink, Send, ShieldAlert } from "lucide-react";
import { getApprovalDecision } from "@/lib/agents/approvalDecision";
import { Button } from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";

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
}: ApprovalReviewPanelProps) {
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
        <label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-dim">
          <Edit3 className="h-3 w-3 text-[var(--chartreuse)]" /> Tailored cover letter / pitch
        </label>
        <textarea
          rows={textareaRows}
          value={reviewPitch}
          onChange={(event) => onReviewPitchChange(event.target.value)}
          className="w-full resize-none rounded-lg border border-[var(--line)] bg-black/40 p-2.5 text-xs leading-relaxed text-[var(--paper)] outline-none focus:border-[var(--chartreuse)]"
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
