"use client";

/* eslint-disable react-hooks/purity */

import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  Sparkles,
  Bot,
  Send,
  Download,
  Check,
  Copy,
  Layers,
  Save,
  Undo2,
  SlidersHorizontal,
  Sliders,
  Code2,
  Cpu,
  ShieldCheck,
  AlertTriangle,
  PanelLeftClose,
  Pin,
  RefreshCw,
  Loader2,
  FileCode,
  Archive,
  FileText,
  Mail,
} from "lucide-react";
import { motion, MotionConfig } from "framer-motion";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/ui/Toaster";
import { Button } from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { toErrorMessage } from "@/lib/errors";
import { analyzeAts } from "@/lib/ats/analyze";
import { texToText, parseLatexLog } from "@/lib/pdf/sanitize";
import ResumeDiff, { computeDiff, getChangedSections } from "@/components/resume/ResumeDiff";
import ResumeVariantsManager from "@/components/resume/ResumeVariantsManager";
import TexEditor from "@/components/resume/TexEditor";
import { useAutoCompile } from "@/hooks/useAutoCompile";
import type { ResumeContent, ResumeDoc, ResumeDocKind, UserProfile } from "@/types";
import { RESUME_TEMPLATES, templatesForKind, templateMeta } from "@/lib/pdf/resumeTemplatesMeta";
import TemplateVisualPreview from "@/components/resume/TemplateVisualPreview";
import ResumeCustomizer from "@/components/resume/ResumeCustomizer";
import { parseTexSettings } from "@/lib/pdf/texSettingsSync";

const PdfViewer = dynamic(() => import("@/components/resume/PdfViewer"), { ssr: false });

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
  layout: "single" | "two";
}

const LAYOUT_BADGE: Record<string, string> = {
  "developer-dashboard": "Two-column",
  "tabular-german": "Two-column",
  "creative-sidebar": "Sidebar",
};

/** Gallery is driven by the template registry — every shipped .tex shows up. */
const STUDIO_TEMPLATES: TemplateMeta[] = RESUME_TEMPLATES.map((m) => ({
  id: m.id,
  name: m.name,
  desc: m.description,
  badge: LAYOUT_BADGE[m.id] ?? m.recommendedFor[0] ?? `ATS ${m.atsScore}`,
  layout: m.id === "developer-dashboard" || m.id === "tabular-german" ? "two" : "single",
}));

const DOC_TYPE_META: { kind: ResumeDocKind; name: string; desc: string; defaultTemplate: string }[] = [
  { kind: "resume", name: "Resume", desc: "Compact 1-page high-impact industry format.", defaultTemplate: "classic-ats" },
  { kind: "cv", name: "CV", desc: "Detailed multi-page curriculum vitae.", defaultTemplate: "tabular-german" },
  { kind: "cover_letter", name: "Cover Letter", desc: "Concise pitch generated from your current content.", defaultTemplate: "letter-cover" },
  { kind: "motivation_letter", name: "Motivation Letter", desc: "Formal multi-paragraph motivation statement.", defaultTemplate: "letter-motivation" },
];

function defaultTemplateForKind(kind: ResumeDocKind): string {
  return DOC_TYPE_META.find((d) => d.kind === kind)?.defaultTemplate ?? "classic-ats";
}

const QUICK_PROMPTS = [
  { label: "ATS keyword polish", prompt: "Analyze this resume against modern ATS algorithms and optimize keyword density without keyword stuffing." },
  { label: "Quantify achievements", prompt: "Rewrite work experience bullets using the Google XYZ formula (Accomplished [X], measured by [Y], by doing [Z])." },
  { label: "Cut to exact 1-page", prompt: "Tighten spacing and condense bullet points so this resume fits perfectly on a single page." },
  { label: "Ingest vault evidence", prompt: "Scan my Profile Vault and pull in verified technical project metrics and production achievements." },
  { label: "DACH CV style", prompt: "Format this into a German Tabellarischer Lebenslauf structure." },
];

function profileToResume(profile: UserProfile): ResumeContent {
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
          "Built high-performance local-first career operating system with instant <30ms typesetting engine.",
        ],
      },
    ],
  };
}

