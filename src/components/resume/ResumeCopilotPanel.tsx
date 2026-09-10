"use client";

/**
 * AI Resume Copilot chat panel: status row, context inspector, quick
 * prompts, streamed message log (reasoning / tool activity / evidence),
 * and the input bar. Presentational — the Studio page owns sending.
 */

import type { FormEvent, RefObject } from "react";
import { AlertTriangle, Archive, Bot, Check, Code2, Cpu, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export interface ChatToolActivity {
  tool: string;
  detail: string;
  status: "ok" | "partial" | "error";
}

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  actionSummary?: string;
  timestamp: string;
  /** Live-streamed reply still arriving. */
  streaming?: boolean;
  /** Concise server-produced working notes (never raw CoT). */
  reasoning?: string[];
  /** Visible tool activity for this turn. */
  tools?: ChatToolActivity[];
  /** Vault evidence citations. */
  cites?: { doc: string; chunk: number }[];
  /** Turn-level error (stream or request failure). */
  error?: string;
}

const QUICK_PROMPTS = [
  { label: "ATS keyword polish", prompt: "Analyze this resume against modern ATS algorithms and optimize keyword density without keyword stuffing." },
  { label: "Quantify achievements", prompt: "Rewrite work experience bullets using the Google XYZ formula (Accomplished [X], measured by [Y], by doing [Z])." },
  { label: "Cut to exact 1-page", prompt: "Tighten spacing and condense bullet points so this resume fits perfectly on a single page." },
  { label: "Ingest vault evidence", prompt: "Scan my Profile Vault and pull in verified technical project metrics and production achievements." },
  { label: "DACH CV style", prompt: "Format this into a German Tabellarischer Lebenslauf structure." },
];

