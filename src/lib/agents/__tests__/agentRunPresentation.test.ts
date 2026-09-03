import { describe, expect, it } from "vitest";
import { agentOutcomePresentation } from "@/lib/agents/agentRunPresentation";

describe("agentOutcomePresentation", () => {
  it("treats an idle run as neutral rather than an error", () => {
    expect(agentOutcomePresentation("idle")).toEqual({
      tone: "neutral",
      icon: "info",
    });
  });

  it("keeps a failed run error-toned", () => {
    expect(agentOutcomePresentation("failed")).toEqual({
      tone: "error",
      icon: "alert",
    });
  });
});
