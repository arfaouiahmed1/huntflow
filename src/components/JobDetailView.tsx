"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Layers, Bot, MessagesSquare, Check, Copy, Trash2, LayoutDashboard, ArrowLeft, ShieldCheck, ChevronRight, CalendarDays, Tag, Award, ImageIcon, History, AlertTriangle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { JobApplication } from "@/types";
import { agentScreenshotUrl } from "@/lib/agentScreenshot";
import StatusSelect from "@/components/ui/StatusSelect";
import { statusConfig } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import DateField from "@/components/ui/DateField";
import Select from "@/components/ui/Select";
import { scoreColor, cn } from "@/lib/utils";
import LazyReveal from "@/components/detail/LazyReveal";
import JobDetailHeader from "@/components/detail/JobDetailHeader";
import JobDetailOverview from "@/components/detail/JobDetailOverview";
import JobDetailSkillsPanel from "@/components/detail/JobDetailSkillsPanel";
import AgentOutputsDashboard from "@/components/agent/AgentOutputsDashboard";
const MatchAnalysis = dynamic(() => import("@/components/match/MatchAnalysis"), { ssr: false, loading: () => <SectionPlaceholder label="Loading match analysis…" /> });
const DocumentsPanel = dynamic(() => import("@/components/documents/DocumentsPanel"), { ssr: false, loading: () => <SectionPlaceholder label="Loading documents…" /> });
const FlashcardsPanel = dynamic(() => import("@/components/flashcards/FlashcardsPanel"), { ssr: false, loading: () => <SectionPlaceholder label="Loading STAR cards…" /> });
const IntelligenceQuestionsPanel = dynamic(() => import("@/components/intel/InterviewQuestionsPanel"), { ssr: false, loading: () => <SectionPlaceholder label="Loading interview prep…" /> });
const JobDetailAgentRun = dynamic(() => import("@/components/detail/JobDetailAgentRun"), { ssr: false, loading: () => <SectionPlaceholder label="Loading agent…" /> });

function SectionPlaceholder({ label }: { label: string }) {
  return <div className="grid min-h-[180px] place-items-center rounded-2xl border border-dashed border-[var(--line)] text-xs text-dim">{label}</div>;
}

export type JobDetailTab = "overview" | "docs" | "flashcards" | "questions" | "agent";
export interface JobDetailViewProps { job: JobApplication; mode?: "drawer" | "page"; initialTab?: JobDetailTab; onTabChange?: (tab: JobDetailTab) => void; onClose?: () => void; onDelete?: () => void; headerActions?: React.ReactNode; className?: string; }
export const JOB_DETAIL_TABS: { id: JobDetailTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "docs", label: "Documents", icon: FileText },
  { id: "flashcards", label: "STAR Cards", icon: Layers },
  { id: "questions", label: "Interview", icon: MessagesSquare },
  { id: "agent", label: "Auto-Apply", icon: Bot },
];

function noteValue(notes: string | undefined, prefix: string): string | null {
  const segment = (notes || "").split(/\s*·\s*/).find((part) => part.toLowerCase().startsWith(prefix.toLowerCase()));
  return segment ? segment.slice(prefix.length).trim() || null : null;
}
function postingHost(url: string | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./i, ""); } catch { return null; }
}
function inferredAts(url: string | undefined): string | null {
  const host = postingHost(url); if (!host) return null;
  if (host.includes("greenhouse")) return "Greenhouse"; if (host.includes("lever")) return "Lever";
  if (host.includes("ashby")) return "Ashby"; if (host.includes("workday")) return "Workday"; return null;
}
function KeyFact({ label, children, tone = "default" }: { label: string; children: React.ReactNode; tone?: "default" | "accent" }) {
  return (
    <div className={cn("rounded-xl border p-3", tone === "accent" ? "border-[var(--amber)]/15 bg-[var(--amber)]/[0.025]" : "border-[var(--line)] bg-[var(--ink-card)]/[0.4]")}>
      <p className={cn("text-[10px] font-bold uppercase tracking-[0.14em]", tone === "accent" ? "text-[var(--amber)]" : "text-dim")}>{label}</p>
      <div className="mt-1 text-xs font-semibold text-[var(--paper)]">{children}</div>
    </div>
  );
}

