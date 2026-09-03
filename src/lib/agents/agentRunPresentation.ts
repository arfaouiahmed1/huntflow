export type AgentOutcomeTone = "success" | "warning" | "error" | "neutral";
export type AgentOutcomeIcon = "check" | "alert" | "info";

export interface AgentOutcomePresentation {
  tone: AgentOutcomeTone;
  icon: AgentOutcomeIcon;
}

/** Maps terminal agent outcomes to UI semantics without treating idle as failure. */
export function agentOutcomePresentation(status: string | null | undefined): AgentOutcomePresentation {
  if (status === "applied") return { tone: "success", icon: "check" };
  if (status === "manual_required") return { tone: "warning", icon: "alert" };
  if (status === "idle" || !status) return { tone: "neutral", icon: "info" };
  return { tone: "error", icon: "alert" };
}
