"use client";

import { useMemo, useState } from "react";
import {
  Send,
  RefreshCw,
  Loader2,
  Inbox,
  ArrowDownLeft,
  ArrowUpRight,
  Unplug,
  Sparkles,
  Building2,
  User,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";

const TEMPLATES = [
  {
    name: "Application follow-up",
    subject: "Re: {role} application — {company}",
    body: `Hi {name},

I applied for the {role} position at {company} on {date} and wanted to follow up. I remain very interested in the opportunity and would be glad to provide any additional information.

Best regards,
Ahmed Arfaoui
+216 58 732 642 · linkedin.com/in/ahmedarfaoui99`,
  },
  {
    name: "Cold outreach",
    subject: "AI Engineer — {company}",
    body: `Hi {name},

I'm an AI engineer graduating from ESPRIT in 2026, specializing in agentic systems and GenAI. I've been following {company}'s work and noticed you're hiring for AI-focused roles.

A few highlights:
• Built browser-automation agents with 97.6% tool-call success across 126 runs
• Shipped RAG pipelines, LLM evaluation harnesses, and MLOps workflows
• Automated banking reporting at VERMEG — 95% reduction in manual effort

Would you be open to a quick chat this week?

Best regards,
Ahmed Arfaoui
+216 58 732 642 · linkedin.com/in/ahmedarfaoui99`,
  },
  {
    name: "Thank you after interview",
    subject: "Thank you — {role} interview",
    body: `Dear {name},

Thank you for taking the time to speak with me about the {role} position at {company}. I really enjoyed learning more about the team and the challenges ahead.

I'm confident my experience with agentic AI systems and production ML pipelines would let me contribute from day one. Please let me know if there's anything else I can provide.

Best regards,
Ahmed Arfaoui
+216 58 732 642`,
  },
];

export default function OutreachPage() {
  const { contacts, emails, applications, addEmail, mailSettings, refreshStats } = useApp();
  const { success, error } = useToast();
  const [contactId, setContactId] = useState("");
  const [jobId, setJobId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [template, setTemplate] = useState("");

  const contact = contacts.find((c) => c.id === contactId);
  const job = applications.find((j) => j.id === jobId);

  const applyTemplate = (t: string) => {
    if (!t) return;
    const tmpl = TEMPLATES.find((x) => x.name === t)!;
    const company = job?.company || contact?.company || "{company}";
    const role = job?.title || "{role}";
    const name = contact?.name?.split(" ")[0] || "{name}";
    const date = job?.appliedDate ? new Date(job.appliedDate).toLocaleDateString() : "{date}";
    setSubject(tmpl.subject.replaceAll("{company}", company).replaceAll("{role}", role));
    setBody(tmpl.body.replaceAll("{company}", company).replaceAll("{role}", role).replaceAll("{name}", name).replaceAll("{date}", date));
  };

  const send = async () => {
    if (!contact?.email) {
      error("Pick a contact with an email address.");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      error("Subject and body are required.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: contact.email, subject, body, jobId: job?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed.");
      if (data.email) {
        addEmail(data.email);
      } else {
        addEmail({
          contactId: contact.id,
          jobId: job?.id,
          direction: "sent",
          subject,
          body,
          threadId: crypto.randomUUID(),
          status: "sent",
          read: true,
        });
      }
      success(`Email sent to ${contact.name}.`);
      setSubject("");
      setBody("");
      setTemplate("");
      refreshStats();
    } catch (e) {
      error(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setSending(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/mail/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed.");
      success(
        data.synced > 0
          ? `Inbox scanned — ${data.synced} new message${data.synced > 1 ? "s" : ""} matched to your pipeline.`
          : "Inbox scanned — no new replies found."
      );
    } catch (e) {
      error(e instanceof Error ? e.message : "Sync failed — check your IMAP settings.");
    } finally {
      setSyncing(false);
    }
  };

  const connected = Boolean(mailSettings.smtpHost && mailSettings.smtpUser && mailSettings.smtpPass);

  const jobLabel = (jobId?: string) => {
    const j = applications.find((x) => x.id === jobId);
    return j ? `${j.company} — ${j.title}` : null;
  };

  const contactLabel = (contactId?: string) => {
    const c = contacts.find((x) => x.id === contactId);
    return c ? c.name : null;
  };

  const history = useMemo(() => emails, [emails]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--chartreuse)]">/outreach</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--paper)]">Outreach</h1>
          <p className="mt-1 text-sm text-dim">Write, send, and track every email that moves your pipeline.</p>
        </div>
        <div className="flex items-center gap-2">
          {!connected && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--amber)]/40 bg-[var(--amber)]/10 px-3 py-1.5 text-[11px] font-bold text-[var(--amber)]">
              <Unplug className="h-3.5 w-3.5" /> Email not connected
            </span>
          )}
          <Button variant="outline" onClick={sync} loading={syncing} disabled={!connected || syncing} title={!connected ? "Connect email in Settings before syncing the inbox." : undefined}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync inbox
          </Button>
        </div>
      </div>

      {!connected && (
        <div className="rounded-2xl border border-[var(--amber)]/25 bg-[var(--amber)]/5 px-5 py-4 text-sm text-[var(--amber)]">
          Connect your email in <span className="font-bold">Settings → Email</span> to send messages and auto-scan replies
          from your inbox. Until then, messages are logged locally.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Composer */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
          <p className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">
            <Sparkles className="h-4 w-4 text-[var(--chartreuse)]" /> Composer
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">To (contact)</span>
              <Select
                value={contactId || undefined}
                onChange={(v) => setContactId(v)}
                placeholder="Select a contact…"
                className="w-full"
                options={contacts.map((c) => ({
                  value: c.id,
                  label: `${c.name}${c.email ? ` · ${c.email}` : ""}`,
                }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Linked job</span>
              <Select
                value={jobId || undefined}
                onChange={(v) => setJobId(v)}
                placeholder="No linked application…"
                className="w-full"
                options={applications.map((j) => ({
                  value: j.id,
                  label: `${j.company} — ${j.title.slice(0, 40)}`,
                }))}
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Template:</span>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  onClick={() => {
                    setTemplate(t.name);
                    applyTemplate(t.name);
                  }}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors",
                    template === t.name
                      ? "border-[var(--chartreuse)]/50 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                      : "border-[var(--line)] text-dim hover:border-[var(--line)]/60 hover:text-[var(--paper)]"
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <label className="mt-3 block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Re: AI Engineer application — DataDome"
              className="w-full rounded-lg border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
            />
          </label>

          <label className="mt-3 block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Message</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={9}
              placeholder="Hi …"
              className="w-full resize-none rounded-lg border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-sm leading-relaxed text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
            />
          </label>

          <div className="mt-4 flex items-center justify-between">
            <p className="font-mono text-[10px] text-dim">
              {contact?.email ? `→ ${contact.email}` : connected ? "Select a contact" : "Send disabled until email is connected"}
            </p>
            <Button onClick={send} loading={sending} disabled={!connected}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send email
            </Button>
          </div>
        </div>

        {/* History */}
        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70">
          <p className="flex items-center gap-2 border-b border-[var(--line)] bg-white/[0.02] px-5 py-3.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">
            <Inbox className="h-4 w-4 text-[var(--sky)]" /> Message log — {history.length}
          </p>
          <div className="max-h-[560px] divide-y divide-[var(--line)]/50 overflow-y-auto">
            {history.length === 0 ? (
              <p className="px-5 py-10 text-center text-xs text-dim">No messages yet. Send your first outreach or sync your inbox.</p>
            ) : (
              history.map((e) => (
                <div key={e.id} className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-lg",
                        e.direction === "sent" ? "bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]" : "bg-[var(--sky)]/10 text-[var(--sky)]"
                      )}
                    >
                      {e.direction === "sent" ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--paper)]">{e.subject}</p>
                      <p className="flex items-center gap-2 truncate text-[11px] text-dim">
                        {e.contactId && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" /> {contactLabel(e.contactId)}
                          </span>
                        )}
                        {e.jobId && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" /> {jobLabel(e.jobId)}
                          </span>
                        )}
                        <span className="ml-auto shrink-0 font-mono">{new Date(e.sentAt).toLocaleDateString()}</span>
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 rounded-lg bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-dim">
                    {e.body}
                  </p>
                  {e.status === "replied" && (
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--chartreuse)]">
                      <ArrowDownLeft className="h-2.5 w-2.5" /> Reply received
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
