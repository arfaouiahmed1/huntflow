"use client";
import { FileText, ChevronDown, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResumeContent } from "@/types";
type PdfState = "idle" | "compiling" | "ready" | "no-tex" | "error";
interface Props { resume: ResumeContent; selectedTemplate: string; fontFamilyFallback?: string; usesDocumentSerif?: boolean; zoom: number; isDragging: boolean; effectiveHighlight?: string | null; htmlOpen: boolean; onToggle: () => void; pdfUrl: string | null; pdfState: PdfState; }
export default function ResumeHtmlFallback({ resume, selectedTemplate, fontFamilyFallback = "sans", usesDocumentSerif = false, zoom, isDragging, effectiveHighlight = null, htmlOpen, onToggle, pdfUrl, pdfState }: Props) {
  const labeled = pdfState === "no-tex" || pdfState === "error";
  const h2Base = "text-[11px] font-extrabold uppercase tracking-[0.14em] border-b pb-1";
  const h2Color = selectedTemplate === "modern-professional" ? "text-sky-900 border-sky-200" : selectedTemplate === "tabular-german" ? "text-emerald-900 border-emerald-200" : "text-neutral-900 border-neutral-200";
  const hl = (k: string) => effectiveHighlight === k && "ring-2 ring-[var(--chartreuse)]/60 bg-[var(--chartreuse)]/10";
  return (
    <>
      <div className="w-full px-4 pt-4 sm:px-8">
        <button type="button" data-testid="html-preview-toggle" onClick={onToggle} className={cn("mx-auto flex w-full max-w-[900px] cursor-pointer items-center justify-between rounded-xl border px-3.5 py-2 text-[11px] font-semibold shadow-sm backdrop-blur transition-all", htmlOpen ? "border-[var(--line)] bg-white/[0.04] text-[var(--paper)] hover:bg-white/[0.06]" : "border-[var(--chartreuse)]/25 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)] hover:bg-[var(--chartreuse)]/15")}>
          <span className="flex items-center gap-2">{htmlOpen ? <EyeOff className="h-3.5 w-3.5 opacity-70" /> : <Eye className="h-3.5 w-3.5" />} <FileText className="h-3 w-3 opacity-60" />{htmlOpen ? "Hide" : "Show"} HTML fallback — Structure approximation{pdfUrl && <span className="hidden sm:inline font-normal text-dim">· the PDF above is authoritative</span>}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform text-dim", htmlOpen && "rotate-180")} />
        </button>
        {labeled && <p data-testid="html-fallback-label" className="mx-auto mt-2 max-w-[900px] rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-[11px] leading-relaxed text-amber-900 shadow-sm"><strong>Structure approximation</strong> — HTML fallback, not the typography source of truth. {pdfState === "no-tex" ? "TeX engine unavailable." : "Last compile failed."} The compiled PDF is the source of truth when available.</p>}
        {!labeled && <p data-testid="html-fallback-label" className="mx-auto mt-2 hidden max-w-[900px] rounded-full border border-[var(--line)] bg-black/20 px-3 py-1 text-center text-[10px] leading-relaxed text-dim sm:block">HTML fallback — Structure approximation: lightweight preview; compiled PDF is the typography source of truth.</p>}
      </div>
      {htmlOpen && (
        <div className="flex flex-1 justify-center items-start p-4 sm:p-8">
          <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center", transition: isDragging ? "none" : "transform 0.18s cubic-bezier(0.22,1,0.36,1)" }} className={cn("document-paper w-full max-w-[794px] min-h-[1123px] bg-[#fffefb] text-neutral-900 shadow-[0_28px_80px_rgba(0,0,0,0.28),0_4px_16px_rgba(0,0,0,0.08)] p-7 sm:p-12 space-y-6 rounded-[3px] shrink-0 border border-neutral-200", !usesDocumentSerif && "document-paper-sans", fontFamilyFallback === "serif" && "font-serif")}>
            <div className={cn("pb-4 space-y-1.5", selectedTemplate === "modern-professional" ? "border-b-2 border-sky-800 text-left" : selectedTemplate === "tabular-german" ? "border-b border-emerald-800 text-left" : selectedTemplate === "executive" ? "border-b border-neutral-800 text-center tracking-wide" : "border-b border-neutral-300/80 text-center", hl("header") && "rounded-xl p-3")} data-section="header">
              <h1 className={cn("text-[28px] font-extrabold tracking-tight text-neutral-950 uppercase leading-none", selectedTemplate === "modern-professional" && "text-sky-900", selectedTemplate === "tabular-german" && "text-emerald-900", selectedTemplate === "executive" && "text-xl font-serif tracking-[0.12em] font-bold")}>{resume.header.name}</h1>
              <p className="text-[13px] font-semibold tracking-tight text-neutral-700">{resume.header.title}</p>
              <p className="text-[11px] leading-relaxed text-neutral-600 flex flex-wrap justify-center gap-x-1.5 gap-y-0.5">{resume.header.email && <span>{resume.header.email}</span>}{resume.header.phone && <span>• {resume.header.phone}</span>}{resume.header.location && <span>• {resume.header.location}</span>}{resume.header.linkedin && <span>• {resume.header.linkedin}</span>}{resume.header.github && <span>• {resume.header.github}</span>}</p>
            </div>
            {resume.summary && <div data-section="summary" className={cn("space-y-2 rounded-xl p-1", hl("summary"))}><h2 className={cn(h2Base, h2Color)}>Professional Summary</h2><p className="text-[12.5px] leading-[1.7] text-neutral-800">{resume.summary}</p></div>}
            {resume.skills && resume.skills.length > 0 && <div data-section="skills" className={cn("space-y-2 rounded-xl p-1", hl("skills"))}><h2 className={cn(h2Base, h2Color)}>Core Skills & Technologies</h2><p className="text-[11.5px] leading-relaxed text-neutral-800">{resume.skills.join("  ·  ")}</p></div>}
            {resume.experience && resume.experience.length > 0 && <div data-section="experience" className={cn("space-y-3.5 rounded-xl p-1", hl("experience"))}><h2 className={cn(h2Base, h2Color)}>Work Experience</h2>{resume.experience.map((exp, idx) => <div key={idx} className="space-y-1.5"><div className="flex justify-between items-baseline gap-3"><span className="text-[13px] font-bold leading-tight text-neutral-950">{exp.role} <span className="font-medium text-neutral-600">— {exp.company}</span></span><span className="shrink-0 text-[11px] font-medium tabular-nums text-neutral-500">{exp.duration}</span></div><ul className="list-disc list-inside space-y-1 text-[12.5px] text-neutral-800 leading-[1.65]">{exp.bullets.map((b, bIdx) => <li key={bIdx} className="pl-1 marker:text-neutral-400">{b}</li>)}</ul></div>)}</div>}
            {resume.projects && resume.projects.length > 0 && <div data-section="projects" className={cn("space-y-3 rounded-xl p-1", hl("projects"))}><h2 className={cn(h2Base, h2Color)}>Featured Projects</h2>{resume.projects.map((p, idx) => <div key={idx} className="space-y-1 text-xs"><div className="font-bold text-neutral-950">{p.name} <span className="text-[11px] font-normal text-neutral-600">({p.tech})</span></div>{p.bullets && <ul className="list-disc list-inside space-y-0.5 text-[12.5px] text-neutral-800">{p.bullets.map((b, bIdx) => <li key={bIdx}>{b}</li>)}</ul>}</div>)}</div>}
            {resume.education && resume.education.length > 0 && <div data-section="education" className={cn("space-y-2 rounded-xl p-1", hl("education"))}><h2 className={cn(h2Base, h2Color)}>Education</h2>{resume.education.map((ed, idx) => <div key={idx} className="flex justify-between items-baseline gap-3 text-[12.5px]"><span className="font-bold text-neutral-950">{ed.degree} <span className="font-normal text-neutral-600">— {ed.school}</span></span><span className="shrink-0 text-[11px] tabular-nums text-neutral-500">{ed.year}</span></div>)}</div>}
          </div>
        </div>
      )}
    </>
  );
}
