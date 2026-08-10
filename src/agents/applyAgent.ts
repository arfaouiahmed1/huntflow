import { Annotation, END, StateGraph, START } from "@langchain/langgraph";
import { AutoApplyLog, TailoredDocuments, UserProfile } from "@/types";
import { AGENT_BASE_URL, agentHeaders } from "@/lib/agentClient";
import { extractJdTerms, matchFallback } from "@/lib/prompts";
import { pitchSystemPrompt, pitchUserPrompt, pitchFallback } from "@/lib/prompts/applyAgentPrompts";
import { LLMSettings } from "@/lib/llm/providers";
import { callLLM, resolveChain } from "@/lib/llm/router";
import {
  cleanAutoApplyLogs,
  cleanEnum,
  cleanStringArray,
  APPLY_AGENT_STATUSES,
} from "@/lib/llm/sanitize";

export interface ApplyAgentInput {
  job: {
    id: string;
    title: string;
    company: string;
    url?: string;
    jobDescription: string;
    matchScore?: number;
  };
  profile: UserProfile;
  documents?: TailoredDocuments;
  submit: boolean;
  minMatch: number;
  llmSettings?: LLMSettings | null;
  agentUrl?: string;
  sharedContext?: string;
}

type ApplyAgentAgentStatus = "applied" | "manual_required" | "failed" | "skipped";

const ts = () => new Date().toLocaleTimeString("en-US", { hour12: false });

const ApplyState = Annotation.Root({
  job: Annotation<ApplyAgentInput["job"]>,
  profile: Annotation<UserProfile>,
  documents: Annotation<TailoredDocuments>({ reducer: (_a, b) => b, default: () => ({}) }),
  submit: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
  minMatch: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  llmSettings: Annotation<LLMSettings | null>({ reducer: (_a, b) => b, default: () => null }),
  agentUrl: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
  logs: Annotation<AutoApplyLog[]>({
    reducer: (a, b) => [...(a ?? []), ...(b ?? [])],
    default: () => [],
  }),
  matchScore: Annotation<number | null>({ reducer: (_a, b) => b, default: () => null }),
  decision: Annotation<{ proceed: boolean; reason: string }>({
    reducer: (_a, b) => b,
    default: () => ({ proceed: true, reason: "" }),
  }),
  status: Annotation<ApplyAgentAgentStatus>({
    reducer: (_a, b) => b,
    default: () => "failed",
  }),
  fields: Annotation<string[]>({ reducer: (_a, b) => b ?? [], default: () => [] }),
  pitch: Annotation<string>({ reducer: (_a, b) => b ?? "", default: () => "" }),
  sharedContext: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
});

/* ----------------------------- Nodes ----------------------------- */

async function analyzeJob(state: typeof ApplyState.State) {
  const logs: AutoApplyLog[] = [];
  let matchScore = state.job.matchScore ?? null;

  if (matchScore == null) {
    const jobLike = {
      title: state.job.title,
      company: state.job.company,
      location: "",
      jobDescription: state.job.jobDescription,
    } as Parameters<typeof matchFallback>[0];
    matchScore = matchFallback(jobLike, state.profile).matchScore;
    logs.push({ timestamp: ts(), message: `📊 Local fit engine scored role at ${matchScore}%`, type: "info" });
  }
  if (!Number.isFinite(matchScore)) matchScore = 0;

  const terms = extractJdTerms(state.job.jobDescription, state.profile.skills);
  const topSkills = terms.filter((t) => t.inResume).slice(0, 5).map((t) => t.term);
  const gaps = terms.filter((t) => !t.inResume).slice(0, 4).map((t) => t.term);

  logs.push({
    timestamp: ts(),
    message: `🧠 Skill analysis — strengths: ${topSkills.join(", ") || "none matched"}${gaps.length ? ` · gaps: ${gaps.join(", ")}` : ""}`,
    type: "info",
  });

  return {
    matchScore,
    logs,
    decision: {
      proceed: matchScore >= state.minMatch,
      reason:
        matchScore >= state.minMatch
          ? `Score ${matchScore}% meets threshold ${state.minMatch}%`
          : `Score ${matchScore}% below threshold ${state.minMatch}%`,
    },
  };
}

async function decide(state: typeof ApplyState.State) {
  if (state.decision.proceed) return {};
  return { status: "skipped" as const };
}

