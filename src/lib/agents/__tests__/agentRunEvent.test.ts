import { describe, expect, it } from "vitest";
import { failureReasonFromLogs } from "@/lib/agents/agentRunEvent";

describe("failureReasonFromLogs", () => {
  it("keeps the failed node's readable reason for the visible step state", () => {
    expect(
      failureReasonFromLogs([
        { type: "info", message: "Started" },
        { type: "error", message: "The posting rejected the prefill request." },
      ])
    ).toBe("The posting rejected the prefill request.");
  });
});
