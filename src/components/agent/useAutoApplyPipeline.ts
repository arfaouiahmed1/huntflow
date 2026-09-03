"use client";

import { useState } from "react";
import { CompanyResearch, JobApplication } from "@/types";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/ui/Toaster";
import { RegionCode } from "@/lib/agents/regionalNorms";
import { getApprovalDecision } from "@/lib/agents/approvalDecision";
import { type AgentStepStatus } from "@/components/agent/AgentPlannerCard";

export interface AutoApplyResult {
  status?: string;
  atsScore?: number;
  recommendedTemplate?: string;
  matchingSkills?: string[];
  missingSkills?: string[];
  salaryEstimate?: string;
  outreachSubject?: string;
  companyResearch?: CompanyResearch;
}

const PREP_STEPS = [
  "companyIntel",
  "regionalNorms",
  "piiSanitizer",
  "resumeCVTailor",
  "letterTailor",
  "interviewPrep",
  "salaryIntel",
  "outreachEmail",
  "atsAudit",
];

export function useAutoApplyPipeline(job: JobApplication) {
  const { profile, updateApplication } = useApp();
  const { success, error: errToast, warn, celebrate } = useToast();
  const [running, setRunning] = useState(false);
  const [runningStep, setRunningStep] = useState<string | null>(null);
  const [targetRegion, setTargetRegion] = useState<RegionCode>("US");
  const [submit, setSubmit] = useState(false);
  const [submitAcknowledged, setSubmitAcknowledged] = useState(false);
  const [multiAgentResult, setMultiAgentResult] = useState<AutoApplyResult | null>(job.multiAgentOutputs || null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [reviewPitch, setReviewPitch] = useState(
    (job.documents?.coverLetter as string) ||
      `Dear Hiring Team, The ${job.title} role at ${job.company} maps directly to my experience. I would welcome the chance to discuss how I can contribute.`
  );

  const resumePipeline = async (approved: boolean, shouldSubmit: boolean) => {
    const decision = getApprovalDecision({
      hasReviewThread: Boolean(threadId),
      submitAcknowledged,
      isResuming: resuming,
    });
    if (!decision.canKeepPrefilled) {
      warn("No active review thread found. Please run the engine first.");
      return;
    }
    if (shouldSubmit && !decision.canApproveAndSubmit) {
      warn("Confirm that you reviewed the field plan before submitting.");
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

      updateApplication(job.id, {
        autoApplyStatus: data.status,
        autoApplyLogs: data.logs,
      });
      if (data.status === "applied") {
        success("Application submission verified.");
        celebrate();
      } else {
        warn("Application review updated.");
      }
    } catch (error) {
      errToast(error instanceof Error ? error.message : "Failed to resume");
    } finally {
      setResuming(false);
    }
  };

  const runMultiAgentPipeline = async () => {
    if (running || runningStep) return;
    setRunning(true);
    try {
      const nextThreadId = `thread_${job.id}_${Date.now()}`;
      setThreadId(nextThreadId);
      const response = await fetch("/api/agent/multi-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          profile,
          targetRegion,
          submit,
          threadId: nextThreadId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Multi-agent run failed");

      setMultiAgentResult(data);
      if (data.threadId) setThreadId(data.threadId);
      updateApplication(job.id, {
        autoApplyStatus: data.status,
        autoApplyLogs: data.logs,
        multiAgentOutputs: {
          atsScore: data.atsScore,
          recommendedTemplate: data.recommendedTemplate,
          matchingSkills: data.matchingSkills,
          missingSkills: data.missingSkills,
          salaryEstimate: data.salaryEstimate,
          outreachSubject: data.outreachSubject,
          companyResearch: data.companyResearch,
        },
      });
      if (data.status === "applied") {
        success("Application submission verified by the browser agent.");
        celebrate();
      } else if (data.status === "manual_required") {
        warn("Paused at Human-In-The-Loop review gate. Inspect and approve below.");
      }
    } catch (error) {
      errToast(error instanceof Error ? error.message : "Multi-agent execution failed.");
    } finally {
      setRunning(false);
    }
  };

  const runPartialStep = async (step: string) => {
    if (running || runningStep) return;
    setRunningStep(step);
    try {
      const response = await fetch("/api/agent/partial-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, profile, targetRegion, stopAfter: step }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || `Failed to run up to ${step}`);

      const data = json.data as AutoApplyResult;
      setMultiAgentResult(data);
      if (data.companyResearch) {
        updateApplication(job.id, {
          multiAgentOutputs: {
            ...(job.multiAgentOutputs ?? {}),
            companyResearch: data.companyResearch,
          },
        });
      }
      success(`Successfully ran pipeline up to ${step}.`);
    } catch (error) {
      errToast(error instanceof Error ? error.message : `Execution up to ${step} failed.`);
    } finally {
      setRunningStep(null);
    }
  };

  const stepStatuses: Record<string, AgentStepStatus> = {};
  const hasResult = Boolean(multiAgentResult);
  for (const id of PREP_STEPS) stepStatuses[id] = hasResult ? "done" : "queued";
  if (running) stepStatuses.autoApplyExecution = "running";
  else if (hasResult) {
    if (job.autoApplyStatus === "applied") stepStatuses.autoApplyExecution = "done";
    else if (job.autoApplyStatus === "manual_required") stepStatuses.autoApplyExecution = "warn";
    else if (job.autoApplyStatus === "failed") stepStatuses.autoApplyExecution = "fail";
    else stepStatuses.autoApplyExecution = "queued";
  }
  if (hasResult && !running && job.autoApplyStatus && job.autoApplyStatus !== "idle") {
    stepStatuses.orchestratorGate = "done";
  }

  return {
    multiAgentResult,
    reviewPitch,
    resuming,
    resumePipeline,
    runMultiAgentPipeline,
    runPartialStep,
    running,
    runningStep,
    setReviewPitch,
    setSubmit,
    setSubmitAcknowledged,
    setTargetRegion,
    stepStatuses,
    submit,
    submitAcknowledged,
    targetRegion,
    threadId,
  };
}