export default function JobDetailView({ job, mode = "page", initialTab = "overview", onTabChange, onClose, onDelete, headerActions, className }: JobDetailViewProps) {
  const { deleteApplication, updateApplication } = useApp();
  const { success, error } = useToast();
  const [tab, setTab] = useState<JobDetailTab>(initialTab);
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);

  const nextNote = noteValue(job.notes, "Next:");
  const applicationChannel = noteValue(job.notes, "Channel:");
  const atsKeywords = (noteValue(job.notes, "ATS keywords:") || "").split(",").map((k) => k.trim()).filter(Boolean);
  const sourceHost = postingHost(job.url);
  const atsSystem = inferredAts(job.url);

  const handleTabSelect = (selectedTab: JobDetailTab) => { setTab(selectedTab); onTabChange?.(selectedTab); };
  const patchDate = (field: "appliedDate" | "deadline" | "followUpDue") => (value: string) => {
    updateApplication(job.id, { [field]: value || undefined });
    success(field === "appliedDate" ? "Applied date saved." : field === "deadline" ? "Deadline saved." : "Follow-up saved.");
  };
  const copyUrl = async () => {
    if (!job.url) return;
    try { await navigator.clipboard.writeText(job.url); setCopied(true); success("Link copied to clipboard."); setTimeout(() => setCopied(false), 1500); }
    catch (err) { error(err instanceof Error ? err.message : "Clipboard copy failed."); }
  };
  const handleDeleteApplication = () => { deleteApplication(job.id); success(`Removed "${job.title}" from pipeline.`); onDelete?.(); };

  const renderSubpanel = () => {
    switch (tab) {
      case "overview":
        return (
          <div className="space-y-8">
            <section aria-label="Match and skills">
              <LazyReveal minHeight={280}><MatchAnalysis job={job} /></LazyReveal>
            </section>
            <LazyReveal minHeight={260}><JobDetailOverview job={job} /></LazyReveal>
            <LazyReveal minHeight={220}><JobDetailSkillsPanel skillsGap={job.skillsGap} /></LazyReveal>
            <LazyReveal minHeight={320}><AgentOutputsDashboard job={job} /></LazyReveal>
          </div>
        );
      case "docs":
        return <LazyReveal minHeight={260}><DocumentsPanel job={job} /></LazyReveal>;
      case "flashcards":
        return <LazyReveal minHeight={260}><FlashcardsPanel job={job} /></LazyReveal>;
      case "questions":
        return <LazyReveal minHeight={280}><IntelligenceQuestionsPanel job={job} /></LazyReveal>;
      case "agent":
        return <LazyReveal minHeight={360}><JobDetailAgentRun job={job} /></LazyReveal>;
      default:
        return (
          <div className="space-y-8">
            <LazyReveal minHeight={280}><MatchAnalysis job={job} /></LazyReveal>
            <LazyReveal minHeight={260}><JobDetailOverview job={job} /></LazyReveal>
          </div>
        );
    }
  };

  if (mode === "drawer") {
    return (
      <div className={cn("flex h-full flex-col overflow-hidden", className)}>
        <JobDetailHeader job={job} mode="drawer" onClose={onClose} headerActions={headerActions} />
        <div className="border-b border-[var(--line)] px-6 py-4 shrink-0 space-y-3">
          <div className="flex items-center gap-3">
            <StatusSelect status={job.status} onChange={(s) => { updateApplication(job.id, { status: s }); success(`Moved to ${statusConfig[s].label}.`); }} />
            {typeof job.matchScore === "number" && <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 font-mono text-xs font-bold" style={{ color: scoreColor(job.matchScore) }}>{job.matchScore}% match</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                ["appliedDate", "Applied", job.appliedDate],
                ["deadline", "Deadline", job.deadline],
                ["followUpDue", "Follow-up", job.followUpDue],
              ] as const
            ).map(([field, label, value]) => (
              <label key={field} className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">{label}</span>
                <DateField value={value ?? ""} onChange={patchDate(field)} />
              </label>
            ))}
          </div>
          <div className="flex items-start gap-2">
            <Select ariaLabel="Priority" value={job.priority ?? "medium"} onChange={(p) => updateApplication(job.id, { priority: p })} className="w-32 shrink-0" options={[{ value: "high", label: "High priority", dot: "var(--coral)" }, { value: "medium", label: "Medium priority", dot: "var(--amber)" }, { value: "low", label: "Low priority", dot: "var(--sky)" }]} />
            <textarea rows={2} placeholder="Notes…" value={notesDraft ?? job.notes ?? ""} onChange={(e) => setNotesDraft(e.target.value)} onBlur={() => { if (notesDraft !== null && notesDraft !== (job.notes ?? "")) updateApplication(job.id, { notes: notesDraft }); }} className="flex-1 resize-none rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5 text-xs text-paper outline-none placeholder:text-dim/70 focus:border-chartreuse/50" />
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/[0.04] px-3 py-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--chartreuse)]" />
            <div><p className="text-xs font-semibold text-[var(--paper)]">Supervised application agent</p><p className="mt-0.5 text-[10px] leading-relaxed text-dim">You review the field plan and evidence before any submission.</p></div>
          </div>
          {(() => {
            const screenshot = agentScreenshotUrl(job.screenshotUrl, job.cloudinaryUrl);
            const verdict = job.employerReview?.verdict;
            const verdictTone = verdict === "interview_likely" ? "border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]" : verdict === "possible_callback" ? "border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]" : verdict === "likely_reject" ? "border-[var(--coral)]/30 bg-[var(--coral)]/10 text-[var(--coral)]" : "border-[var(--line)] bg-white/[0.03] text-dim";
            const fit = job.fitCategory;
            return (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-deep)]/[0.05] p-4">
                <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-dim"><ShieldCheck className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> Enriched intelligence</p>
                <div className="flex flex-wrap gap-1.5">
                  {verdict ? (
                    <span data-testid="employer-verdict" className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold", verdictTone)}><Award className="h-3 w-3" /> {verdict.replace(/_/g, " ")} {typeof job.employerReview?.acceptanceProbability === "number" && <span className="font-mono">· {job.employerReview?.acceptanceProbability}%</span>}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.03] px-2.5 py-1 text-[11px] text-dim"><Award className="h-3 w-3" /> no employer verdict</span>
                  )}
                  {fit ? (
                    <span data-testid="fit-category" className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold", fit === "direct_fit" ? "border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]" : "border-[var(--violet)]/30 bg-[var(--violet)]/10 text-[var(--violet)]")}><Tag className="h-3 w-3" /> {fit.replace(/_/g, " ")}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.03] px-2.5 py-1 text-[11px] text-dim"><Tag className="h-3 w-3" /> fit unclassified</span>
                  )}
                  {job.skipReason && <span data-testid="skip-reason" className="inline-flex items-center gap-1.5 rounded-full border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-2.5 py-1 text-[11px] font-bold text-[var(--coral)]"><AlertTriangle className="h-3 w-3" /> skip: {job.skipReason.replace(/_/g, " ")}</span>}
                </div>
                <div className="mt-3">
                  {screenshot ? (
                    <div data-testid="screenshot-proof" className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--ink-deep)]/[0.06]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={screenshot} alt="Listing proof" className="max-h-40 w-full object-cover object-top" />
                      <div className="flex items-center justify-between border-t border-[var(--line)] px-3 py-1.5">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-dim"><ImageIcon className="h-3 w-3 text-[var(--chartreuse)]" /> Visual Proof {job.cloudinaryUrl && <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--chartreuse)]" />}</span>
                        {job.url && <a href={job.url} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-[var(--sky)] hover:underline">Open original →</a>}
                      </div>
                    </div>
                  ) : (
                    <div data-testid="screenshot-proof-missing" className="rounded-xl border border-dashed border-[var(--line)] bg-white/[0.02] p-3 text-center"><p className="inline-flex items-center justify-center gap-1.5 text-[11px] text-dim"><ImageIcon className="h-3.5 w-3.5" /> No screenshot proof captured</p></div>
                  )}
                </div>
                <div data-testid="multi-agent-outputs" className="mt-3 rounded-xl border border-[var(--line)] bg-white/[0.03] p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-dim"><Bot className="h-3 w-3 text-[var(--sky)]" /> Multi-agent chips</p>
                  {job.multiAgentOutputs && Object.keys(job.multiAgentOutputs).length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {typeof job.multiAgentOutputs.atsScore === "number" && <span className="rounded-full border border-[var(--violet)]/30 bg-[var(--violet)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--violet)]">ATS {job.multiAgentOutputs.atsScore}</span>}
                      {job.multiAgentOutputs.recommendedTemplate && <span className="rounded-full border border-[var(--sky)]/30 bg-[var(--sky)]/10 px-2 py-0.5 text-[11px] text-[var(--sky)]">Template: {job.multiAgentOutputs.recommendedTemplate}</span>}
                      {job.multiAgentOutputs.salaryEstimate && <span className="rounded-full border border-[var(--amber)]/30 bg-[var(--amber)]/10 px-2 py-0.5 text-[11px] text-[var(--amber)]">{job.multiAgentOutputs.salaryEstimate}</span>}
                      {(job.multiAgentOutputs.matchingSkills || []).slice(0, 4).map((s) => <span key={s} className="rounded-full border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/10 px-2 py-0.5 text-[11px] text-[var(--chartreuse)]">{s}</span>)}
                      {job.multiAgentOutputs.outreachSubject && <span className="rounded-full border border-[var(--line)] bg-white/[0.03] px-2 py-0.5 text-[11px] text-dim">✉ {job.multiAgentOutputs.outreachSubject}</span>}
                    </div>
                  ) : (
                    <p className="text-[11px] text-dim">No multi-agent outputs yet — run the full pipeline</p>
                  )}
                </div>
                <div data-testid="auto-apply-logs" className="mt-3 rounded-xl border border-[var(--line)] bg-white/[0.03] p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-dim"><History className="h-3 w-3 text-[var(--amber)]" /> Auto-apply timeline {job.autoApplyLogs?.length ? <span className="font-mono text-[10px] text-dim">· {job.autoApplyLogs.length} events</span> : null}</p>
                  {job.autoApplyLogs?.length ? (
                    <ol className="relative border-l border-[var(--line)] pl-4">
                      {job.autoApplyLogs.slice(-6).map((log, idx) => {
                        const dot = log.type === "success" ? "bg-[var(--chartreuse)]" : log.type === "warning" ? "bg-[var(--amber)]" : log.type === "error" ? "bg-[var(--coral)]" : log.type === "reasoning" ? "bg-[var(--violet)]" : "bg-[var(--sky)]";
                        return (
                          <li key={`${log.timestamp}-${idx}`} className="relative pb-3 last:pb-0">
                            <span className={cn("absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border border-[var(--line)]", dot)} />
                            <p className="text-[11px] leading-relaxed text-[var(--paper)]/90">{log.message}</p>
                            <p className="font-mono text-[10px] text-dim">{new Date(log.timestamp).toLocaleString()}</p>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="text-[11px] text-dim">No application timeline events yet</p>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-[var(--line)] px-4 py-2 shrink-0 no-scrollbar">
          {JOB_DETAIL_TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => handleTabSelect(id)} className={cn("relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer", active ? "text-[var(--chartreuse)]" : "text-dim hover:text-[var(--paper)]")}>
                {active && <motion.span layoutId="drawer-tab-pill" className="absolute inset-0 rounded-lg bg-[var(--chartreuse)]/10 ring-1 ring-[var(--chartreuse)]/20" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <Icon className="relative h-3.5 w-3.5" /> <span className="relative">{label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>{renderSubpanel()}</motion.div>
          </AnimatePresence>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--line)] px-6 py-4 shrink-0 bg-[var(--ink-soft)]">
          {confirmRemove ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-dim">Remove this application?</span>
              <button onClick={handleDeleteApplication} className="rounded-lg bg-[var(--coral)]/15 px-2.5 py-1.5 font-semibold text-[var(--coral)] hover:bg-[var(--coral)]/25 cursor-pointer">Yes, remove</button>
              <button onClick={() => setConfirmRemove(false)} className="rounded-lg px-2.5 py-1.5 text-dim hover:text-[var(--paper)] cursor-pointer">Keep it</button>
            </div>
          ) : (
            <button onClick={() => setConfirmRemove(true)} className="inline-flex items-center gap-1.5 text-xs text-[var(--coral)] hover:opacity-80 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
          )}
          <Button variant="outline" size="sm" onClick={copyUrl} disabled={!job.url}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy URL"}</Button>
        </div>
      </div>
    );
  }

  const recommendation: { title: string; detail: string; action: string; tab: JobDetailTab } =
    job.status === "wishlist"
      ? { title: "Decide whether this role earns a tailored application", detail: nextNote || "Review the match evidence and any dealbreakers before investing time in documents.", action: job.skillsGap ? "Review match evidence" : "Analyze role fit", tab: "overview" }
      : job.status === "applied"
        ? { title: "Keep the follow-up and interview plan current", detail: nextNote || "Confirm the follow-up date, then prepare likely interview questions.", action: "Prepare for interview", tab: "questions" }
        : job.status === "interviewing"
          ? { title: "Turn the role evidence into interview answers", detail: nextNote || "Practice the highest-value questions and connect them to your STAR evidence.", action: "Open interview prep", tab: "questions" }
          : job.status === "offer"
            ? { title: "Review the complete role record before deciding", detail: nextNote || "Revisit the role, compensation, and evidence captured throughout the process.", action: "Review role brief", tab: "overview" }
            : { title: "Capture useful evidence before closing this role", detail: nextNote || "Keep any interview feedback and reusable lessons in the notes.", action: "Review workspace", tab: "overview" };

  return (
    <div className={cn("space-y-5", className)}>
      {onClose && <button onClick={onClose} className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-dim hover:text-[var(--paper)]"><ArrowLeft className="h-4 w-4" /> Back to Job Finder</button>}
      <JobDetailHeader job={job} mode="page" headerActions={headerActions} />
      <section className="flex flex-col gap-4 rounded-2xl border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/[0.045] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--chartreuse)]">Recommended next step</p><h2 className="mt-1 font-display text-base font-semibold text-[var(--paper)]">{recommendation.title}</h2><p className="mt-1 max-w-4xl text-xs leading-relaxed text-dim">{recommendation.detail}</p></div>
        <Button className="shrink-0" onClick={() => handleTabSelect(recommendation.tab)}>{recommendation.action} <ChevronRight className="h-4 w-4" /></Button>
      </section>
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/60 p-4 sm:p-5">
        <div className="flex items-center justify-between"><h2 className="font-display text-sm font-semibold text-[var(--paper)]">Working notes</h2><p className="text-[10px] text-dim">Saved when you leave the field.</p></div>
        <textarea rows={3} placeholder="Add decisions, recruiter context, or interview notes…" value={notesDraft ?? job.notes ?? ""} onChange={(event) => setNotesDraft(event.target.value)} onBlur={() => { if (notesDraft !== null && notesDraft !== (job.notes ?? "")) updateApplication(job.id, { notes: notesDraft }); }} className="mt-3 w-full resize-y rounded-xl border border-line bg-white/[0.03] px-3 py-2.5 text-xs leading-relaxed text-paper outline-none placeholder:text-dim/70 focus:border-chartreuse/50" />
      </section>
      <section className="grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/60 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
        <KeyFact label="Posting host">{sourceHost || "Not captured"}</KeyFact>
        <KeyFact label="Application system">{atsSystem || "Not identified"}{!atsSystem && sourceHost && <span className="mt-0.5 block text-[10px] font-normal text-dim">Inferred only when the host names a known ATS.</span>}</KeyFact>
        <KeyFact label="Channel">{applicationChannel || "Not recorded"}</KeyFact>
        <KeyFact label="Target keywords" tone="accent">{atsKeywords.length > 0 ? <span className="flex flex-wrap gap-1">{atsKeywords.slice(0, 6).map((keyword) => <span key={keyword} className="rounded-md border border-[var(--sky)]/20 bg-[var(--sky)]/[0.07] px-1.5 py-0.5 text-[10px] font-medium text-[var(--sky)]">{keyword}</span>)}{atsKeywords.length > 6 && <span className="rounded-md border border-[var(--line)] bg-white/[0.025] px-1.5 py-0.5 text-[10px] text-dim">+{atsKeywords.length - 6}</span>}</span> : <span className="font-normal text-dim">None extracted</span>}</KeyFact>
      </section>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/60 p-2.5">
            {JOB_DETAIL_TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button key={id} type="button" aria-pressed={active} onClick={() => handleTabSelect(id)} className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold", active ? "bg-[var(--chartreuse)]/10 text-[var(--chartreuse)] ring-1 ring-[var(--chartreuse)]/25" : "text-dim hover:bg-white/5 hover:text-[var(--paper)]")}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              );
            })}
          </div>
          <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--ink-card)]/60 p-6 sm:p-8 shadow-[0_8px_40px_rgba(0,0,0,0.12)]"><div key={tab} className="min-w-0">{renderSubpanel()}</div></section>
        </div>
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/60 p-5">
            <div className="mb-4 flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[var(--sky)]" /><h2 className="font-display text-sm font-semibold text-[var(--paper)]">Application control</h2></div>
            <div className="space-y-4">
              <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Status</span><StatusSelect status={job.status} onChange={(status) => { updateApplication(job.id, { status }); success(`Moved to ${statusConfig[status].label}.`); }} /></label>
              <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Priority</span><Select ariaLabel="Priority" value={job.priority ?? "medium"} onChange={(priority) => updateApplication(job.id, { priority })} className="w-full" options={[{ value: "high", label: "High priority", dot: "var(--coral)" }, { value: "medium", label: "Medium priority", dot: "var(--amber)" }, { value: "low", label: "Low priority", dot: "var(--sky)" }]} /></label>
              <div className="grid gap-3 border-t border-[var(--line)] pt-4">
                {(
                  [
                    ["appliedDate", "Applied", job.appliedDate],
                    ["deadline", "Deadline", job.deadline],
                    ["followUpDue", "Follow-up", job.followUpDue],
                  ] as const
                ).map(([field, label, value]) => (
                  <label key={field} className="block"><span className="mb-1 block text-[10px] text-dim">{label}</span><DateField value={value ?? ""} onChange={patchDate(field as "appliedDate" | "deadline" | "followUpDue")} /></label>
                ))}
              </div>
            </div>
          </section>
          <section className="rounded-2xl border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/[0.04] p-5">
            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--chartreuse)]" /><div><h2 className="font-display text-sm font-semibold text-[var(--paper)]">Supervised application</h2><p className="mt-1 text-xs leading-relaxed text-dim">The agent shows its reasoning, steps, clicks, screenshots, and outcome. Submission requires your explicit confirmation.</p></div></div>
            <Button variant="outline" className="mt-4 w-full" onClick={() => handleTabSelect("agent")}><Bot className="h-4 w-4" /> Review application agent</Button>
          </section>
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-deep)]/[0.05] p-4">
            {confirmRemove ? (
              <div><p className="text-xs text-dim">Remove this role and its workspace data?</p><div className="mt-3 flex gap-2"><Button variant="danger" size="sm" onClick={handleDeleteApplication}>Yes, remove</Button><Button variant="ghost" size="sm" onClick={() => setConfirmRemove(false)}>Keep role</Button></div></div>
            ) : (
              <button onClick={() => setConfirmRemove(true)} className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-[var(--coral)] hover:opacity-80"><Trash2 className="h-3.5 w-3.5" /> Remove role from workspace</button>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
