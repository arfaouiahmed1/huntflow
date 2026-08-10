import { Annotation, END, StateGraph, START } from "@langchain/langgraph";
import { UserProfile } from "@/types";
import { generateJSON, generateText } from "@/lib/llm/client";
import { cleanAssistantDecision, CleanAssistantDecision } from "@/lib/llm/sanitize";
import { buildSharedContext } from "@/lib/agents/context";
import { remember } from "@/lib/agents/memory";
import { searchVault } from "@/lib/vault";
import { jobsRepo, emailsRepo, interviewsRepo, remindersRepo, settingsRepo, contactsRepo } from "@/lib/db";
import { ORCHESTRATOR_TOOLS_PROMPT } from "@/lib/prompts/orchestratorPrompts";

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
    if (["pipeline_summary", "search_jobs", "search_vault", "remember", "access_email"].includes(tool)) {
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
    default:
      return { toolResult: "Unknown tool." };
  }
}

async function compose(state: typeof AssistantState.State) {
  if (state.finalAnswer) return {};
  const transcript = state.steps
    .map((s) => `- ${s.label}: ${s.detail}`)
    .join("\n");

  try {
    const res = await generateText(
      undefined,
      `You are an elite career intelligence orchestrator for HUNTFLOW. Your role is to synthesize complex data into clear, actionable, and confident advice for the user. Answer the user's question using the shared context and tool results only — never invent pipeline facts, statuses, or numbers. If a user correction contradicts earlier tool output, trust the user and say so briefly. Write like a sharp human coach: concise, specific, practical, no fluff, no false reassurance, and no em dashes.`,
      `USER MESSAGE: ${state.message}
SHARED CONTEXT:\n${state.sharedContext.slice(0, 3000)}
TOOLS RUN:\n${transcript || "none"}
TOOL RESULTS:\n${state.toolResult.slice(0, 3000) || "—"}
PREVIOUS CONVERSATION:\n${state.history.slice(-6).map((m) => `${m.role}: ${m.content.slice(0, 300)}`).join("\n")}`
    );
    return { finalAnswer: res.text.trim(), llmUsed: true };
  } catch {
    if (state.toolResult) {
      return { finalAnswer: `Here's what I found:\n\n${state.toolResult.slice(0, 2000)}` };
    }
    return { finalAnswer: "I don't have a provider configured, so this answer needs one — add an API key in Settings → AI Engine and ask again." };
  }
}

const assistantGraph = new StateGraph(AssistantState)
  .addNode("route", route)
  .addNode("executeTool", executeTool)
  .addNode("compose", compose)
  .addEdge(START, "route")
  .addConditionalEdges("route", (state) => (state.pendingTool ? "executeTool" : "compose"))
  .addEdge("executeTool", "route")
  .addEdge("compose", END)
  .compile();

export async function runAssistant(input: {
  message: string;
  history?: ChatMessage[];
  profile: UserProfile;
}): Promise<AssistantResult> {
  const shared = buildSharedContext({
    profile: input.profile,
    jobs: jobsRepo.list(),
    emails: emailsRepo.list(),
    interviews: interviewsRepo.list(),
    reminders: remindersRepo.list(),
    maxTokens: 5000,
  });

  const result = await assistantGraph.invoke({
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
  });

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
