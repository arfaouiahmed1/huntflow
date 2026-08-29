"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  FileText,
  Copy,
  Check,
  Download,
  Wand2,
  RefreshCw,
  FileDown,
  Loader2,
  Mail,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Printer,
  type LucideIcon,
} from "lucide-react";
import { JobApplication } from "@/types";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { toErrorMessage } from "@/lib/errors";
import AIStatusBadge from "@/components/ui/AIStatusBadge";

type DocType = "tailoredResume" | "coverLetter" | "motivationLetter" | "followUpEmail";

/** Render tailored resume as formatted paper view */
function ResumePaperView({ content, job }: { content: string; job: JobApplication }) {
  // Parse simple sections
  const lines = content.split("\n");
  const headerLine = lines.find((l) => l.includes("|") || l.includes("@")) || lines[0] || "";

  return (
    <div className="space-y-4 text-left select-text">
      {/* Header */}
      <div className="border-b border-neutral-300 pb-3 text-center">
        <h2 className="text-xl font-extrabold uppercase tracking-tight text-neutral-950">
          {lines[0]?.replace(/^#+\s*/, "").split("|")[0]?.trim() || "Candidate Profile"}
        </h2>
        <p className="mt-0.5 text-xs font-semibold text-sky-800">
          Target Role: {job.title} — {job.company}
        </p>
        <p className="mt-1 text-[11px] font-mono text-neutral-600">
          {headerLine.replace(/^#+\s*/, "")}
        </p>
      </div>

      {/* Render formatted body */}
      <div className="space-y-3 text-xs leading-relaxed text-neutral-800">
        {lines.slice(2).map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={idx} className="h-1.5" />;

          // Section headers
          if (trimmed.startsWith("##") || trimmed.startsWith("###") || (/^[A-Z\s]{4,}$/.test(trimmed) && trimmed.length < 30)) {
            return (
              <h3
                key={idx}
                className="text-xs font-bold uppercase tracking-wider text-sky-900 border-b border-sky-100 pb-0.5 pt-2"
              >
                {trimmed.replace(/^#+\s*/, "")}
              </h3>
            );
          }

          // Bullet points
          if (trimmed.startsWith("•") || trimmed.startsWith("-") || trimmed.startsWith("*")) {
            return (
              <div key={idx} className="flex gap-2 pl-2">
                <span className="text-sky-700 font-bold">•</span>
                <span className="flex-1 text-neutral-800 leading-normal">
                  {trimmed.replace(/^[•\-*]\s*/, "")}
                </span>
              </div>
            );
          }

          // Bold subheadings / companies / roles
          if (trimmed.startsWith("**") || trimmed.includes("—") || trimmed.includes("@")) {
            return (
              <p key={idx} className="font-semibold text-neutral-950 pt-1">
                {trimmed.replace(/\*\*/g, "")}
              </p>
            );
          }

          return (
            <p key={idx} className="text-neutral-700 leading-relaxed">
              {trimmed}
            </p>
          );
        })}
      </div>
    </div>
  );
}

/** Render formal cover / motivation letter as formatted letterhead sheet */
function LetterPaperView({ content, job, docType, candidateName }: { content: string; job: JobApplication; docType: DocType; candidateName: string }) {
  const isMotivation = docType === "motivationLetter";
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const paragraphs = content.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="space-y-5 text-left select-text max-w-2xl mx-auto">
      {/* Letterhead Header */}
      <div className="border-b-2 border-sky-800 pb-3 flex justify-between items-end">
        <div>
          <h2 className="text-lg font-bold uppercase tracking-tight text-neutral-950">{candidateName}</h2>
          <p className="text-xs font-medium text-neutral-600">
            Application for <span className="font-bold text-sky-900">{job.title}</span>
          </p>
        </div>
        <div className="text-right text-[11px] font-mono text-neutral-500">
          <p>{dateStr}</p>
          <p>{job.location || "Global / Hybrid"}</p>
        </div>
      </div>

      {/* Recipient Block */}
      <div className="text-xs text-neutral-700 space-y-0.5">
        <p className="font-bold text-neutral-900">Hiring & Engineering Team</p>
        <p className="font-semibold text-sky-900">{job.company}</p>
        <p className="text-neutral-500">{job.location || "Company Headquarters"}</p>
      </div>

      {/* Subject Line */}
      <div className="bg-neutral-100 rounded px-3 py-1.5 text-xs font-bold text-neutral-900 border-l-2 border-sky-700">
        RE: {isMotivation ? "Motivation Statement" : "Application"} for {job.title} ({job.company})
      </div>

      {/* Body Paragraphs */}
      <div className="space-y-3.5 text-xs leading-relaxed text-neutral-800">
        {paragraphs.map((p, idx) => (
          <p key={idx} className="leading-relaxed">
            {p.replace(/^#+\s*/, "").replace(/^(Dear|To)\s+.*?,?\n/i, "")}
          </p>
        ))}
      </div>

      {/* Sign-off */}
      <div className="pt-4 border-t border-neutral-200 text-xs space-y-1">
        <p className="text-neutral-600">Sincerely,</p>
        <p className="font-bold text-neutral-950 text-sm">{candidateName}</p>
      </div>
    </div>
  );
}

/** Render follow-up email in modern mail client viewport */
function EmailPaperView({ content, job, candidateName }: { content: string; job: JobApplication; candidateName: string }) {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  const subjectLine = lines.find((l) => l.toLowerCase().startsWith("subject:"))?.replace(/^subject:\s*/i, "") || `Following up on ${job.title} application — ${candidateName}`;
  const bodyLines = lines.filter((l) => !l.toLowerCase().startsWith("subject:"));

  return (
    <div className="rounded-lg border border-neutral-300 bg-neutral-50/50 shadow-sm overflow-hidden text-left select-text">
      <div className="bg-neutral-200/70 border-b border-neutral-300 px-4 py-2.5 space-y-1.5 text-xs">
        <div className="flex gap-2">
          <span className="font-semibold text-neutral-500 min-w-[55px]">To:</span>
          <span className="font-mono text-neutral-800">hiring@{job.company.toLowerCase().replace(/[^a-z0-9]/g, "")}.com</span>
        </div>
        <div className="flex gap-2">
          <span className="font-semibold text-neutral-500 min-w-[55px]">Subject:</span>
          <span className="font-bold text-neutral-950">{subjectLine}</span>
        </div>
      </div>

      <div className="p-6 bg-white space-y-3 text-xs leading-relaxed text-neutral-800">
        {bodyLines.map((line, idx) => (
          <p key={idx} className="leading-relaxed">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function DocumentsPanel({ job }: { job: JobApplication }) {
  const { generateDocuments, generateDocument, profile } = useApp();
  const { success, error: errToast, celebrate } = useToast();
  const [loading, setLoading] = useState(false);
  const [singleLoading, setSingleLoading] = useState<DocType | null>(null);
  const [pdfLoading, setPdfLoading] = useState<DocType | null>(null);
  const [activeDoc, setActiveDoc] = useState<DocType>("tailoredResume");
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(100);

  const docs = job.documents;

  const run = async () => {
    setLoading(true);
    try {
      await generateDocuments(job.id);
      setActiveDoc("tailoredResume");
      success("All 4 tailored documents created.");
      celebrate();
    } catch (e) {
      errToast(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const runSingle = async (docType: DocType) => {
    setSingleLoading(docType);
    try {
      await generateDocument(job.id, docType);
      setActiveDoc(docType);
      success(`${docList.find((d) => d.id === docType)?.label} tailored.`);
    } catch (e) {
      errToast(toErrorMessage(e));
    } finally {
      setSingleLoading(null);
    }
  };

  const docList: { id: DocType; label: string; icon: LucideIcon; hint: string }[] = [
    { id: "tailoredResume", label: "Tailored CV", icon: FileText, hint: "ATS-optimized resume" },
    { id: "coverLetter", label: "Cover Letter", icon: Wand2, hint: "3-paragraph pitch" },
    { id: "motivationLetter", label: "Motivation Letter", icon: Sparkles, hint: "Why this company" },
    { id: "followUpEmail", label: "Follow-Up Email", icon: Mail, hint: "4-day nudge" },
  ];

  const copyDoc = async () => {
    const content = docs?.[activeDoc];
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      success(`${docList.find((d) => d.id === activeDoc)?.label} copied.`);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      errToast(toErrorMessage(e));
    }
  };

  const downloadPdf = async (docType: DocType) => {
    const content = docs?.[docType];
    if (!content) return;
    setPdfLoading(docType);
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType,
          content,
          profile,
          job: {
            title: job.title,
            company: job.company,
            location: job.location,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `PDF generation failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${profile.name.replace(/\s+/g, "_")}_${docType}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
      success(`${docList.find((d) => d.id === docType)?.label} PDF exported.`);
    } catch (e) {
      errToast(toErrorMessage(e));
    } finally {
      setPdfLoading(null);
    }
  };

  const download = () => {
    const content = docs?.[activeDoc];
    if (!content) return;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${job.company.replace(/\s+/g, "_")}_${activeDoc}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {!docs ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] p-8 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-[var(--chartreuse)]" />
          <h3 className="font-display text-sm font-semibold">Application package</h3>
          <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-dim">
            Generate reviewable drafts from the master profile and saved evidence. Unsupported claims must be removed before export.
          </p>
          <Button onClick={run} loading={loading} className="mt-5">
            <Sparkles className="h-4 w-4" /> {loading ? "Generating application drafts…" : "Generate application drafts"}
          </Button>
        </div>
      ) : (
        <>
          {/* Document Selector Pills */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {docList.map(({ id, label, icon: Icon, hint }) => (
              <button
                key={id}
                onClick={() => setActiveDoc(id)}
                className={
                  "rounded-xl border p-3 text-left transition-all cursor-pointer " +
                  (activeDoc === id
                    ? "border-[var(--chartreuse)] bg-[var(--chartreuse)]/10 shadow-sm"
                    : "border-[var(--line)] bg-white/[0.02] hover:border-[var(--line)]/60")
                }
              >
                <div className="flex items-start justify-between">
                  <Icon className={"h-4 w-4 " + (activeDoc === id ? "text-[var(--chartreuse)]" : "text-dim")} />
                  {docs[id] ? (
                    <Check className="h-3.5 w-3.5 text-[var(--chartreuse)]" aria-label="Generated" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--amber)]" title="Not generated yet" />
                  )}
                </div>
                <p className={"mt-2 text-xs font-semibold " + (activeDoc === id ? "text-[var(--chartreuse)]" : "text-[var(--paper)]")}>
                  {label}
                </p>
                <p className="mt-0.5 text-[10px] text-dim">{hint}</p>
                {!docs[id] && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void runSingle(id);
                    }}
                    disabled={singleLoading === id}
                    className={
                      "mt-2 w-full rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors " +
                      (singleLoading === id
                        ? "cursor-wait border-[var(--line)] text-dim"
                        : "border-[var(--chartreuse)]/30 text-[var(--chartreuse)] hover:bg-[var(--chartreuse)]/10")
                    }
                  >
                    {singleLoading === id ? <Loader2 className="mx-auto h-3 w-3 animate-spin" /> : "Generate this one"}
                  </button>
                )}
              </button>
            ))}
          </div>

          {/* Action & Zoom Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={run} loading={loading}>
                <RefreshCw className="h-3.5 w-3.5" /> {loading ? "Regenerating drafts…" : "Regenerate drafts"}
              </Button>
              <Button variant="outline" size="sm" onClick={copyDoc} disabled={!docs[activeDoc]}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy Text"}
              </Button>
              <Button variant="outline" size="sm" onClick={download} disabled={!docs[activeDoc]}>
                <Download className="h-3.5 w-3.5" /> .txt
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => downloadPdf(activeDoc)}
                loading={pdfLoading === activeDoc}
                disabled={!docs[activeDoc]}
              >
                {pdfLoading === activeDoc ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileDown className="h-3.5 w-3.5" />
                )}
                {pdfLoading === activeDoc ? "Compiling LaTeX…" : "Export PDF"}
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint} title="Print or Save as PDF">
                <Printer className="h-3.5 w-3.5" /> Print
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <AIStatusBadge
                size="sm"
                source={docs.source}
                provider={docs.provider}
                model={docs.model}
                timestamp={docs.generatedAt}
              />

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-black/40 px-1.5 py-1">
              <button
                onClick={() => setZoom((z) => Math.max(z - 10, 50))}
                className="p-1 text-dim hover:text-[var(--paper)] rounded hover:bg-white/[0.05]"
                title="Zoom Out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="font-mono text-[11px] text-[var(--paper)] min-w-[36px] text-center">
                {zoom}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(z + 10, 150))}
                className="p-1 text-dim hover:text-[var(--paper)] rounded hover:bg-white/[0.05]"
                title="Zoom In"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setZoom(100)}
                className="p-1 text-dim hover:text-[var(--paper)] rounded hover:bg-white/[0.05]"
                title="Reset Zoom (100%)"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>

          {/* Full High-Fidelity Paper Document Canvas */}
          <div className="flex justify-center overflow-auto rounded-2xl border border-[var(--line)] bg-neutral-950/80 p-4 sm:p-6 min-h-[500px]">
            <motion.div
              key={activeDoc}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                transform: `scale(${zoom / 100})`,
                transformOrigin: "top center",
                transition: "transform 0.15s ease-out",
              }}
              className="w-full max-w-[800px] rounded-sm bg-white p-8 sm:p-12 text-neutral-900 shadow-2xl min-h-[700px] border border-neutral-300 font-sans"
            >
              {docs[activeDoc] ? (
                activeDoc === "tailoredResume" ? (
                  <ResumePaperView content={docs[activeDoc]} job={job} />
                ) : activeDoc === "followUpEmail" ? (
                  <EmailPaperView content={docs[activeDoc]} job={job} candidateName={profile.name} />
                ) : (
                  <LetterPaperView
                    content={docs[activeDoc]}
                    job={job}
                    docType={activeDoc}
                    candidateName={profile.name}
                  />
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center text-neutral-400">
                  <FileText className="h-10 w-10 text-neutral-300 mb-2" />
                  <p className="text-sm font-semibold text-neutral-600">No document content generated yet</p>
                  <p className="text-xs text-neutral-400 mt-1">Click &ldquo;Generate this one&rdquo; or &ldquo;Generate All Documents&rdquo; above.</p>
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}