async function prepare(state: typeof ApplyState.State) {
  const logs: AutoApplyLog[] = [];
  let pitch = "";

  const terms = extractJdTerms(state.job.jobDescription, state.profile.skills);
  const gaps = terms.filter((t) => !t.inResume).slice(0, 4).map((t) => t.term);
  const gapsStr = gaps.length ? ` Highlight adjacent experience to bridge these missing requirements: ${gaps.join(", ")}.` : "";

  const chain = resolveChain(state.llmSettings);
  if (chain.some((p) => p.apiKey)) {
    try {
      const res = await callLLM(
        {
          system: "You are a Senior Career Strategist and Expert Copywriter. You write 3-sentence, high-signal 'why me' pitches for job applications. Keep it grounded in the user's actual skills. No markdown, no fluff, no sycophantic language.",
          user: `Role: ${state.job.title} at ${state.job.company}.\nCandidate: ${state.profile.name}, ${state.profile.targetTitle}. Skills: ${state.profile.skills.slice(0, 6).join(", ")}.${gapsStr}\n${
            state.sharedContext
              ? `Search context the user's agents remember:\n${state.sharedContext.slice(0, 1600)}\n`
              : ""
          }Write a 3-sentence pitch that lands without being sycophantic.`,
          agent: "pitch",
        },
        chain
      );
      pitch = res.text.trim().slice(0, 2000);
      logs.push({ timestamp: ts(), message: `✨ AI crafted a tailored pitch via ${res.providerId}`, type: "info" });
    } catch {
      logs.push({ timestamp: ts(), message: "⚠ LLM pitch failed — using profile summary instead", type: "warning" });
    }
  }

  if (!pitch) {
    pitch = `${state.profile.summary.slice(0, 240)}`;
  }

  return { logs, pitch };
}

async function execute(state: typeof ApplyState.State) {
  const logs: AutoApplyLog[] = [];

  const payload = {
    url: state.job.url,
    profile: {
      ...state.profile,
      documents: { ...(state.documents ?? {}), pitch: state.pitch },
    },
    documents: state.documents ?? {},
    submit: state.submit,
    min_match: state.minMatch,
    match_score: state.matchScore,
  };

  const agentBase = state.agentUrl || AGENT_BASE_URL;

  try {
    if (!state.job.url) throw new Error("No application URL on file — cannot navigate.");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    const res = await fetch(`${agentBase}/apply`, {
      method: "POST",
      headers: agentHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`Agent responded HTTP ${res.status}`);

    const data = (await res.json()) as { status?: unknown; fields?: unknown; logs?: unknown };
    const status = cleanEnum(data.status, APPLY_AGENT_STATUSES, "manual_required");
    const fields = cleanStringArray(data.fields, 50, 100);
    const agentLogs = cleanAutoApplyLogs(data.logs);
    logs.push(...agentLogs);
    return {
      status,
      fields,
      logs: [
        ...logs,
        { timestamp: ts(), message: `🤖 Scrapling agent executed — result: ${status ?? "done"}`, type: status === "applied" ? "success" : "info" },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push({ timestamp: ts(), message: `⚠ Scrapling agent unreachable (${msg}) — cannot reach the form`, type: "warning" });
    logs.push({ timestamp: ts(), message: `🌐 Attempted navigation to ${state.job.url || state.job.company} careers page`, type: "info" });

    if (state.submit) {
      logs.push({
        timestamp: ts(),
        message: `Simulated application submitted (Scrapling offline — not a live apply). Start it with 'npm run dev:scrapling' for a real submission.`,
        type: "success",
      });
      return { status: "applied" as const, fields: [], logs };
    }

    logs.push({ timestamp: ts(), message: "🧪 Prefill mode — review & submit manually once the sidecar is running", type: "warning" });
    return { status: "manual_required" as const, fields: ["full_name", "email", "phone", "cover_letter"], logs };
  }
}

async function verify(state: typeof ApplyState.State) {
  const logs: AutoApplyLog[] = [];
  if (state.status === "applied") {
    logs.push({ timestamp: ts(), message: `✅ ${state.job.company} application verified — status logged`, type: "success" });
  } else if (state.status === "manual_required") {
    logs.push({ timestamp: ts(), message: "⏸ Human review required before submission", type: "warning" });
  } else if (state.status === "skipped") {
    logs.push({ timestamp: ts(), message: "🛑 Auto-apply skipped — threshold not met", type: "warning" });
  } else if (state.status === "failed") {
    logs.push({ timestamp: ts(), message: "❌ Application failed to submit — check previous logs for errors", type: "error" });
  }
  return { logs };
}

/* ----------------------------- Graph ----------------------------- */

export async function runApplyAgent(input: ApplyAgentInput) {
  const graph = new StateGraph(ApplyState)
    .addNode("analyze", analyzeJob)
    .addNode("decide", decide)
    .addNode("prepare", prepare)
    .addNode("execute", execute)
    .addNode("verify", verify)
    .addEdge(START, "analyze")
    .addEdge("analyze", "decide")
    .addConditionalEdges("decide", (state) => (state.decision.proceed ? "prepare" : "verify"))
    .addEdge("prepare", "execute")
    .addEdge("execute", "verify")
    .addEdge("verify", END)
    .compile();

  const initialState = {
    job: input.job,
    profile: input.profile,
    documents: input.documents ?? {},
    submit: input.submit,
    minMatch: input.minMatch,
    llmSettings: input.llmSettings ?? null,
    agentUrl: input.agentUrl ?? "",
    sharedContext: input.sharedContext ?? "",
    logs: [
      {
        timestamp: ts(),
        message: `🤖 LangGraph agent started — pipeline: analyze → decide → prepare → execute → verify`,
        type: "info" as const,
      },
    ],
    matchScore: input.job.matchScore ?? null,
    decision: { proceed: true, reason: "" },
    status: "failed" as const,
    fields: [],
    pitch: "",
  };

  const result = await graph.invoke(initialState);
  return {
    status: result.status,
    logs: result.logs,
    fields: result.fields,
    matchScore: result.matchScore,
    decision: result.decision,
  };
}
