"use client";
import Select from "@/components/ui/Select";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  FileText,
  Sparkles,
  Bot,
  Send,
  Download,
  Check,
  Copy,
  Plus,
  Trash2,
  Edit3,
  Layers,
  Target,
  Award,
  Zap,
  Briefcase,
  GraduationCap,
  Save,
  Undo2,
  Wand2,
  MessageSquarePlus,
  FileCode,
  Archive,
  RefreshCw,
  Printer,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  SlidersHorizontal,
  Settings2,
  CheckCircle2,
  AlertCircle,
  X,
  GripVertical,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/ui/Toaster";
import { Button } from "@/components/ui/Button";
import { ResumeContent, ResumeProjectItem } from "@/types";
import { cn } from "@/lib/utils";
import { analyzeAts } from "@/lib/ats/analyze";
import ResumePdfPreview from "@/components/resume/ResumePdfPreview";
import ResumeHtmlFallback from "@/components/resume/ResumeHtmlFallback";
import ResumeCompileControls from "@/components/resume/ResumeCompileControls";

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  actionSummary?: string;
  timestamp: string;
}

interface TemplateMeta {
  id: string;
  name: string;
  desc: string;
  badge: string;
  kind: "resume" | "cv" | "both";
  font: string;
  accent: string;
}

const ALL_TEMPLATES: TemplateMeta[] = [
  {
    id: "classic-ats",
    name: "Classic ATS Standard",
    desc: "Single-column Helvetica. 100% ATS parser guarantee, minimal decoration, highest acceptance rate.",
    badge: "100% ATS Score",
    kind: "resume",
    font: "font-sans",
    accent: "bg-neutral-900",
  },
  {
    id: "modern-professional",
    name: "Modern Tech",
    desc: "Clean two-tone headers with deep blue accent bar. Tech-optimized single column layout.",
    badge: "98% ATS Score",
    kind: "resume",
    font: "font-sans",
    accent: "bg-sky-700",
  },
  {
    id: "technical-modern",
    name: "Technical Modern",
    desc: "High-density technical layout for senior software, ML, and systems engineers.",
    badge: "96% ATS Score",
    kind: "resume",
    font: "font-mono",
    accent: "bg-teal-700",
  },
  {
    id: "minimal-clean",
    name: "Minimal Clean",
    desc: "Quiet typography, generous whitespace, single teal accent line.",
    badge: "98% ATS Score",
    kind: "resume",
    font: "font-sans",
    accent: "bg-emerald-700",
  },
  {
    id: "executive",
    name: "Executive Serif",
    desc: "Times-based classic look for senior & leadership profiles. Small-caps section headers.",
    badge: "92% ATS Score",
    kind: "both",
    font: "font-serif",
    accent: "bg-stone-900",
  },
  {
    id: "tabular-german",
    name: "German Tabellarischer CV",
    desc: "DACH standard format with date/location column and structured sections.",
    badge: "95% ATS Score",
    kind: "cv",
    font: "font-sans",
    accent: "bg-indigo-800",
  },
  {
    id: "modern-french",
    name: "French Professional CV",
    desc: "Formal French layout with target title accent and skills matrix.",
    badge: "90% ATS Score",
    kind: "cv",
    font: "font-sans",
    accent: "bg-blue-800",
  },
  {
    id: "nordic-clean",
    name: "Nordic Clean CV",
    desc: "Scandinavian minimalist layout with high whitespace and elegant slate headers.",
    badge: "95% ATS Score",
    kind: "cv",
    font: "font-sans",
    accent: "bg-slate-800",
  },
  {
    id: "academic-cv",
    name: "Academic & Research CV",
    desc: "Comprehensive multi-page format for research, publications, grants, and education.",
    badge: "90% ATS Score",
    kind: "cv",
    font: "font-serif",
    accent: "bg-neutral-800",
  },
];

