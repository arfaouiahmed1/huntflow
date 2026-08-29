"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { JobApplication } from "@/types";
import { useToast } from "@/components/ui/Toaster";
import { RegionCode } from "@/lib/agents/regionalNorms";
import { getApprovalDecision } from "@/lib/agents/approvalDecision";
import { failureReasonFromLogs } from "@/lib/agents/agentRunEvent";
import { AGENT_STEPS, type AgentStepStatus } from "@/components/agent/AgentPlannerCard";
import { type AgentLogEntry } from "@/components/agent/AgentRawLogPanel";
import { type AgentReasoningEntry } from "@/components/agent/AgentReasoningTimeline";

interface StreamEvent {
  kind: "node_finish" | "log" | "interrupt" | "complete" | "error";
  node?: string;
  data?: Record<string, unknown>;
  log?: AgentLogEntry;
}

const STEP_ORDER = AGENT_STEPS.map((step) => step.id);

function statusFromNodeFinish(node: string, data: Record<string, unknown> | undefined): AgentStepStatus {
  if (node === "autoApplyExecution") {
    const outcome = data?.autoApplyStatus;
    if (outcome === "applied") return "done";
    if (outcome === "manual_required") return "warn";
    if (outcome === "skipped" || outcome === "failed") return "fail";
  }
  const logs = Array.isArray(data?.logs) ? (data.logs as { type?: string }[]) : [];
  if (logs.some((log) => log.type === "error")) return "fail";
  if (logs.some((log) => log.type === "warning")) return "warn";
  return "done";
}

export interface AgentRunOutcome {
  status?: string;
  atsScore?: number;
  threadId?: string;
}

interface UseAgentRunControllerArgs {
  job: JobApplication;
  onFinished?: (outcome: AgentRunOutcome) => void;
  region: RegionCode;
  submit: boolean;
}

export function useAgentRunController({ job, onFinished, region, submit }: UseAgentRunControllerArgs) {
  const { success, error: errToast, warn, celebrate } = useToast();
  const [running, setRunning] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [stepStatuses, setStepStatuses] = useState<Record<string, AgentStepStatus>>({});
  const [stepReasons, setStepReasons] = useState<Record<string, string>>({});
  const [reasoning, setReasoning] = useState<AgentReasoningEntry[]>([]);
  const [logs, setLogs] = useState<AgentLogEntry[]>([]);
  const [terminalStatus, setTerminalStatus] = useState<string | null>(job.autoApplyStatus || null);
  const [resuming, setResuming] = useState(false);
  const [submitAcknowledged, setSubmitAcknowledged] = useState(false);
  const [reviewPitch, setReviewPitch] = useState(
    (job.documents?.coverLetter as string) ||
      `Dear Hiring Team, The ${job.title} role at ${job.company} maps directly to my experience. I would welcome the chance to discuss how I can contribute.`
  );
  const reasonIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const applyEvent = useCallback((event: StreamEvent) => {
    if (event.kind === "log" && event.log) {
      setLogs((current) => [...current.slice(-399), event.log!]);
      if (event.log.type === "reasoning") {
        reasonIdRef.current += 1;
        setReasoning((current) => [
          ...current.slice(-49),
          { id: reasonIdRef.current, timestamp: event.log!.timestamp, message: event.log!.message, source: event.node },
        ]);
      }
      if (event.node) {
        if (event.log.type === "error") {
          setStepStatuses((current) => ({ ...current, [event.node!]: "fail" }));
          setStepReasons((current) => ({ ...current, [event.node!]: event.log!.message }));
        } else {
          setStepStatuses((current) => current[event.node!] ? current : { ...current, [event.node!]: "running" });
        }
      }
      return;
    }
    if (event.kind === "node_finish" && event.node && STEP_ORDER.includes(event.node)) {
      setStepStatuses((current) => ({ ...current, [event.node!]: statusFromNodeFinish(event.node!, event.data) }));
      const failureReason = failureReasonFromLogs(event.data?.logs);
      if (failureReason) setStepReasons((current) => ({ ...current, [event.node!]: failureReason }));
      return;
    }
    if (event.kind === "interrupt" && event.node && STEP_ORDER.includes(event.node)) {
      setStepStatuses((current) => ({ ...current, [event.node!]: "warn" }));
      setTerminalStatus("manual_required");
      return;
    }
    if (event.kind === "complete") {
      const status = typeof event.data?.status === "string" ? event.data.status : undefined;
      setTerminalStatus(status ?? null);
      if (typeof event.data?.threadId === "string") setThreadId(event.data.threadId);
      return;
    }
    if (event.kind === "error") setTerminalStatus("failed");
  }, []);

  const runPipeline = async () => {
    if (running) return;
    if (submit) warn("Submission runs still pause at the human review gate before anything is sent.");
    setRunning(true);
    setStepStatuses({});
    setStepReasons({});
    setReasoning([]);
    setLogs([]);
    setTerminalStatus(null);
    setSubmitAcknowledged(false);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/agent/multi-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          targetRegion: region,
          submit,
          stream: true,
          threadId: `thread_${job.id}_${Date.now()}`,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(`Pipeline failed (${response.status})`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((value) => value.startsWith("data: "));
          if (!line) continue;
          try {
            applyEvent(JSON.parse(line.slice(6)) as StreamEvent);
          } catch {
            // Ignore malformed frame boundaries; later frames remain readable.
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        errToast(error instanceof Error ? error.message : "Pipeline failed.");
        setTerminalStatus("failed");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  useEffect(() => {
    if (!running && terminalStatus) {
      if (terminalStatus === "applied") {
        success("Application submission verified by the browser agent.");
        celebrate();
      }
      onFinished?.({ status: terminalStatus, threadId: threadId ?? undefined });
    }
    // onFinished is intentionally excluded to preserve one callback per terminal outcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, terminalStatus]);

  const resumePipeline = async (approved: boolean, shouldSubmit: boolean) => {
    const decision = getApprovalDecision({
      hasReviewThread: Boolean(threadId),
      submitAcknowledged,
      isResuming: resuming,
    });
    if (!decision.canKeepPrefilled) {
      warn("No review thread found — run the pipeline first.");
      return;
    }
    if (shouldSubmit && !decision.canApproveAndSubmit) {
      warn("Confirm you reviewed the plan before submitting.");
      return;
    }
    setResuming(true);
    try {
      const response = await fetch("/api/agent/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          jobId: job.id,
          approved,
          submit: shouldSubmit,
          editedPitch: reviewPitch,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to resume application");
      setTerminalStatus(data.status);
      if (Array.isArray(data.logs)) setLogs(data.logs.slice(-400));
      if (data.status === "applied") {
        success("Application submission verified.");
        celebrate();
      } else {
        warn("Review decision recorded.");
      }
    } catch (error) {
      errToast(error instanceof Error ? error.message : "Failed to resume");
    } finally {
      setResuming(false);
    }
  };

  return {
    logs,
    reasoning,
    resuming,
    resumePipeline,
    reviewPitch,
    runPipeline,
    running,
    setReviewPitch,
    setSubmitAcknowledged,
    stepReasons,
    stepStatuses,
    submitAcknowledged,
    terminalStatus,
    threadId,
  };
}
