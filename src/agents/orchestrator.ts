import { Annotation, END, StateGraph, START } from "@langchain/langgraph";
import { UserProfile } from "@/types";
import { generateJSON, generateText } from "@/lib/llm/client";
import { generateTextStream } from "@/lib/llm/stream";
import { cleanAssistantDecision, CleanAssistantDecision } from "@/lib/llm/sanitize";
import { buildSharedContext } from "@/lib/agents/context";
import { remember } from "@/lib/agents/memory";
import { searchVault } from "@/lib/vault";
import { jobsRepo, emailsRepo, interviewsRepo, remindersRepo, settingsRepo, contactsRepo } from "@/lib/db";
import { ORCHESTRATOR_TOOLS_PROMPT } from "@/lib/prompts/orchestratorPrompts";
import { executeCompanyIntelTool, executeSalaryIntelTool } from "@/lib/agents/tools/multiAgentTools";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantStep {
  kind: "tool" | "info";
  label: string;
  detail: string;
}

export interface AssistantResult {
  reply: string;
  steps: AssistantStep[];
  usedTools: string[];
  llm: boolean;
}

/**
 * Live events emitted as the assistant works. The streamed route maps these to
 * `reasoning` / `tool_call` / `token` SSE frames so the UI can show the agent at
 * work in real time instead of waiting for a single JSON blob.
 */
export type AssistantStreamEvent =
  | { kind: "reasoning"; note: string }
  | { kind: "tool_call"; label: string; detail: string }
  | { kind: "token"; delta: string };

const MAX_ITERATIONS = 3;

const AssistantState = Annotation.Root({
  message: Annotation<string>,
  profile: Annotation<UserProfile>,
  sharedContext: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
  history: Annotation<ChatMessage[]>({ reducer: (_a, b) => b, default: () => [] }),
  steps: Annotation<AssistantStep[]>({
    reducer: (a, b) => [...(a ?? []), ...(b ?? [])],
    default: () => [],
  }),
  toolResult: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
  iteration: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  pendingTool: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
  pendingArgs: Annotation<Record<string, string>>({ reducer: (_a, b) => b, default: () => ({}) }),
  finalAnswer: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
  llmUsed: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
});

