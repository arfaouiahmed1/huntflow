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
  type LucideIcon,
} from "lucide-react";
import { JobApplication } from "@/types";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { toErrorMessage } from "@/lib/errors";

type DocType = "tailoredResume" | "coverLetter" | "motivationLetter" | "followUpEmail";

export default function DocumentsPanel({ job }: { job: JobApplication }) {
  const { generateDocuments, profile } = useApp();
  const { success, error: errToast, celebrate } = useToast();
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<DocType | null>(null);
  const [activeDoc, setActiveDoc] = useState<DocType>("tailoredResume");
  const [copied, setCopied] = useState(false);

  const docs = job.documents;

  const run = async () => {
    setLoading(true);
    try {
      await generateDocuments(job.id);
      setActiveDoc("tailoredResume");
      success("All 4 documents tailored.");
      celebrate();
    } catch (e) {
      errToast(toErrorMessage(e));
    } finally {
      setLoading(false);
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
    await navigator.clipboard.writeText(content);
    setCopied(true);
    success(`${docList.find((d) => d.id === activeDoc)?.label} copied.`);
    setTimeout(() => setCopied(false), 1500);
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

  return (
    <div className="space-y-5">
      {!docs ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] p-8 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-[var(--chartreuse)]" />
          <h3 className="font-display text-sm font-semibold">Tailored Documents</h3>
          <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-dim">
            One click generates all four: tailored CV, cover letter, motivation letter, and follow-up email.
          </p>
          <Button onClick={run} loading={loading} className="mt-5">
            <Sparkles className="h-4 w-4" /> {loading ? "Generating all 4 documents…" : "Generate All Documents"}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {docList.map(({ id, label, icon: Icon, hint }) => (
              <button
                key={id}
                onClick={() => setActiveDoc(id)}
                className={
                  "rounded-xl border p-3 text-left transition-colors " +
                  (activeDoc === id
                    ? "border-[var(--chartreuse)]/50 bg-[var(--chartreuse)]/10"
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
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={run} loading={loading}>
              <RefreshCw className="h-3.5 w-3.5" /> {loading ? "Regenerating all…" : "Regenerate All"}
            </Button>
            <Button variant="outline" size="sm" onClick={copyDoc} disabled={!docs[activeDoc]}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
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
            {activeDoc !== "followUpEmail" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadPdf("followUpEmail")}
                loading={pdfLoading === "followUpEmail"}
                disabled={!docs.followUpEmail}
              >
                <Mail className="h-3.5 w-3.5" /> Email PDF
              </Button>
            )}
          </div>

          <motion.div
            key={activeDoc}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-h-[460px] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5"
          >
            <pre className="markdown-body whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed">
              {docs[activeDoc] || "No content generated yet."}
            </pre>
          </motion.div>
        </>
      )}
    </div>
  );
}
