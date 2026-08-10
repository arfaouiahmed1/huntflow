import { AGENT_BASE_URL, agentHeaders } from "@/lib/agentClient";
import { cleanEnum, cleanStringArray, cleanAutoApplyLogs, APPLY_AGENT_STATUSES } from "@/lib/llm/sanitize";
import { AutoApplyLog, TailoredDocuments, UserProfile } from "@/types";

export interface ApplyExecutionInput {
  url?: string;
  profile: UserProfile;
  documents?: TailoredDocuments;
  pitch?: string;
  submit: boolean;
  minMatch: number;
  matchScore: number | null;
  agentUrl?: string;
}

export interface ApplyExecutionResult {
  status: "applied" | "manual_required" | "failed" | "skipped";
  fields: string[];
  logs: AutoApplyLog[];
}

const ts = () => new Date().toLocaleTimeString("en-US", { hour12: false });

/**
 * Drive the Scrapling sidecar to prefill/submit an application form.
 *
 * Shared by both the single-agent graph (applyAgent.ts) and the multi-agent
 * graph (multiAgentAppGraph.ts) so they execute identically. When the sidecar
 * is unreachable, `submit` degrades to a *simulated* "applied" (never a real
 * submission) and prefill mode reports `manual_required`.
 */
export async function executeApply(input: ApplyExecutionInput): Promise<ApplyExecutionResult> {
  const logs: AutoApplyLog[] = [];
  const payload = {
    url: input.url,
    profile: {
      ...input.profile,
      documents: { ...(input.documents ?? {}), pitch: input.pitch ?? "" },
    },
    documents: input.documents ?? {},
    submit: input.submit,
    min_match: input.minMatch,
    match_score: input.matchScore,
  };

  const agentBase = input.agentUrl || AGENT_BASE_URL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    if (!input.url) throw new Error("No application URL on file — cannot navigate.");

    const res = await fetch(`${agentBase}/apply`, {
      method: "POST",
      headers: agentHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Agent responded HTTP ${res.status}`);

    const data = (await res.json()) as { status?: unknown; fields?: unknown; logs?: unknown };
    const status = cleanEnum(data.status, APPLY_AGENT_STATUSES, "manual_required");
    const fields = cleanStringArray(data.fields, 50, 100);
    const agentLogs = cleanAutoApplyLogs(data.logs);
    logs.push(...agentLogs);
    logs.push({
      timestamp: ts(),
      message: `🤖 Scrapling agent executed — result: ${status ?? "done"}`,
      type: status === "applied" ? "success" : "info",
    });
    return { status, fields, logs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push({ timestamp: ts(), message: `⚠ Scrapling agent unreachable (${msg}) — cannot reach the form`, type: "warning" });
    logs.push({ timestamp: ts(), message: `🌐 Attempted navigation to ${input.url || ""} careers page`, type: "info" });

    if (input.submit) {
      logs.push({
        timestamp: ts(),
        message: `Simulated application submitted (Scrapling offline — not a live apply). Start it with 'npm run dev:scrapling' for a real submission.`,
        type: "success",
      });
      return { status: "applied", fields: [], logs };
    }

    logs.push({ timestamp: ts(), message: "🧪 Prefill mode — review & submit manually once the sidecar is running", type: "warning" });
    return { status: "manual_required", fields: ["full_name", "email", "phone", "cover_letter"], logs };
  } finally {
    // Clear the abort timer on every exit path (success, throw, early return)
    // so a pending 90s timer never outlives the request.
    clearTimeout(timer);
  }
}
