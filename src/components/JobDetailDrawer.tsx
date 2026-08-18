"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Target,
  FileText,
  Layers,
  Bot,
  BrainCircuit,
  MessagesSquare,
  MapPin,
  Link2,
  Check,
  Copy,
  Trash2,
  LayoutDashboard,
  Cpu,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { JobApplication } from "@/types";
import { companyLogoUrl } from "@/lib/companyLogo";
import StatusSelect from "@/components/ui/StatusSelect";
import { statusConfig } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import DateField from "@/components/ui/DateField";
import Select from "@/components/ui/Select";
import { scoreColor, cn } from "@/lib/utils";
import MatchAnalysis from "@/components/match/MatchAnalysis";
import DocumentsPanel from "@/components/documents/DocumentsPanel";
import FlashcardsPanel from "@/components/flashcards/FlashcardsPanel";
import AutoApplyPanel from "@/components/agent/AutoApplyPanel";
import IntelligencePanel from "@/components/intel/IntelligencePanel";
import InterviewQuestionsPanel from "@/components/intel/InterviewQuestionsPanel";
import OverviewPanel from "@/components/overview/OverviewPanel";

type Tab = "match" | "docs" | "flashcards" | "intel" | "questions" | "agent" | "overview";

const BG_AGENT_SETTING = "bg_agent_mode";

