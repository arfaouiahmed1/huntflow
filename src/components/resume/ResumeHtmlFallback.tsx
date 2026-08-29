"use client";

import { FileText, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResumeContent } from "@/types";

type PdfState = "idle" | "compiling" | "ready" | "no-tex" | "error";

interface Props {
  resume: ResumeContent;
  selectedTemplate: string;
  fontFamilyFallback?: string;
  usesDocumentSerif?: boolean;
  zoom: number;
  isDragging: boolean;
  effectiveHighlight?: string | null;
  htmlOpen: boolean;
  onToggle: () => void;
  pdfUrl: string | null;
  pdfState: PdfState;
}

export default function ResumeHtmlFallback({
  resume,
  selectedTemplate,
  fontFamilyFallback = "sans",
  usesDocumentSerif = false,
  zoom,
  isDragging,
  effectiveHighlight = null,
  htmlOpen,
  onToggle,
  pdfUrl,
  pdfState,
}: Props) {
  const labeled = pdfState === "no-tex" || pdfState === "error";
  return (
    <>
      <div className="w-full px-4 pt-4 sm:px-8">
        <button type="button" data-testid="html-preview-toggle" onClick={onToggle} className="mx-auto flex w-full max-w-[900px] cursor-pointer items-center justify-between rounded-lg border border-black/10 bg-white/85 px-3 py-1.5 text-[10px] font-semibold text-neutral-600 shadow-sm backdrop-blur transition-colors hover:bg-white">
          <span className="flex items-center gap-1.5"><FileText className="h-3 w-3" />{htmlOpen ? "Hide" : "Show"} HTML fallback — Structure approximation{pdfUrl && <span className="font-normal text-neutral-500">· the PDF above is authoritative</span>}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", htmlOpen && "rotate-180")} />
        </button>
        {labeled && <p data-testid="html-fallback-label" className="mx-auto mt-2 max-w-[900px] rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] leading-relaxed text-amber-900"><strong>Structure approximation</strong> — HTML fallback, not the typography source of truth. {pdfState === "no-tex" ? "TeX engine unavailable." : "Last compile failed."} The compiled PDF is the source of truth when available.</p>}
        {!labeled && <p data-testid="html-fallback-label" className="mx-auto mt-2 hidden max-w-[900px] text-[10px] text-neutral-500 sm:block">HTML fallback — Structure approximation: lightweight preview; compiled PDF is the typography source of truth.</p>}
      </div>
      {htmlOpen && (
        <div className="flex flex-1 justify-center items-start p-4 sm:p-8">
          <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center", transition: isDragging ? "none" : "transform 0.15s ease-out" }} className={cn("document-paper w-full max-w-[794px] min-h-[1123px] bg-[#fffefb] text-neutral-900 shadow-[0_24px_70px_rgba(15,23,42,0.22)] p-7 sm:p-12 space-y-5 rounded-[2px] shrink-0", !usesDocumentSerif && "document-paper-sans", fontFamilyFallback === "serif" && "font-serif")}>
            <div className={cn("pb-3 space-y-1", selectedTemplate === "modern-professional" ? "border-b-2 border-sky-800 text-left" : selectedTemplate === "tabular-german" ? "border-b border-emerald-800 text-left" : selectedTemplate === "executive" ? "border-b border-neutral-800 text-center tracking-wide" : "border-b border-neutral-300 text-center", effectiveHighlight === "header" && "ring-2 ring-[var(--chartreuse)]/60 bg-[var(--chartreuse)]/10 rounded-lg p-2")} data-section="header">
              <h1 className={cn("text-2xl font-bold tracking-tight text-neutral-950 uppercase", selectedTemplate === "modern-professional" && "text-sky-900", selectedTemplate === "tabular-german" && "text-emerald-900 font-bold", selectedTemplate === "executive" && "text-xl font-serif tracking-widest")}>{resume.header.name}</h1>
              <p className="text-sm font-semibold text-neutral-700">{resume.header.title}</p>
              <p className="text-[11px] leading-relaxed text-neutral-600 space-x-2">{resume.header.email && <span>{resume.header.email}</span>}{resume.header.phone && <span>• {resume.header.phone}</span>}{resume.header.location && <span>• {resume.header.location}</span>}{resume.header.linkedin && <span>• {resume.header.linkedin}</span>}{resume.header.github && <span>• {resume.header.github}</span>}</p>
            </div>
            {resume.summary && <div data-section="summary" className={cn("space-y-1 rounded-lg p-1", effectiveHighlight === "summary" && "ring-2 ring-[var(--chartreuse)]/60 bg-[var(--chartreuse)]/10")}><h2 className={cn("text-xs font-bold uppercase tracking-wider border-b pb-0.5", selectedTemplate === "modern-professional" ? "text-sky-900 border-sky-200" : selectedTemplate === "tabular-german" ? "text-emerald-900 border-emerald-200" : "text-neutral-900 border-neutral-200")}>Professional Summary</h2><p className="text-xs leading-relaxed text-neutral-800">{resume.summary}</p></div>}
            {resume.skills && resume.skills.length > 0 && <div data-section="skills" className={cn("space-y-1 rounded-lg p-1", effectiveHighlight === "skills" && "ring-2 ring-[var(--chartreuse)]/60 bg-[var(--chartreuse)]/10")}><h2 className={cn("text-xs font-bold uppercase tracking-wider border-b pb-0.5", selectedTemplate === "modern-professional" ? "text-sky-900 border-sky-200" : selectedTemplate === "tabular-german" ? "text-emerald-900 border-emerald-200" : "text-neutral-900 border-neutral-200")}>Core Skills & Technologies</h2><p className="text-xs leading-relaxed text-neutral-800">{resume.skills.join(" • ")}</p></div>}
            {resume.experience && resume.experience.length > 0 && <div data-section="experience" className={cn("space-y-3 rounded-lg p-1", effectiveHighlight === "experience" && "ring-2 ring-[var(--chartreuse)]/60 bg-[var(--chartreuse)]/10")}><h2 className={cn("text-xs font-bold uppercase tracking-wider border-b pb-0.5", selectedTemplate === "modern-professional" ? "text-sky-900 border-sky-200" : selectedTemplate === "tabular-german" ? "text-emerald-900 border-emerald-200" : "text-neutral-900 border-neutral-200")}>Work Experience</h2>{resume.experience.map((exp, idx) => <div key={idx} className="space-y-1"><div className="flex justify-between items-baseline"><span className="text-xs font-bold text-neutral-950">{exp.role} <span className="font-normal text-neutral-600">— {exp.company}</span></span><span className="text-[11px] text-neutral-500">{exp.duration}</span></div><ul className="list-disc list-inside space-y-0.5 text-xs text-neutral-800 leading-relaxed">{exp.bullets.map((b, bIdx) => <li key={bIdx} className="pl-1">{b}</li>)}</ul></div>)}</div>}
            {resume.projects && resume.projects.length > 0 && <div data-section="projects" className={cn("space-y-2 rounded-lg p-1", effectiveHighlight === "projects" && "ring-2 ring-[var(--chartreuse)]/60 bg-[var(--chartreuse)]/10")}><h2 className={cn("text-xs font-bold uppercase tracking-wider border-b pb-0.5", selectedTemplate === "modern-professional" ? "text-sky-900 border-sky-200" : selectedTemplate === "tabular-german" ? "text-emerald-900 border-emerald-200" : "text-neutral-900 border-neutral-200")}>Featured Projects</h2>{resume.projects.map((p, idx) => <div key={idx} className="space-y-0.5 text-xs"><div className="font-bold text-neutral-950">{p.name} <span className="text-[11px] font-normal text-neutral-600">({p.tech})</span></div>{p.bullets && <ul className="list-disc list-inside space-y-0.5 text-xs text-neutral-800">{p.bullets.map((b, bIdx) => <li key={bIdx}>{b}</li>)}</ul>}</div>)}</div>}
            {resume.education && resume.education.length > 0 && <div data-section="education" className={cn("space-y-1 rounded-lg p-1", effectiveHighlight === "education" && "ring-2 ring-[var(--chartreuse)]/60 bg-[var(--chartreuse)]/10")}><h2 className={cn("text-xs font-bold uppercase tracking-wider border-b pb-0.5", selectedTemplate === "modern-professional" ? "text-sky-900 border-sky-200" : selectedTemplate === "tabular-german" ? "text-emerald-900 border-emerald-200" : "text-neutral-900 border-neutral-200")}>Education</h2>{resume.education.map((ed, idx) => <div key={idx} className="flex justify-between items-baseline text-xs"><span className="font-bold text-neutral-950">{ed.degree} <span className="font-normal text-neutral-600">— {ed.school}</span></span><span className="text-[11px] text-neutral-500">{ed.year}</span></div>)}</div>}
          </div>
        </div>
      )}
    </>
  );
}
