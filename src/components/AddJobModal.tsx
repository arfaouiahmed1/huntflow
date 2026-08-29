"use client";

import { useState } from "react";
import { Link2, FileText, Sparkles, AlertCircle } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { useApp } from "@/context/AppContext";
import { ApplicationStatus } from "@/types";
import { cn } from "@/lib/utils";
import { statusConfig, STATUS_ORDER } from "@/components/ui/StatusBadge";
import {
  AddJobSchema,
  ScrapeUrlSchema,
  formatZodErrors,
  AddJobFormData,
  FormErrors,
} from "@/lib/validation";

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

  const [form, setForm] = useState<AddJobFormData>({
    title: "",
    company: "",
    location: "Remote",
    postalCode: "",
    salary: "",
    description: "",
    status: "wishlist" as ApplicationStatus,
  });

  const [errors, setErrors] = useState<FormErrors<AddJobFormData>>({});

  const handleScrape = async () => {
    setScrapeError("");
    const urlValidation = ScrapeUrlSchema.safeParse({ url });
    if (!urlValidation.success) {
      setScrapeError(urlValidation.error.issues[0]?.message || "Please enter a valid URL.");
      return;
    }

    setScraping(true);
    try {
      const result = await scrapeJobOffer(url.trim());
      setScraped(result);
      setForm({
        title: result.title,
        company: result.company,
        location: result.location || "Remote",
        postalCode: "",
        salary: result.salary,
        description: result.description,
        status: "wishlist",
      });
      setErrors({});
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
    setErrors({});
    setForm({ title: "", company: "", location: "Remote", postalCode: "", salary: "", description: "", status: "wishlist" });
  };

  const handleSubmit = () => {
    const result = AddJobSchema.safeParse(form);
    if (!result.success) {
      const errMap = formatZodErrors(result.error);
      setErrors(errMap);
      return;
    }

    addApplication({
      title: result.data.title,
      company: result.data.company,
      location: result.data.location || "Remote",
      postalCode: result.data.postalCode,
      salary: result.data.salary,
      url: scraped ? url.trim() : result.data.url,
      status: result.data.status,
      jobDescription: result.data.description,
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
                className={cn(field, "pl-10", scrapeError && "border-[var(--coral)] focus:border-[var(--coral)]")}
                placeholder="https://careers.awesomecorp.com/jobs/123"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (scrapeError) setScrapeError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleScrape()}
              />
            </div>
            <Button onClick={handleScrape} loading={scraping} disabled={!url.trim()}>
              {scraping ? "Analyzing…" : <><Sparkles className="h-4 w-4" /> Extract</>}
            </Button>
          </div>
          {scrapeError && (
            <p className="mt-2 flex items-center gap-1 text-xs text-[var(--coral)]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{scrapeError}</span>
            </p>
          )}
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
          <input
            className={cn(field, errors.title && "border-[var(--coral)] focus:border-[var(--coral)]")}
            value={form.title}
            onChange={(e) => {
              setForm({ ...form, title: e.target.value });
              if (errors.title) setErrors((err) => { const next = { ...err }; delete next.title; return next; });
            }}
          />
          {errors.title && (
            <p className="mt-1 flex items-center gap-1 text-xs text-[var(--coral)]">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>{errors.title}</span>
            </p>
          )}
        </div>
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-dim">Company *</label>
          <input
            className={cn(field, errors.company && "border-[var(--coral)] focus:border-[var(--coral)]")}
            value={form.company}
            onChange={(e) => {
              setForm({ ...form, company: e.target.value });
              if (errors.company) setErrors((err) => { const next = { ...err }; delete next.company; return next; });
            }}
          />
          {errors.company && (
            <p className="mt-1 flex items-center gap-1 text-xs text-[var(--coral)]">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>{errors.company}</span>
            </p>
          )}
        </div>
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-dim">Location</label>
          <input
            className={field}
            value={form.location}
            placeholder="e.g. Remote or Paris, France"
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-dim">Postal Code (ZIP)</label>
          <input
            className={cn(field, errors.postalCode && "border-[var(--coral)] focus:border-[var(--coral)]")}
            value={form.postalCode ?? ""}
            placeholder="e.g. 75001 or 10001"
            onChange={(e) => {
              setForm({ ...form, postalCode: e.target.value });
              if (errors.postalCode) setErrors((err) => { const n = { ...err }; delete n.postalCode; return n; });
            }}
          />
          {errors.postalCode && (
            <p className="mt-1 flex items-center gap-1 text-xs text-[var(--coral)]">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>{errors.postalCode}</span>
            </p>
          )}
        </div>
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-dim">Salary Range</label>
          <input
            className={field}
            value={form.salary}
            placeholder="e.g. $120k - $150k"
            onChange={(e) => setForm({ ...form, salary: e.target.value })}
          />
        </div>
        <div>
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
            className={cn(
              field,
              "min-h-[160px] resize-y leading-relaxed",
              errors.description && "border-[var(--coral)] focus:border-[var(--coral)]"
            )}
            placeholder="Paste the full job description here — the AI engine uses it to tailor resumes, score fit, and build flashcards…"
            value={form.description}
            onChange={(e) => {
              setForm({ ...form, description: e.target.value });
              if (errors.description) setErrors((err) => { const next = { ...err }; delete next.description; return next; });
            }}
          />
          {errors.description && (
            <p className="mt-1 flex items-center gap-1 text-xs text-[var(--coral)]">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>{errors.description}</span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
        <Button onClick={handleSubmit}>
          Add to Tracker
        </Button>
      </div>
    </Modal>
  );
}
