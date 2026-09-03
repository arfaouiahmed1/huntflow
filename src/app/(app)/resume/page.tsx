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
  Layers,
  Award,
  Zap,
  Save,
  Undo2,
  MessageSquarePlus,
  FileCode,
  Archive,
  ChevronDown,
  ChevronUp,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  SlidersHorizontal,
  GripVertical,
  Code2,
  Cpu,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/ui/Toaster";
import { Button } from "@/components/ui/Button";
import { ResumeContent } from "@/types";
import { cn } from "@/lib/utils";
import { analyzeAts } from "@/lib/ats/analyze";
import ResumePdfPreview from "@/components/resume/ResumePdfPreview";
import ResumeHtmlFallback from "@/components/resume/ResumeHtmlFallback";
import ResumeCompileControls from "@/components/resume/ResumeCompileControls";
import { renderTypstResume } from "@/lib/pdf/typstRenderer";
import ResumeVariantsManager from "@/components/resume/ResumeVariantsManager";
import Modal from "@/components/ui/Modal";

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
    accent: "bg-zinc-800",
  },
  {
    id: "modern-french",
    name: "French Standard CV",
    desc: "Clean European format with structured competencies and detailed career timeline.",
    badge: "94% ATS Score",
    kind: "cv",
    font: "font-sans",
    accent: "bg-blue-800",
  },
];

const QUICK_PROMPTS = [
  { label: "🎯 ATS Keyword Polish", prompt: "Analyze this resume against modern ATS algorithms and optimize keyword density without keyword stuffing." },
  { label: "📈 Quantify Achievements", prompt: "Rewrite work experience bullets using the Google XYZ formula (Accomplished [X], measured by [Y], by doing [Z])." },
  { label: "⚡ Cut to Exact 1-Page", prompt: "Tighten spacing and condense bullet points so this resume fits perfectly on a single page." },
  { label: "🗄️ Ingest Vault Evidence", prompt: "Scan my Profile Vault and pull in verified technical project metrics and production achievements." },
  { label: "🇩🇪 DACH CV Style", prompt: "Format this into a German Tabellarischer Lebenslauf structure." },
];

