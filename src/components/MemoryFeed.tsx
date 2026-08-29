"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, Plus, Trash2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toaster";
import { toErrorMessage } from "@/lib/errors";

export interface MemoryFeedItem {
  id: number;
  kind: "note" | "insight" | "fact" | "decision" | "outcome";
  content: string;
  jobId?: string;
  source: string;
  importance: number;
  createdAt?: string;
}

const KIND_STYLE: Record<MemoryFeedItem["kind"], string> = {
  note: "border-[var(--line)] text-dim",
  insight: "border-[var(--sky)]/40 bg-[var(--sky)]/10 text-[var(--sky)]",
  fact: "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]",
  decision: "border-[var(--amber)]/40 bg-[var(--amber)]/10 text-[var(--amber)]",
  outcome: "border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)]",
};

export default function MemoryFeed({ limit = 12 }: { limit?: number }) {
  const { error: toastError } = useToast();
  const [items, setItems] = useState<MemoryFeedItem[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/memory?limit=${limit}`);
      const data = await res.json();
      if (res.ok) setItems(data.memory ?? []);
      else toastError(data?.error || `Memory ${res.status}`);
    } catch (err) {
      toastError(`Memory unavailable: ${toErrorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  }, [limit, toastError]);

  useEffect(() => {
    let ignore = false;
    fetch(`/api/memory?limit=${limit}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!ignore && data) {
          setItems(data.memory ?? []);
        }
      })
      .catch((err) => {
        if (!ignore) toastError(`Memory unavailable: ${toErrorMessage(err)}`);
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [limit, toastError]);

  const add = async () => {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, source: "manual" }),
      });
      if (!res.ok) throw new Error("save failed");
      setDraft("");
      setNote("Noted — agents will see this in shared context.");
      await load();
    } catch (err) {
      setNote("Could not save the note.");
      toastError(`Save failed: ${toErrorMessage(err)}`);
    } finally {
      setBusy(false);
      setTimeout(() => setNote(""), 4000);
    }
  };

  const remove = async (id: number) => {
    try {
      const res = await fetch(`/api/memory?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string })?.error || `Delete ${res.status}`);
      }
    } catch (err) {
      toastError(`Failed to delete memory: ${toErrorMessage(err)}`);
    }
    load();
  };

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">
          <Brain className="h-4 w-4 text-[var(--chartreuse)]" /> Shared Memory
        </p>
        <span className="text-[10px] text-dim">agents read this on every run</span>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Remember something for the agents…"
          className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-white/[0.02] px-3 py-2 text-xs text-[var(--paper)] outline-none placeholder:text-dim/60 focus:border-[var(--chartreuse)]/50"
        />
        <button
          onClick={add}
          disabled={busy || !draft.trim()}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)] transition-colors hover:bg-[var(--chartreuse)]/20 disabled:opacity-40"
          title="Save note"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {note && <p className="mt-1.5 text-[10px] text-[var(--chartreuse)]">{note}</p>}

      <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {loading && (
          <div className="space-y-1.5">
            <div className="skeleton h-9 rounded-xl" />
            <div className="skeleton h-9 rounded-xl" />
            <div className="skeleton h-9 rounded-xl" />
          </div>
        )}
        {!loading && items.length === 0 && (
          <p className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--line)] p-3 text-[10px] text-dim">
            <Sparkles className="h-3.5 w-3.5" /> Nothing remembered yet — apply runs, LinkedIn imports, and manual notes land here.
          </p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="group flex items-start gap-2 rounded-xl border border-[var(--line)]/60 bg-white/[0.02] px-3 py-2"
          >
            <span className={cn("mt-0.5 shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider", KIND_STYLE[item.kind])}>
              {item.kind}
            </span>
            <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-[var(--paper)]/90">
              {item.content}
              <span className="mt-0.5 block text-[9px] text-dim/70">
                {item.source} · {item.createdAt?.slice(0, 10) ?? ""}
                {item.importance > 0 && <span className="ml-1 text-[var(--amber)]">{"★".repeat(Math.min(item.importance, 3))}</span>}
              </span>
            </p>
            <button
              onClick={() => remove(item.id)}
              className="invisible shrink-0 text-dim opacity-0 transition-opacity hover:text-[var(--coral)] group-hover:visible group-hover:opacity-100"
              title="Forget"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
