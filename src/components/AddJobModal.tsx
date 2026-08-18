"use client";

import { useState } from "react";
import { Link2, FileText, Sparkles } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { useApp } from "@/context/AppContext";
import { ApplicationStatus } from "@/types";
import { cn } from "@/lib/utils";
import { statusConfig, STATUS_ORDER } from "@/components/ui/StatusBadge";

interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  description: string;
  salary: string;
}

export default function AddJobModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addApplication, scrapeJobOffer } = useApp();
  const [mode, setMode] = useState<"url" | "manual">("url");
  const [url, setUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
  const [scraped, setScraped] = useState<ScrapedJob | null>(null);

  const [form, setForm] = useState({
    title: "",
    company: "",
    location: "",
    salary: "",
    description: "",
    status: "wishlist" as ApplicationStatus,
  });

  const handleScrape = async () => {
    if (!url.trim()) return;
    setScraping(true);
    setScrapeError("");
    try {
      const result = await scrapeJobOffer(url.trim());
      setScraped(result);
      setForm({
        title: result.title,
        company: result.company,
        location: result.location,
        salary: result.salary,
        description: result.description,
        status: "wishlist",
      });
    } catch (e: unknown) {
      setScrapeError(e instanceof Error ? e.message : "Failed to scrape job offer.");
    } finally {
      setScraping(false);
    }
  };

  const reset = () => {
    setUrl("");
    setScraped(null);
    setScrapeError("");
    setForm({ title: "", company: "", location: "", salary: "", description: "", status: "wishlist" });
  };

  const handleSubmit = () => {
    if (!form.title || !form.company || !form.description) return;
    addApplication({
      title: form.title,
      company: form.company,
      location: form.location || "Remote",
      salary: form.salary,
      url: scraped ? url.trim() : undefined,
      status: form.status,
      jobDescription: form.description,
    });
    reset();
    onClose();
  };

  const field =
    "w-full rounded-xl border border-[var(--line)] bg-white/[0.03] px-3.5 py-2.5 text-sm text-[var(--paper)] outline-none transition-colors placeholder:text-[var(--paper-dim)]/60 focus:border-[var(--chartreuse)]/50";

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Track New Opportunity" wide>
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-[var(--line)] bg-white/[0.02] p-1">
        <button
          onClick={() => setMode("url")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors",
            mode === "url" ? "bg-[var(--chartreuse)] text-ink" : "text-dim hover:text-[var(--paper)]"
          )}
        >
          <Link2 className="h-4 w-4" /> From URL
        </button>
        <button
          onClick={() => setMode("manual")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors",
            mode === "manual" ? "bg-[var(--chartreuse)] text-ink" : "text-dim hover:text-[var(--paper)]"
          )}
        >
          <FileText className="h-4 w-4" /> Manual Entry
        </button>
      </div>

      {mode === "url" && (
        <div className="mb-6">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-dim">
            Job Offer URL
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
              <input
                className={cn(field, "pl-10")}
                placeholder="https://careers.awesomecorp.com/jobs/123"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleScrape()}
              />
            </div>
            <Button onClick={handleScrape} loading={scraping} disabled={!url.trim()}>
              {scraping ? "Analyzing…" : <><Sparkles className="h-4 w-4" /> Extract</>}
            </Button>
          </div>
          {scrapeError && <p className="mt-2 text-xs text-[var(--coral)]">{scrapeError}</p>}
          {scraping && (
            <div className="mt-4 space-y-2">
              {["Scrapling engine loading…", "Inspecting DOM schema…", "Extracting job intelligence…"].map((s, i) => (
                <div key={s} className="flex items-center gap-2 text-xs text-dim">
                  <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-[var(--chartreuse)]" style={{ animationDelay: `${i * 0.3}s` }} />
                  <span className="font-mono">{s}</span>
                </div>
              ))}
            </div>
          )}
          {scraped && (
            <div className="mt-4 rounded-xl border border-[var(--chartreuse)]/25 bg-[var(--chartreuse)]/5 p-3 text-xs text-[var(--chartreuse)]">
              <span className="font-semibold">✓ Extracted</span> — {scraped.title} @ {scraped.company}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-dim">Job Title *</label>
          <input className={field} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-dim">Company *</label>
          <input className={field} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        </div>
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-dim">Location</label>
          <input className={field} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </div>
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-dim">Salary Range</label>
          <input className={field} value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-dim">Status</label>
          <Select
            ariaLabel="Status"
            value={form.status}
            onChange={(s: ApplicationStatus) => setForm({ ...form, status: s })}
            options={STATUS_ORDER.map((s) => ({ value: s, label: statusConfig[s].label, dot: statusConfig[s].dot }))}
            className="w-full [&>button]:px-3.5 [&>button]:py-2.5 [&>button]:text-sm [&>button]:rounded-xl"
            placeholder="Select status…"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-dim">
            Job Description * {form.description.length > 0 && <span className="text-dim">({form.description.length} chars)</span>}
          </label>
          <textarea
            className={cn(field, "min-h-[160px] resize-y leading-relaxed")}
            placeholder="Paste the full job description here — the AI engine uses it to tailor resumes, score fit, and build flashcards…"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={!form.title || !form.company || !form.description}>
          Add to Tracker
        </Button>
      </div>
    </Modal>
  );
}