interface ResumeCopilotPanelProps {
  messages: ChatMessage[];
  messagesEndRef: RefObject<HTMLDivElement | null>;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  busy: boolean;
  contextLine: { templateId: string; docKind: string; roles: number; skills: number; target: string | null };
  input: string;
  onInputChange: (next: string) => void;
  onSubmit: () => void;
  onQuickPrompt: (prompt: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

export default function ResumeCopilotPanel({
  messages,
  messagesEndRef,
  inspectorOpen,
  onToggleInspector,
  busy,
  contextLine,
  input,
  onInputChange,
  onSubmit,
  onQuickPrompt,
  inputRef,
}: ResumeCopilotPanelProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <div role="tabpanel" id="refine-panel-chat" aria-labelledby="refine-tab-chat" className="flex min-h-0 flex-1 flex-col">
      {/* Copilot status row */}
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--ink-soft)]/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="relative grid h-7 w-7 place-items-center rounded-lg border border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10">
            <Bot className="h-3.5 w-3.5 text-[var(--chartreuse)]" aria-hidden />
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--chartreuse)]" aria-hidden />
          </div>
          <div>
            <p className="font-display text-xs font-bold text-[var(--paper)]">AI Resume Copilot</p>
            <p className="flex items-center gap-1 text-[10px] text-dim">
              <Archive className="h-2.5 w-2.5 text-[var(--chartreuse)]" aria-hidden /> Vault RAG connected
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleInspector}
            aria-expanded={inspectorOpen}
            aria-label="Toggle context inspector"
            title="Toggle context inspector"
            className={cn(
              "grid h-11 w-11 place-items-center rounded-lg border text-xs transition-colors",
              inspectorOpen
                ? "border-[var(--chartreuse)] bg-[var(--chartreuse)]/15 text-[var(--chartreuse)]"
                : "border-[var(--line)] text-dim hover:text-[var(--paper)] hover:bg-white/[0.04]"
            )}
          >
            <Code2 className="h-3.5 w-3.5" aria-hidden />
          </button>
          {busy && (
            <span role="status" className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--chartreuse)] animate-pulse">
              <Sparkles className="h-3 w-3" aria-hidden /> Optimizing…
            </span>
          )}
        </div>
      </div>

      {/* Real-time Prompt Inspector Panel */}
      {inspectorOpen && (
        <div className="border-b border-[var(--line)] bg-black/60 p-3 text-[11px] font-mono text-dim space-y-1.5 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between text-[var(--chartreuse)]">
            <span className="font-bold flex items-center gap-1"><Cpu className="h-3 w-3" /> Context Inspector</span>
            <span>live session</span>
          </div>
          <p className="text-white/80">Copilot: HUNTFLOW Elite Resume Strategist, grounded in your vault.</p>
          <p className="text-white/60">Template: {contextLine.templateId} | Mode: {contextLine.docKind} | Engine: LaTeX PDF</p>
          <p className="text-white/40 truncate">Active context: {contextLine.roles} roles, {contextLine.skills} skills{contextLine.target ? ` · target: ${contextLine.target}` : ""}</p>
          <p className="text-white/40">Sampling parameters live server-side; nothing is hidden here.</p>
        </div>
      )}

      {/* Quick Prompts Chips */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-[var(--line)] p-2.5 bg-black/20 no-scrollbar">
        {QUICK_PROMPTS.map((qp, idx) => (
          <button
            key={idx}
            disabled={busy}
            onClick={() => onQuickPrompt(qp.prompt)}
            className="shrink-0 rounded-full border border-[var(--line)] bg-white/[0.03] px-3 py-1 text-[10px] font-semibold tracking-tight text-[var(--paper)] transition-all hover:border-[var(--chartreuse)]/40 hover:bg-[var(--chartreuse)]/10 hover:text-[var(--chartreuse)] active:scale-[0.98] disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Chat Messages */}
      <div role="log" aria-label="Copilot conversation" className="max-h-[50vh] min-h-0 flex-1 space-y-4 overflow-y-auto p-4 lg:max-h-none">
        {messages.map((msg) => {
          const isAssistant = msg.sender === "assistant";
          return (
            <div
              key={msg.id}
              className={cn("flex flex-col space-y-1", isAssistant ? "items-start" : "items-end")}
            >
              <div
                className={cn(
                  "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm",
                  isAssistant
                    ? "border border-[var(--line)] bg-white/[0.04] text-[var(--paper)] backdrop-blur"
                    : "bg-[var(--chartreuse)] text-neutral-950 font-medium shadow-[0_4px_16px_rgba(185,237,87,0.22)]"
                )}
              >
                <div className="whitespace-pre-wrap">
                  {msg.text}
                  {msg.streaming && <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-[var(--chartreuse)]" aria-hidden />}
                </div>

                {isAssistant && msg.reasoning && msg.reasoning.length > 0 && (
                  <details className="mt-2 rounded-xl border border-[var(--line)] bg-black/30 px-2.5 py-1.5">
                    <summary className="cursor-pointer font-mono text-[10px] font-semibold text-dim hover:text-[var(--paper)]">
                      Working · {msg.reasoning.length} step{msg.reasoning.length === 1 ? "" : "s"}
                    </summary>
                    <ul className="mt-1 space-y-0.5 font-mono text-[10px] leading-relaxed text-dim">
                      {msg.reasoning.map((note, i) => (
                        <li key={i}>· {note}</li>
                      ))}
                    </ul>
                  </details>
                )}

                {isAssistant && msg.tools && msg.tools.length > 0 && (
                  <ul className="mt-2 space-y-1" aria-label="Tool activity">
                    {msg.tools.map((t, i) => (
                      <li
                        key={i}
                        className={cn(
                          "flex items-center gap-1.5 rounded-xl border px-2.5 py-1 font-mono text-[10px] font-semibold",
                          t.status === "error"
                            ? "border-red-400/25 bg-red-400/10 text-red-200"
                            : t.status === "partial"
                              ? "border-amber-300/25 bg-amber-400/10 text-amber-200"
                              : "border-[var(--chartreuse)]/25 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                        )}
                      >
                        {t.status === "error" ? (
                          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                        ) : (
                          <Check className="h-3 w-3 shrink-0" aria-hidden />
                        )}
                        <span>
                          {t.tool}: {t.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {isAssistant && msg.cites && msg.cites.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Evidence">
                    {msg.cites.map((c, i) => (
                      <span
                        key={i}
                        title="Vault evidence backing this reply"
                        className="rounded-full border border-[var(--sky)]/25 bg-[var(--sky)]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--sky)]"
                      >
                        {c.doc}#{c.chunk}
                      </span>
                    ))}
                  </div>
                )}

                {msg.error && (
                  <div role="alert" className="mt-2 rounded-xl border border-red-400/25 bg-red-400/10 px-2.5 py-1 text-[11px] text-red-200">
                    {msg.error}
                  </div>
                )}

                {msg.actionSummary && (
                  <div className="mt-2.5 flex items-center gap-1.5 rounded-xl border border-[var(--chartreuse)]/25 bg-[var(--chartreuse)]/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-[var(--chartreuse)]">
                    <Check className="h-3 w-3" /> {msg.actionSummary}
                  </div>
                )}
              </div>
              <span className="text-[10px] font-medium tracking-tight text-dim/70 px-1">{msg.timestamp}</span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input Bar */}
      <div className="border-t border-[var(--line)] p-3 bg-[var(--ink-soft)]/50 backdrop-blur">
        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            disabled={busy}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Ask AI Copilot to rewrite, enhance metrics, or optimize..."
            aria-label="Ask the AI Copilot to rewrite, enhance metrics, or optimize"
            className="flex min-h-[44px] flex-1 rounded-xl border border-[var(--line)] bg-white/[0.04] px-3.5 py-2 text-xs text-[var(--paper)] outline-none transition-all placeholder:text-dim focus:border-[var(--chartreuse)]/50 focus:bg-white/[0.06]"
          />
          <Button type="submit" size="sm" disabled={!input.trim() || busy} loading={busy} aria-label="Send message" className="min-h-[44px] shadow-[var(--glow)]">
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
