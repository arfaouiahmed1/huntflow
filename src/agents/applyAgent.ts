import { Annotation, END, StateGraph, START } from "@langchain/langgraph";
import { AutoApplyLog, TailoredDocuments, UserProfile } from "@/types";
import { extractJdTerms, matchFallback } from "@/lib/prompts";
import { pitchFallback } from "@/lib/prompts/applyAgentPrompts";
import { PRINCIPLES_BLOCK } from "@/lib/prompts/principles";
import { LLMSettings } from "@/lib/llm/providers";
import { callLLM, resolveChain } from "@/lib/llm/router";
import { executeApply } from "@/lib/agents/executeApply";

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
  /** @deprecated Kept only so older local callers do not break; it is ignored. */
  minMatch?: number;
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

  // Always run the deterministic fit engine so the user sees profile
  // dealbreakers (visa, clearance, on-site-only, salary floor) as evidence.
  const jobLike = {
    id: state.job.id,
    title: state.job.title,
    company: state.job.company,
    location: "",
    url: state.job.url,
    jobDescription: state.job.jobDescription,
  } as Parameters<typeof matchFallback>[0];
  const analysis = matchFallback(jobLike, state.profile);

  if (matchScore == null) {
    matchScore = analysis.matchScore;
    logs.push({ timestamp: ts(), message: `📊 Local fit engine scored role at ${matchScore}%`, type: "info" });
  }
  if (!Number.isFinite(matchScore)) matchScore = 0;

  if (analysis.fit === "skip") {
    logs.push({
      timestamp: ts(),
      message: `🚫 Fit gate: role marked "skip" — ${(analysis.dealbreakers ?? []).slice(0, 2).join("; ") || "profile dealbreaker"}`,
      type: "warning",
    });
  }

  const terms = extractJdTerms(state.job.jobDescription, state.profile.skills);
  const topSkills = terms.filter((t) => t.inResume).slice(0, 5).map((t) => t.term);
  const gaps = terms.filter((t) => !t.inResume).slice(0, 4).map((t) => t.term);

  logs.push({
    timestamp: ts(),
    message: `🧠 Skill analysis — strengths: ${topSkills.join(", ") || "none matched"}${gaps.length ? ` · gaps: ${gaps.join(", ")}` : ""}`,
    type: "info",
  });

  const fitGate = analysis.fit === "skip";
  const proceed = !fitGate;
  const reason = fitGate
    ? `Fit is "skip" — ${(analysis.dealbreakers ?? []).slice(0, 1).join("; ") || "profile dealbreaker"}`
    : `Score ${matchScore}% recorded as fit evidence; preparation remains supervised.`;

  return {
    matchScore,
    logs,
    decision: { proceed, reason },
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
          system: `You are a Senior Career Strategist and Expert Copywriter. You write 3-sentence, high-signal "why me" pitches for job applications.

${PRINCIPLES_BLOCK}

Pitch constraints: keep it grounded in the user's actual skills and accomplishments — never invent facts, skills, or metrics. Write like a real professional in a conversation, not a marketing template: vary sentence rhythm, avoid clichés such as "I am excited about the opportunity" or "aligns perfectly", and never use em dashes. No markdown, no fluff, no sycophantic language.`,
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
      logs.push({ timestamp: ts(), message: "⚠ LLM pitch failed — using deterministic pitch fallback", type: "warning" });
    }
  }

  if (!pitch) {
    pitch = pitchFallback({ title: state.job.title, company: state.job.company }, state.profile);
  }

  return { logs, pitch };
}

async function execute(state: typeof ApplyState.State) {
  const result = await executeApply({
    url: state.job.url,
    profile: state.profile,
    documents: state.documents,
    pitch: state.pitch,
    submit: state.submit,
    matchScore: state.matchScore,
    agentUrl: state.agentUrl,
  });
  return result;
}

async function verify(state: typeof ApplyState.State) {
  const logs: AutoApplyLog[] = [];
  if (state.status === "applied") {
    logs.push({ timestamp: ts(), message: `✅ ${state.job.company} application verified — status logged`, type: "success" });
  } else if (state.status === "manual_required") {
    logs.push({ timestamp: ts(), message: "⏸ Human review required before submission", type: "warning" });
  } else if (state.status === "skipped") {
    logs.push({ timestamp: ts(), message: "🛑 Auto-apply skipped — profile safety review requires attention", type: "warning" });
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
