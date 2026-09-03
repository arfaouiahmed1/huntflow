"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, FileText, Copy, Check, Download, Wand2, RefreshCw, FileDown, Loader2, Mail, ZoomIn, ZoomOut, RotateCcw, Printer, type LucideIcon } from "lucide-react";
import { JobApplication } from "@/types";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { toErrorMessage } from "@/lib/errors";
import AIStatusBadge from "@/components/ui/AIStatusBadge";
import { cn } from "@/lib/utils";

type DocType = "tailoredResume" | "coverLetter" | "motivationLetter" | "followUpEmail";

function ResumePaperView({ content, job }: { content: string; job: JobApplication }) {
  const lines = content.split("\n");
  const headerLine = lines.find((l) => l.includes("|") || l.includes("@")) || lines[0] || "";
  return (
    <div className="document-paper space-y-5 text-left select-text">
      <div className="border-b border-neutral-300 pb-4 text-center space-y-1">
        <h2 className="text-[22px] font-extrabold uppercase tracking-tight text-neutral-950 leading-none">{lines[0]?.replace(/^#+\s*/, "").split("|")[0]?.trim() || "Candidate Profile"}</h2>
        <p className="text-xs font-semibold tracking-tight text-[#1F3A5F]">Target Role — {job.title} · {job.company}</p>
        <p className="text-[11px] font-mono text-neutral-600 tracking-tight">{headerLine.replace(/^#+\s*/, "")}</p>
        <div className="mx-auto mt-2 h-px w-full max-w-[640px] bg-[#1F3A5F]/20" />
      </div>
      <div className="space-y-4 text-[12.5px] leading-[1.7] text-neutral-800">
        {lines.slice(2).map((line, idx) => {
          const t = line.trim();
          if (!t) return <div key={idx} className="h-1" />;
          if (t.startsWith("##") || t.startsWith("###") || (/^[A-Z\s]{4,}$/.test(t) && t.length < 32)) {
            return <h3 key={idx} className="pt-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#1F3A5F] border-b border-[#1F3A5F]/15 pb-1">{t.replace(/^#+\s*/, "")}</h3>;
          }
          if (t.startsWith("•") || t.startsWith("-") || t.startsWith("*")) {
            return <div key={idx} className="flex gap-2 pl-2"><span className="text-[#1F3A5F] font-bold leading-none mt-[6px]">•</span><span className="flex-1 leading-normal">{t.replace(/^[•\-*]\s*/, "")}</span></div>;
          }
          if (t.startsWith("**") || t.includes("—") || t.includes("@")) {
            return <p key={idx} className="pt-1 font-semibold text-neutral-950">{t.replace(/\*\*/g, "")}</p>;
          }
          return <p key={idx} className="text-neutral-700 leading-relaxed">{t}</p>;
        })}
      </div>
    </div>
  );
}

function LetterPaperView({ content, job, docType, candidateName }: { content: string; job: JobApplication; docType: DocType; candidateName: string }) {
  const isMotivation = docType === "motivationLetter";
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const paragraphs = content.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="document-paper space-y-6 text-left select-text max-w-[680px] mx-auto">
      <div className="border-b-2 border-[#1F3A5F] pb-4 flex justify-between items-end gap-4">
        <div><h2 className="text-[18px] font-extrabold uppercase tracking-tight text-neutral-950 leading-none">{candidateName}</h2><p className="text-xs font-medium text-neutral-600 mt-1">Application for <span className="font-bold text-[#1F3A5F]">{job.title}</span></p></div>
        <div className="text-right text-[11px] font-mono leading-tight text-neutral-500 shrink-0"><p>{dateStr}</p><p>{job.location || "Global / Hybrid"}</p></div>
      </div>
      <div className="text-xs text-neutral-700 space-y-0.5 leading-relaxed"><p className="font-bold text-neutral-900">Hiring & Engineering Team</p><p className="font-semibold text-[#1F3A5F]">{job.company}</p><p className="text-neutral-500">{job.location || "Company Headquarters"}</p></div>
      <div className="rounded-lg bg-neutral-100 px-3.5 py-2 text-xs font-bold text-neutral-900 border-l-[3px] border-[#1F3A5F]">RE: {isMotivation ? "Motivation Statement" : "Application"} for {job.title} ({job.company})</div>
      <div className="space-y-3.5 text-[12.5px] leading-[1.75] text-neutral-800">{paragraphs.map((p, idx) => <p key={idx} className="leading-relaxed">{p.replace(/^#+\s*/, "").replace(/^(Dear|To)\s+.*?,?\n/i, "")}</p>)}</div>
      <div className="pt-5 border-t border-neutral-200 text-xs space-y-1"><p className="text-neutral-600 italic">Sincerely,</p><p className="font-bold text-neutral-950 text-[13px] tracking-tight">{candidateName}</p></div>
    </div>
  );
}

function EmailPaperView({ content, job, candidateName }: { content: string; job: JobApplication; candidateName: string }) {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  const subjectLine = lines.find((l) => l.toLowerCase().startsWith("subject:"))?.replace(/^subject:\s*/i, "") || `Following up on ${job.title} application — ${candidateName}`;
  const bodyLines = lines.filter((l) => !l.toLowerCase().startsWith("subject:"));
  return (
    <div className="rounded-xl border border-neutral-300 bg-white shadow-sm overflow-hidden text-left select-text">
      <div className="bg-neutral-100 border-b border-neutral-200 px-4 py-3 space-y-1.5 text-xs">
        <div className="flex gap-2"><span className="font-semibold text-neutral-500 min-w-[56px]">To:</span><span className="font-mono text-neutral-800">hiring@{job.company.toLowerCase().replace(/[^a-z0-9]/g, "")}.com</span></div>
        <div className="flex gap-2"><span className="font-semibold text-neutral-500 min-w-[56px]">Subject:</span><span className="font-bold text-neutral-950">{subjectLine}</span></div>
      </div>
      <div className="p-6 sm:p-7 bg-white space-y-3 text-[12.5px] leading-relaxed text-neutral-800">{bodyLines.map((line, idx) => <p key={idx} className="leading-relaxed">{line}</p>)}</div>
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
      const defaultTemplate: Record<DocType, string> = { tailoredResume: "classic-ats", coverLetter: "letter-cover", motivationLetter: "letter-motivation", followUpEmail: "letter-cover" };
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, content, profile, job: { title: job.title, company: job.company, location: job.location }, templateId: defaultTemplate[docType] }),
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

  const handlePrint = () => window.print();

  return (
    <div className="space-y-5">
      {!docs ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--ink-card)]/40 p-8 text-center shadow-sm">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[var(--chartreuse)]/12 ring-1 ring-[var(--chartreuse)]/20"><FileText className="h-5 w-5 text-[var(--chartreuse)]" /></div>
          <h3 className="mt-3 font-display text-sm font-semibold text-[var(--paper)]">Application package</h3>
          <p className="mx-auto mt-2 max-w-[32ch] text-xs leading-relaxed text-dim">Generate reviewable drafts from the master profile and saved evidence. Unsupported claims must be removed before export.</p>
          <Button onClick={run} loading={loading} className="mt-5"><Sparkles className="h-4 w-4" /> {loading ? "Generating application drafts…" : "Generate application drafts"}</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {docList.map(({ id, label, icon: Icon, hint }) => {
              const active = activeDoc === id;
              const generated = Boolean(docs[id]);
              return (
                <button key={id} onClick={() => setActiveDoc(id)} className={cn("group relative rounded-2xl border p-3.5 text-left transition-all cursor-pointer", active ? "border-[var(--chartreuse)] bg-[var(--chartreuse)]/10 shadow-[0_8px_24px_rgba(185,237,87,0.12)]" : "border-[var(--line)] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]")}>
                  <div className="flex items-start justify-between"><Icon className={cn("h-4 w-4", active ? "text-[var(--chartreuse)]" : "text-dim group-hover:text-[var(--paper)]")} />{generated ? <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--chartreuse)] text-neutral-950"><Check className="h-3 w-3" /></span> : <span className="h-2 w-2 rounded-full bg-[var(--amber)] mt-1" title="Not generated yet" />}</div>
                  <p className={cn("mt-2.5 text-xs font-bold leading-none", active ? "text-[var(--chartreuse)]" : "text-[var(--paper)]")}>{label}</p>
                  <p className="mt-1 text-[10px] leading-none text-dim">{hint}</p>
                  {!generated && <button onClick={(e) => { e.stopPropagation(); void runSingle(id); }} disabled={singleLoading === id} className={cn("mt-2.5 w-full rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition-colors", singleLoading === id ? "cursor-wait border-[var(--line)] text-dim" : "border-[var(--chartreuse)]/30 text-[var(--chartreuse)] hover:bg-[var(--chartreuse)]/10")}>{singleLoading === id ? <Loader2 className="mx-auto h-3 w-3 animate-spin" /> : "Generate this one"}</button>}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-black/20 p-2 backdrop-blur">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={run} loading={loading} className="border-[var(--line)] bg-white/[0.04] hover:bg-white/[0.06]"><RefreshCw className="h-3.5 w-3.5" /> {loading ? "Regenerating…" : "Regenerate"}</Button>
              <span className="hidden h-4 w-px bg-[var(--line)] sm:inline-block" aria-hidden />
              <Button variant="ghost" size="sm" onClick={copyDoc} disabled={!docs[activeDoc]} className="text-dim hover:text-[var(--paper)] hover:bg-white/[0.06]">{copied ? <Check className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}</Button>
              <Button variant="ghost" size="sm" onClick={download} disabled={!docs[activeDoc]} className="text-dim hover:text-[var(--paper)]"><Download className="h-3.5 w-3.5" /> .txt</Button>
              <Button variant="primary" size="sm" onClick={() => downloadPdf(activeDoc)} loading={pdfLoading === activeDoc} disabled={!docs[activeDoc]} title="Exports via the same LaTeX template registry as Resume Studio — parity with /api/resume/compile">{pdfLoading === activeDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}{pdfLoading === activeDoc ? "Compiling LaTeX…" : "Export PDF"}</Button>
              <Button variant="ghost" size="sm" onClick={handlePrint} className="text-dim"><Printer className="h-3.5 w-3.5" /> Print</Button>
            </div>
            <div className="flex items-center gap-2">
              <AIStatusBadge size="sm" source={docs.source} provider={docs.provider} model={docs.model} timestamp={docs.generatedAt} />
              <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--ink-card)]/80 px-1.5 py-1 shadow-sm">
                <button onClick={() => setZoom((z) => Math.max(z - 10, 60))} className="grid h-6 w-6 place-items-center rounded-md text-dim hover:text-[var(--paper)] hover:bg-white/[0.06] transition-colors" title="Zoom Out"><ZoomOut className="h-3.5 w-3.5" /></button>
                <span className="font-mono text-[11px] font-semibold text-[var(--paper)] min-w-[38px] text-center tabular-nums">{zoom}%</span>
                <button onClick={() => setZoom((z) => Math.min(z + 10, 140))} className="grid h-6 w-6 place-items-center rounded-md text-dim hover:text-[var(--paper)] hover:bg-white/[0.06] transition-colors" title="Zoom In"><ZoomIn className="h-3.5 w-3.5" /></button>
                <button onClick={() => setZoom(100)} className="grid h-6 w-6 place-items-center rounded-md text-dim hover:text-[var(--paper)] hover:bg-white/[0.06] transition-colors" title="Reset 100%"><RotateCcw className="h-3 w-3" /></button>
              </div>
            </div>
          </div>

          <div className="flex justify-center overflow-auto rounded-2xl border border-[var(--line)] bg-[var(--ink-deep)] p-4 sm:p-7 min-h-[520px] shadow-inner">
            <motion.div key={activeDoc} initial={{ opacity: 0, y: 8, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center", transition: "transform 0.18s cubic-bezier(0.22,1,0.36,1)" }} className="w-full max-w-[820px] rounded-[3px] bg-[#fffefb] p-8 sm:p-12 text-neutral-900 shadow-[0_28px_80px_rgba(0,0,0,0.35),0_4px_16px_rgba(0,0,0,0.08)] min-h-[720px] border border-neutral-200">
              {docs[activeDoc] ? (
                activeDoc === "tailoredResume" ? <ResumePaperView content={docs[activeDoc]} job={job} /> : activeDoc === "followUpEmail" ? <EmailPaperView content={docs[activeDoc]} job={job} candidateName={profile.name} /> : <LetterPaperView content={docs[activeDoc]} job={job} docType={activeDoc} candidateName={profile.name} />
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center text-neutral-400"><FileText className="h-10 w-10 text-neutral-300 mb-3" /><p className="text-sm font-semibold text-neutral-600">No document content generated yet</p><p className="text-xs text-neutral-500 mt-1">Click “Generate this one” or “Regenerate” above.</p></div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}