export default function JobDetailDrawer({
  jobId,
  onClose,
}: {
  jobId: string | null;
  onClose: () => void;
}) {
  const { applications, deleteApplication, updateApplication } = useApp();
  const { success } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [copied, setCopied] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [bgAgent, setBgAgent] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(BG_AGENT_SETTING) !== "manual";
  });

  /* Hydrate the persisted background-agent mode on mount, then keep it synced. */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/data", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.settings) return;
        const stored = d.settings[BG_AGENT_SETTING];
        if (stored === undefined) return;
        const next = stored !== "manual";
        localStorage.setItem(BG_AGENT_SETTING, next ? "auto" : "manual");
        setBgAgent(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleBgAgent = (next: boolean) => {
    setBgAgent(next);
    localStorage.setItem(BG_AGENT_SETTING, next ? "auto" : "manual");
    fetch("/api/data/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [BG_AGENT_SETTING]: next ? "auto" : "manual" }),
    }).catch(() => undefined);
  };

  const job = useMemo(
    () => applications.find((a) => a.id === jobId) || null,
    [applications, jobId]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (jobId) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [jobId, onClose]);

  if (!job) return null;

  const patchDate = (field: "appliedDate" | "deadline" | "followUpDue") => (value: string) => {
    updateApplication(job.id, { [field]: value || undefined });
    success(field === "appliedDate" ? "Applied date saved." : field === "deadline" ? "Deadline saved." : "Follow-up saved.");
  };

  const logo = logoFailed ? null : companyLogoUrl(job.company, job.url);

  const tabs: { id: Tab; label: string; icon: typeof Target }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "match", label: "Match & Skills", icon: Target },
    { id: "docs", label: "Documents", icon: FileText },
    { id: "flashcards", label: "STAR Cards", icon: Layers },
    { id: "intel", label: "Intelligence", icon: BrainCircuit },
    { id: "questions", label: "Interview", icon: MessagesSquare },
    { id: "agent", label: "Auto-Apply", icon: Bot },
  ];

  const copyUrl = async () => {
    if (!job.url) return;
    await navigator.clipboard.writeText(job.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-[560px] flex-col border-l border-[var(--line)] bg-[var(--ink-soft)] shadow-2xl"
      >
        {/* Header */}
        <div className="border-b border-[var(--line)] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {logo ? (
                <img
                  src={logo}
                  alt={`${job.company} logo`}
                  onError={() => setLogoFailed(true)}
                  className="h-12 w-12 shrink-0 rounded-xl border border-[var(--line)] object-cover"
                />
              ) : (
                <div className="grid h-12 w-12 place-items-center rounded-xl border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 font-display text-base font-bold text-[var(--chartreuse)]">
                  {job.company.charAt(0).toUpperCase() || "?"}
                </div>
              )}
              <div>
                <h2 className="font-display text-base font-semibold text-[var(--paper)]">{job.title}</h2>
                <p className="text-sm text-dim">{job.company}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close drawer"
              className="grid h-9 w-9 place-items-center rounded-lg text-dim transition-colors hover:bg-white/5 hover:text-[var(--paper)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-dim">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> {job.location}
            </span>
            {job.salary && (
              <span className="inline-flex items-center gap-1.5 font-mono">
                <Target className="h-3.5 w-3.5" /> {job.salary}
              </span>
            )}
            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[var(--chartreuse)] hover:underline"
              >
                <Link2 className="h-3.5 w-3.5" /> View posting
              </a>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <StatusSelect
              status={job.status}
              onChange={(s) => {
                updateApplication(job.id, { status: s });
                success(`Moved to ${statusConfig[s].label}.`);
              }}
            />
            {typeof job.matchScore === "number" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 font-mono text-xs font-bold" style={{ color: scoreColor(job.matchScore) }}>
                {job.matchScore}% match
              </span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {(
              [
                ["appliedDate", "Applied", job.appliedDate],
                ["deadline", "Deadline", job.deadline],
                ["followUpDue", "Follow-up", job.followUpDue],
              ] as const
            ).map(([field, label, value]) => (
              <label key={field} className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">
                  {label}
                </span>
                <DateField value={value ?? ""} onChange={patchDate(field)} />
              </label>
            ))}
          </div>

          <div className="mt-3 flex items-start gap-2">
            <Select
              ariaLabel="Priority"
              value={job.priority ?? "medium"}
              onChange={(p) => updateApplication(job.id, { priority: p })}
              className="w-32 shrink-0"
              options={[
                { value: "high", label: "High priority", dot: "var(--coral)" },
                { value: "medium", label: "Medium priority", dot: "var(--amber)" },
                { value: "low", label: "Low priority", dot: "var(--sky)" },
              ]}
            />
            <textarea
              rows={2}
              placeholder="Notes…"
              value={notesDraft ?? job.notes ?? ""}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={() => {
                if (notesDraft !== null && notesDraft !== (job.notes ?? "")) {
                  updateApplication(job.id, { notes: notesDraft });
                }
              }}
              className="flex-1 resize-none rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5 text-xs text-paper outline-none transition-colors placeholder:text-dim/70 focus:border-chartreuse/50"
            />
          </div>
        </div>

        {/* Background-agent mode toggle */}
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white/[0.02] px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Cpu className="h-4 w-4 shrink-0 text-[var(--chartreuse)]" />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[var(--paper)]">Background agents</p>
              <p className="truncate text-[10px] text-dim">
                {bgAgent ? "Run automatically in the background" : "Run only when you ask"}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={bgAgent}
            aria-label="Background agent mode"
            onClick={() => toggleBgAgent(!bgAgent)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors focus:outline-none",
              bgAgent ? "bg-[var(--chartreuse)]" : "bg-white/15"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-5 w-5 rounded-full bg-[var(--paper)] shadow-sm transition-transform duration-200 ease-in-out",
                bgAgent ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-[var(--line)] px-4 py-2">
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                  active ? "text-[var(--chartreuse)]" : "text-dim hover:text-[var(--paper)]"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="drawer-tab-pill"
                    className="absolute inset-0 rounded-lg bg-[var(--chartreuse)]/10 ring-1 ring-[var(--chartreuse)]/20"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon className="relative h-3.5 w-3.5" /> <span className="relative">{label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {tab === "overview" && <OverviewPanel job={job} />}
              {tab === "match" && <MatchAnalysis job={job} />}
              {tab === "docs" && <DocumentsPanel job={job} />}
              {tab === "flashcards" && <FlashcardsPanel job={job} />}
              {tab === "intel" && <IntelligencePanel job={job} />}
              {tab === "questions" && <InterviewQuestionsPanel job={job} />}
              {tab === "agent" && <AutoApplyPanel job={job} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--line)] px-6 py-4">
          {confirmRemove ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-dim">Remove this application?</span>
              <button
                onClick={() => {
                  deleteApplication(job.id);
                  onClose();
                }}
                className="rounded-lg bg-[var(--coral)]/15 px-2.5 py-1.5 font-semibold text-[var(--coral)] transition-colors hover:bg-[var(--coral)]/25"
              >
                Yes, remove
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                className="rounded-lg px-2.5 py-1.5 text-dim transition-colors hover:text-[var(--paper)]"
              >
                Keep it
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--coral)] transition-colors hover:opacity-80"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          )}
          <Button variant="outline" size="sm" onClick={copyUrl} disabled={!job.url}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy URL"}
          </Button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
