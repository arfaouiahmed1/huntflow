"use client";

import { useState } from "react";
import { Award, BadgeCheck, Building2, Copy, FileSignature, Layers, Mail, MessageSquare, ShieldCheck, Sparkles, DollarSign, Check, Send } from "lucide-react";
import { JobApplication } from "@/types";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toaster";
import TieredInterviewView from "@/components/intel/TieredInterviewView";
import OutreachSequenceView from "@/components/agent/OutreachSequenceView";
import { generateTieredInterviewPrep } from "@/lib/agents/interviewTiers";
import { generateOutreachSequence } from "@/lib/mail/outreachSequence";

type ViewMode = "cards" | "table" | "json";

function CopyButton({ text, label }: { text: string; label?: string }) {
  const { success } = useToast();
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    success(label ? `${label} copied.` : "Copied.");
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <button onClick={onCopy} className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-dim hover:bg-white/[0.06] hover:text-[var(--paper)] cursor-pointer">
      {copied ? <Check className="h-3 w-3 text-[var(--chartreuse)]" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy"}
    </button>
  );
}

function OutputCard({ icon: Icon, label, accent, children, copyText, copyLabel }: { icon: React.ComponentType<{ className?: string }>; label: string; accent: string; children: React.ReactNode; copyText?: string; copyLabel?: string }) {
  return (
    <div className={cn("rounded-[1.5rem] border p-7 min-h-[148px] flex flex-col", accent)}>
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-dim">
          <Icon className="h-3.5 w-3.5" /> {label}
        </p>
        {copyText && <CopyButton text={copyText} label={copyLabel} />}
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </div>
  );
}

