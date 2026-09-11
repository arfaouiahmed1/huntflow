"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
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
  Printer,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { JobApplication, ResumeDocKind } from "@/types";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { toErrorMessage } from "@/lib/errors";
import AIStatusBadge from "@/components/ui/AIStatusBadge";
import { cn } from "@/lib/utils";

const PdfViewer = dynamic(() => import("@/components/resume/PdfViewer"), { ssr: false });

type DocType = "tailoredResume" | "coverLetter" | "motivationLetter" | "followUpEmail";

const defaultTemplate: Record<DocType, string> = {
  tailoredResume: "classic-ats",
  coverLetter: "letter-cover",
  motivationLetter: "letter-motivation",
  followUpEmail: "letter-cover",
};

const kindMap: Record<DocType, ResumeDocKind> = {
  tailoredResume: "resume",
  coverLetter: "cover_letter",
  motivationLetter: "motivation_letter",
  followUpEmail: "cover_letter",
};

export default function DocumentsPanel({ job }: { job: JobApplication }) {
  const router = useRouter();
  const { generateDocuments, generateDocument, profile } = useApp();
  const { success, error: errToast, celebrate } = useToast();
  const [loading, setLoading] = useState(false);
  const [singleLoading, setSingleLoading] = useState<DocType | null>(null);
  const [pdfLoading, setPdfLoading] = useState<DocType | null>(null);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [activeDoc, setActiveDoc] = useState<DocType>("tailoredResume");
  const [copied, setCopied] = useState(false);
  const [pdfCache, setPdfCache] = useState<Record<DocType, ArrayBuffer | null>>({
    tailoredResume: null,
    coverLetter: null,
    motivationLetter: null,
    followUpEmail: null,
  });
  const [pdfError, setPdfError] = useState<string | null>(null);

  const docs = job.documents;

  const docList: { id: DocType; label: string; icon: LucideIcon; hint: string }[] = [
    { id: "tailoredResume", label: "Tailored CV", icon: FileText, hint: "ATS-optimized resume" },
    { id: "coverLetter", label: "Cover Letter", icon: Wand2, hint: "3-paragraph pitch" },
    { id: "motivationLetter", label: "Motivation Letter", icon: Sparkles, hint: "Why this company" },
    { id: "followUpEmail", label: "Follow-Up Email", icon: Mail, hint: "4-day nudge" },
  ];

  const compilePdfForDoc = useCallback(
    async (docType: DocType, force = false): Promise<ArrayBuffer | null> => {
      const content = docs?.[docType];
      if (!content || !content.trim()) return null;
      if (!force && pdfCache[docType]) return pdfCache[docType];

      setPdfLoading(docType);
      setPdfError(null);
      try {
        const res = await fetch("/api/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            docType,
            content,
            profile,
            job: { title: job.title, company: job.company, location: job.location },
            templateId: defaultTemplate[docType],
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `PDF compile failed (HTTP ${res.status})`);
        }
        const buf = await res.arrayBuffer();
        setPdfCache((prev) => ({ ...prev, [docType]: buf }));
        return buf;
      } catch (e) {
        const msg = toErrorMessage(e);
        setPdfError(msg);
        return null;
      } finally {
        setPdfLoading(null);
      }
    },
    [docs, pdfCache, profile, job.title, job.company, job.location]
  );

  useEffect(() => {
    if (docs?.[activeDoc] && !pdfCache[activeDoc] && pdfLoading !== activeDoc) {
      void compilePdfForDoc(activeDoc);
    }
  }, [activeDoc, docs, pdfCache, pdfLoading, compilePdfForDoc]);

  const run = async () => {
    setLoading(true);
    try {
      await generateDocuments(job.id);
      setActiveDoc("tailoredResume");
      setPdfCache({
        tailoredResume: null,
        coverLetter: null,
        motivationLetter: null,
        followUpEmail: null,
      });
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
      setPdfCache((prev) => ({ ...prev, [docType]: null }));
      success(`${docList.find((d) => d.id === docType)?.label} tailored.`);
    } catch (e) {
      errToast(toErrorMessage(e));
    } finally {
      setSingleLoading(null);
    }
  };

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
    let buf = pdfCache[docType];
    if (!buf) {
      buf = await compilePdfForDoc(docType, true);
    }
    if (!buf) return;
    const blob = new Blob([buf], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${profile.name.replace(/\s+/g, "_")}_${docType}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
    success(`${docList.find((d) => d.id === docType)?.label} PDF exported.`);
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

  const openInStudio = async () => {
    const content = docs?.[activeDoc];
    if (!content) return;
    setHandoffLoading(true);
    try {
      const texRes = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType: activeDoc,
          content,
          profile,
          job: { title: job.title, company: job.company, location: job.location },
          templateId: defaultTemplate[activeDoc],
          format: "tex",
        }),
      });
      if (!texRes.ok) {
        throw new Error(`Failed to generate LaTeX source (HTTP ${texRes.status})`);
      }
      const texData = (await texRes.json()) as { ok?: boolean; tex?: string };
      const tex = texData.tex || "";

      const docName =
        activeDoc === "followUpEmail"
          ? `${job.company} — Follow-Up`
          : `${job.company} — ${docList.find((d) => d.id === activeDoc)?.label || "Document"}`;

      const saveRes = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: docName,
          kind: kindMap[activeDoc],
          templateId: defaultTemplate[activeDoc],
          tex,
          targetJobId: job.id,
          autoCompile: true,
        }),
      });
      if (!saveRes.ok) {
        throw new Error(`Failed to save into Resume Studio (HTTP ${saveRes.status})`);
      }
      const saveData = (await saveRes.json()) as { ok?: boolean; doc?: { id: string } };
      const docId = saveData.doc?.id;
      if (!docId) throw new Error("No doc ID returned from server.");
      success("Document saved to Studio. Opening editor…");
      router.push(`/resume?docId=${encodeURIComponent(docId)}`);
    } catch (e) {
      errToast(toErrorMessage(e));
    } finally {
      setHandoffLoading(false);
    }
  };

  const currentPdfData = pdfCache[activeDoc];
  const isCompilingCurrent = pdfLoading === activeDoc;
  const currentPdfState: "idle" | "compiling" | "ready" | "error" = isCompilingCurrent
    ? "compiling"
    : pdfError
      ? "error"
      : currentPdfData
        ? "ready"
        : "idle";

  return (
    <div className="space-y-5">
      {!docs ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--ink-card)]/40 p-8 text-center shadow-sm">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[var(--chartreuse)]/12 ring-1 ring-[var(--chartreuse)]/20">
            <FileText className="h-5 w-5 text-[var(--chartreuse)]" />
          </div>
          <h3 className="mt-3 font-display text-sm font-semibold text-[var(--paper)]">Application package</h3>
          <p className="mx-auto mt-2 max-w-[32ch] text-xs leading-relaxed text-dim">
            Generate reviewable drafts from the master profile and saved evidence. Unsupported claims must be removed before export.
          </p>
          <Button onClick={run} loading={loading} className="mt-5">
            <Sparkles className="h-4 w-4" /> {loading ? "Generating application drafts…" : "Generate application drafts"}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {docList.map(({ id, label, icon: Icon, hint }) => {
              const active = activeDoc === id;
              const generated = Boolean(docs[id]);
              return (
                <button
                  key={id}
                  onClick={() => setActiveDoc(id)}
                  className={cn(
                    "group relative rounded-2xl border p-3.5 text-left transition-all cursor-pointer",
                    active
                      ? "border-[var(--chartreuse)] bg-[var(--chartreuse)]/10 shadow-[0_8px_24px_rgba(185,237,87,0.12)]"
                      : "border-[var(--line)] bg-[var(--ink-soft)]/50 hover:bg-[var(--ink-soft)]"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <Icon className={cn("h-4 w-4", active ? "text-[var(--chartreuse)]" : "text-dim group-hover:text-[var(--paper)]")} />
                    {generated ? (
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--chartreuse)] text-neutral-950">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-[var(--amber)] mt-1" title="Not generated yet" />
                    )}
                  </div>
                  <p className={cn("mt-2.5 text-xs font-bold leading-none", active ? "text-[var(--chartreuse)]" : "text-[var(--paper)]")}>{label}</p>
                  <p className="mt-1 text-[10px] leading-none text-dim">{hint}</p>
                  {!generated && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void runSingle(id);
                      }}
                      disabled={singleLoading === id}
                      className={cn(
                        "mt-2.5 w-full rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition-colors",
                        singleLoading === id
                          ? "cursor-wait border-[var(--line)] text-dim"
                          : "border-[var(--chartreuse)]/30 text-[var(--chartreuse)] hover:bg-[var(--chartreuse)]/10"
                      )}
                    >
                      {singleLoading === id ? <Loader2 className="mx-auto h-3 w-3 animate-spin" /> : "Generate this one"}
                    </button>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--ink-soft)]/50 p-2 backdrop-blur">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={run} loading={loading} className="border-[var(--line)] bg-[var(--ink-card)] hover:bg-[var(--ink-soft)] text-[var(--paper)]">
                <RefreshCw className="h-3.5 w-3.5" /> {loading ? "Regenerating…" : "Regenerate"}
              </Button>
              <span className="hidden h-4 w-px bg-[var(--line)] sm:inline-block" aria-hidden />
              <Button
                variant="ghost"
                size="sm"
                onClick={copyDoc}
                disabled={!docs[activeDoc]}
                className="text-dim hover:text-[var(--paper)] hover:bg-[var(--ink-soft)]"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button variant="ghost" size="sm" onClick={download} disabled={!docs[activeDoc]} className="text-dim hover:text-[var(--paper)]">
                <Download className="h-3.5 w-3.5" /> .txt
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => downloadPdf(activeDoc)}
                loading={pdfLoading === activeDoc}
                disabled={!docs[activeDoc]}
                title="Exports via the same LaTeX template registry as Resume Studio — parity with /api/resume/compile"
              >
                {pdfLoading === activeDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                {pdfLoading === activeDoc ? "Compiling LaTeX…" : "Export PDF"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={openInStudio}
                loading={handoffLoading}
                disabled={!docs[activeDoc]}
                title="Open this document in Resume Studio with raw .tex editor and copilot"
                className="border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)] hover:bg-[var(--chartreuse)]/20"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open in Studio
              </Button>
              <Button variant="ghost" size="sm" onClick={handlePrint} className="text-dim">
                <Printer className="h-3.5 w-3.5" /> Print
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <AIStatusBadge size="sm" source={docs.source} provider={docs.provider} model={docs.model} timestamp={docs.generatedAt} />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--ink-deep)] p-2 sm:p-4 min-h-[520px] shadow-inner">
            {docs[activeDoc] ? (
              <PdfViewer
                compact
                pdfData={currentPdfData}
                token={null}
                latencyMs={null}
                pdfState={currentPdfState}
                pdfError={pdfError}
                stale={false}
                onDownload={() => downloadPdf(activeDoc)}
                downloading={pdfLoading === activeDoc}
                onForward={async () => null}
                onReverse={async () => null}
                forwardBusy={false}
                reverseBusy={false}
                onRevealLine={() => {}}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center text-dim">
                <FileText className="h-10 w-10 text-dim/60 mb-3" />
                <p className="text-sm font-semibold text-[var(--paper)]">No document content generated yet</p>
                <p className="text-xs text-dim mt-1">Click “Generate this one” or “Regenerate” above.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
