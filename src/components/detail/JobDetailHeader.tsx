"use client";
import { useState } from "react";
import { MapPin, Link2, ExternalLink, X, Check, Copy } from "lucide-react";
import { displayJobCompany, displayJobTitle } from "@/lib/jobDisplay";
import { companyLogoUrl } from "@/lib/companyLogo";
import { scoreColor, cn } from "@/lib/utils";
import StatusBadge from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import type { JobApplication } from "@/types";
interface JobDetailHeaderProps { job: JobApplication; mode: "drawer" | "page"; onClose?: () => void; headerActions?: React.ReactNode; className?: string; }
function postingHost(url: string | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./i, ""); } catch { return null; }
}
export default function JobDetailHeader({ job, mode, onClose, headerActions, className }: JobDetailHeaderProps) {
  const { success, error } = useToast();
  const [logoFailed, setLogoFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const displayTitle = displayJobTitle(job);
  const displayCompany = displayJobCompany(job);
  const sourceHost = postingHost(job.url);
  const logo = logoFailed ? null : companyLogoUrl(displayCompany, job.url);
  const copyUrl = async () => {
    if (!job.url) return;
    try { await navigator.clipboard.writeText(job.url); setCopied(true); success("Link copied to clipboard."); setTimeout(() => setCopied(false), 1500); }
    catch (err) { error(err instanceof Error ? err.message : "Clipboard copy failed."); }
  };
  if (mode === "drawer") {
    return (
      <div className={cn("border-b border-[var(--line)] px-6 py-5 shrink-0", className)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={`${displayCompany} logo`} onError={() => setLogoFailed(true)} className="h-12 w-12 shrink-0 rounded-xl border border-[var(--line)] object-cover" />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded-xl border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 font-display text-base font-bold text-[var(--chartreuse)] shrink-0">
                {displayCompany.charAt(0).toUpperCase() || "?"}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold text-[var(--paper)] truncate">{displayTitle}</h2>
              <p className="text-sm text-dim truncate">{displayCompany}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {headerActions}
            {onClose && (
              <button onClick={onClose} aria-label="Close drawer" className="grid h-9 w-9 place-items-center rounded-lg text-dim hover:bg-white/5 hover:text-[var(--paper)] cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-dim">
          <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {job.location}</span>
          {job.url && <a href={job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[var(--chartreuse)] hover:underline"><Link2 className="h-3.5 w-3.5" /> View posting</a>}
        </div>
      </div>
    );
  }
  return (
    <section className={cn("overflow-hidden rounded-3xl border border-[var(--line)] bg-[linear-gradient(125deg,rgba(185,237,87,0.10),rgba(19,26,35,0.88)_42%,rgba(107,199,255,0.08))] p-5 sm:p-7", className)}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={`${displayCompany} logo`} onError={() => setLogoFailed(true)} className="h-14 w-14 shrink-0 rounded-2xl border border-[var(--line)] bg-white object-cover sm:h-16 sm:w-16" />
          ) : (
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 font-display text-xl font-bold text-[var(--chartreuse)] sm:h-16 sm:w-16">{displayCompany.charAt(0).toUpperCase() || "?"}</div>
          )}
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={job.status} />
              {typeof job.skillsGap?.matchScore === "number" ? (
                <span className="rounded-full border border-[var(--line)] bg-black/20 px-2.5 py-1 font-mono text-[11px] font-bold" style={{ color: scoreColor(job.skillsGap.matchScore) }}>
                  HuntFlow fit: {job.skillsGap.matchScore}%{job.skillsGap.fit ? ` · ${job.skillsGap.fit.replace(/_/g, " ")}` : ""}
                </span>
              ) : typeof job.matchScore === "number" ? (
                <span className="rounded-full border border-[var(--line)] bg-black/20 px-2.5 py-1 font-mono text-[11px] font-bold text-dim">Stored discovery score: {job.matchScore}%</span>
              ) : null}
              {(job.source || sourceHost) && <span className="rounded-full border border-[var(--line)] bg-black/20 px-2.5 py-1 text-[11px] text-dim">Source: {job.source || sourceHost}</span>}
            </div>
            <h1 className="max-w-4xl font-display text-2xl font-bold leading-tight text-[var(--paper)] sm:text-3xl">{displayTitle}</h1>
            <p className="mt-1 text-base font-medium text-dim">{displayCompany}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dim">
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {job.location || "Location not specified"}</span>
              {job.url && <a href={job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[var(--chartreuse)] hover:underline"><Link2 className="h-3.5 w-3.5" /> View posting</a>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {job.url && <a href={job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-black/20 px-3.5 py-2.5 text-xs font-semibold text-[var(--paper)] hover:border-[var(--chartreuse)]/40 hover:text-[var(--chartreuse)]"><ExternalLink className="h-3.5 w-3.5" /> Open original posting</a>}
          <Button variant="outline" onClick={copyUrl} disabled={!job.url}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy link"}</Button>
          {headerActions}
        </div>
      </div>
    </section>
  );
}