export default function AgentOutputsDashboard({ job }: { job: JobApplication }) {
  const [mode, setMode] = useState<ViewMode>("cards");
  const [showTieredInterview, setShowTieredInterview] = useState(false);
  const [showOutreachSequence, setShowOutreachSequence] = useState(false);

  const out = job.multiAgentOutputs;
  const hasOutputs = !!out && Object.values(out).some((v) => v !== undefined && v !== null && (Array.isArray(v) ? v.length > 0 : true));

  const ats = out?.atsScore;
  const template = out?.recommendedTemplate;
  const salary = out?.salaryEstimate;
  const matching = out?.matchingSkills ?? [];
  const missing = out?.missingSkills ?? [];
  const outreach = out?.outreachSubject;
  const topics = out?.interviewPrepTopics ?? [];
  const research = out?.companyResearch;

  if (!hasOutputs) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-[var(--line)] bg-white/[0.02] p-10 text-center">
        <Sparkles className="mx-auto h-5 w-5 text-dim" />
        <p className="mx-auto mt-3 max-w-[36ch] text-xs leading-relaxed text-dim">No agent outputs yet — run the <span className="font-semibold text-[var(--paper)]">supervised pipeline</span> in the Auto-Apply tab. Each of the 11 agents will fill a spacious card here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-sm font-semibold text-[var(--paper)]">Agent intelligence — spacious outputs</h3>
        <div className="flex gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.02] p-1">
          {(["cards", "table", "json"] as ViewMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn("rounded-full px-3 py-1 text-[11px] font-semibold capitalize", mode === m ? "bg-[var(--paper)] text-[var(--ink)]" : "text-dim hover:text-[var(--paper)]")}>{m}</button>
          ))}
        </div>
      </div>

      {mode === "cards" && (
        <div className="grid gap-6 sm:grid-cols-2">
          <OutputCard icon={BadgeCheck} label="ATS audit" accent="border-[var(--violet)]/25 bg-[var(--violet)]/[0.04]" copyText={ats !== undefined ? `ATS ${ats}` : undefined} copyLabel="ATS score">
            {ats !== undefined ? (
              <>
                <p className="font-display text-3xl font-bold text-[var(--violet)]">{ats}<span className="text-lg font-semibold">/100</span></p>
                <p className="mt-2 text-xs leading-relaxed text-dim">Keyword match + header coverage + length. Capped at 59 when parser &lt;60 (deterministic gate).</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-[var(--violet)]" style={{ width: `${Math.min(100, ats)}%` }} /></div>
              </>
            ) : <p className="text-xs text-dim">No ATS score yet.</p>}
          </OutputCard>

          <OutputCard icon={FileSignature} label="Template" accent="border-[var(--sky)]/25 bg-[var(--sky)]/[0.04]" copyText={template} copyLabel="Template">
            {template ? <><p className="font-mono text-sm font-bold text-[var(--sky)]">{template}</p><p className="mt-2 text-xs leading-relaxed text-dim">Region-aware: DACH → tabular, FR → modern, US → classic-ats.</p></> : <p className="text-xs text-dim">No template selected.</p>}
          </OutputCard>

          <OutputCard icon={DollarSign} label="Salary band" accent="border-[var(--amber)]/25 bg-[var(--amber)]/[0.04]" copyText={salary} copyLabel="Salary">
            {salary ? <p className="text-sm font-semibold leading-relaxed text-[var(--amber)]">{salary}</p> : <p className="text-xs text-dim">No estimate yet.</p>}
          </OutputCard>

          <OutputCard icon={Layers} label="Matching skills" accent="border-[var(--chartreuse)]/25 bg-[var(--chartreuse)]/[0.04]" copyText={matching.join(", ")} copyLabel="Matching skills">
            {matching.length ? <div className="flex flex-wrap gap-1.5">{matching.map((s) => <span key={s} className="rounded-full border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--chartreuse)]">{s}</span>)}</div> : <p className="text-xs text-dim">No matches yet.</p>}
          </OutputCard>

          <OutputCard icon={ShieldCheck} label="Gaps to close" accent="border-[var(--coral)]/25 bg-[var(--coral)]/[0.04]" copyText={missing.join(", ")} copyLabel="Gaps">
            {missing.length ? <div className="flex flex-wrap gap-1.5">{missing.map((s) => <span key={s} className="rounded-full border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--coral)]">{s}</span>)}</div> : <p className="text-xs text-dim">No gaps detected.</p>}
          </OutputCard>

          <OutputCard icon={Mail} label="Outreach subject" accent="border-[var(--line)] bg-white/[0.02]" copyText={outreach} copyLabel="Subject">
            {outreach ? <p className="text-sm leading-relaxed text-[var(--paper)]">“{outreach}”</p> : <p className="text-xs text-dim">No subject yet.</p>}
            <button
              type="button"
              onClick={() => setShowOutreachSequence(!showOutreachSequence)}
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--sky)] hover:underline cursor-pointer"
            >
              <Send className="h-3 w-3" /> {showOutreachSequence ? "Hide 3-stage sequence" : "View 3-stage outreach sequence →"}
            </button>
          </OutputCard>

          <OutputCard icon={MessageSquare} label="Interview focus" accent="border-[var(--violet)]/25 bg-white/[0.02]" copyText={topics.join(" · ")} copyLabel="Topics">
            {topics.length ? <ul className="list-disc pl-4 space-y-1 text-xs leading-relaxed text-[var(--paper)]/90">{topics.map((t) => <li key={t}>{t}</li>)}</ul> : <p className="text-xs text-dim">No topics yet.</p>}
            <button
              type="button"
              onClick={() => setShowTieredInterview(!showTieredInterview)}
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--violet)] hover:underline cursor-pointer"
            >
              <MessageSquare className="h-3 w-3" /> {showTieredInterview ? "Hide multi-tier prep" : "View 3-tier STAR prep & probes →"}
            </button>
          </OutputCard>

          <OutputCard icon={Building2} label="Company research" accent="border-[var(--sky)]/20 bg-white/[0.02]" copyText={research ? JSON.stringify(research, null, 2) : undefined} copyLabel="Research">
            {research ? (
              <div className="space-y-2 text-xs leading-relaxed">
                <p className="font-semibold text-[var(--paper)]">{research.company ?? "Unknown"} · {research.status ?? "ok"}</p>
                {(research.facts ?? []).slice(0, 4).map((f, i) => <p key={i} className="text-dim"><span className="font-semibold text-[var(--paper)]/80">{f.label}:</span> {f.value}</p>)}
                {research.warnings?.length ? <p className="rounded-lg bg-[var(--amber)]/10 px-2 py-1 text-[11px] text-[var(--amber)]">{research.warnings[0]}</p> : null}
              </div>
            ) : <p className="text-xs text-dim">No research yet.</p>}
          </OutputCard>
        </div>
      )}

      {mode === "table" && (
        <div className="overflow-hidden rounded-[1.25rem] border border-[var(--line)]">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-dim"><tr><th className="px-4 py-3">Output</th><th className="px-4 py-3">Value</th><th className="px-4 py-3 w-20">Copy</th></tr></thead>
            <tbody className="divide-y divide-[var(--line)]">
              {[
                ["ATS score", ats !== undefined ? `${ats}/100` : "—"],
                ["Template", template ?? "—"],
                ["Salary", salary ?? "—"],
                ["Matching", matching.join(", ") || "—"],
                ["Gaps", missing.join(", ") || "—"],
                ["Outreach", outreach ?? "—"],
                ["Interview", topics.join(" · ") || "—"],
              ].map(([k, v]) => (
                <tr key={k} className="hover:bg-white/[0.02]"><td className="px-4 py-3 font-semibold text-[var(--paper)]">{k}</td><td className="px-4 py-3 text-dim">{v}</td><td className="px-4 py-3">{v !== "—" && <CopyButton text={String(v)} label={String(k)} />}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mode === "json" && (
        <pre className="max-h-[480px] overflow-auto rounded-[1.25rem] border border-[var(--line)] bg-[var(--ink-soft)]/50 p-6 font-mono text-[11px] leading-relaxed text-paper/90">{JSON.stringify(out, null, 2)}</pre>
      )}
      {showOutreachSequence && (
        <div className="pt-2">
          <OutreachSequenceView
            plan={generateOutreachSequence(
              { company: job.company, title: job.title, url: job.url, jobDescription: job.jobDescription },
              { name: "Candidate", topSkills: matching.length ? matching : ["Software Engineering"] }
            )}
          />
        </div>
      )}

      {showTieredInterview && (
        <div className="pt-2">
          <TieredInterviewView
            prep={generateTieredInterviewPrep(
              topics.length ? topics : ["System Design", "Architecture"],
              { company: job.company, title: job.title, jobDescription: job.jobDescription }
            )}
          />
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[10px] text-dim"><Award className="h-3 w-3 text-[var(--chartreuse)]" /> Grounded: skills are subset of your profile, missing are disjoint, ATS is parser-capped — nothing hallucinated.</p>
    </div>
  );
}
