import { describe, expect, it } from "vitest";
import { getApprovalDecision } from "@/lib/agents/approvalDecision";

describe("getApprovalDecision", () => {
  it("blocks external submit without acknowledgement while keeping manual finish available", () => {
    expect(
      getApprovalDecision({ hasReviewThread: true, submitAcknowledged: false, isResuming: false })
    ).toEqual({
      canApproveAndSubmit: false,
      canKeepPrefilled: true,
      blockingReason: "acknowledgment_required",
    });
  });

  it("allows an acknowledged submit only for an active review thread", () => {
    expect(
      getApprovalDecision({ hasReviewThread: true, submitAcknowledged: true, isResuming: false })
    ).toEqual({
      canApproveAndSubmit: true,
      canKeepPrefilled: true,
      blockingReason: null,
    });
    expect(
      getApprovalDecision({ hasReviewThread: false, submitAcknowledged: true, isResuming: false })
    ).toEqual({
      canApproveAndSubmit: false,
      canKeepPrefilled: false,
      blockingReason: "missing_review_thread",
    });
  });
});
