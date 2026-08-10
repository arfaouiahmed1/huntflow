"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Send, Loader2, Sparkles, Wrench, User, Sparkle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import { consumeAssistant } from "@/lib/assistant/streamClient";

interface Msg {
  role: "user" | "assistant";
  content: string;
  steps?: { kind: string; label: string; detail: string }[];
  /** Live "thinking" notes shown above the reply while the agent is working. */
  reasoning?: string[];
}

const HISTORY_KEY = "huntflow_assistant_history";
const SUGGESTIONS = [
  "What does my resume say about payment systems?",
  "Where does my pipeline stand right now?",
  "Find me anything about Stripe or fintech",
  "Remember: waiting on Acme before Thursday",
];

export default function AssistantPage() {
  const { profile, llmSettings } = useApp();
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      return saved ? (JSON.parse(saved) as Msg[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const liveIndexRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-15)));
    } catch {
      /* storage full — ignore */
    }
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  /** Immutably replace one message while a stream is updating it in place. */
  const patchLive = (patch: (m: { content: string; steps?: Msg["steps"]; reasoning?: string[] }) => void) => {
    setMessages((prev) => {
      const idx = liveIndexRef.current;
      if (idx === null || idx < 0 || idx >= prev.length || prev[idx].role !== "assistant") return prev;
      const next = prev.slice();
      next[idx] = {
        ...prev[idx],
        content: prev[idx].content,
        steps: prev[idx].steps,
        reasoning: prev[idx].reasoning,
      };
      patch(next[idx]);
      return next;
    });
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || thinking) return;
    setInput("");
    const history: Msg[] = messages.slice(-8);
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setThinking(true);

    // Seed an empty assistant bubble that the stream fills in live.
    const liveIndex = next.length;
    liveIndexRef.current = liveIndex;
    setMessages((prev) => [...prev, { role: "assistant", content: "", steps: [], reasoning: [] }]);

    await consumeAssistant(JSON.stringify({ message: content, history: history.map((m) => ({ role: m.role, content: m.content })) }), {
      onEvent: {
        onReasoning: (note) => {
          patchLive((m) => {
            m.reasoning = [...(m.reasoning ?? []), note];
          });
        },
        onToolCall: (label, detail) => {
          patchLive((m) => {
            m.steps = [...(m.steps ?? []), { kind: "tool", label, detail }];
          });
        },
        onToken: (delta) => {
          patchLive((m) => {
            m.content += delta;
          });
        },
        onDone: (result) => {
          setMessages((prev) => {
            const idx = liveIndexRef.current;
            if (idx === null || idx < 0 || idx >= prev.length) return prev;
            const next = prev.slice();
            const current = next[idx];
            next[idx] = {
              ...current,
              content: result.reply || current.content,
              steps: result.steps && result.steps.length ? result.steps : current.steps,
            };
            return next;
          });
          liveIndexRef.current = null;
        },
        onError: (message) => {
          setMessages((prev) => {
            const idx = liveIndexRef.current;
            if (idx === null || idx < 0 || idx >= prev.length) return prev;
            const next = prev.slice();
            next[idx] = { ...next[idx], content: message || "Something went wrong." };
            return next;
          });
          liveIndexRef.current = null;
        },
      },
    });

    setThinking(false);
  };

  return (
    <div className="flex h-[calc(100dvh-104px)] flex-col lg:h-[calc(100dvh-96px)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--chartreuse)]">/assistant</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--paper)]">Command Assistant</h1>
          <p className="mt-1 text-sm text-dim">
            Orchestrator agent — reads your pipeline, your vault, and its own memory to answer.
          </p>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-[10px] text-dim sm:inline-flex">
          <Sparkles className="h-3 w-3 text-[var(--chartreuse)]" />
          {llmSettings?.providerId ? `engine: ${llmSettings.providerId}` : "no provider — heuristic mode"}
        </span>
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="grid h-full place-items-center">
            <div className="max-w-md text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10">
                <Bot className="h-7 w-7 text-[var(--chartreuse)]" />
              </div>
              <p className="mt-4 font-display text-lg font-bold text-[var(--paper)]">Ask anything about your search.</p>
              <p className="mt-2 text-sm leading-relaxed text-dim">
                The orchestrator routes to pipeline snapshots, job search, vault RAG, and shared memory — then composes an answer.
              </p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3 text-left text-[11px] leading-relaxed text-dim transition-colors hover:border-[var(--chartreuse)]/40 hover:text-[var(--paper)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}
          >
            {m.role === "assistant" && (
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10">
                <Bot className="h-4 w-4 text-[var(--chartreuse)]" />
              </div>
            )}
            <div className={cn("max-w-[78%]", m.role === "user" && "order-first")}>
              {m.role === "assistant" && m.reasoning && m.reasoning.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {m.reasoning.map((r, k) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/8 px-2 py-0.5 font-mono text-[9px] text-[var(--chartreuse)]"
                    >
                      <Sparkle className="h-2.5 w-2.5" /> {r}
                    </span>
                  ))}
                </div>
              )}
              {m.role === "assistant" && m.steps && m.steps.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {m.steps.map((s, j) => (
                    <span
                      key={j}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--sky)]/30 bg-[var(--sky)]/8 px-2 py-0.5 font-mono text-[9px] text-[var(--sky)]"
                      title={s.detail}
                    >
                      <Wrench className="h-2.5 w-2.5" /> {s.label}
                    </span>
                  ))}
                </div>
              )}
              <div
                className={cn(
                  "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  m.role === "user"
                    ? "rounded-br-md bg-[var(--chartreuse)] text-ink"
                    : "rounded-bl-md border border-[var(--line)] bg-[var(--ink-card)]/80 text-[var(--paper)]"
                )}
              >
                {m.role === "assistant" && !m.content ? (
                  <p className="min-w-40 text-xs text-dim">
                    <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin text-[var(--chartreuse)]" />
                    thinking…
                  </p>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            </div>
            {m.role === "user" && (
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-white/[0.04]">
                <User className="h-4 w-4 text-dim" />
              </div>
            )}
          </motion.div>
        ))}

        {thinking && (
          <div className="flex gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10">
              <Bot className="h-4 w-4 text-[var(--chartreuse)]" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-[var(--line)] bg-[var(--ink-card)]/80 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--chartreuse)]" />
              <p className="text-xs text-dim">routing to tools…</p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="pt-4">
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/80 p-2.5 focus-within:border-[var(--chartreuse)]/40">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Ask the orchestrator… (Enter to send, Shift+Enter for a new line)"
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-[var(--paper)] outline-none placeholder:text-dim/60"
          />
          <button
            onClick={() => send()}
            disabled={thinking || !input.trim()}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--chartreuse)] text-ink transition-all hover:bg-chartreuse-bright disabled:opacity-40 active:scale-95"
            title="Send"
          >
            {thinking ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Send className="h-4.5 w-4.5" />}
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-dim">
          Tool calls appear as chips · memory and usage are logged with every run
        </p>
      </div>
    </div>
  );
}
