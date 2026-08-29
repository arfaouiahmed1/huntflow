export interface ApprovalDecisionInput {
  hasReviewThread: boolean;
  submitAcknowledged: boolean;
  isResuming: boolean;
}

export interface ApprovalDecision {
  canApproveAndSubmit: boolean;
  canKeepPrefilled: boolean;
  blockingReason: "missing_review_thread" | "acknowledgment_required" | null;
}

export function getApprovalDecision({
  hasReviewThread,
  submitAcknowledged,
  isResuming,
}: ApprovalDecisionInput): ApprovalDecision {
  if (!hasReviewThread) {
    return {
      canApproveAndSubmit: false,
      canKeepPrefilled: false,
      blockingReason: "missing_review_thread",
    };
  }

  if (isResuming || !submitAcknowledged) {
    return {
      canApproveAndSubmit: false,
      canKeepPrefilled: !isResuming,
      blockingReason: submitAcknowledged ? null : "acknowledgment_required",
    };
  }

  return {
    canApproveAndSubmit: true,
    canKeepPrefilled: true,
    blockingReason: null,
  };
}