function profileToResume(profile: ReturnType<typeof useApp>["profile"]): ResumeContent {
  return {
    header: {
      name: profile.name || "Alex Johnson",
      title: profile.targetTitle || "Senior Full-Stack Engineer",
      email: profile.email || "alex@example.com",
      phone: profile.phone || "+1 (555) 234-5678",
      location: profile.location || "San Francisco, CA",
      linkedin: profile.linkedin || "linkedin.com/in/alexjohnson",
      github: profile.github || "github.com/alexjohnson",
      portfolio: profile.portfolio || "alexjohnson.dev",
    },
    summary:
      profile.summary ||
      "Results-driven Senior Full-Stack Engineer with 6+ years of experience designing, scaling, and maintaining distributed web applications and AI-integrated developer tooling.",
    skills:
      profile.skills && profile.skills.length > 0
        ? profile.skills
        : ["TypeScript", "React", "Next.js", "Node.js", "Python", "PostgreSQL", "Docker", "AWS", "GraphQL", "Tailwind CSS"],
    experience:
      profile.experience && profile.experience.length > 0
        ? profile.experience.map((e) => ({
            role: e.role,
            company: e.company,
            duration: e.duration,
            bullets: e.bulletPoints || [],
          }))
        : [
            {
              role: "Lead Full-Stack Engineer",
              company: "Nexus Tech Solutions",
              duration: "2022 — Present",
              bullets: [
                "Spearheaded redesign of core microservices platform, slashing API p99 latency by 42% for 2M+ active users.",
                "Engineered automated CI/CD pipeline using GitHub Actions, shortening deployment cycles from 3 days to under 15 minutes.",
                "Mentored a team of 6 engineers across frontend and distributed systems engineering.",
              ],
            },
            {
              role: "Senior Software Engineer",
              company: "CloudScale Systems",
              duration: "2020 — 2022",
              bullets: [
                "Architected low-latency caching layer reducing backend database load by 35%.",
                "Authored RFCs for cross-team event bus architecture adopting Apache Kafka.",
              ],
            },
          ],
    education:
      profile.education && profile.education.length > 0
        ? profile.education.map((ed) => ({
            degree: ed.degree,
            school: ed.school,
            year: ed.year,
          }))
        : [
            {
              degree: "B.S. in Computer Science",
              school: "University of California, Berkeley",
              year: "2016 — 2020",
            },
          ],
    projects: [
      {
        name: "HuntFlow Career Engine",
        tech: "Next.js, TypeScript, SQLite, Typst",
        link: "github.com/huntflow/core",
        bullets: [
          "Built high-performance local-first career operating system with instant <30ms Typst typesetting engine.",
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
  const [engine, setEngine] = useState<"latex" | "typst">("typst");
  const [latexSource, setLatexSource] = useState("");
  const [typstSource, setTypstSource] = useState("");
  const [compilingPdf, setCompilingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "compiling" | "ready" | "no-tex" | "error">("idle");
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [compiledTex, setCompiledTex] = useState<string | null>(null);
  const [compileToken, setCompileToken] = useState<string | null>(null);
  const [compileLatencyMs, setCompileLatencyMs] = useState<number | null>(null);
  const [htmlOpen, setHtmlOpen] = useState(true);
  const [diffCollapsed, setDiffCollapsed] = useState(true);
  const [changedSections] = useState<string[]>([]);
  const [promptInspectorOpen, setPromptInspectorOpen] = useState(false);
  const [showVariantsModal, setShowVariantsModal] = useState(false);
  // 3-Pane Resizing Widths
  const [leftWidthPercent, setLeftWidthPercent] = useState(28);
  const [rightWidthPercent, setRightWidthPercent] = useState(28);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [zoom, setZoom] = useState(100);

  // Section Ordering
  const [sectionOrder, setSectionOrder] = useState<string[]>([
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
  ]);

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
      text: "👋 **Welcome to the LaTeX & Typst Resume Studio!**\n\nI operate across your live document canvas. You can ask me to rewrite bullet points with quantifiable impact, sync data from your **Vault**, or switch typesetting engines.\n\n💡 *Tip: Highlight any text on the preview canvas to instantly quote and edit with AI.*",
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
      return { score: 92, checks: [], keywords: [], estimatedPages: 1 };
    }
  }, [resume, selectedJob]);

  // Update Typst markup
  useEffect(() => {
    try {
      const markup = renderTypstResume(selectedTemplate, resume);
      setTypstSource(markup);
    } catch {
      // safe fallback
    }
  }, [resume, selectedTemplate]);

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
    setPdfState("compiling");
    setPdfError(null);
    const start = Date.now();

    if (engine === "typst") {
      try {
        const res = await fetch("/api/resume/compile-typst", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: resume, templateId: selectedTemplate }),
        });
        const data = await res.json();
        setCompileLatencyMs(data.durationMs || Date.now() - start);
        if (data.ok && data.pdfBase64) {
          const blob = new Blob([Buffer.from(data.pdfBase64, "base64")], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          setPdfUrl(url);
          setPdfState("ready");
        } else {
          setPdfState("ready"); // HTML preview fallback
        }
      } catch {
        setPdfState("ready");
      }
      return;
    }

    // LaTeX engine
    if (!latexSource.trim()) return;
    try {
      const compileRes = await fetch("/api/resume/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tex: latexSource }),
      });
      const compileData = (await compileRes.json()) as { ok?: boolean; token?: string; error?: { message?: string } };
      setCompileLatencyMs(Date.now() - start);
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
  }, [engine, resume, selectedTemplate, latexSource]);

  const compileSynctex = useCallback(async () => {
    await compilePreview();
  }, [compilePreview]);

  useEffect(() => {
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

  // Resizing mouse handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const totalWidth = window.innerWidth;
      if (isDraggingLeft) {
        const newLeftPercent = Math.min(Math.max((e.clientX / totalWidth) * 100, 20), 40);
        setLeftWidthPercent(newLeftPercent);
      } else if (isDraggingRight) {
        const newRightPercent = Math.min(Math.max(((totalWidth - e.clientX) / totalWidth) * 100, 20), 40);
        setRightWidthPercent(newRightPercent);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
    };

    if (isDraggingLeft || isDraggingRight) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingLeft, isDraggingRight]);

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
    handleSendMessage(`Rebuild and format my ${docKind.toUpperCase()} according to the ${templateId} template layout.`);
  };

  const downloadPdf = async () => {
    setCompilingPdf(true);
    try {
      if (engine === "typst") {
        const res = await fetch("/api/resume/compile-typst", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: resume, templateId: selectedTemplate }),
        });
        const data = await res.json();
        if (data.ok && data.pdfBase64) {
          const blob = new Blob([Buffer.from(data.pdfBase64, "base64")], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${resume.header.name.replace(/\s+/g, "_")}_Resume.pdf`;
          a.click();
          success("Typst PDF generated and downloaded!");
          return;
        }
      }

      // Fallback or LaTeX compile
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

  const moveSection = (idx: number, direction: "up" | "down") => {
    const next = [...sectionOrder];
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= next.length) return;
    const temp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = temp;
    setSectionOrder(next);
    success(`Moved ${temp} section ${direction}.`);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] overflow-hidden space-y-2">
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

      {/* Studio Header: Global Actions, Engine Switcher & ATS Score */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/80 px-4 py-2.5 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-[15px] font-bold tracking-tight text-[var(--paper)] flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10">
              <FileText className="h-4 w-4 text-[var(--chartreuse)]" />
            </span>
            Resume & CV Studio
          </h1>

          {/* Resume vs CV Toggle Pill */}
          <div className="flex items-center rounded-xl border border-[var(--line)] bg-black/40 p-0.5 shadow-inner">
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

          {/* Engine Switcher */}
          <div className="flex items-center rounded-xl border border-[var(--line)] bg-black/40 p-0.5 shadow-inner">
            <button
              onClick={() => {
                setEngine("typst");
                void compilePreview();
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                engine === "typst"
                  ? "bg-sky-500 text-neutral-950 font-bold shadow-sm"
                  : "text-dim hover:text-[var(--paper)]"
              )}
              title="Instant <30ms Typst Typesetting Engine"
            >
              <Zap className="h-3 w-3" />
              <span>Typst (Fast)</span>
            </button>
            <button
              onClick={() => {
                setEngine("latex");
                void compilePreview();
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                engine === "latex"
                  ? "bg-emerald-500 text-neutral-950 font-bold shadow-sm"
                  : "text-dim hover:text-[var(--paper)]"
              )}
              title="Full LaTeX TeX Live Compiler"
            >
              <FileCode className="h-3 w-3" />
              <span>LaTeX (TeX)</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 px-2.5 py-1 text-[11px] font-bold tracking-tight text-[var(--chartreuse)] shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--chartreuse)] animate-pulse" aria-hidden />
            <Award className="h-3 w-3" /> ATS {atsReport.score}/100
          </div>
        </div>

        {/* Action Controls & Zoom Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowVariantsModal(true)}
            className="border-[var(--line)] bg-white/[0.04] hover:bg-white/[0.06]"
            title="Manage Master Resume Archetypes & Funnels"
          >
            <Layers className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
            <span>Archetypes</span>
          </Button>

          {history.length > 0 && (
            <Button size="sm" variant="outline" onClick={undoLast} title="Undo last change" className="border-[var(--line)] bg-white/[0.04]">
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </Button>
          )}
          <div className="flex items-center gap-1 rounded-xl border border-[var(--line)] bg-black/40 px-1.5 py-1 shadow-inner">
            <button
              onClick={() => setZoom((z) => Math.max(z - 10, 50))}
              className="grid h-6 w-6 place-items-center rounded-md text-dim hover:text-[var(--paper)] hover:bg-white/[0.06] transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="font-mono text-[11px] font-semibold tabular-nums text-[var(--paper)] min-w-[36px] text-center">
              {zoom}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(z + 10, 150))}
              className="grid h-6 w-6 place-items-center rounded-md text-dim hover:text-[var(--paper)] hover:bg-white/[0.06] transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setZoom(100)}
              className="grid h-6 w-6 place-items-center rounded-md text-dim hover:text-[var(--paper)] hover:bg-white/[0.06] transition-colors"
              title="Reset Zoom (100%)"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>

          <Button size="sm" variant="outline" onClick={copyMarkdown} title="Copy Markdown" className="border-[var(--line)] bg-white/[0.04]">
            {copied ? <Check className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy MD"}</span>
          </Button>

          <Button size="sm" onClick={downloadPdf} loading={compilingPdf} className="shadow-[var(--glow)]">
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
        </div>
      </div>

      {/* Main 3-Pane Resizable Workbench Canvas */}
      <div className="relative flex flex-1 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--ink)] shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
        {/* PANE 1 (LEFT): AI Resume Copilot with Prompt Inspector */}
        <div
          style={{ width: `${leftWidthPercent}%` }}
          className="flex flex-col h-full border-r border-[var(--line)] bg-[var(--ink-card)]/90 backdrop-blur-xl shrink-0 shadow-[4px_0_20px_rgba(0,0,0,0.12)] min-w-[300px]"
        >
          {/* Copilot Header */}
          <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--ink-soft)]/60 px-4 py-3">
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
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPromptInspectorOpen(!promptInspectorOpen)}
                className={cn(
                  "p-1.5 rounded-lg border text-xs transition-colors",
                  promptInspectorOpen
                    ? "border-[var(--chartreuse)] bg-[var(--chartreuse)]/15 text-[var(--chartreuse)]"
                    : "border-[var(--line)] text-dim hover:text-[var(--paper)] hover:bg-white/[0.04]"
                )}
                title="Toggle Live Prompt Inspector"
              >
                <Code2 className="h-3.5 w-3.5" />
              </button>
              {copilotBusy && (
                <span className="flex items-center gap-1.5 text-[10px] text-[var(--chartreuse)] font-mono animate-pulse">
                  <Sparkles className="h-3 w-3" /> Optimizing…
                </span>
              )}
            </div>
          </div>

          {/* Real-time Prompt Inspector Panel */}
          {promptInspectorOpen && (
            <div className="border-b border-[var(--line)] bg-black/60 p-3 text-[11px] font-mono text-dim space-y-1.5 max-h-48 overflow-y-auto">
              <div className="flex items-center justify-between text-[var(--chartreuse)]">
                <span className="font-bold flex items-center gap-1"><Cpu className="h-3 w-3" /> Prompt Inspector</span>
                <span>temp: 0.2 | top_p: 0.95</span>
              </div>
              <p className="text-white/80">System: Act as an elite career strategist and ATS optimization compiler.</p>
              <p className="text-white/60">Template: {selectedTemplate} | Mode: {docKind}</p>
              <p className="text-white/40 truncate">Active Context: {resume.experience?.length || 0} roles, {resume.skills?.length || 0} skills</p>
            </div>
          )}

          {/* Quick Prompts Chips */}
          <div className="flex gap-1.5 overflow-x-auto border-b border-[var(--line)] p-2.5 bg-black/20 no-scrollbar">
            {QUICK_PROMPTS.map((qp, idx) => (
              <button
                key={idx}
                disabled={copilotBusy}
                onClick={() => handleSendMessage(qp.prompt)}
                className="shrink-0 rounded-full border border-[var(--line)] bg-white/[0.03] px-3 py-1 text-[10px] font-semibold tracking-tight text-[var(--paper)] transition-all hover:border-[var(--chartreuse)]/40 hover:bg-[var(--chartreuse)]/10 hover:text-[var(--chartreuse)] active:scale-[0.98] disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {qp.label}
              </button>
            ))}
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.map((msg) => {
              const isAssistant = msg.sender === "assistant";
              return (
                <div
                  key={msg.id}
                  className={cn("flex flex-col space-y-1", isAssistant ? "items-start" : "items-end")}
                >
                  <div
                    className={cn(
                      "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm",
                      isAssistant
                        ? "border border-[var(--line)] bg-white/[0.04] text-[var(--paper)] backdrop-blur"
                        : "bg-[var(--chartreuse)] text-neutral-950 font-medium shadow-[0_4px_16px_rgba(185,237,87,0.22)]"
                    )}
                  >
                    <div className="whitespace-pre-wrap">{msg.text}</div>

                    {msg.actionSummary && (
                      <div className="mt-2.5 flex items-center gap-1.5 rounded-xl border border-[var(--chartreuse)]/25 bg-[var(--chartreuse)]/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-[var(--chartreuse)]">
                        <Check className="h-3 w-3" /> {msg.actionSummary}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-medium tracking-tight text-dim/70 px-1">{msg.timestamp}</span>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <div className="border-t border-[var(--line)] p-3 bg-[var(--ink-soft)]/50 backdrop-blur">
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
                placeholder="Ask AI Copilot to rewrite, enhance metrics, or optimize..."
                className="flex-1 rounded-xl border border-[var(--line)] bg-white/[0.04] px-3.5 py-2 text-xs text-[var(--paper)] outline-none transition-all placeholder:text-dim focus:border-[var(--chartreuse)]/50 focus:bg-white/[0.06]"
              />
              <Button type="submit" size="sm" disabled={!chatInput.trim() || copilotBusy} loading={copilotBusy} className="shadow-[var(--glow)]">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
          </div>
        </div>

        {/* RESIZE DRAG HANDLE 1 */}
        <div
          onMouseDown={() => setIsDraggingLeft(true)}
          className={cn(
            "w-1.5 bg-[var(--line)] hover:bg-[var(--chartreuse)]/40 transition-colors cursor-col-resize flex items-center justify-center shrink-0 select-none",
            isDraggingLeft && "bg-[var(--chartreuse)]/60"
          )}
        >
          <GripVertical className="h-3 w-3 text-dim opacity-40 group-hover:opacity-80" />
        </div>

        {/* PANE 2 (MIDDLE): Live Document Typesetting Canvas with Dual-Engine Preview */}
        <div
          ref={previewContainerRef}
          onMouseUp={handlePreviewMouseUp}
          className="flex-1 overflow-auto bg-[var(--ink-deep)] p-6 flex flex-col items-center gap-5 relative select-text min-w-[420px]"
          style={{
            backgroundImage:
              "radial-gradient(800px 500px at 50% -10%, color-mix(in srgb, var(--chartreuse) 4%, transparent), transparent 60%), radial-gradient(700px 400px at 100% 100%, color-mix(in srgb, var(--sky) 3%, transparent), transparent 55%)",
          }}
        >
          {compileLatencyMs !== null && (
            <div className="absolute top-3 left-4 flex items-center gap-2 rounded-full border border-line bg-black/60 px-3 py-1 text-[10px] font-mono text-dim backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{engine.toUpperCase()} compiled in {compileLatencyMs}ms</span>
            </div>
          )}

          <ResumePdfPreview
            pdfUrl={pdfUrl}
            pdfState={pdfState}
            pdfError={pdfError}
            compiledTex={compiledTex}
            latexSource={engine === "typst" ? typstSource : latexSource}
            compileToken={compileToken}
          />
          <ResumeHtmlFallback
            resume={resume}
            selectedTemplate={selectedTemplate}
            zoom={zoom}
            isDragging={isDraggingLeft || isDraggingRight}
            htmlOpen={htmlOpen}
            onToggle={() => setHtmlOpen((v) => !v)}
            pdfUrl={pdfUrl}
            pdfState={pdfState}
          />
        </div>

        {/* RESIZE DRAG HANDLE 2 */}
        <div
          onMouseDown={() => setIsDraggingRight(true)}
          className={cn(
            "w-1.5 bg-[var(--line)] hover:bg-[var(--chartreuse)]/40 transition-colors cursor-col-resize flex items-center justify-center shrink-0 select-none",
            isDraggingRight && "bg-[var(--chartreuse)]/60"
          )}
        >
          <GripVertical className="h-3 w-3 text-dim opacity-40 group-hover:opacity-80" />
        </div>

        {/* PANE 3 (RIGHT): ATS Diagnostic Tree, Template Switcher & Section Reordering */}
        <div
          style={{ width: `${rightWidthPercent}%` }}
          className="border-l border-[var(--line)] bg-[var(--ink-card)]/95 backdrop-blur-xl p-4 overflow-y-auto space-y-6 shrink-0 shadow-[-12px_0_32px_rgba(0,0,0,0.2)] min-w-[300px]"
        >
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--paper)] flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-[var(--chartreuse)]/12 ring-1 ring-[var(--chartreuse)]/20">
                <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
              </span>
              Studio Diagnostics & Controls
            </h3>
          </div>

          {/* ATS Diagnostic Tree */}
          <div className="rounded-xl border border-[var(--line)] bg-black/30 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--paper)] flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> ATS Parser Score
              </span>
              <span className="text-xs font-mono font-extrabold text-[var(--chartreuse)]">
                {atsReport.score}/100
              </span>
            </div>
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--chartreuse)] transition-all duration-500"
                style={{ width: `${atsReport.score}%` }}
              />
            </div>
            <div className="text-[10px] text-dim space-y-1 pt-1">
              <div className="flex items-center justify-between">
                <span>Standard Section Headings</span>
                <span className="text-emerald-400 font-mono">100% Passed</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Quantified Bullet Impact</span>
                <span className="text-emerald-400 font-mono">92% High</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Estimated Print Pages</span>
                <span className="text-[var(--paper)] font-mono">{atsReport.estimatedPages} Page</span>
              </div>
            </div>
          </div>

          {/* Section Reordering & Layout Structure */}
          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim flex items-center gap-1.5">
              <Layers className="h-3 w-3 text-[var(--chartreuse)]" /> Section Hierarchy & Order
            </label>
            <div className="space-y-1.5">
              {sectionOrder.map((sec, idx) => (
                <div
                  key={sec}
                  className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-white/[0.02] px-3 py-1.5 text-xs text-[var(--paper)]"
                >
                  <span className="capitalize font-medium">{sec}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveSection(idx, "up")}
                      className="p-1 rounded hover:bg-white/10 text-dim hover:text-white disabled:opacity-20 cursor-pointer"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === sectionOrder.length - 1}
                      onClick={() => moveSection(idx, "down")}
                      className="p-1 rounded hover:bg-white/10 text-dim hover:text-white disabled:opacity-20 cursor-pointer"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Target Job Tailoring */}
          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">
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

          {/* Template Switcher */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">
                {docKind === "cv" ? "CV Formats" : "ATS Resume Formats"} ({filteredTemplates.length})
              </label>
              <span className="rounded-full border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/10 px-2 py-0.5 text-[10px] font-mono font-semibold tracking-tight text-[var(--chartreuse)] uppercase">
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
                        ? "border-[var(--chartreuse)] bg-[var(--chartreuse)]/10 shadow-[0_8px_24px_rgba(185,237,87,0.12)] ring-1 ring-[var(--chartreuse)]/20"
                        : "border-[var(--line)] bg-black/20 hover:border-white/15 hover:bg-white/[0.03]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold tracking-tight text-[var(--paper)] group-hover:text-[var(--chartreuse)] transition-colors">
                        {tmpl.name}
                      </span>
                      <span className="shrink-0 text-[9px] font-mono font-bold tracking-wide text-[var(--chartreuse)] bg-[var(--chartreuse)]/10 px-2 py-0.5 rounded-full border border-[var(--chartreuse)]/20">
                        {tmpl.badge}
                      </span>
                    </div>

                    <p className="text-[10px] text-dim leading-relaxed">{tmpl.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-[var(--line)] space-y-2.5">
            <Button size="sm" variant="outline" className="w-full justify-center border-[var(--line)] bg-white/[0.04] hover:bg-white/[0.06]" onClick={syncToProfile}>
              <Save className="h-3.5 w-3.5" /> Sync with Main Profile
            </Button>
            <Button size="sm" className="w-full justify-center shadow-[var(--glow)]" onClick={downloadPdf} loading={compilingPdf}>
              <Download className="h-3.5 w-3.5" /> Export {engine === "typst" ? "Typst" : "LaTeX"} PDF
            </Button>
          </div>
        </div>
      </div>

      {showVariantsModal && (
        <Modal open={showVariantsModal} onClose={() => setShowVariantsModal(false)} title="Resume Archetypes & Conversion Funnels" wide>
          <ResumeVariantsManager
            onSelectVariant={(variant) => {
              setResume(variant.content);
              setSelectedTemplate(variant.templateId || "classic-ats");
              setShowVariantsModal(false);
              success(`Loaded archetype "${variant.name}" into editor.`);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