function StudioInner() {
  const searchParams = useSearchParams();
  const docIdParam = searchParams.get("docId");

  const { profile, applications } = useApp();
  const { success, error: errToast } = useToast();

  const [activeDocId, setActiveDocId] = useState<string>(docIdParam || "");
  const [docName, setDocName] = useState<string>("main.tex");
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("classic-ats");
  const [docKind, setDocKind] = useState<ResumeDocKind>("resume");

  // Raw .tex is the single source of truth for the entire editor
  const [texBuffer, setTexBuffer] = useState<string>("");
  const [history, setHistory] = useState<string[]>([]);
  const [autoCompile, setAutoCompile] = useState<boolean>(true);
  const [lastSavedTex, setLastSavedTex] = useState<string>("");
  const isDirty = useMemo(() => texBuffer !== lastSavedTex && texBuffer.length > 0, [texBuffer, lastSavedTex]);

  // SyncTeX navigation
  const [revealLine, setRevealLine] = useState<number | null>(null);
  const [forwardBusy, setForwardBusy] = useState(false);
  const [reverseBusy, setReverseBusy] = useState(false);

  // AutoCompile hook
  const {
    compileNow,
    busy: compileBusy,
    latencyMs: compileLatencyMs,
    pdfData,
    pdfState,
    pdfError,
    token: compileToken,
    compiledTex,
    logTail,
  } = useAutoCompile({
    tex: texBuffer,
    autoCompile,
    onError: (msg) => {
      errToast(msg);
    },
  });

  const isStale = useMemo(() => {
    return compiledTex !== null && compiledTex !== texBuffer;
  }, [compiledTex, texBuffer]);

  // Parse logTail into line numbers for TexEditor gutter markers
  const errorLines = useMemo(() => {
    if (!logTail) return [];
    const lines: number[] = [];
    const parsed = parseLatexLog(logTail);
    for (const item of parsed) {
      const m = item.match(/l\.(\d+)/i) || item.match(/line\s+(\d+)/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n > 0 && !lines.includes(n)) lines.push(n);
      }
    }
    return lines;
  }, [logTail]);

  // Pinned baseline for Diff tab
  const [baseline, setBaseline] = useState<string | null>(null);

  // Modals & Panels
  const [configureOpen, setConfigureOpen] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [showVariantsModal, setShowVariantsModal] = useState(false);
  const [promptInspectorOpen, setPromptInspectorOpen] = useState(false);
  const [refineTab, setRefineTab] = useState<"chat" | "ats" | "diff">("chat");
  const [refineCollapsed, setRefineCollapsed] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<
    | { kind: "template"; templateId: string }
    | { kind: "docKind"; docKind: ResumeDocKind }
    | null
  >(null);

  // Resizable split state (persisted to localStorage)
  const [splitPct, setSplitPct] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("huntflow_overleaf_split_pct");
      if (saved) {
        const n = parseFloat(saved);
        if (!isNaN(n) && n >= 20 && n <= 80) return n;
      }
    }
    return 50;
  });
  const [mobileTab, setMobileTab] = useState<"editor" | "pdf" | "ai">("editor");

  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplit = useRef(false);

  // Chat Copilot State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "msg-0",
      sender: "assistant",
      text: "**Welcome to the AI Studio!**\n\nI work directly on your raw `main.tex` buffer in real time across resumes, CVs, cover letters, and motivation letters. Ask me to rewrite experience bullets with quantified impact, align keywords against your target role, or pull verified metrics from your **Vault**.",
      timestamp: "Just now",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const log = messagesEndRef.current?.parentElement;
    if (log) log.scrollTop = log.scrollHeight;
  }, [chatMessages]);

  const selectedJob = useMemo(
    () => applications.find((a) => a.id === selectedJobId) || null,
    [applications, selectedJobId]
  );

  // ATS score computed from texToText(texBuffer)
  const atsReport = useMemo(() => {
    if (!texBuffer.trim()) return { score: 0, checks: [], keywords: [], estimatedPages: 1 };
    try {
      const text = texToText(texBuffer);
      return analyzeAts(
        text,
        selectedJob ? `${selectedJob.title} ${selectedJob.company} ${selectedJob.jobDescription || ""}` : undefined
      );
    } catch {
      return { score: 85, checks: [], keywords: [], estimatedPages: 1 };
    }
  }, [texBuffer, selectedJob]);

  // Seed on mount or on docIdParam navigation
  const hasSeededRef = useRef(false);
  const lastSeededDocIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (hasSeededRef.current && lastSeededDocIdRef.current === docIdParam) return;
    hasSeededRef.current = true;
    lastSeededDocIdRef.current = docIdParam;
    async function seed() {
      try {
        const res = await fetch("/api/resume");
        if (res.ok) {
          const data = (await res.json()) as { docs?: ResumeDoc[] };
          const list = data.docs || [];
          let targetDoc: ResumeDoc | undefined;

          if (docIdParam) {
            targetDoc = list.find((d) => d.id === docIdParam);
          }
          if (!targetDoc && list.length > 0) {
            targetDoc = list[0];
          }

          if (targetDoc && targetDoc.tex) {
            setActiveDocId(targetDoc.id);
            setDocName(targetDoc.name || "main.tex");
            setSelectedTemplate(targetDoc.templateId || "classic-ats");
            setDocKind(targetDoc.kind);
            if (targetDoc.targetJobId) setSelectedJobId(targetDoc.targetJobId);
            setTexBuffer(targetDoc.tex);
            setLastSavedTex(targetDoc.tex);
            return;
          }
        }

        // Fallback: render fresh initial LaTeX from profile
        const renderRes = await fetch("/api/resume/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId: "classic-ats",
            content: profileToResume(profile),
          }),
        });
        if (renderRes.ok) {
          const rData = (await renderRes.json()) as { tex?: string };
          const initTex = rData.tex || "";
          setTexBuffer(initTex);
          setLastSavedTex(initTex);
        }
      } catch {
        // Fallback handled
      }
    }

    void seed();
  }, [docIdParam, profile]);

  // Debounced auto-save to /api/resume (2s)
  useEffect(() => {
    if (!texBuffer || !isDirty) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: activeDocId || undefined,
            name: docName || "main.tex",
            kind: docKind,
            templateId: selectedTemplate,
            tex: texBuffer,
            targetJobId: selectedJobId || undefined,
            autoCompile,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { doc?: { id: string } };
          if (data.doc?.id && !activeDocId) {
            setActiveDocId(data.doc.id);
          }
          setLastSavedTex(texBuffer);
        }
      } catch {
        // non-blocking
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [texBuffer, isDirty, activeDocId, docName, docKind, selectedTemplate, selectedJobId, autoCompile]);

  const saveExplicitly = async () => {
    try {
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeDocId || undefined,
          name: docName || "main.tex",
          kind: docKind,
          templateId: selectedTemplate,
          tex: texBuffer,
          targetJobId: selectedJobId || undefined,
          autoCompile,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = (await res.json()) as { doc?: { id: string } };
      if (data.doc?.id) setActiveDocId(data.doc.id);
      setLastSavedTex(texBuffer);
      success("Saved changes to database.");
    } catch (e) {
      errToast(toErrorMessage(e));
    }
  };

  const handleTexChange = useCallback((newTex: string) => {
    setTexBuffer(newTex);
  }, []);

  const applyTexUpdate = useCallback(
    (newTex: string, saveHistory = true) => {
      if (saveHistory) {
        setHistory((prev) => [texBuffer, ...prev.slice(0, 19)]);
      }
      setTexBuffer(newTex);
    },
    [texBuffer]
  );

  const undoLast = () => {
    if (history.length === 0) return;
    const [previous, ...rest] = history;
    setHistory(rest);
    setTexBuffer(previous);
    success("Reverted to previous version.");
  };

  // SyncTeX forward & reverse handlers
  const handleSynctexForward = async () => {
    if (!compileToken) return null;
    const line = revealLine || 1;
    setForwardBusy(true);
    try {
      const res = await fetch("/api/resume/synctex/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: compileToken, line, column: 0 }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error?.message || "SyncTeX forward failed");
      return { page: data.page, x: data.x, y: data.y, width: data.width, height: data.height };
    } catch (e) {
      errToast(toErrorMessage(e));
      return null;
    } finally {
      setForwardBusy(false);
    }
  };

  const handleSynctexReverse = async (page: number, x: number, y: number) => {
    if (!compileToken) return null;
    setReverseBusy(true);
    try {
      const res = await fetch("/api/resume/synctex/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: compileToken, page, x, y }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error?.message || "SyncTeX reverse failed");
      return { line: data.line };
    } catch (e) {
      errToast(toErrorMessage(e));
      return null;
    } finally {
      setReverseBusy(false);
    }
  };

  // Download compiled PDF
  const handleDownloadPdf = () => {
    if (!compileToken) {
      compileNow();
      return;
    }
    window.open(`/api/resume/compile?token=${encodeURIComponent(compileToken)}&save=1`, "_blank");
  };

  // Chat copilot interaction
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
          tex: texBuffer,
          templateId: selectedTemplate,
          history: chatMessages.slice(-6).map((m) => ({ role: m.sender, content: m.text })),
          targetJob: selectedJob ? { title: selectedJob.title, company: selectedJob.company, description: selectedJob.jobDescription } : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Copilot returned ${res.status}`);
      }

      const data = (await res.json()) as { ok?: boolean; reply?: string; actionSummary?: string; tex?: string };

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: "assistant",
        text: data.reply || "I've reviewed your request.",
        actionSummary: data.actionSummary,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setChatMessages((prev) => [...prev, aiMsg]);

      if (data.tex && data.tex.trim()) {
        applyTexUpdate(data.tex);
        success(data.actionSummary || "LaTeX updated by AI Copilot.");
      }
    } catch (err: unknown) {
      errToast(toErrorMessage(err));
    } finally {
      setCopilotBusy(false);
    }
  };

  const parsedSettings = useMemo(() => parseTexSettings(texBuffer), [texBuffer]);

  const switchTemplateInstantly = async (targetTemplateId: string, withAi = false, force = false) => {
    if (!force && targetTemplateId === selectedTemplate && !withAi) return;
    try {
      const res = await fetch("/api/resume/switch-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tex: texBuffer,
          targetTemplateId,
          profile,
          job: selectedJob ? { company: selectedJob.company, title: selectedJob.title } : undefined,
        }),
      });
      if (!res.ok) throw new Error("Template switch failed");
      const data = (await res.json()) as { ok?: boolean; tex?: string; templateName?: string };
      if (data.tex) {
        applyTexUpdate(data.tex);
        setSelectedTemplate(targetTemplateId);
        const meta = templateMeta(targetTemplateId);
        if (meta && !meta.kinds.includes(docKind)) setDocKind(meta.kinds[0]);
        success(`Switched to “${data.templateName || targetTemplateId}” with your content preserved.`);
      }
    } catch (e) {
      errToast(toErrorMessage(e));
    }
    if (withAi) {
      void handleSendMessage(`Rebuild and format my document according to the ${targetTemplateId} template layout.`);
    }
  };

  // Template switch confirmation
  const confirmPendingSwitch = async (withAiReformat: boolean) => {
    if (!pendingSwitch) return;
    if (pendingSwitch.kind === "docKind") {
      const kind = pendingSwitch.docKind;
      const target = defaultTemplateForKind(kind);
      setDocKind(kind);
      setSelectedTemplate(target);
      setPendingSwitch(null);
      void switchTemplateInstantly(target, withAiReformat, true);
    } else {
      const templateId = pendingSwitch.templateId;
      setPendingSwitch(null);
      void switchTemplateInstantly(templateId, withAiReformat);
    }
  };

  // Drag divider mouse listeners
  const startSplitDrag = () => {
    isDraggingSplit.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingSplit.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(75, Math.max(25, Math.round(pct * 10) / 10));
      setSplitPct(clamped);
    };
    const onMouseUp = () => {
      if (isDraggingSplit.current) {
        isDraggingSplit.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        localStorage.setItem("huntflow_overleaf_split_pct", String(splitPct));
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [splitPct]);

  // Diff comparison
  const changedSections = useMemo(() => {
    return baseline ? getChangedSections(computeDiff(baseline, texBuffer)) : [];
  }, [baseline, texBuffer]);

  const pinBaseline = () => {
    if (!texBuffer.trim()) {
      errToast("Nothing to pin yet — buffer is empty.");
      return;
    }
    setBaseline(texBuffer);
    success("Baseline pinned — source diff is live.");
  };

  const copyMarkdown = async () => {
    try {
      const text = texToText(texBuffer);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      success("Copied clean text to clipboard!");
    } catch {
      errToast("Copy failed");
    }
  };

  const filteredTemplates = useMemo(
    () =>
      templatesForKind(docKind)
        .map((m) => STUDIO_TEMPLATES.find((t) => t.id === m.id))
        .filter((t): t is TemplateMeta => Boolean(t)),
    [docKind]
  );

  return (
    <MotionConfig reducedMotion="user">
    <div className="flex h-[calc(100vh-5rem)] min-h-0 flex-col overflow-hidden text-[var(--paper)]">
      {/* Overleaf Top Bar: filename, dirty, Recompile, Auto, Latency, Target Job, Templates, Download, AI Rail */}
      <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[var(--line)] bg-[var(--ink-card)]/90 px-3.5 py-2 backdrop-blur shrink-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
          {/* Document name, type & dirty dot */}
          <div className="flex items-center gap-2 rounded-lg border border-line bg-[var(--ink-soft)] px-2.5 py-1">
            <FileCode className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
            <span className="font-mono text-xs font-bold text-[var(--paper)]">{docName}</span>
            <span className="rounded-full bg-[var(--chartreuse)]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--chartreuse)] ring-1 ring-[var(--chartreuse)]/25">
              {DOC_TYPE_META.find((d) => d.kind === docKind)?.name ?? docKind}
            </span>
            {isDirty && (
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" title="Unsaved changes" />
            )}
          </div>

          {/* Recompile split-button & Auto toggle */}
          <div className="flex items-center rounded-lg border border-[var(--line)] bg-[var(--ink-soft)] p-0.5 shadow-sm">
            <Button
              size="sm"
              variant="ghost"
              onClick={compileNow}
              disabled={compileBusy}
              className="h-7 gap-1.5 px-2.5 text-xs font-semibold text-[var(--paper)] hover:bg-white/[0.08]"
              title="Typeset with pdflatex (bypass debounce)"
            >
              {compileBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--chartreuse)]" /> : <RefreshCw className="h-3.5 w-3.5 text-[var(--chartreuse)]" />}
              <span>Recompile</span>
            </Button>
            <span className="h-4 w-px bg-[var(--line)]" aria-hidden />
            <label className="flex items-center gap-1.5 px-2 text-[11px] font-medium text-dim cursor-pointer hover:text-[var(--paper)]" title="Compile automatically 1.2s after typing stops">
              <input
                type="checkbox"
                checked={autoCompile}
                onChange={(e) => setAutoCompile(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--chartreuse)] rounded"
              />
              <span>Auto</span>
            </label>
          </div>

          {/* Compile Status / Latency badge */}
          {compileLatencyMs !== null && !compileBusy && (
            <span className="hidden items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--ink-soft)] px-2 py-0.5 font-mono text-[10px] text-dim sm:inline-flex">
              {compileLatencyMs}ms
            </span>
          )}

          {isStale && (
            <span className="rounded-full bg-[var(--amber)]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--amber)] ring-1 ring-[var(--amber)]/30">
              Stale
            </span>
          )}

          {/* Target Job Selector */}
          <div className="w-52 sm:w-64" title={selectedJob ? `${selectedJob.company} — ${selectedJob.title}` : "General profile"}>
            <Select
              value={selectedJobId}
              onChange={(v) => setSelectedJobId(v)}
              options={[
                { value: "", label: "General Profile", hint: "No specific role" },
                ...applications.map((app) => ({ value: app.id, label: app.company, hint: app.title })),
              ]}
              placeholder="Target role…"
              ariaLabel="Tailor for target job"
              className="w-full [&>button]:h-8 [&>button]:text-xs"
              menuClassName="w-72 max-w-[85vw]"
            />
          </div>
        </div>

        {/* Right controls: Download, Templates modal, Save, AI Rail Toggle */}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCustomizerOpen(true)}
            className="h-8 gap-1.5 text-xs border-[var(--line)] bg-[var(--ink-soft)] hover:bg-[var(--ink-soft)]/80 text-[var(--paper)]"
            title="Visual resume builder: photo, icons, accent color, margins, contact info"
          >
            <Sliders className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
            <span className="hidden md:inline">Customize</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfigureOpen(true)}
            className="h-8 border-[var(--line)] bg-[var(--ink-soft)] hover:bg-[var(--ink-soft)]/80 text-xs text-[var(--paper)]"
            title="Templates, mode, history"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Template</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={saveExplicitly}
            disabled={!isDirty}
            className="h-8 border-[var(--line)] bg-[var(--ink-soft)] hover:bg-[var(--ink-soft)]/80 text-xs text-[var(--paper)]"
            title="Save to database"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Save</span>
          </Button>

          <Button
            size="sm"
            onClick={handleDownloadPdf}
            className="h-8 gap-1.5 text-xs shadow-[var(--glow)]"
            title="Download compiled PDF"
          >
            <Download className="h-3.5 w-3.5" />
            <span>PDF</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRefineCollapsed(!refineCollapsed)}
            className={cn("h-8 px-2 text-xs", !refineCollapsed ? "text-[var(--chartreuse)] bg-[var(--chartreuse)]/10" : "text-dim hover:text-[var(--paper)]")}
            title={refineCollapsed ? "Open AI Copilot & ATS" : "Collapse AI rail"}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{refineCollapsed ? "Copilot" : "Rail"}</span>
          </Button>
        </div>
      </motion.header>

      {/* Mobile Tab Switcher (< lg) */}
      <div className="flex border-b border-[var(--line)] bg-[var(--ink-soft)] px-2 py-1 lg:hidden">
        {(["editor", "pdf", "ai"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            className={cn(
              "flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors",
              mobileTab === tab ? "bg-[var(--chartreuse)] text-neutral-950 font-bold" : "text-dim hover:text-[var(--paper)]"
            )}
          >
            {tab === "editor" ? "LaTeX Code" : tab === "pdf" ? "PDF Preview" : "AI Copilot"}
          </button>
        ))}
      </div>

      {/* Main Workbench: Editor | Divider | PDF Preview | AI Rail */}
      <div ref={splitContainerRef} className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Desktop Split: CodeMirror Left + PDF Right */}
        <div
          className={cn(
            "flex min-h-0 flex-1 overflow-hidden",
            "max-lg:hidden"
          )}
        >
          {/* Left Pane: CodeMirror TexEditor */}
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: "easeOut", delay: 0.05 }}
            style={{ width: `${splitPct}%` }}
            className="flex min-h-0 min-w-[320px] flex-col border-r border-[var(--line)] bg-[var(--ink-card)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--ink-soft)] px-3 py-1.5 text-[11px] font-mono text-dim">
              <span>LaTeX Source ({texBuffer.length} chars)</span>
              <div className="flex items-center gap-2">
                {errorLines.length > 0 && (
                  <span className="text-[var(--coral)] font-bold flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {errorLines.length} error{errorLines.length > 1 ? "s" : ""}
                  </span>
                )}
                {history.length > 0 && (
                  <button onClick={undoLast} className="hover:text-[var(--paper)] flex items-center gap-1">
                    <Undo2 className="h-3 w-3" /> Undo ({history.length})
                  </button>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <TexEditor
                value={texBuffer}
                onChange={handleTexChange}
                errorLines={errorLines}
                revealLine={revealLine}
              />
            </div>
          </motion.div>

          {/* Drag Handle */}
          <div
            onMouseDown={startSplitDrag}
            className="group relative z-10 -ml-1 w-2 cursor-col-resize select-none bg-transparent hover:bg-[var(--chartreuse)]/30 active:bg-[var(--chartreuse)]/50 transition-colors"
            title="Drag to resize editor and preview panes"
          >
            <div className="absolute inset-y-0 left-0.5 w-px bg-[var(--line)] group-hover:bg-[var(--chartreuse)]" />
          </div>

          {/* Right Pane: PdfViewer continuous scroll */}
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: "easeOut", delay: 0.1 }}
            style={{ width: `${100 - splitPct}%` }}
            className="flex min-h-0 min-w-[320px] flex-1 flex-col overflow-hidden bg-[var(--ink-deep)] p-2 sm:p-4"
          >
            <PdfViewer
              pdfData={pdfData}
              token={compileToken}
              latencyMs={compileLatencyMs}
              pdfState={pdfState}
              pdfError={pdfError}
              stale={isStale}
              onDownload={handleDownloadPdf}
              downloading={false}
              onForward={handleSynctexForward}
              onReverse={handleSynctexReverse}
              forwardBusy={forwardBusy}
              reverseBusy={reverseBusy}
              onRevealLine={(line: number) => setRevealLine(line)}
            />
          </motion.div>
        </div>

        {/* Mobile View: active tab only (< lg) */}
        <div className="flex min-h-0 flex-1 overflow-hidden lg:hidden">
          {mobileTab === "editor" && (
            <div className="flex min-h-0 flex-1 flex-col bg-[var(--ink-card)]">
              <TexEditor
                value={texBuffer}
                onChange={handleTexChange}
                errorLines={errorLines}
                revealLine={revealLine}
              />
            </div>
          )}
          {mobileTab === "pdf" && (
            <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-[var(--ink-deep)] p-2">
              <PdfViewer
                pdfData={pdfData}
                token={compileToken}
                latencyMs={compileLatencyMs}
                pdfState={pdfState}
                pdfError={pdfError}
                stale={isStale}
                onDownload={handleDownloadPdf}
                downloading={false}
                onForward={handleSynctexForward}
                onReverse={handleSynctexReverse}
                forwardBusy={forwardBusy}
                reverseBusy={reverseBusy}
                onRevealLine={(line: number) => setRevealLine(line)}
              />
            </div>
          )}
        </div>

        {/* Collapsible Right AI Rail */}
        {(!refineCollapsed || mobileTab === "ai") && (
          <motion.aside
            aria-label="Refine workspace"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: "easeOut", delay: 0.15 }}
            className={cn(
              "z-20 flex min-h-0 flex-col border-l border-[var(--line)] bg-[var(--ink-card)]/95 backdrop-blur-xl",
              mobileTab === "ai"
                ? "absolute inset-0 flex"
                : "w-80 sm:w-96 shrink-0"
            )}
          >
            {/* Rail Header: tabs + collapse button */}
            <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--ink-soft)]/60 px-3 py-2">
              <div role="tablist" aria-label="Copilot tools" className="flex items-center gap-1">
                {(["chat", "ats", "diff"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    id={`refine-tab-${tab}`}
                    aria-selected={refineTab === tab}
                    onClick={() => setRefineTab(tab)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-bold capitalize transition-colors cursor-pointer",
                      refineTab === tab
                        ? "bg-[var(--chartreuse)]/15 text-[var(--chartreuse)] ring-1 ring-[var(--chartreuse)]/30"
                        : "text-dim hover:bg-white/[0.05] hover:text-[var(--paper)]"
                    )}
                  >
                    {tab === "chat" ? "Copilot" : tab === "ats" ? `ATS (${atsReport.score})` : "Diff"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setRefineCollapsed(true)}
                aria-label="Collapse refine rail"
                title="Collapse refine rail"
                className="grid h-7 w-7 place-items-center rounded-lg text-dim hover:bg-white/[0.06] hover:text-[var(--paper)]"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>

            {/* Chat Tab Panel */}
            {refineTab === "chat" && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--ink-soft)]/60 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="grid h-6 w-6 place-items-center rounded-md bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold leading-tight">LaTeX Copilot</p>
                      <p className="text-[10px] text-dim flex items-center gap-1">
                        <Archive className="h-2.5 w-2.5 text-[var(--chartreuse)]" /> Vault connected
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPromptInspectorOpen(!promptInspectorOpen)}
                    aria-label="Toggle Context Inspector"
                    title="Toggle Context Inspector"
                    className="grid h-6 w-6 place-items-center rounded border border-[var(--line)] text-dim hover:text-[var(--paper)]"
                  >
                    <Code2 className="h-3 w-3" />
                  </button>
                </div>

                {promptInspectorOpen && (
                  <div className="border-b border-[var(--line)] bg-[var(--ink-soft)] p-2.5 text-[10px] font-mono text-dim space-y-1">
                    <p className="text-[var(--chartreuse)] font-bold flex items-center gap-1">
                      <Cpu className="h-2.5 w-2.5" /> Context Inspector
                    </p>
                    <p>Mode: {docKind.toUpperCase()} | Template: {selectedTemplate}</p>
                    <p>Buffer size: {texBuffer.length} characters</p>
                    {selectedJob && <p>Target: {selectedJob.company} — {selectedJob.title}</p>}
                  </div>
                )}

                {/* Quick Prompts */}
                <div className="flex gap-1.5 overflow-x-auto border-b border-[var(--line)] bg-[var(--ink-soft)]/40 p-2 no-scrollbar">
                  {QUICK_PROMPTS.map((qp, idx) => (
                    <button
                      key={idx}
                      disabled={copilotBusy}
                      onClick={() => handleSendMessage(qp.prompt)}
                      className="shrink-0 rounded-full border border-[var(--line)] bg-white/[0.03] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--paper)] hover:border-[var(--chartreuse)]/40 hover:bg-[var(--chartreuse)]/10 hover:text-[var(--chartreuse)] disabled:opacity-50"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>

                {/* Chat Log */}
                <div role="log" aria-label="Copilot conversation" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  {chatMessages.map((msg) => {
                    const isAssistant = msg.sender === "assistant";
                    return (
                      <div key={msg.id} className={cn("flex flex-col space-y-1", isAssistant ? "items-start" : "items-end")}>
                        <div
                          className={cn(
                            "max-w-[92%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
                            isAssistant
                              ? "border border-[var(--line)] bg-white/[0.04] text-[var(--paper)]"
                              : "bg-[var(--chartreuse)] text-neutral-950 font-medium"
                          )}
                        >
                          <div className="whitespace-pre-wrap">{msg.text}</div>
                          {msg.actionSummary && (
                            <div className="mt-2 flex items-center gap-1 rounded-lg border border-[var(--chartreuse)]/25 bg-[var(--chartreuse)]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--chartreuse)]">
                              <Check className="h-3 w-3" /> {msg.actionSummary}
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] font-medium text-dim/70 px-1">{msg.timestamp}</span>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Chat Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSendMessage();
                  }}
                  className="flex items-center gap-1.5 border-t border-[var(--line)] bg-[var(--ink-soft)]/50 p-2"
                >
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={chatInput}
                    disabled={copilotBusy}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask Copilot to rewrite, fix bullets, quantify metrics…"
                    className="flex-1 rounded-lg border border-[var(--line)] bg-white/[0.04] px-3 py-1.5 text-xs text-[var(--paper)] outline-none focus:border-[var(--chartreuse)]/50 placeholder:text-dim"
                  />
                  <Button type="submit" size="sm" disabled={!chatInput.trim() || copilotBusy} loading={copilotBusy} className="h-8 px-2.5">
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </form>
              </div>
            )}

            {/* ATS Tab Panel */}
            {refineTab === "ats" && (
              <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--ink-soft)]/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--paper)]">
                      <ShieldCheck className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> ATS Analysis
                    </span>
                    <span className="font-mono text-xs font-extrabold text-[var(--chartreuse)]">{atsReport.score}/100</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-[var(--chartreuse)] transition-all duration-500" style={{ width: `${atsReport.score}%` }} />
                  </div>
                  <p className="mt-2 text-[10px] text-dim">
                    Estimated pages: {atsReport.estimatedPages} {selectedJob ? `· Target: ${selectedJob.company}` : "· General profile"}
                  </p>
                </div>

                <ul className="space-y-1.5">
                  {atsReport.checks.map((check) => (
                    <li key={check.id} className="rounded-lg border border-[var(--line)] bg-white/[0.02] px-2.5 py-1.5">
                      <p className="flex items-center gap-1.5 text-xs font-semibold">
                        {check.ok ? <Check className="h-3 w-3 text-[var(--chartreuse)]" /> : <AlertTriangle className="h-3 w-3 text-[var(--amber)]" />}
                        {check.label}
                      </p>
                      <p className="mt-0.5 text-[10px] text-dim">{check.hint}</p>
                    </li>
                  ))}
                </ul>

                {atsReport.keywords.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-dim">Keywords</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {atsReport.keywords.map((k) => (
                        <span
                          key={k.term}
                          className={cn(
                            "rounded-full border px-2 py-0.5 font-mono text-[9px]",
                            k.inResume ? "border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]" : "border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]"
                          )}
                        >
                          {k.term}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Diff Tab Panel */}
            {refineTab === "diff" && (
              <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold">Source Diff</p>
                  <Button size="sm" variant="outline" onClick={pinBaseline} className="h-7 text-xs border-[var(--line)]">
                    <Pin className="h-3 w-3" /> {baseline ? "Re-pin" : "Pin baseline"}
                  </Button>
                </div>
                {!baseline ? (
                  <p className="rounded-xl border border-[var(--line)] bg-[var(--ink-soft)]/50 p-3 text-xs text-dim">
                    Pin a baseline to compare subsequent edits line-by-line.
                  </p>
                ) : (
                  <>
                    {changedSections.length > 0 && (
                      <p className="text-[10px] font-mono text-[var(--chartreuse)]">
                        Changed sections: {changedSections.join(", ")}
                      </p>
                    )}
                    <ResumeDiff beforeTex={baseline} afterTex={texBuffer} />
                  </>
                )}
              </div>
            )}
          </motion.aside>
        )}
      </div>

      {/* Confirmation modal for template / docKind switches */}
      {pendingSwitch && (
        <Modal
          open
          onClose={() => setPendingSwitch(null)}
          title={pendingSwitch.kind === "template" ? "Switch template?" : `Generate ${DOC_TYPE_META.find((d) => d.kind === pendingSwitch.docKind)?.name ?? pendingSwitch.docKind}?`}
        >
          <div className="space-y-4 text-xs text-dim leading-relaxed">
            <p>
              {pendingSwitch.kind === "template"
                ? `The editor will re-render with template “${STUDIO_TEMPLATES.find((t) => t.id === pendingSwitch.templateId)?.name ?? pendingSwitch.templateId}”.`
                : `The editor will generate a ${DOC_TYPE_META.find((d) => d.kind === pendingSwitch.docKind)?.name ?? pendingSwitch.docKind} from your current content — bullets, metrics, and edits preserved.`}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => setPendingSwitch(null)}>
                Cancel
              </Button>
              <Button size="sm" variant="outline" onClick={() => void confirmPendingSwitch(false)}>
                Switch layout only
              </Button>
              <Button size="sm" onClick={() => void confirmPendingSwitch(true)} disabled={copilotBusy}>
                Switch + AI reformat
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Configure modal */}
      {configureOpen && (
        <Modal open={configureOpen} onClose={() => setConfigureOpen(false)} title="AI Studio Settings" wide>
          <div className="space-y-5">
            <fieldset>
              <legend className="text-[10px] font-semibold uppercase tracking-wider text-dim">Generate document</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {DOC_TYPE_META.map((opt) => {
                  const Icon = opt.kind === "resume" ? FileText : opt.kind === "cv" ? Layers : opt.kind === "cover_letter" ? Mail : Sparkles;
                  return (
                  <label
                    key={opt.kind}
                    className={cn(
                      "cursor-pointer rounded-2xl border p-3 transition-all",
                      docKind === opt.kind
                        ? "border-[var(--chartreuse)] bg-[var(--chartreuse)]/10 ring-1 ring-[var(--chartreuse)]/30"
                        : "border-line bg-[var(--ink-soft)]/50 hover:bg-[var(--ink-soft)]"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="doc-kind"
                        checked={docKind === opt.kind}
                        onChange={() => setPendingSwitch({ kind: "docKind", docKind: opt.kind })}
                        className="h-4 w-4 accent-[var(--chartreuse)]"
                      />
                      <Icon className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
                      <span className="text-xs font-bold text-[var(--paper)]">{opt.name}</span>
                    </span>
                    <span className="mt-1 block text-[11px] text-dim">{opt.desc}</span>
                  </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-[10px] font-semibold uppercase tracking-wider text-dim mb-2">
                LaTeX Template ({filteredTemplates.length}) — Click to switch layout instantly
              </legend>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 max-h-[380px] overflow-y-auto pr-1">
                {filteredTemplates.map((tmpl) => {
                  const isSelected = selectedTemplate === tmpl.id;
                  return (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => {
                        void switchTemplateInstantly(tmpl.id);
                      }}
                      className={cn(
                        "group flex flex-col p-2.5 rounded-2xl border text-left transition-all cursor-pointer",
                        isSelected
                          ? "border-[var(--chartreuse)] bg-[var(--chartreuse)]/10 ring-2 ring-[var(--chartreuse)]/40 shadow-sm"
                          : "border-line bg-[var(--ink-soft)]/50 hover:bg-[var(--ink-soft)] hover:border-[var(--chartreuse)]/40"
                      )}
                    >
                      <div className="relative w-full rounded-xl overflow-hidden mb-2 shadow-xs group-hover:scale-[1.01] transition-transform">
                        <TemplateVisualPreview
                          templateId={tmpl.id}
                          name={parsedSettings.name}
                          title={parsedSettings.title}
                        />
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--chartreuse)] text-neutral-950 shadow">
                            <Check className="h-3 w-3 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <span className="text-xs font-bold text-[var(--paper)] truncate">{tmpl.name}</span>
                        <span className="shrink-0 rounded bg-[var(--chartreuse)]/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[var(--chartreuse)]">
                          {tmpl.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-dim line-clamp-2 mt-1">{tmpl.desc}</p>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <section className="space-y-2 border-t border-[var(--line)] pt-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-dim">Actions & Tools</h3>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={undoLast} disabled={history.length === 0} className="border-[var(--line)]">
                  <Undo2 className="h-3.5 w-3.5" /> Undo ({history.length})
                </Button>
                <Button size="sm" variant="outline" onClick={copyMarkdown} className="border-[var(--line)]">
                  {copied ? <Check className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy Plain Text"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setConfigureOpen(false);
                    setShowVariantsModal(true);
                  }}
                  className="border-[var(--line)]"
                >
                  <Layers className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> Archetypes
                </Button>
              </div>
            </section>
          </div>
        </Modal>
      )}

      {/* Resume Visual Customizer & Settings Modal */}
      {customizerOpen && (
        <Modal open={customizerOpen} onClose={() => setCustomizerOpen(false)} title="AI Studio Customizer & Settings" wide>
          <div className="h-[580px] -mx-6 -my-4">
            <ResumeCustomizer
              tex={texBuffer}
              onApply={(newTex) => applyTexUpdate(newTex)}
              selectedTemplate={selectedTemplate}
              onSelectTemplate={(tmplId) => {
                void switchTemplateInstantly(tmplId);
              }}
              templates={filteredTemplates}
              profile={profile}
              vaultHref="/vault"
            />
          </div>
        </Modal>
      )}

      {/* Variants modal */}
      {showVariantsModal && (
        <Modal open={showVariantsModal} onClose={() => setShowVariantsModal(false)} title="Resume Archetypes & Conversion Funnels" wide>
          <ResumeVariantsManager
            onSelectVariant={async (variant) => {
              try {
                const renderRes = await fetch("/api/resume/render", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    templateId: variant.templateId || "classic-ats",
                    content: variant.content,
                  }),
                });
                if (renderRes.ok) {
                  const rData = (await renderRes.json()) as { tex?: string };
                  if (rData.tex) {
                    applyTexUpdate(rData.tex);
                    setSelectedTemplate(variant.templateId || "classic-ats");
                    setShowVariantsModal(false);
                    success(`Loaded archetype "${variant.name}" into LaTeX editor.`);
                  }
                }
              } catch {
                errToast("Failed to render archetype");
              }
            }}
          />
        </Modal>
      )}
    </div>
    </MotionConfig>
  );
}

export default function AIStudioPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-dim">Loading AI Studio…</div>}>
      <StudioInner />
    </Suspense>
  );
}