async function route(state: typeof AssistantState.State) {
  const iter = (state.iteration ?? 0) + 1;
  if (iter > MAX_ITERATIONS) {
    return {
      iteration: iter,
      pendingTool: "",
      finalAnswer: state.toolResult ? `Ran ${state.steps.length} tool(s). Based on what they found:\n\n${state.toolResult.slice(0, 2000)}` : "I hit my tool budget — try asking more specifically.",
    };
  }

  const recent = state.history.slice(-6)
    .map((m) => `${m.role}: ${m.content.slice(0, 400)}`)
    .join("\n");

  const user = `USER MESSAGE: ${state.message}
PREVIOUS CONVERSATION:\n${recent || "—"}
PREVIOUS TOOL RESULTS (if any):\n${state.toolResult.slice(0, 1200) || "—"}`;

  let decision: CleanAssistantDecision | null = null;
  let rawAction: string | undefined;
  try {
    const res = await generateJSON<{ action: string; tool?: string; args?: Record<string, string>; note?: string; message?: string }>(
      undefined,
      `${ORCHESTRATOR_TOOLS_PROMPT}\n\nSHARED CONTEXT (what you know about this search):\n${state.sharedContext.slice(0, 4000)}`,
      user,
      "orchestrator-route"
    );
    rawAction = res?.action;
    decision = cleanAssistantDecision(res);
  } catch {
    /* no provider — fall through to heuristic routing below */
  }

  if (!decision && (rawAction === "tool" || rawAction === "answer")) {
    /* the model asked for something outside the tool whitelist (or malformed) */
    return { iteration: iter, pendingTool: "", finalAnswer: "I'm not sure how to do that yet.", llmUsed: true };
  }

  if (decision) {
    if (decision.action === "answer") {
      return {
        iteration: iter,
        pendingTool: "",
        finalAnswer: decision.message || "Done.",
        llmUsed: true,
      };
    }
    const tool = decision.tool ?? "";
    if (["pipeline_summary", "search_jobs", "search_vault", "remember", "access_email", "company_intel", "salary_intel"].includes(tool)) {
      const lastRun = state.steps.filter((s) => s.kind === "tool").at(-1)?.label;
      if (lastRun === tool && state.toolResult) {
        return {
          iteration: iter,
          pendingTool: "",
          finalAnswer: decision.message || `Already ran ${tool} above — here's the result:\n\n${state.toolResult.slice(0, 2000)}`,
          llmUsed: true,
        };
      }
      return {
        iteration: iter,
        pendingTool: tool,
        pendingArgs: decision.args ?? {},
        steps: [{ kind: "tool" as const, label: tool, detail: decision.note || tool }],
        llmUsed: true,
      };
    }
    return { iteration: iter, pendingTool: "", finalAnswer: decision.message || "I'm not sure how to do that yet." };
  }

  /* Heuristic fallback when no LLM provider is configured */
  const msg = state.message.toLowerCase();
  const hasToolResult = !!state.toolResult;
  if (hasToolResult) {
    return {
      iteration: iter,
      pendingTool: "",
      finalAnswer: `Here's what I found:\n\n${state.toolResult.slice(0, 2000)}`,
    };
  }
  if (/vault|document|resume|cv|letter|uploaded|file/.test(msg)) {
    return { iteration: iter, pendingTool: "search_vault", pendingArgs: { query: state.message }, steps: [{ kind: "tool", label: "search_vault", detail: "docs lookup" }] };
  }
  if (/pipeline|status|tracked|how many|follow.?up|interview|reminder|offer|applied/.test(msg)) {
    return { iteration: iter, pendingTool: "pipeline_summary", pendingArgs: {}, steps: [{ kind: "tool", label: "pipeline_summary", detail: "state snapshot" }] };
  }
  if (/salary|comp|pay|what.*earn|market rate/.test(msg)) {
    return { iteration: iter, pendingTool: "salary_intel", pendingArgs: {}, steps: [{ kind: "tool", label: "salary_intel", detail: "market comp estimate" }] };
  }
  if (/review|employer|company.*(culture|profile)|(review|assess|research).*(company|acme|employer)/.test(msg)) {
    return { iteration: iter, pendingTool: "company_intel", pendingArgs: {}, steps: [{ kind: "tool", label: "company_intel", detail: "employer review" }] };
  }
  if (/find|job|company|role|position/.test(msg)) {
    return { iteration: iter, pendingTool: "search_jobs", pendingArgs: { query: state.message }, steps: [{ kind: "tool", label: "search_jobs", detail: "job lookup" }] };
  }
  return { iteration: iter, pendingTool: "", finalAnswer: "No AI provider is configured (Settings → AI Engine) and this question needs a brain. Add an API key and I'll answer properly — or check the tools I can run without one (pipeline status, job search, vault search)." };
}