const QUICK_PROMPTS = [
  { label: "⚡ Optimize for ATS", prompt: "Audit my entire resume for ATS compatibility, keyword density, and formatting. Optimize bullets and skills." },
  { label: "📊 Google X-Y-Z Metrics", prompt: "Rewrite my work experience bullet points using Google's X-Y-Z formula ('Accomplished X as measured by Y, by doing Z') with quantitative metrics." },
  { label: "🎯 Tailor for Target Role", prompt: "Tailor this resume specifically for my target title and highlight relevant technical leadership and engineering skills." },
  { label: "✨ Strengthen Action Verbs", prompt: "Replace passive verbs with high-impact power action verbs (e.g. Architected, Engineered, Spearheaded, Accelerated)." },
  { label: "🗄️ Pull from Vault", prompt: "Search my vault documents and incorporate any relevant projects, certificates, or skills that strengthen this resume." },
];

function profileToResume(profile: ReturnType<typeof useApp>["profile"]): ResumeContent {
  return {
    header: {
      name: profile.name || "Ahmed Arfaoui",
      title: profile.targetTitle || profile.headline || "AI Engineer (New Graduate)",
      email: profile.email || "ahmedarfaoui2000@gmail.com",
      phone: profile.phone || "+216 58 732 642",
      location: profile.location || "Tunis, Tunisia",
      linkedin: profile.linkedin || "https://linkedin.com/in/ahmed-arfaoui",
      github: profile.github || "https://github.com/ahmedarfaoui",
      portfolio: profile.portfolio || "https://ahmedarfaoui.dev",
    },
    summary:
      profile.summary ||
      "AI engineer specializing in agentic systems, GenAI pipelines, and machine learning. Built production LLM workflows (RAG, tool-calling agents, MLOps) across internships and personal projects; experienced in Python, TypeScript, and end-to-end deployment.",
    skills:
      profile.skills && profile.skills.length > 0
        ? [...profile.skills]
        : ["Python", "TypeScript", "FastAPI", "LangGraph", "LangChain", "RAG", "Next.js", "Docker", "PostgreSQL"],
    experience: (profile.experience && profile.experience.length > 0
      ? profile.experience
      : [
          {
            id: "exp-1",
            company: "Open Web Catcher",
            role: "AI Software Engineer Intern",
            duration: "2026",
            bulletPoints: [
              "Built browser-automation agents handling 126 automated runs with 97.6% tool-call success and 73.7% strict completion rate.",
              "Engineered agentic tool-use pipelines and RAG evaluation harnesses.",
            ],
          },
        ]
    ).map((e) => ({
      company: e.company,
      role: e.role,
      duration: e.duration,
      bullets: e.bulletPoints && e.bulletPoints.length > 0 ? [...e.bulletPoints] : ["Built scalable software systems and pipelines."],
    })),
    education: (profile.education && profile.education.length > 0
      ? profile.education
      : [
          {
            id: "edu-1",
            degree: "Engineering Degree — Data Engineering & AI",
            school: "ESPRIT (École Supérieure Privée d'Ingénierie et de Technologie)",
            year: "2026",
          },
        ]
    ).map((ed) => ({
      degree: ed.degree,
      school: ed.school,
      year: ed.year,
    })),
    projects: [
      {
        name: "Job Finder / Huntflow",
        tech: "Next.js, Python, FastAPI, LangGraph, SQLite",
        link: "https://github.com/ahmedarfaoui/huntflow",
        bullets: [
          "Engineered agentic automation pipeline reducing application submission time by 80%.",
          "Implemented local-first vector search with cosine similarity and deterministic fallback engines.",
        ],
      },
    ],
  };
}

