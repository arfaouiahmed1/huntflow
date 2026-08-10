"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarClock,
  Plus,
  Video,
  Phone,
  MapPin,
  CheckCircle2,
  Circle,
  Clock,
  Star,
  ClipboardList,
  Trash2,
  Trophy,
  Pencil,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { InterviewEvent } from "@/types";
import { Button } from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import { palette } from "@/lib/theme";

const TYPE_META: Record<InterviewEvent["type"], { label: string; icon: typeof Video; color: string }> = {
  phone: { label: "Phone", icon: Phone, color: "var(--sky)" },
  video: { label: "Video", icon: Video, color: "var(--chartreuse)" },
  onsite: { label: "On-site", icon: MapPin, color: "var(--amber)" },
  technical: { label: "Technical", icon: ClipboardList, color: "var(--sky)" },
  system_design: { label: "System Design", icon: ClipboardList, color: "var(--coral)" },
  behavioral: { label: "Behavioral", icon: ClipboardList, color: "var(--chartreuse)" },
  take_home: { label: "Take-home", icon: Clock, color: "var(--amber)" },
  other: { label: "Other", icon: CalendarClock, color: palette.paperDim },
};

const TYPES = Object.keys(TYPE_META) as InterviewEvent["type"][];
const PREP_SUGGESTIONS = [
  "Re-read the job description and my tailored resume",
  "Review STAR flashcards for this role",
  "Prepare 3 questions to ask the interviewer",
  "Research recent company news / funding",
  "Rehearse the system design walkthrough",
  "Check the tech stack — review my past projects",
];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function InterviewsPage() {
  const { interviews, applications, addInterview, updateInterview, deleteInterview, updateApplication } = useApp();
  const { success } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InterviewEvent | null>(null);
  const [reviewing, setReviewing] = useState<InterviewEvent | null>(null);
  const [reviewRating, setReviewRating] = useState(4);
  const [reviewText, setReviewText] = useState("");
  const [form, setForm] = useState({
    jobId: "",
    title: "",
    type: "video" as InterviewEvent["type"],
    scheduledAt: "",
    durationMin: 45,
    location: "",
    notes: "",
    prep: [] as string[],
  });

  const jobFor = (id?: string) => applications.find((j) => j.id === id);

  const sorted = useMemo(() => {
    return [...interviews].sort((a, b) => {
      const aDone = a.status === "done" ? 1 : 0;
      const bDone = b.status === "done" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    });
  }, [interviews]);

  const upcoming = interviews.filter((i) => i.status === "scheduled").length;
  const done = interviews.filter((i) => i.status === "done").length;

  const openNew = () => {
    setEditing(null);
    setForm({ jobId: "", title: "", type: "video", scheduledAt: "", durationMin: 45, location: "", notes: "", prep: [] });
    setFormOpen(true);
  };

  const openEdit = (i: InterviewEvent) => {
    setEditing(i);
    setForm({
      jobId: i.jobId ?? "",
      title: i.title,
      type: i.type,
      scheduledAt: i.scheduledAt.slice(0, 16),
      durationMin: i.durationMin,
      location: i.location,
      notes: i.notes,
      prep: i.prep ?? [],
    });
    setFormOpen(true);
  };

  const togglePrep = (item: string) => {
    setForm((f) => ({ ...f, prep: f.prep.includes(item) ? f.prep.filter((p) => p !== item) : [...f.prep, item] }));
  };

  const submit = () => {
    if (!form.title.trim() && !form.jobId) {
      success("Give the interview a title or pick a job.");
      return;
    }
    const job = jobFor(form.jobId);
    const title = form.title.trim() || job?.title || "Interview";
    if (editing) {
      updateInterview(editing.id, { ...form, title, scheduledAt: new Date(form.scheduledAt).toISOString() });
    } else {
      addInterview({
        jobId: form.jobId || undefined,
        title,
        type: form.type,
        scheduledAt: new Date(form.scheduledAt || Date.now() + 86400000).toISOString(),
        durationMin: form.durationMin,
        location: form.location,
        notes: form.notes,
        status: "scheduled",
        prep: form.prep,
      });
      if (form.jobId) {
        const j = jobFor(form.jobId);
        if (j && j.status === "applied") updateApplication(j.id, { status: "interviewing" });
      }
    }
    setFormOpen(false);
  };

  const complete = (i: InterviewEvent) => {
    setReviewing(i);
    setReviewRating(4);
    setReviewText(i.review ?? "");
  };

  const saveReview = () => {
    if (!reviewing) return;
    const positive = reviewRating >= 4;
    updateInterview(reviewing.id, {
      status: "done",
      rating: reviewRating,
      review: reviewText,
    });
    if (reviewing.jobId) {
      const j = jobFor(reviewing.jobId);
      if (j && positive && j.status !== "rejected") {
        updateApplication(j.id, { status: "offer", notes: `🏆 Positive interview review (${reviewRating}/5).` + (j.notes ? `\n${j.notes}` : "") });
      }
    }
    success(positive ? "Interview logged — job promoted to offer!" : "Interview logged.");
    setReviewing(null);
  };

  const remove = (i: InterviewEvent) => {
    if (confirm("Delete this interview?")) deleteInterview(i.id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--chartreuse)]">/interviews</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--paper)]">Interview Command</h1>
          <p className="mt-1 text-sm text-dim">Every conversation scheduled, prepped, and reviewed.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Schedule interview
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Upcoming", value: upcoming, icon: CalendarClock, color: "var(--chartreuse)" },
          { label: "Completed", value: done, icon: CheckCircle2, color: "var(--sky)" },
          { label: "Offers won", value: applications.filter((a) => a.status === "offer").length, icon: Trophy, color: "var(--amber)" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
            <Icon className="h-5 w-5" style={{ color }} />
            <p className="mt-3 font-mono text-3xl font-bold tabular-nums" style={{ color }}>
              {String(value).padStart(2, "0")}
            </p>
            <p className="mt-1 text-xs text-dim">{label}</p>
          </div>
        ))}
      </div>

      {/* Timeline */}
      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] p-12 text-center">
          <CalendarClock className="mx-auto h-8 w-8 text-dim" />
          <p className="mt-3 text-sm font-semibold text-[var(--paper)]">No interviews yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-dim">
            Once you land conversations, they show up here with prep checklists and post-interview reviews.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {sorted.map((i) => {
              const meta = TYPE_META[i.type];
              const Icon = meta.icon;
              const job = jobFor(i.jobId);
              const isUpcoming = i.status === "scheduled";
              return (
                <motion.div
                  key={i.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    "rounded-2xl border bg-[var(--ink-card)]/70 p-5 transition-colors",
                    isUpcoming ? "border-[var(--chartreuse)]/25" : "border-[var(--line)] opacity-80"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-4">
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border"
                      style={{ borderColor: `${meta.color}40`, background: `${meta.color}14`, color: meta.color }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--paper)]">
                        {i.title}
                        {i.rating ? (
                          <span className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star key={n} className={cn("h-3 w-3", n <= (i.rating ?? 0) ? "fill-[var(--amber)] text-[var(--amber)]" : "text-dim/40")} />
                            ))}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-dim">
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="h-3 w-3" /> {fmtDate(i.scheduledAt)} · {fmtTime(i.scheduledAt)} · {i.durationMin}m
                        </span>
                        <span className="flex items-center gap-1">
                          <span style={{ color: meta.color }}>{meta.label}</span>
                        </span>
                        {job && <span className="text-[var(--chartreuse)]">{job.company}</span>}
                        {i.location && <span>{i.location}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isUpcoming ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openEdit(i)}>
                            <Pencil className="h-3.5 w-3.5" /> Prep
                          </Button>
                          <Button size="sm" onClick={() => complete(i)}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Mark done
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => complete(i)}>
                          <Pencil className="h-3.5 w-3.5" /> Edit review
                        </Button>
                      )}
                      <button onClick={() => remove(i)} className="text-dim transition-colors hover:text-[var(--coral)]">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {i.prep && i.prep.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {i.prep.map((p) => (
                        <span key={p} className="rounded-full border border-[var(--line)] bg-white/[0.02] px-2.5 py-1 text-[10px] text-dim">
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                  {i.notes && <p className="mt-2 text-[11px] leading-relaxed text-dim">{i.notes}</p>}
                  {i.review && (
                    <p className="mt-2 rounded-lg border border-[var(--line)]/50 bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-[var(--paper)]/80">
                      <span className="font-bold text-dim">REVIEW · </span>
                      {i.review}
                    </p>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Schedule modal */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Prepare / edit interview" : "Schedule interview"} wide>
        <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Linked application</span>
                  <select
                    value={form.jobId}
                    onChange={(e) => setForm({ ...form, jobId: e.target.value })}
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--ink-soft)] px-3 py-2 text-sm text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
                  >
                    <option value="">No linked application…</option>
                    {applications.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.company} — {j.title.slice(0, 42)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Title</span>
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="HR screen / Technical round 1…"
                    className="w-full rounded-lg border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Type</span>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as InterviewEvent["type"] })}
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--ink-soft)] px-3 py-2 text-sm text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_META[t].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">When</span>
                  <input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                    className="w-full rounded-lg border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Duration (min)</span>
                  <input
                    type="number"
                    min={15}
                    step={15}
                    value={form.durationMin}
                    onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) || 45 })}
                    className="w-full rounded-lg border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Location / link</span>
                  <input
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Google Meet link / office address"
                    className="w-full rounded-lg border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Prep checklist</span>
                  <div className="space-y-1.5 rounded-lg border border-[var(--line)] bg-white/[0.02] p-3">
                    {PREP_SUGGESTIONS.map((p) => (
                      <button key={p} onClick={() => togglePrep(p)} className="flex w-full items-center gap-2 text-left text-xs text-dim hover:text-[var(--paper)]">
                        {form.prep.includes(p) ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--chartreuse)]" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className={form.prep.includes(p) ? "text-[var(--chartreuse)]" : ""}>{p}</span>
                      </button>
                    ))}
                  </div>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Notes</span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    placeholder="Interviewer name, agenda, things to remember…"
                    className="w-full resize-none rounded-lg border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
                  />
                </label>
              </div>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] bg-white/[0.02] px-5 py-4">
          <Button variant="outline" onClick={() => setFormOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>{editing ? "Save" : "Schedule"}</Button>
        </div>
      </Modal>

      {/* Review modal */}
      <Modal open={!!reviewing} onClose={() => setReviewing(null)} title="Post-interview review">
        <div className="py-1">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">How did it go?</p>
                <div className="mb-4 flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setReviewRating(n)}
                      className={cn(
                        "rounded-lg border px-3 py-2 transition-all",
                        n <= reviewRating ? "border-[var(--amber)]/60 bg-[var(--amber)]/15" : "border-[var(--line)] hover:border-[var(--line)]/60"
                      )}
                    >
                      <Star className={cn("h-5 w-5", n <= reviewRating ? "fill-[var(--amber)] text-[var(--amber)]" : "text-dim")} />
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">What happened?</span>
                  <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    rows={5}
                    placeholder="Questions asked, how it went, red flags, next steps…"
                    className="w-full resize-none rounded-lg border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
                  />
                </label>
                <p className="mt-3 text-[10px] leading-relaxed text-dim">
                  Rating 4+ automatically promotes the linked application to <span className="font-bold text-[var(--amber)]">offer</span>.
                </p>
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--line)] bg-white/[0.02] px-5 py-4">
            <Button variant="outline" onClick={() => setReviewing(null)}>
              Cancel
            </Button>
            <Button onClick={saveReview}>Save review</Button>
          </div>
      </Modal>
    </div>
  );
}
