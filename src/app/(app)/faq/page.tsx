"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Faq = { q: string; a: string; href: string; hrefLabel: string };
type Category = { id: string; label: string; items: Faq[] };

const CATEGORIES: Category[] = [
  {
    id: "ai",
    label: "AI & providers",
    items: [
      {
        q: "How does the AI fallback chain work?",
        a: "Requests try your enabled providers top-to-bottom and hop on failure (rate limits, outages, bad JSON — 3 attempts per provider with backoff). The first enabled provider powers legacy single-provider features. Keys stay in your local database, never in git. Configure the chain under Settings → Agents or the /agent engine panel.",
        href: "/settings",
        hrefLabel: "Open Settings → Agents",
      },
      {
        q: "Can I use a local model with Ollama?",
        a: "Yes. Add a provider pointed at your local endpoint (e.g. http://localhost:11434/v1) — a key is optional for local models. Test the connection, then optionally pin heavy workflows to it via per-agent routing so cloud keys stay untouched.",
        href: "/settings",
        hrefLabel: "Open Settings → Agents",
      },
      {
        q: "What is the sidecar token (HUNTFLOW_AGENT_TOKEN)?",
        a: "A shared secret between Next.js and the Python Scrapling agent, sent as the X-Huntflow-Token header. Set the same value in .env for both sides. LinkedIn sessions, crawling, and auto-apply need the sidecar running (default http://127.0.0.1:8001).",
        href: "/agent",
        hrefLabel: "Open Auto-Apply Agent",
      },
    ],
  },
  {
    id: "crawler",
    label: "Crawler & extraction",
    items: [
      {
        q: "How does Discovery find roles?",
        a: "Discovery on /jobs fans out over your enabled boards with worker concurrency set in Settings → Crawler. Fresh postings land in the swipe deck ranked by fit — save keepers, skip the rest. If discovery feels slow, raise concurrency modestly; if you hit rate limits, lower it.",
        href: "/jobs",
        hrefLabel: "Open Job Finder",
      },
      {
        q: "Why is a listing missing fields or marked stale?",
        a: "Boards change markup often; the extractor keeps what it can verify and leaves the rest blank rather than inventing data. Re-run Discovery or open the role detail to re-extract. Proof screenshots in the job deck show exactly what the crawler saw.",
        href: "/jobs",
        hrefLabel: "Open Job Finder",
      },
    ],
  },
  {
    id: "resume",
    label: "Resume studio",
    items: [
      {
        q: "How do tailoring and ATS checks work?",
        a: "Resume Studio drafts a role-targeted resume plus cover/motivation letters, runs keyword and formatting ATS checks, then compiles to LaTeX PDF. Fix flagged keywords first — they move the score most — then re-run the check before exporting.",
        href: "/resume",
        hrefLabel: "Open Resume Studio",
      },
      {
        q: "Where do STAR cards and interview questions come from?",
        a: "Match analysis on a job builds fit score, evidence gaps, STAR cards, and interview questions grounded in your vault facts. Add missing experience to the vault first and the next analysis will cite it.",
        href: "/vault",
        hrefLabel: "Open Evidence Vault",
      },
    ],
  },
  {
    id: "visual",
    label: "Visual proof & Cloudinary",
    items: [
      {
        q: "Do I need Cloudinary?",
        a: "No — without it, screenshots stay local in .agent_runs/. With it, live browser screenshots stream to the agent console and job deck during scraping and automation. Values saved in Settings → Crawler take precedence over CLOUDINARY_* in .env.",
        href: "/settings",
        hrefLabel: "Open Settings → Crawler",
      },
      {
        q: "How do I toggle visual proof thumbnails?",
        a: "Workspace defaults in Settings control whether listing screenshots show on cards and detail pages. Proof data is kept either way — the toggle only changes display density.",
        href: "/tracker",
        hrefLabel: "Open Tracker",
      },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    items: [
      {
        q: "How do I connect Gmail?",
        a: "Create a Web-application OAuth client in Google Cloud Console, save the Client ID + Secret in Settings → Connections, add the shown Redirect URI to Google's authorized list, then Connect with Google OAuth. IMAP/SMTP with an app password works as a fallback for sending and syncing.",
        href: "/settings",
        hrefLabel: "Open Settings → Connections",
      },
      {
        q: "How do I connect LinkedIn (li_at)?",
        a: "Use the browser login window in Settings → Connections, or paste your li_at session cookie (linkedin.com → F12 → Application → Cookies → copy li_at). On a checkpoint, complete verification in your browser and refresh; session-locked means another login is in progress — wait and retry.",
        href: "/settings",
        hrefLabel: "Open Settings → Connections",
      },
    ],
  },
  {
    id: "privacy",
    label: "Privacy & data",
    items: [
      {
        q: "Where is my data stored?",
        a: "Locally: jobs, contacts, emails, interviews, vault facts, and provider keys live in your local database, not in git. Exports are single JSON snapshots you control. Cloud calls only go to the providers and services you explicitly configure.",
        href: "/vault",
        hrefLabel: "Open Evidence Vault",
      },
      {
        q: "How do backup, restore, and reset work?",
        a: "Export downloads one JSON snapshot (jobs, contacts, emails, interviews, reminders, memories, vault, settings, usage). Restore replaces everything and re-seeds. Reset wipes the database and local cache and reloads clean — AI engine keys stay untouched. Always export before resetting.",
        href: "/settings",
        hrefLabel: "Open Settings → Data",
      },
    ],
  },
];

export default function FaqPage() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState<string | null>("ai-0");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATEGORIES.filter((c) => cat === "all" || c.id === cat).map((c) => ({
      ...c,
      items: c.items.filter(
        (f) => !q || f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)
      ),
    })).filter((c) => c.items.length > 0);
  }, [query, cat]);

  const count = filtered.reduce((n, c) => n + c.items.length, 0);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 overflow-x-clip px-1">
      <header className="space-y-2">
        <h1 className="font-display text-2xl font-bold text-paper sm:text-3xl">FAQ</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-dim">
          Truthful, setup-focused answers drawn from the app itself. Search or filter by category —
          each answer ends with the surface that fixes it.
        </p>
      </header>

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" aria-hidden="true" />
          <input
            id="faq-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search answers — e.g. Gmail, Ollama, Cloudinary…"
            aria-label="Search frequently asked questions"
            className="w-full rounded-xl border border-line bg-white/[0.02] py-2.5 pl-9 pr-3 text-sm text-paper placeholder:text-dim/70 focus:border-chartreuse/50 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
          {[{ id: "all", label: "All" }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label }))].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              aria-pressed={cat === c.id}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chartreuse/60",
                cat === c.id
                  ? "border-chartreuse/50 bg-chartreuse/10 text-chartreuse"
                  : "border-line bg-white/[0.02] text-dim hover:text-paper"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-dim" aria-live="polite">
          {count} answer{count === 1 ? "" : "s"}
          {query.trim() ? ` for “${query.trim()}”` : ""}
        </p>
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-line bg-white/[0.02] p-6 text-center">
          <p className="text-sm font-semibold text-paper">No answers match that search.</p>
          <p className="mt-1 text-xs text-dim">Try “Gmail”, “Ollama”, or “backup” — or walk the interactive demo.</p>
          <Link href="/guide" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-chartreuse hover:underline">
            Open Guide & Demo <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {filtered.map((c) => (
        <section key={c.id} aria-label={c.label} className="space-y-2">
          <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">{c.label}</h2>
          {c.items.map((f) => {
            const key = `${c.id}-${CATEGORIES.find((x) => x.id === c.id)!.items.indexOf(f)}`;
            const isOpen = open === key;
            return (
              <div
                key={key}
                className={cn(
                  "overflow-hidden rounded-xl border transition-colors",
                  isOpen ? "border-chartreuse/30 bg-white/[0.03]" : "border-line bg-white/[0.015]"
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : key)}
                  aria-expanded={isOpen}
                  aria-controls={`${key}-panel`}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-chartreuse/60"
                >
                  <span className="flex-1 text-xs font-semibold text-paper">{f.q}</span>
                  <ArrowUpRight className={cn("h-4 w-4 shrink-0 transition-transform", isOpen ? "rotate-90 text-chartreuse" : "text-dim")} aria-hidden="true" />
                </button>
                {isOpen && (
                  <div id={`${key}-panel`} className="px-4 pb-4">
                    <p className="max-w-3xl text-xs leading-relaxed text-dim">{f.a}</p>
                    <Link href={f.href} className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-chartreuse hover:underline">
                      {f.hrefLabel} <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
