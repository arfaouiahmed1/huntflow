"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
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
  ExternalLink,
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

type Tab = "overview" | "match" | "docs" | "flashcards" | "intel" | "questions" | "agent";

const BG_AGENT_SETTING = "bg_agent_mode";

const TABS: { id: Tab; label: string; icon: typeof Target }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "match", label: "Match & Skills", icon: Target },
  { id: "docs", label: "Documents", icon: FileText },
  { id: "flashcards", label: "STAR Cards", icon: Layers },
  { id: "intel", label: "Intelligence", icon: BrainCircuit },
  { id: "questions", label: "Interview", icon: MessagesSquare },
  { id: "agent", label: "Auto-Apply", icon: Bot },
];

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = params?.id ?? null;
  const router = useRouter();
  const { applications, deleteApplication, updateApplication, dataReady } = useApp();
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

  const job = useMemo(
    () => applications.find((a) => a.id === jobId) || null,
    [applications, jobId]
  );

  if (!job) {
    if (!dataReady) {
      return (
        <div className="space-y-6 animate-pulse">
          <div className="h-8 w-24 rounded-lg bg-white/5" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="h-80 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/40 p-5" />
            <div className="h-96 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/40 p-6" />
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/60 p-16 text-center">
        <p className="text-sm font-semibold text-[var(--paper)]">Job not found</p>
        <p className="mt-1 text-xs text-dim">It may have been removed.</p>
        <Button variant="outline" className="mt-5" onClick={() => router.push("/tracker")}>
          <ArrowLeft className="h-4 w-4" /> Back to tracker
        </Button>
      </div>
    );
  }

  const patchDate = (field: "appliedDate" | "deadline" | "followUpDue") => (value: string) => {
    updateApplication(job.id, { [field]: value || undefined });
    success(
      field === "appliedDate" ? "Applied date saved." : field === "deadline" ? "Deadline saved." : "Follow-up saved."
    );
  };

  const toggleBgAgent = (next: boolean) => {
    setBgAgent(next);
    localStorage.setItem(BG_AGENT_SETTING, next ? "auto" : "manual");
    fetch("/api/data/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [BG_AGENT_SETTING]: next ? "auto" : "manual" }),
    }).catch(() => undefined);
  };

  const logo = logoFailed ? null : companyLogoUrl(job.company, job.url);

  const copyUrl = async () => {
    if (!job.url) return;
    await navigator.clipboard.writeText(job.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const goBack = () => router.back();

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={goBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-dim transition-colors hover:text-[var(--paper)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyUrl} disabled={!job.url}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy URL"}
          </Button>
          {confirmRemove ? (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <button
                onClick={() => {
                  deleteApplication(job.id);
                  goBack();
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
            </span>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[var(--coral)] transition-colors hover:bg-[var(--coral)]/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Meta rail */}
        <aside className="lg:sticky lg:top-6 lg:self-start space-y-4">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
            <div className="flex items-center gap-3">
              {logo ? (
                <img
                  src={logo}
                  alt={`${job.company} logo`}
                  onError={() => setLogoFailed(true)}
                  className="h-14 w-14 shrink-0 rounded-xl border border-[var(--line)] object-cover"
                />
              ) : (
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 font-display text-lg font-bold text-[var(--chartreuse)]">
                  {job.company.charAt(0).toUpperCase() || "?"}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="font-display text-lg font-bold leading-tight text-[var(--paper)]">{job.title}</h1>
                <p className="truncate text-sm text-dim">{job.company}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-dim">
              {job.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {job.location}
                </span>
              )}
              {job.salary && (
                <span className="inline-flex items-center gap-1.5 font-mono">
                  <Target className="h-3.5 w-3.5" /> {job.salary}
                </span>
              )}
            </div>

            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-white/[0.02] px-3 py-2 text-xs font-semibold text-[var(--chartreuse)] transition-colors hover:border-[var(--chartreuse)]/40 hover:bg-[var(--chartreuse)]/5"
              >
                <ExternalLink className="h-3.5 w-3.5" /> View posting
              </a>
            )}

            <div className="mt-4 flex items-center gap-3">
              <StatusSelect
                status={job.status}
                onChange={(s) => {
                  updateApplication(job.id, { status: s });
                  success(`Moved to ${statusConfig[s].label}.`);
                }}
              />
              {typeof job.matchScore === "number" && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 font-mono text-xs font-bold"
                  style={{ color: scoreColor(job.matchScore) }}
                >
                  {job.matchScore}% match
                </span>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5 space-y-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Timeline</h2>
            {(
              [
                ["appliedDate", "Applied", job.appliedDate],
                ["deadline", "Deadline", job.deadline],
                ["followUpDue", "Follow-up", job.followUpDue],
              ] as const
            ).map(([field, label, value]) => (
              <div key={field}>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">{label}</span>
                <DateField value={value ?? ""} onChange={patchDate(field)} />
              </div>
            ))}
          </div>

          {/* Priority + notes */}
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5 space-y-3">
            <div>
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Priority</span>
              <Select
                ariaLabel="Priority"
                value={job.priority ?? "medium"}
                onChange={(p: JobApplication["priority"]) => updateApplication(job.id, { priority: p })}
                options={[
                  { value: "high", label: "High priority", dot: "var(--coral)" },
                  { value: "medium", label: "Medium priority", dot: "var(--amber)" },
                  { value: "low", label: "Low priority", dot: "var(--sky)" },
                ]}
              />
            </div>
            <div>
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Notes</span>
              <textarea
                rows={3}
                placeholder="Notes…"
                value={notesDraft ?? job.notes ?? ""}
                onChange={(e) => setNotesDraft(e.target.value)}
                onBlur={() => {
                  if (notesDraft !== null && notesDraft !== (job.notes ?? "")) {
                    updateApplication(job.id, { notes: notesDraft });
                  }
                }}
                className="w-full resize-none rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5 text-xs text-paper outline-none transition-colors placeholder:text-dim/70 focus:border-chartreuse/50"
              />
            </div>
          </div>

          {/* Background-agent mode toggle */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 px-4 py-3">
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
        </aside>

        {/* Analysis */}
        <section>
          <div className="flex gap-1 overflow-x-auto border-b border-[var(--line)] pb-1">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={cn(
                    "relative flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors",
                    active
                      ? "border-[var(--chartreuse)] text-[var(--chartreuse)]"
                      : "border-transparent text-dim hover:text-[var(--paper)]"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            {tab === "overview" && <OverviewPanel job={job} />}
            {tab === "match" && <MatchAnalysis job={job} />}
            {tab === "docs" && <DocumentsPanel job={job} />}
            {tab === "flashcards" && <FlashcardsPanel job={job} />}
            {tab === "intel" && <IntelligencePanel job={job} />}
            {tab === "questions" && <InterviewQuestionsPanel job={job} />}
            {tab === "agent" && <AutoApplyPanel job={job} />}
          </div>
        </section>
      </div>
    </div>
  );
}