async function executeTool(state: typeof AssistantState.State) {
  const { pendingTool: tool, pendingArgs: args } = state;

  switch (tool) {
    case "pipeline_summary": {
      const shared = buildSharedContext({
        profile: state.profile,
        jobs: jobsRepo.list(),
        emails: emailsRepo.list(),
        interviews: interviewsRepo.list(),
        reminders: remindersRepo.list(),
        maxTokens: 2500,
      });
      return { toolResult: `PIPELINE SNAPSHOT:\n${shared.context}` };
    }
    case "search_jobs": {
      const raw = (args.query ?? state.message).toLowerCase();
      const STOPWORDS = new Set(["find", "jobs", "job", "search", "role", "position", "for", "the", "my", "what", "how", "are", "any", "me", "at", "in"]);
      const terms = raw.split(/\s+/).filter((t) => t.length > 2 && !STOPWORDS.has(t));
      const jobs = jobsRepo
        .list()
        .filter((j) => {
          const haystack = [j.title, j.company, j.location, j.status, j.notes ?? ""].join(" ").toLowerCase();
          return terms.length ? terms.some((t) => haystack.includes(t)) : haystack.includes(raw);
        })
        .slice(0, 6);
      if (!jobs.length) return { toolResult: "No tracked jobs matched." };
      return {
        toolResult: jobs
          .map((j) => `- ${j.title} @ ${j.company} (${j.status}${j.matchScore != null ? `, ${j.matchScore}%` : ""}${j.followUpDue ? `, follow-up ${j.followUpDue}` : ""})`)
          .join("\n"),
      };
    }
    case "search_vault": {
      const q = args.query ?? state.message;
      const hits = await searchVault(q, 3).catch(() => []);
      if (!hits.length) return { toolResult: "No matching passages found in the vault." };
      return {
        toolResult: hits
          .map((h) => `[${h.docName} — ${Math.round(h.score * 100)}%]\n${h.text.slice(0, 400)}`)
          .join("\n\n---\n\n"),
      };
    }
    case "remember": {
      const content = args.content ?? state.message;
      remember("note", content, { source: "assistant", importance: 1 });
      return { toolResult: `Remembered: ${content.slice(0, 200)}` };
    }
    case "access_email": {
      const raw = settingsRepo.get("mail_settings");
      let parsed: any = {};
      if (raw) {
        try { parsed = JSON.parse(raw); } catch { /* ignore */ }
      }
      const mailSettings = {
        imapHost: parsed.imapHost ?? "",
        imapPort: parsed.imapPort ?? 993,
        imapUser: parsed.imapUser ?? "",
        imapPass: parsed.imapPass ?? "",
        smtpHost: parsed.smtpHost ?? "",
        smtpPort: parsed.smtpPort ?? 587,
        smtpUser: parsed.smtpUser ?? "",
        smtpPass: parsed.smtpPass ?? "",
        fromName: parsed.fromName ?? "",
        fromEmail: parsed.fromEmail ?? "",
      };

      if (!mailSettings.imapUser || !mailSettings.smtpUser) {
        return { toolResult: "Email is not configured in Settings." };
      }

      if (args.action === "send") {
        if (!args.to || !args.subject || !args.body) {
           return { toolResult: "Missing 'to', 'subject', or 'body' for sending email." };
        }
        // Anti-exfiltration gate: only send to an email that already exists in
        // the user's contacts, never to an address the model invented from
        // scraped/job/vault content. Prevents prompt-injection exfiltration.
        const to = String(args.to).trim();
        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
        if (!EMAIL_RE.test(to)) {
          return { toolResult: "Refusing to send: recipient is not a valid email address." };
        }
        const known = contactsRepo.list().some((c) => c.email && c.email.toLowerCase() === to.toLowerCase());
        if (!known) {
          return { toolResult: `Refusing to send: "${to}" is not a saved contact. Add them under Network first, or confirm the address.` };
        }
        try {
          const nodemailer = (await import("nodemailer")).default;
          const transporter = nodemailer.createTransport({
            host: mailSettings.smtpHost,
            port: mailSettings.smtpPort,
            secure: mailSettings.smtpPort === 465,
            auth: { user: mailSettings.smtpUser, pass: mailSettings.smtpPass },
          });
          await transporter.sendMail({
            from: `"${mailSettings.fromName || mailSettings.smtpUser}" <${mailSettings.fromEmail || mailSettings.smtpUser}>`,
            to,
            subject: String(args.subject).slice(0, 200),
            text: String(args.body).slice(0, 10_000),
          });
          return { toolResult: `Successfully sent email to ${to}.` };
        } catch (e) {
          const msg = (e instanceof Error ? e.message : String(e)).replace(/pass(?:word)?[=:\s]+\S+/gi, '[REDACTED]');
          return { toolResult: `Failed to send email: ${msg}` };
        }
      } else {
        try {
          const { ImapFlow } = await import("imapflow");
          const client = new ImapFlow({
            host: mailSettings.imapHost,
            port: mailSettings.imapPort,
            secure: mailSettings.imapPort === 993,
            auth: { user: mailSettings.imapUser, pass: mailSettings.imapPass },
            logger: false,
          });
          await client.connect();
          const lock = await client.getMailboxLock("INBOX");
          let synced = 0;
          const subjects = [];
          try {
            const unseen = await client.search({ seen: false, deleted: false }, { uid: true });
            const sample = (Array.isArray(unseen) ? unseen : []).slice(-5);
            for (const uid of sample) {
              const msg = await client.fetchOne(uid, { envelope: true });
              if (msg && msg.envelope) {
                subjects.push(`- From: ${msg.envelope.from?.[0]?.address} | Subject: ${msg.envelope.subject}`);
                await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
                synced++;
              }
            }
          } finally {
            await lock.release();
            await client.logout();
          }
          if (synced === 0) return { toolResult: "No new unseen emails." };
          return { toolResult: `Read ${synced} new emails:\n${subjects.join("\n")}` };
        } catch (e) {
          const msg = (e instanceof Error ? e.message : String(e)).replace(/pass(?:word)?[=:\s]+\S+/gi, '[REDACTED]');
          return { toolResult: `Failed to read email: ${msg}` };
        }
      }
    }
    case "company_intel": {
      // Employer review — runs the same CompanyIntel agent used downstream in
      // auto-apply, sourcing the freshest tracked posting for the company so the
      // result is grounded in real pipeline data rather than invented.
      const company = String(args.company ?? "").trim() || inferCompany(state.message);
      if (!company) return { toolResult: "Tell me which company to review — e.g. \"review Acme\"." };
      const jd = latestJdFor(company);
      if (!jd) return { toolResult: `I couldn't find a tracked posting for ${company}. Add that job to your pipeline first.` };
      const res = await executeCompanyIntelTool({ company, jobDescription: jd });
      return {
        toolResult: `EMPLOYER REVIEW — ${company}\nATS: ${(res.atsType || "generic").toUpperCase()}\nCulture: ${(res.cultureKeywords ?? []).join(", ") || "not available"}\nSummary: ${res.summary}`,
      };
    }
    case "salary_intel": {
      const company = String(args.company ?? "").trim() || inferCompany(state.message);
      if (!company) return { toolResult: "Tell me which company's salary to estimate — e.g. \"salary at Acme\"." };
      const jd = latestJdFor(company);
      if (!jd) return { toolResult: `I couldn't find a tracked posting for ${company}. Add that job to your pipeline first.` };
      const job = [...jobsRepo.list()].reverse().find((j) => j.company.toLowerCase().includes(company.toLowerCase()));
      const res = await executeSalaryIntelTool({
        jobTitle: job?.title ?? inferTitle(jd),
        company,
        location: job?.location,
        jobDescription: jd,
      });
      return {
        toolResult: `SALARY ESTIMATE — ${res.role} @ ${res.company}\nRange: ${res.estimatedRange} (confidence: ${res.confidence})`,
      };
    }
    default:
      return { toolResult: "Unknown tool." };
  }
}

