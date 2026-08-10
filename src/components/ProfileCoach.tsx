"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, ChevronDown, Loader2, Send, Sparkles, User, Wrench, Sparkle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { UserProfile } from "@/types";
import { cn } from "@/lib/utils";
import { consumeAssistant } from "@/lib/assistant/streamClient";

interface CoachMsg {
  role: "user" | "assistant";
  content: string;
  steps?: { kind: string; label: string; detail: string }[];
  reasoning?: string[];
}

const QUICK_QUESTIONS = [
  "How can I improve my summary?",
  "What skills should I learn next?",
  "Review my experience section",
  "Is my profile ready to apply?",
];

/** Compact, human-readable snapshot of the applicant profile to ground coaching. */
function profileSnapshot(profile: UserProfile): string {
  const exp =
    profile.experience
      ?.slice(0, 4)
      .map((e) => `${e.role} @ ${e.company}${e.duration ? ` (${e.duration})` : ""}`)
      .join("; ") || "—";
  return [
    `Name: ${profile.name}`,
    `Target title: ${profile.targetTitle || "—"}`,
    `Headline: ${profile.headline || "—"}`,
    `Summary: ${profile.summary || "—"}`,
    `Skills: ${profile.skills?.join(", ") || "—"}`,
    `Experience: ${exp}`,
    `Years of experience: ${profile.yearsOfExperience ?? "—"}`,
    `Location: ${profile.location || "—"}`,
    `Languages: ${profile.languagesSpoken || "—"}`,
  ].join("\n");
}

const COACH_PREAMBLE = [
  "You are the user's personal profile coach for HUNTFLOW.",
  "Give concrete, actionable advice to strengthen their job-hunt profile.",
  "Ground every recommendation in the profile snapshot below and in the vault / pipeline tools you can call.",
  "Be specific, honest, and encouraging. No fluff.",
].join("\n");

export default function ProfileCoach() {
  const { profile } = useApp();
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<CoachMsg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const liveIndexRef = useRef<number | null>(null);

  const patchLive = (patch: (m: { content: string; steps?: CoachMsg["steps"]; reasoning?: string[] }) => void) => {
    setMessages((prev) => {
      const idx = liveIndexRef.current;
      if (idx === null || idx < 0 || idx >= prev.length || prev[idx].role !== "assistant") return prev;
      const next = prev.slice();
      next[idx] = { ...prev[idx], content: prev[idx].content, steps: prev[idx].steps, reasoning: prev[idx].reasoning };
      patch(next[idx]);
      return next;
    });
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || thinking) return;
    setInput("");
    setStarted(true);
    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    const coach = `${COACH_PREAMBLE}\n\nCURRENT PROFILE:\n${profileSnapshot(profile)}`;

    // Append the user turn and a live assistant bubble in one state update so the
    // assistant index is deterministic (user at `length`, assistant at `length+1`).
    const liveIndex = messages.length + 1;
    liveIndexRef.current = liveIndex;
    setMessages((prev) => [...prev, { role: "user", content }, { role: "assistant", content: "", steps: [], reasoning: [] }]);
    setThinking(true);

    await consumeAssistant(JSON.stringify({ message: `${coach}\n\nUSER QUESTION: ${content}`, history, profile }), {
      onEvent: {
        onReasoning: (note) => patchLive((m) => { m.reasoning = [...(m.reasoning ?? []), note]; }),
        onToolCall: (label, detail) => patchLive((m) => { m.steps = [...(m.steps ?? []), { kind: "tool", label, detail }]; }),
        onToken: (delta) => patchLive((m) => { m.content += delta; }),
        onDone: (result) => {
          setMessages((prev2) => {
            const idx = liveIndexRef.current;
            if (idx === null || idx < 0 || idx >= prev2.length) return prev2;
            const copy = prev2.slice();
            const cur = copy[idx];
            copy[idx] = { ...cur, content: result.reply || cur.content, steps: result.steps && result.steps.length ? result.steps : cur.steps };
            return copy;
          });
          liveIndexRef.current = null;
        },
        onError: (message) => {
          setMessages((prev2) => {
            const idx = liveIndexRef.current;
            if (idx === null || idx < 0 || idx >= prev2.length) return prev2;
            const copy = prev2.slice();
            copy[idx] = { ...copy[idx], content: message || "Something went wrong." };
            return copy;
          });
          liveIndexRef.current = null;
        },
      },
    });

    setThinking(false);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70">
      {/* Header / toggle */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10">
          <Bot className="h-4.5 w-4.5 text-[var(--chartreuse)]" />
        </span>
        <div className="flex-1">
          <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--paper)]">
            Profile Coach
            <Sparkles className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
          </p>
          <p className="text-[11px] text-dim">
            Interviews you about your background, then gives concrete guidelines to strengthen the profile — grounded in your vault and pipeline.
          </p>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-dim transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-[var(--line)]">
          {/* Messages */}
          <div className="max-h-[320px] space-y-3 overflow-y-auto px-5 py-4">
            {messages.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--line)]/50 p-4 text-[11px] leading-relaxed text-dim/70">
                Ask me to review your summary, skills, or experience — I&apos;ll check them against your target role and the
                documents in your vault, then hand back a prioritized improvement list.
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
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10">
                    <Bot className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
                  </div>
                )}
                <div className={cn("max-w-[82%]", m.role === "user" && "order-first")}>
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
                      "rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed",
                      m.role === "user"
                        ? "rounded-br-md bg-[var(--chartreuse)] text-ink"
                        : "rounded-bl-md border border-[var(--line)] bg-white/[0.03] text-[var(--paper)]"
                    )}
                  >
                    {m.role === "assistant" && !m.content ? (
                      <p className="min-w-36 text-xs text-dim">
                        <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin text-[var(--chartreuse)]" />
                        thinking…
                      </p>
                    ) : (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    )}
                  </div>
                </div>
                {m.role === "user" && (
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-white/[0.04]">
                    <User className="h-3.5 w-3.5 text-dim" />
                  </div>
                )}
              </motion.div>
            ))}

            {thinking && (
              <div className="flex gap-3">
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10">
                  <Bot className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-[var(--line)] bg-white/[0.03] px-4 py-2.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--chartreuse)]" />
                  <p className="text-[11px] text-dim">reviewing your profile…</p>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick questions */}
          {!started && (
            <div className="flex flex-wrap gap-2 px-5 pb-3">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="rounded-full border border-[var(--line)] bg-white/[0.02] px-3 py-1.5 text-[11px] text-dim transition-colors hover:border-[var(--chartreuse)]/40 hover:text-[var(--paper)]"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Composer */}
          <div className="border-t border-[var(--line)] px-5 py-3">
            <div className="flex items-end gap-2 rounded-xl border border-[var(--line)] bg-white/[0.03] p-2 focus-within:border-[var(--chartreuse)]/40">
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
                placeholder="Ask about your summary, skills, experience…"
                className="max-h-28 min-h-[38px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] text-[var(--paper)] outline-none placeholder:text-dim/60"
              />
              <button
                onClick={() => send()}
                disabled={thinking || !input.trim()}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--chartreuse)] text-ink transition-all hover:bg-chartreuse-bright disabled:opacity-40 active:scale-95"
                title="Send"
              >
                {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-2 text-[10px] text-dim/70">
              Uses the same orchestrator as the Assistant — it can search your vault, snapshot your pipeline, and remember what it learns.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
