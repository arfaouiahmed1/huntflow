"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Radar,
  Star,
  KanbanSquare,
  FileSignature,
  Archive,
  Bot,
  ArrowRight,
  ArrowLeft,
  Play,
  MousePointer2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = {
  id: string;
  title: string;
  route: string;
  routeLabel: string;
  icon: LucideIcon;
  what: string;
  how: string[];
  previewTitle: string;
  preview: React.ReactNode;
};

function PreviewShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-ink-soft/60">
      <div className="flex items-center gap-2 border-b border-line/70 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-coral/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-chartreuse/70" />
        <span className="ml-2 truncate font-mono text-[11px] text-dim">{title}</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

const STEPS: Step[] = [
  {
    id: "discover",
    title: "Discover roles",
    route: "/jobs",
    routeLabel: "Job Finder",
    icon: Radar,
    what: "Run Discovery on /jobs to pull fresh postings from your enabled boards, ranked by fit.",
    how: ["Open /jobs", "Pick sources + result limit", "Run Discovery, save keepers, skip the rest"],
    previewTitle: "jobs — discovery deck",
    preview: (
      <div className="space-y-3">
        <div className="rounded-xl border border-chartreuse/30 bg-chartreuse/[0.06] p-4">
          <p className="text-sm font-bold text-paper">Senior Frontend Engineer · Acme</p>
          <p className="mt-1 text-xs text-dim">Remote · $140–180k · React, TypeScript</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[86%] rounded-full bg-chartreuse" />
          </div>
          <p className="mt-1 font-mono text-[11px] text-chartreuse">Fit 86</p>
        </div>
        <div className="flex gap-2">
          <span className="flex-1 rounded-lg border border-line px-3 py-2 text-center text-xs font-semibold text-dim">Skip</span>
          <span className="flex-1 rounded-lg bg-chartreuse px-3 py-2 text-center text-xs font-bold text-ink">Save keeper</span>
        </div>
      </div>
    ),
  },
  {
    id: "rank",
    title: "Review & rank",
    route: "/jobs",
    routeLabel: "Job Finder",
    icon: Star,
    what: "Open a saved role to run match analysis: fit score, evidence gaps, STAR cards, interview questions.",
    how: ["Open a saved role", "Run match analysis", "Read gaps before tailoring"],
    previewTitle: "jobs — match analysis",
    preview: (
      <div className="space-y-2">
        {[
          ["React + design systems", "Strong · vault-cited", "w-[90%] bg-chartreuse"],
          ["Node APIs", "Partial · 1 gap", "w-[62%] bg-amber"],
          ["LLM evals", "Gap · add evidence", "w-[28%] bg-coral"],
        ].map(([label, note, bar]) => (
          <div key={label} className="rounded-xl border border-line bg-white/[0.02] p-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-paper">{label}</span>
              <span className="text-dim">{note}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className={cn("h-full rounded-full", bar)} />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "track",
    title: "Track pipeline",
    route: "/tracker",
    routeLabel: "Applications",
    icon: KanbanSquare,
    what: "Saved roles land in /tracker as wishlist. Move them across applied → interviewing → offer.",
    how: ["Open /tracker", "Drag cards across stages", "Switch board / table / deck views"],
    previewTitle: "tracker — board",
    preview: (
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Wishlist", ["Acme", "Globex"]],
          ["Applied", ["Initech"]],
          ["Interview", ["Umbrella"]],
        ].map(([col, cards]) => (
          <div key={col as string} className="rounded-xl border border-line bg-white/[0.02] p-2">
            <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-widest text-dim">{col}</p>
            <div className="space-y-1.5">
              {(cards as string[]).map((c) => (
                <div key={c} className="rounded-lg border border-line/70 bg-ink px-2 py-1.5 text-[11px] font-semibold text-paper">
                  {c}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "tailor",
    title: "Tailor documents",
    route: "/resume",
    routeLabel: "Resume Studio",
    icon: FileSignature,
    what: "In /resume the Studio drafts tailored resumes and letters, then compiles to LaTeX PDF with ATS checks.",
    how: ["Open /resume", "Pick target role", "Draft → ATS check → compile PDF"],
    previewTitle: "resume — studio draft",
    preview: (
      <div className="space-y-2">
        <div className="rounded-xl border border-line bg-white/[0.02] p-3 text-xs leading-relaxed text-dim">
          <span className="font-bold text-paper">Summary —</span> Frontend engineer with 6y shipping
          design systems; <span className="bg-chartreuse/20 px-1 text-chartreuse">tailored: added LLM eval bullet</span>.
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="rounded-full bg-chartreuse/15 px-2 py-0.5 font-bold text-chartreuse">ATS 92</span>
          <span className="text-dim">Keywords matched · LaTeX compiled</span>
        </div>
      </div>
    ),
  },
  {
    id: "evidence",
    title: "Ground evidence",
    route: "/vault",
    routeLabel: "Evidence Vault",
    icon: Archive,
    what: "Add career facts, docs, and contacts to /vault. Every agent answer cites this instead of inventing it.",
    how: ["Open /vault", "Add facts + docs", "Agents cite them automatically"],
    previewTitle: "vault — evidence fact",
    preview: (
      <div className="space-y-2">
        <div className="rounded-xl border border-chartreuse/30 bg-chartreuse/[0.05] p-3">
          <p className="text-xs font-bold text-paper">“Cut onboarding time 30% with eval harness”</p>
          <p className="mt-1 text-[11px] text-dim">Cited by: match analysis · pitch · interview prep</p>
        </div>
        <p className="text-[11px] text-dim">No citation → the agent says it lacks evidence.</p>
      </div>
    ),
  },
  {
    id: "apply",
    title: "Apply with review",
    route: "/agent",
    routeLabel: "Auto-Apply Agent",
    icon: Bot,
    what: "On /agent the pipeline researches, tailors, and prefills — then pauses at a human review gate. Nothing submits silently.",
    how: ["Open /agent", "Run the pipeline", "Review and approve each submit"],
    previewTitle: "agent — review gate",
    preview: (
      <div className="space-y-2">
        <div className="rounded-xl border border-amber/40 bg-amber/[0.06] p-3">
          <p className="text-xs font-bold text-paper">Ready for review: application to Acme</p>
          <p className="mt-1 text-[11px] text-dim">Prefilled answers + tailored resume attached. Awaiting your approval.</p>
        </div>
        <div className="flex gap-2">
          <span className="flex-1 rounded-lg border border-line px-3 py-2 text-center text-xs font-semibold text-dim">Edit</span>
          <span className="flex-1 rounded-lg bg-chartreuse px-3 py-2 text-center text-xs font-bold text-ink">Approve & submit</span>
        </div>
      </div>
    ),
  },
];

export default function GuidePage() {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 overflow-x-clip px-1">
      <header className="space-y-2">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-chartreuse/30 bg-chartreuse/10 px-2.5 py-1 text-[11px] font-bold text-chartreuse">
          <Play className="h-3 w-3" /> Interactive demo
        </p>
        <h1 className="font-display text-2xl font-bold text-paper sm:text-3xl">Guide &amp; Demo</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-dim">
          The end-to-end HUNTFLOW loop in six steps. Step through with Next / Back or jump to any step —
          every step links to the live surface. Use mouse / touch controls throughout.
        </p>
      </header>

      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length} aria-label="Guide progress">
        <div className="h-full rounded-full bg-chartreuse transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>

      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Workflow steps">
        {STEPS.map((s, i) => {
          const SIcon = s.icon;
          const active = i === step;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(i)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chartreuse/60",
                active ? "border-chartreuse/50 bg-chartreuse/[0.07]" : "border-line bg-white/[0.02] hover:bg-white/[0.04]"
              )}
            >
              <SIcon className={cn("h-4 w-4", active ? "text-chartreuse" : "text-dim")} aria-hidden="true" />
              <span className="mt-1.5 block text-xs font-bold text-paper">
                <span className="mr-1 font-mono text-[10px] text-dim">{i + 1}</span>
                {s.title}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-ink-card/70 p-5 sm:p-6" aria-label={`Step ${step + 1}: ${current.title}`}>
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-chartreuse/10 text-chartreuse">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-widest text-dim">Step {step + 1} of {STEPS.length}</p>
              <h2 className="font-display text-lg font-bold text-paper">{current.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-dim">{current.what}</p>
            </div>
          </div>
          <ol className="mt-4 space-y-1.5">
            {current.how.map((h, i) => (
              <li key={h} className="flex items-start gap-2 text-xs text-dim">
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-chartreuse/15 font-mono text-[10px] font-bold text-chartreuse">{i + 1}</span>
                {h}
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link
              href={current.route}
              className="inline-flex items-center gap-1.5 rounded-lg bg-chartreuse px-4 py-2 text-xs font-bold text-ink transition-transform active:scale-[0.97]"
            >
              Launch in App: {current.routeLabel} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-paper disabled:opacity-40"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                disabled={step === STEPS.length - 1}
                className="inline-flex items-center gap-1 rounded-lg border border-chartreuse/40 bg-chartreuse/10 px-3 py-2 text-xs font-bold text-chartreuse disabled:opacity-40"
              >
                Next <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </section>

        <PreviewShell title={current.previewTitle}>
          <div key={current.id}>{current.preview}</div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-dim">
            <MousePointer2 className="h-3 w-3" /> Simulated preview — try it live via Launch in App.
          </p>
        </PreviewShell>
      </div>

      <section className="rounded-2xl border border-line bg-white/[0.02] p-5" aria-label="Keyboard and pointer guide">
        <h2 className="text-sm font-bold text-paper">Controls</h2>
        <p className="mt-1 text-xs leading-relaxed text-dim">
          HUNTFLOW is driven with mouse / touch controls: click cards, drag pipeline cards across stages,
          and use on-screen Next / Back buttons here. Form fields support standard Tab / Shift+Tab focus movement
          and Enter to activate.
        </p>
      </section>
    </div>
  );
}