/** Pull the company name out of a short user message like "review Acme" / "salary at Google". */
function inferCompany(message: string): string {
  const m = message.match(/(?:review|intel|salary|company|at|for)\s+([A-Z][A-Za-z0-9&.' -]{1,40})/i);
  return m ? m[1].trim() : "";
}

/** Latest tracked job description for a company, or "" when none is found. */
function latestJdFor(company: string): string {
  const job = [...jobsRepo.list()].reverse().find((j) => j.company.toLowerCase().includes(company.toLowerCase()));
  return (job?.jobDescription ?? "").trim().slice(0, 6000);
}

/** Crude title fallback when a tracked job isn't found by company name. */
function inferTitle(jd: string): string {
  const line = jd.split("\n").find((l) => /title|role|position/i.test(l));
  return line ? line.replace(/title|role|position|[:|]/gi, "").trim().slice(0, 60) : "role";
}

async function compose(state: typeof AssistantState.State, onToken?: (delta: string) => void) {
  if (state.finalAnswer) return {};
  const transcript = state.steps
    .map((s) => `- ${s.label}: ${s.detail}`)
    .join("\n");

  const system = `You are an elite career intelligence orchestrator for HUNTFLOW. Your role is to synthesize complex data into clear, actionable, and confident advice for the user. Answer the user's question using the shared context and tool results only — never invent pipeline facts, statuses, or numbers. If a user correction contradicts earlier tool output, trust the user and say so briefly. Write like a sharp human coach: concise, specific, practical, no fluff, no false reassurance, and no em dashes.`;
  const user = `USER MESSAGE: ${state.message}
SHARED CONTEXT:\n${state.sharedContext.slice(0, 3000)}
TOOLS RUN:\n${transcript || "none"}
TOOL RESULTS:\n${state.toolResult.slice(0, 3000) || "—"}
PREVIOUS CONVERSATION:\n${state.history.slice(-6).map((m) => `${m.role}: ${m.content.slice(0, 300)}`).join("\n")}`;

  /* When a live token sink is present, prefer true token-by-token streaming so
   * the client watches the reply form in real time. Any streaming failure falls
   * back to the exact non-streaming path, so this is never a correctness risk. */
  if (onToken) {
    try {
      let full = "";
      for await (const delta of generateTextStream(undefined, system, user)) {
        if (!delta) continue;
        full += delta;
        onToken(delta);
      }
      if (full.trim()) return { finalAnswer: full.trim(), llmUsed: true };
      // empty streamed reply → fall through to the deterministic path
    } catch {
      /* stream unavailable — fall back below */
    }
  }

  try {
    const res = await generateText(undefined, system, user);
    return { finalAnswer: res.text.trim(), llmUsed: true };
  } catch {
    if (state.toolResult) {
      return { finalAnswer: `Here's what I found:\n\n${state.toolResult.slice(0, 2000)}` };
    }
    return { finalAnswer: "I don't have a provider configured, so this answer needs one — add an API key in Settings → AI Engine and ask again." };
  }
}

interface AssistantGraphOptions {
  /** Called with each final-composition text delta while it's being generated. */
  onComposeToken?: (delta: string) => void;
}

function createAssistantGraph(options: AssistantGraphOptions = {}) {
  const { onComposeToken } = options;
  return new StateGraph(AssistantState)
    .addNode("route", route)
    .addNode("executeTool", executeTool)
    .addNode("compose", (state) => compose(state, onComposeToken))
    .addEdge(START, "route")
    .addConditionalEdges("route", (state) => (state.pendingTool ? "executeTool" : "compose"))
    .addEdge("executeTool", "route")
    .addEdge("compose", END)
    .compile();
}

export interface AssistantInput {
  message: string;
  history?: ChatMessage[];
  profile: UserProfile;
}

/** Shared open-state for a fresh assistant run; identical across stream/non-stream. */
function initialState(input: AssistantInput, shared: { context: string }): typeof AssistantState.State {
  return {
    message: input.message,
    profile: input.profile,
    sharedContext: shared.context,
    history: input.history ?? [],
    steps: [],
    iteration: 0,
    toolResult: "",
    pendingTool: "",
    pendingArgs: {},
    finalAnswer: "",
    llmUsed: false,
  };
}

function summarizeResult(result: { finalAnswer?: string; steps: AssistantStep[]; llmUsed: boolean }, input: AssistantInput): AssistantResult {
  const usedTools = result.steps.filter((s: AssistantStep) => s.kind === "tool").map((s: AssistantStep) => s.label);
  if (usedTools.length && result.llmUsed !== false) {
    remember("insight", `Assistant handled "${input.message.slice(0, 120)}" using ${usedTools.join(", ")}`, {
      source: "assistant",
      importance: 1,
    });
  }
  return {
    reply: result.finalAnswer || "Done.",
    steps: result.steps,
    usedTools,
    llm: result.llmUsed === true,
  };
}

export async function runAssistant(input: AssistantInput): Promise<AssistantResult> {
  const shared = buildSharedContext({
    profile: input.profile,
    jobs: jobsRepo.list(),
    emails: emailsRepo.list(),
    interviews: interviewsRepo.list(),
    reminders: remindersRepo.list(),
    maxTokens: 5000,
  });

  const graph = createAssistantGraph();
  const result = await graph.invoke(initialState(input, shared));
  return summarizeResult(result, input);
}

/**
 * Streaming variant of `runAssistant`. Drives the exact same routing/tool graph
 * but reports each working step to `onEvent` as it happens:
 *  - reasoning: a routing note (before a tool runs / when answering directly)
 *  - tool_call: a tool that actually executed (with its human detail)
 *  - token:     a text delta of the final reply, as it's streamed
 *
 * `onEvent` is fire-and-forget (never awaited) so a slow consumer can't stall
 * the graph. Returns the same `AssistantResult` as `runAssistant`.
 */
export async function runAssistantStream(
  input: AssistantInput,
  onEvent: (event: AssistantStreamEvent) => void
): Promise<AssistantResult> {
  const shared = buildSharedContext({
    profile: input.profile,
    jobs: jobsRepo.list(),
    emails: emailsRepo.list(),
    interviews: interviewsRepo.list(),
    reminders: remindersRepo.list(),
    maxTokens: 5000,
  });

  const graph = createAssistantGraph({
    onComposeToken: (delta) => onEvent({ kind: "token", delta }),
  });

  const results: { finalAnswer?: string; steps: AssistantStep[]; llmUsed: boolean } = {
    steps: [],
    llmUsed: false,
  };

  // `updates` mode yields `{ nodeName: partialState }` for every executed node —
  // the exact, dependency-free way to observe routing and tool activity live.
  const stream = await graph.stream(initialState(input, shared), { streamMode: "updates" });
  for await (const step of stream) {
    if (!step || typeof step !== "object") continue;
    const update = step as Record<string, Record<string, unknown>>;
    for (const [node, partial] of Object.entries(update)) {
      const pstate = partial as Record<string, unknown>;
      if (node === "route") {
        const pendingTool = typeof pstate.pendingTool === "string" ? pstate.pendingTool : "";
        if (pendingTool) {
          onEvent({ kind: "reasoning", note: `routing to ${pendingTool}` });
        } else if (typeof pstate.finalAnswer === "string" && pstate.finalAnswer) {
          onEvent({ kind: "reasoning", note: "composing answer" });
          results.finalAnswer = pstate.finalAnswer;
        }
        if (Array.isArray(pstate.steps)) results.steps = pstate.steps as AssistantStep[];
        if (typeof pstate.llmUsed === "boolean") results.llmUsed = pstate.llmUsed;
      } else if (node === "executeTool") {
        const steps = Array.isArray(pstate.steps) ? (pstate.steps as AssistantStep[]) : (results.steps ?? []);
        const lastTool = [...steps].reverse().find((s) => s.kind === "tool");
        if (lastTool) {
          onEvent({ kind: "tool_call", label: lastTool.label, detail: lastTool.detail });
        }
      } else if (node === "compose") {
        if (Array.isArray(pstate.steps)) results.steps = pstate.steps as AssistantStep[];
        if (typeof pstate.finalAnswer === "string" && (pstate.finalAnswer || "").trim()) {
          results.finalAnswer = pstate.finalAnswer;
        }
        if (typeof pstate.llmUsed === "boolean") results.llmUsed = pstate.llmUsed;
      }
    }
  }

  return summarizeResult(results, input);
}
