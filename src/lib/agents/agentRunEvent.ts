export interface AgentRunLogLike {
  type?: unknown;
  message?: unknown;
}

export function failureReasonFromLogs(logs: unknown): string | undefined {
  if (!Array.isArray(logs)) return undefined;
  const failedLog = logs.find(
    (entry): entry is AgentRunLogLike =>
      typeof entry === "object" && entry !== null && (entry as AgentRunLogLike).type === "error"
  );
  return typeof failedLog?.message === "string" && failedLog.message.trim() ? failedLog.message : undefined;
}