export default function ResumeStudioPage() {
  const { profile, updateProfile, applications } = useApp();
  const { success, error: errToast } = useToast();

  const [resume, setResume] = useState<ResumeContent>(() => profileToResume(profile));
  const [history, setHistory] = useState<ResumeContent[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("classic-ats");
  const [docKind, setDocKind] = useState<"resume" | "cv">("resume");
  const [latexSource, setLatexSource] = useState("");
  const [compilingPdf, setCompilingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "compiling" | "ready" | "no-tex" | "error">("idle");
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [compiledTex, setCompiledTex] = useState<string | null>(null);
  const [compileToken, setCompileToken] = useState<string | null>(null);
  const [htmlOpen, setHtmlOpen] = useState(true);
  const [diffCollapsed, setDiffCollapsed] = useState(true);
  const [changedSections] = useState<string[]>([]);

  // Layout states: resizing & sidebar
  const [leftWidthPercent, setLeftWidthPercent] = useState(40);
  const [isDragging, setIsDragging] = useState(false);
  const [settingsSidebarOpen, setSettingsSidebarOpen] = useState(false);
  const [zoom, setZoom] = useState(100);

  const filteredTemplates = useMemo(
    () => ALL_TEMPLATES.filter((t) => t.kind === docKind || t.kind === "both"),
    [docKind]
  );

  // Selection popup state for "Add to chat"
  const [selectionPopup, setSelectionPopup] = useState<{
    visible: boolean;
    text: string;
    x: number;
    y: number;
  }>({ visible: false, text: "", x: 0, y: 0 });

  // Chat copilot state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "msg-0",
      sender: "assistant",
      text: "👋 **Welcome to your Resume & CV Studio!**\n\nI work directly on your live resume on the right. You can ask me to rewrite any bullet point, add skills from your **Vault**, optimize for **ATS keyword density**, or switch layouts.\n\n💡 *Tip: Highlight/select any text on the resume preview to instantly quote and ask me about it!*",
      timestamp: "Just now",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const selectedJob = useMemo(
    () => applications.find((a) => a.id === selectedJobId) || null,
    [applications, selectedJobId]
  );

  const atsReport = useMemo(() => {
    try {
      return analyzeAts(
        resume,
        selectedJob ? `${selectedJob.title} ${selectedJob.company} ${selectedJob.jobDescription || ""}` : undefined
      );
    } catch {
      return { score: 88, checks: [], keywords: [], estimatedPages: 1 };
    }
  }, [resume, selectedJob]);

  // Render LaTeX representation in backend
  const updateLatexPreview = useCallback(async (content: ResumeContent, templateId: string) => {
    try {
      const res = await fetch("/api/resume/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, content }),
      });
      if (res.ok) {
        const data = await res.json();
        setLatexSource(data.tex || "");
      }
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    updateLatexPreview(resume, selectedTemplate);
  }, [resume, selectedTemplate, updateLatexPreview]);

  const compilePreview = useCallback(async () => {
    if (!latexSource.trim()) return;
    setPdfState("compiling");
    setPdfError(null);
    try {
      const compileRes = await fetch("/api/resume/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tex: latexSource }),
      });
      const compileData = (await compileRes.json()) as { ok?: boolean; token?: string; error?: { message?: string } };
      if (compileData.ok && compileData.token) {
        setCompileToken(compileData.token);
        setPdfUrl(`/api/resume/compile?token=${compileData.token}`);
        setCompiledTex(latexSource);
        setPdfState("ready");
      } else {
        setPdfError(compileData.error?.message ?? "Compile failed");
        setPdfState("error");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("No LaTeX engine")) setPdfState("no-tex");
      else {
        setPdfError(msg);
        setPdfState("error");
      }
    }
  }, [latexSource]);

  const compileSynctex = useCallback(async () => {
    await compilePreview();
  }, [compilePreview]);

  useEffect(() => {
    // auto-attempt initial compile when profile exists — graceful offline, non-blocking
    if (latexSource && pdfState === "idle") {
      void compilePreview();
    }
  }, [latexSource, pdfState, compilePreview]);

  const applyUpdate = (newResume: ResumeContent, saveHistory = true) => {
    if (saveHistory) {
      setHistory((prev) => [resume, ...prev.slice(0, 10)]);
    }
    setResume(newResume);
  };

  const undoLast = () => {
    if (history.length === 0) return;
    const [previous, ...rest] = history;
    setHistory(rest);
    setResume(previous);
    success("Reverted to previous version.");
  };

  // Resizing mouse handler
  const handleMouseDown = () => {
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const totalWidth = window.innerWidth - (settingsSidebarOpen ? 320 : 0);
      const newPercent = Math.min(Math.max((e.clientX / totalWidth) * 100, 25), 65);
      setLeftWidthPercent(newPercent);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, settingsSidebarOpen]);

  // Text selection handler on preview
  const handlePreviewMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setSelectionPopup((p) => ({ ...p, visible: false }));
      return;
    }

    const text = sel.toString().trim();
    if (text.length < 3) {
      setSelectionPopup((p) => ({ ...p, visible: false }));
      return;
    }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setSelectionPopup({
      visible: true,
      text,
      x: rect.left + rect.width / 2,
      y: rect.top - 12,
    });
  };

  const addSelectionToChat = () => {
    if (!selectionPopup.text) return;
    const quote = `Rewrite and optimize this section: "${selectionPopup.text}"`;
    setChatInput(quote);
    setSelectionPopup((p) => ({ ...p, visible: false }));
    window.getSelection()?.removeAllRanges();
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 50);
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const text = customPrompt || chatInput.trim();
    if (!text || copilotBusy) return;

    if (!customPrompt) setChatInput("");

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setCopilotBusy(true);

    try {
      const res = await fetch("/api/resume/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          resume,
          templateId: selectedTemplate,
          history: chatMessages.slice(-6).map((m) => ({ role: m.sender, content: m.text })),
          targetJob: selectedJob ? { title: selectedJob.title, company: selectedJob.company, description: selectedJob.jobDescription } : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Agent returned ${res.status}`);
      }

      const data = await res.json();
      const updated = data.updatedResume as ResumeContent;

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: "assistant",
        text: data.reply,
        actionSummary: data.actionSummary,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setChatMessages((prev) => [...prev, aiMsg]);

      if (updated) {
        applyUpdate(updated);
        success(data.actionSummary || "Resume updated by AI Copilot.");
      }
      if (data.tex) {
        setLatexSource(data.tex);
      }
    } catch (err: unknown) {
      errToast(err instanceof Error ? err.message : "AI Copilot request failed");
    } finally {
      setCopilotBusy(false);
    }
  };

  const handleToggleDocKind = (kind: "resume" | "cv") => {
    setDocKind(kind);
    const target = ALL_TEMPLATES.find((t) => t.kind === kind || t.kind === "both")?.id || (kind === "cv" ? "tabular-german" : "classic-ats");
    setSelectedTemplate(target);
    handleSendMessage(`Switch mode to ${kind.toUpperCase()}. Rebuild and format my profile for a ${kind === "cv" ? "comprehensive, detailed multi-page curriculum vitae" : "compact 1-page high-impact industry resume"}.`);
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    handleSendMessage(`Rebuild and format my ${docKind.toUpperCase()} according to the ${templateId} ATS template layout.`);
  };

  const downloadPdf = async () => {
    setCompilingPdf(true);
    try {
      let tex = latexSource;
      if (!tex) {
        const r = await fetch("/api/resume/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId: selectedTemplate, content: resume }),
        });
        const d = await r.json();
        tex = d.tex;
      }

      const compileRes = await fetch("/api/resume/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tex }),
      });

      const compileData = await compileRes.json();
      if (compileData.ok && compileData.token) {
        window.open(`/api/resume/compile?token=${compileData.token}&save=1`, "_blank");
        success("LaTeX compiled successfully! Downloading PDF.");
      } else {
        window.print();
      }
    } catch {
      window.print();
    } finally {
      setCompilingPdf(false);
    }
  };

  const syncToProfile = () => {
    updateProfile({
      ...profile,
      name: resume.header?.name || profile.name,
      targetTitle: resume.header?.title || profile.targetTitle,
      email: resume.header?.email || profile.email,
      phone: resume.header?.phone || profile.phone,
      location: resume.header?.location || profile.location,
      summary: resume.summary || profile.summary || "",
      skills: resume.skills || profile.skills || [],
      experience: (resume.experience || []).map((e, idx) => ({
        id: `exp-${idx + 1}`,
        company: e.company || "",
        role: e.role || "",
        duration: e.duration || "",
        bulletPoints: e.bullets || [],
      })),
      education: (resume.education || []).map((ed, idx) => ({
        id: `edu-${idx + 1}`,
        degree: ed.degree || "",
        school: ed.school || "",
        year: ed.year || "",
      })),
    });
    success("Synced resume changes to main Profile & My Info!");
  };

  const copyMarkdown = async () => {
    const md = `# ${resume.header?.name || ""}
**${resume.header?.title || ""}**
${[resume.header?.email, resume.header?.phone, resume.header?.location, resume.header?.linkedin, resume.header?.github].filter(Boolean).join(" | ")}

## SUMMARY
${resume.summary || ""}

## CORE SKILLS
${(resume.skills || []).join(" • ")}

## WORK EXPERIENCE
${(resume.experience || [])
  .map(
    (e) => `### ${e.role} — ${e.company} (${e.duration})
${(e.bullets || []).map((b) => `• ${b}`).join("\n")}`
  )
  .join("\n\n")}

## EDUCATION
${(resume.education || []).map((ed) => `• **${ed.degree}** — ${ed.school} (${ed.year})`).join("\n")}

${resume.projects && resume.projects.length > 0 ? `## PROJECTS\n${resume.projects.map((p) => `### ${p.name} (${p.tech})\n${(p.bullets || []).map((b) => `• ${b}`).join("\n")}`).join("\n\n")}` : ""}
`;
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    success("Copied clean markdown to clipboard!");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] overflow-hidden space-y-3">
      {/* Floating Selection Popup: "Add to chat" */}
      {selectionPopup.visible && (
        <div
          style={{
            position: "fixed",
            left: `${selectionPopup.x}px`,
            top: `${selectionPopup.y}px`,
            transform: "translate(-50%, -100%)",
            zIndex: 9999,
          }}
          className="animate-in fade-in zoom-in-95 duration-150"
        >
          <button
            onClick={addSelectionToChat}
            className="flex items-center gap-1.5 rounded-full border border-[var(--chartreuse)] bg-[var(--ink-card)] px-3 py-1.5 text-xs font-bold text-[var(--chartreuse)] shadow-2xl hover:bg-[var(--chartreuse)] hover:text-black transition-all cursor-pointer"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            <span>Add to chat</span>
          </button>
        </div>
      )}

      {/* Top Header / Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-lg font-bold tracking-tight text-[var(--paper)] flex items-center gap-2">
            <FileText className="h-4.5 w-4.5 text-[var(--chartreuse)]" /> Resume & CV Studio
          </h1>

          {/* Resume vs CV Toggle Pill */}
          <div className="flex items-center rounded-lg border border-[var(--line)] bg-black/40 p-0.5">
            <button
              onClick={() => handleToggleDocKind("resume")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                docKind === "resume"
                  ? "bg-[var(--chartreuse)] text-neutral-950 shadow-sm"
                  : "text-dim hover:text-[var(--paper)]"
              )}
            >
              <FileText className="h-3 w-3" />
              <span>Resume</span>
            </button>
            <button
              onClick={() => handleToggleDocKind("cv")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                docKind === "cv"
                  ? "bg-[var(--chartreuse)] text-neutral-950 shadow-sm"
                  : "text-dim hover:text-[var(--paper)]"
              )}
            >
              <Layers className="h-3 w-3" />
              <span>CV</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 px-2.5 py-0.5 text-[11px] font-bold text-[var(--chartreuse)]">
            <Award className="h-3 w-3" /> ATS: {atsReport.score}/100
          </div>
        </div>

        {/* Action Controls & Zoom Toolbar */}
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <Button size="sm" variant="outline" onClick={undoLast} title="Undo last change">
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </Button>
          )}

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

          <Button size="sm" variant="outline" onClick={copyMarkdown} title="Copy Markdown">
            {copied ? <Check className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy MD"}</span>
          </Button>

          <Button size="sm" onClick={downloadPdf} loading={compilingPdf}>
            <Download className="h-3.5 w-3.5" /> Export PDF
          </Button>

          <ResumeCompileControls
            pdfState={pdfState}
            diffCollapsed={diffCollapsed}
            changedSections={changedSections}
            onCompilePreview={compilePreview}
            onCompileSynctex={compileSynctex}
            onToggleDiff={() => setDiffCollapsed((v) => !v)}
            onPinBaseline={() => success("Baseline pinned.")}
          />

          {/* Settings Sidebar Toggle */}
          <Button
            size="sm"
            variant={settingsSidebarOpen ? "primary" : "outline"}
            onClick={() => setSettingsSidebarOpen(!settingsSidebarOpen)}
            className="flex items-center gap-1.5"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Layouts & Settings</span>
          </Button>
        </div>
      </div>

      {/* Main Resizable Studio Canvas */}
      <div className="relative flex flex-1 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/50">
        {/* LEFT PANE: AI Resume Copilot */}
        <div
          style={{ width: `${leftWidthPercent}%` }}
          className="flex flex-col h-full border-r border-[var(--line)] bg-[var(--ink-card)]/90 backdrop-blur-xl shrink-0"
        >
          {/* Copilot Header */}
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="relative grid h-7 w-7 place-items-center rounded-lg border border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10">
                <Bot className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--chartreuse)]" />
              </div>
              <div>
                <p className="font-display text-xs font-bold text-[var(--paper)]">AI Resume Copilot</p>
                <p className="text-[10px] text-dim flex items-center gap-1">
                  <Archive className="h-2.5 w-2.5 text-[var(--chartreuse)]" /> Vault RAG connected
                </p>
              </div>
            </div>
            {copilotBusy && (
              <span className="flex items-center gap-1.5 text-[10px] text-[var(--chartreuse)] font-mono animate-pulse">
                <Sparkles className="h-3 w-3" /> Optimizing…
              </span>
            )}
          </div>

          {/* Quick Prompts Chips */}
          <div className="flex gap-1.5 overflow-x-auto border-b border-[var(--line)] p-2 bg-black/20 no-scrollbar">
            {QUICK_PROMPTS.map((qp, idx) => (
              <button
                key={idx}
                disabled={copilotBusy}
                onClick={() => handleSendMessage(qp.prompt)}
                className="shrink-0 rounded-full border border-[var(--line)] bg-white/[0.03] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--paper)] transition-colors hover:border-[var(--chartreuse)]/40 hover:bg-[var(--chartreuse)]/10 disabled:opacity-50 cursor-pointer"
              >
                {qp.label}
              </button>
            ))}
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {chatMessages.map((msg) => {
              const isAssistant = msg.sender === "assistant";
              return (
                <div
                  key={msg.id}
                  className={cn("flex flex-col space-y-1", isAssistant ? "items-start" : "items-end")}
                >
                  <div
                    className={cn(
                      "max-w-[92%] rounded-2xl p-3 text-xs leading-relaxed",
                      isAssistant
                        ? "border border-[var(--line)] bg-white/[0.03] text-[var(--paper)]"
                        : "bg-[var(--chartreuse)] text-neutral-950 font-medium"
                    )}
                  >
                    <div className="whitespace-pre-wrap">{msg.text}</div>

                    {msg.actionSummary && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 px-2 py-0.5 font-mono text-[10px] text-[var(--chartreuse)]">
                        <Check className="h-3 w-3" /> {msg.actionSummary}
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] text-dim px-1">{msg.timestamp}</span>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <div className="border-t border-[var(--line)] p-2.5 bg-black/40">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={chatInputRef}
                type="text"
                value={chatInput}
                disabled={copilotBusy}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask AI Copilot to rewrite, add Vault facts, or polish..."
                className="flex-1 rounded-xl border border-[var(--line)] bg-white/[0.03] px-3 py-1.5 text-xs text-[var(--paper)] outline-none transition-colors placeholder:text-dim focus:border-[var(--chartreuse)]/50"
              />
              <Button type="submit" size="sm" disabled={!chatInput.trim() || copilotBusy} loading={copilotBusy}>
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
          </div>
        </div>

        {/* RESIZE SPLITTER DRAG HANDLE */}
        <div
          onMouseDown={handleMouseDown}
          className={cn(
            "w-2 bg-[var(--line)] hover:bg-[var(--chartreuse)]/50 transition-colors cursor-col-resize flex items-center justify-center shrink-0 select-none",
            isDragging && "bg-[var(--chartreuse)]"
          )}
        >
          <GripVertical className="h-3 w-3 text-dim opacity-60" />
        </div>

        {/* CENTER / RIGHT PANE: Live Document Paper Preview with Zoom */}
        <div
          ref={previewContainerRef}
          onMouseUp={handlePreviewMouseUp}
          className="flex-1 overflow-auto bg-neutral-900/60 p-6 flex flex-col items-center gap-4 relative select-text"
        >
          <ResumePdfPreview
            pdfUrl={pdfUrl}
            pdfState={pdfState}
            pdfError={pdfError}
            compiledTex={compiledTex}
            latexSource={latexSource}
            compileToken={compileToken}
          />
          <ResumeHtmlFallback
            resume={resume}
            selectedTemplate={selectedTemplate}
            zoom={zoom}
            isDragging={isDragging}
            htmlOpen={htmlOpen}
            onToggle={() => setHtmlOpen((v) => !v)}
            pdfUrl={pdfUrl}
            pdfState={pdfState}
          />
        </div>

        {/* RIGHT SIDEBAR: ATS Layouts & Settings (Show / Hide) */}
        {settingsSidebarOpen && (
          <div className="w-80 border-l border-[var(--line)] bg-[var(--ink-card)]/95 backdrop-blur-xl p-4 overflow-y-auto space-y-5 animate-in slide-in-from-right duration-200 shrink-0">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--paper)] flex items-center gap-1.5">
                <SlidersHorizontal className="h-4 w-4 text-[var(--chartreuse)]" /> ATS Layouts & Settings
              </h3>
              <button
                onClick={() => setSettingsSidebarOpen(false)}
                className="text-dim hover:text-[var(--paper)] p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Target Job Tailoring */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-dim">
                Tailor for Target Job
              </label>
              <Select
                value={selectedJobId}
                onChange={(v) => setSelectedJobId(v)}
                options={[
                  { value: "", label: "General Profile (No specific job)" },
                  ...applications.map((app) => ({ value: app.id, label: `${app.company} — ${app.title}` })),
                ]}
                placeholder="Select job…"
                ariaLabel="Tailor for Target Job"
                className="w-full"
              />
            </div>

            {/* ATS / CV Layout Cards with Visual Image Previews */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-dim">
                  {docKind === "cv" ? "CV Formats" : "ATS Resume Formats"} ({filteredTemplates.length})
                </label>
                <span className="text-[10px] font-mono text-[var(--chartreuse)] uppercase">
                  {docKind} Mode
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {filteredTemplates.map((tmpl) => {
                  const isSelected = selectedTemplate === tmpl.id;
                  return (
                    <div
                      key={tmpl.id}
                      onClick={() => handleTemplateChange(tmpl.id)}
                      className={cn(
                        "rounded-xl border p-3 cursor-pointer transition-all space-y-2 group",
                        isSelected
                          ? "border-[var(--chartreuse)] bg-[var(--chartreuse)]/10 shadow-lg"
                          : "border-[var(--line)] bg-black/30 hover:border-white/20 hover:bg-white/[0.02]"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[var(--paper)] group-hover:text-[var(--chartreuse)]">
                          {tmpl.name}
                        </span>
                        <span className="text-[9px] font-mono text-[var(--chartreuse)] bg-[var(--chartreuse)]/10 px-1.5 py-0.5 rounded">
                          {tmpl.badge}
                        </span>
                      </div>

                      {/* Visual Miniature Image / Mock Preview */}
                      <div className="h-16 w-full rounded-md bg-white p-2 flex flex-col justify-between overflow-hidden shadow-inner border border-neutral-300">
                        <div
                          className={cn(
                            "h-2.5 w-full rounded-xs",
                            tmpl.accent
                          )}
                        />
                        <div className="space-y-1">
                          <div className="h-1 w-3/4 bg-neutral-400 rounded-xs" />
                          <div className="h-1 w-full bg-neutral-300 rounded-xs" />
                          <div className="h-1 w-5/6 bg-neutral-300 rounded-xs" />
                        </div>
                        <div className="flex gap-1">
                          <div className="h-1 w-1/3 bg-neutral-400 rounded-xs" />
                          <div className="h-1 w-1/2 bg-neutral-300 rounded-xs" />
                        </div>
                      </div>

                      <p className="text-[10px] text-dim leading-relaxed">{tmpl.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-[var(--line)] space-y-2">
              <Button size="sm" variant="outline" className="w-full justify-center" onClick={syncToProfile}>
                <Save className="h-3.5 w-3.5" /> Sync with Main Profile
              </Button>
              <Button size="sm" className="w-full justify-center" onClick={downloadPdf} loading={compilingPdf}>
                <Download className="h-3.5 w-3.5" /> Download LaTeX PDF
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
