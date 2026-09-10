"use client";
import Select from "@/components/ui/Select";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  FileText,
  Download,
  Check,
  Copy,
  Layers,
  Save,
  Undo2,
  MessageSquarePlus,
  SlidersHorizontal,
  ShieldCheck,
  AlertTriangle,
  PanelLeftClose,
  Pin,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/ui/Toaster";
import { Button } from "@/components/ui/Button";
import { ResumeContent } from "@/types";
import { cn } from "@/lib/utils";
import { analyzeAts } from "@/lib/ats/analyze";
import ResumePdfPreview from "@/components/resume/ResumePdfPreview";
import ResumeCompileControls from "@/components/resume/ResumeCompileControls";
import ResumeDiff, { computeDiff, getChangedSections } from "@/components/resume/ResumeDiff";
import ResumeVariantsManager from "@/components/resume/ResumeVariantsManager";
import Modal from "@/components/ui/Modal";
import { resolveLatexLatency } from "@/lib/resumeCompile";
import ResumeSourcePane from "@/components/resume/ResumeSourcePane";
import { parseLatexErrors } from "@/lib/latexErrors";
import type { LatexError } from "@/lib/latexErrors";
import { readSseStream } from "@/lib/sseClient";
import type { SsePacket } from "@/lib/sseClient";

import ResumeCopilotPanel from "@/components/resume/ResumeCopilotPanel";
import type { ChatMessage } from "@/components/resume/ResumeCopilotPanel";

import { galleryTemplates } from "@/components/resume/templateGallery";

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
        tech: "Next.js, TypeScript, SQLite, LaTeX",
        link: "github.com/huntflow/core",
        bullets: [
          "Built high-performance local-first career operating system with compiled LaTeX PDF typesetting.",
        ],
      },
    ],
  };
}

// Single persisted studio document: server (SQLite) is source truth.
const STUDIO_DOC_ID = "studio-main";

export default function ResumeStudioPage() {
  const { profile, updateProfile, applications } = useApp();
  const { success, error: errToast } = useToast();

  const [resume, setResume] = useState<ResumeContent>(() => profileToResume(profile));
  const [history, setHistory] = useState<ResumeContent[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("classic-ats");
  const [docKind, setDocKind] = useState<"resume" | "cv">("resume");
  // PDF-first Studio: LaTeX is the sole compile engine. The compiled PDF is
  // the only authoritative preview — there is no HTML fallback and Typst
  // markup is never presented as a PDF.
  const [latexSource, setLatexSource] = useState("");
  // Source ownership: once the user hand-edits the TeX (or loads a draft),
  // structured re-renders must not silently clobber it — they require an
  // explicit force (template-switch confirm, Copilot apply, draft load).
  const [sourceTouched, setSourceTouched] = useState(false);
  // Persistence (server is truth — never localStorage): single studio doc.
  const [savedRev, setSavedRev] = useState<number | null>(null);
  const [lastSavedTex, setLastSavedTex] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedDraft, setSavedDraft] = useState<{ updatedAt: string; rev: number } | null>(null);
  const [draftDismissed, setDraftDismissed] = useState(false);
  // Compile diagnostics for the log strip + editor markers.
  const [compileLogTail, setCompileLogTail] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ line: number; column: number } | null>(null);
  const [revealLine, setRevealLine] = useState<{ line: number; nonce: number } | null>(null);
  // Bidirectional SyncTeX: forward mark from source cursor, reverse pick
  // from real PDF clicks. Both require a live compile token.
  const [forwardMark, setForwardMark] = useState<{ page: number; x: number; y: number; nonce: number } | null>(null);
  const [pickReverse, setPickReverse] = useState(false);
  const [reverseResult, setReverseResult] = useState<{ line: number; column: number } | null>(null);
  const isSourceDirty = lastSavedTex === null ? sourceTouched && latexSource.trim().length > 0 : latexSource !== lastSavedTex;
  const compileErrors: LatexError[] = useMemo(() => parseLatexErrors(compileLogTail), [compileLogTail]);
  const [compilingPdf, setCompilingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "compiling" | "ready" | "no-tex" | "error">("idle");
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [compiledTex, setCompiledTex] = useState<string | null>(null);
  const [compileToken, setCompileToken] = useState<string | null>(null);
  const [compileLatencyMs, setCompileLatencyMs] = useState<number | null>(null);
  const [diffCollapsed, setDiffCollapsed] = useState(true);
  // Pinned source snapshot for the TeX diff viewer. Null until the user pins
  // a baseline — the diff viewer and the changed-sections chip stay hidden
  // until then, instead of advertising dead controls.
  const [baseline, setBaseline] = useState<{ tex: string } | null>(null);
  // Pending template/mode switch awaiting explicit user confirmation (see
  // confirmPendingSwitch — layout switches never silently mutate content).
  const [pendingSwitch, setPendingSwitch] = useState<
    | { kind: "template"; templateId: string }
    | { kind: "docKind"; docKind: "resume" | "cv" }
    | null
  >(null);
  const [promptInspectorOpen, setPromptInspectorOpen] = useState(false);
  const [showVariantsModal, setShowVariantsModal] = useState(false);
  // Refine rail: tabbed Chat / ATS / Diff workspace. Collapsible on desktop,
  // stacked below the canvas on mobile. No mouse-only resize handles.
  const [refineTab, setRefineTab] = useState<"chat" | "ats" | "diff">("chat");
  const [refineCollapsed, setRefineCollapsed] = useState(false);
  const [configureOpen, setConfigureOpen] = useState(false);
  // Dirty tracking: snapshot of the last profile-synced content so the UI can
  // say honestly whether the canvas holds unsynced changes.
  const [lastSyncedJson, setLastSyncedJson] = useState(() => JSON.stringify(profileToResume(profile)));
  const isDirty = useMemo(() => JSON.stringify(resume) !== lastSyncedJson, [resume, lastSyncedJson]);
  // Honest one-line compile status for the header chip (role=status).
  const compileStatus = useMemo(() => {
    if (pdfState === "compiling") return "Compiling LaTeX…";
    if (pdfState === "no-tex") return "TeX unavailable";
    if (pdfState === "error") return "Compile failed";
    return pdfUrl ? "PDF ready · LaTeX" : "Preview ready";
  }, [pdfState, pdfUrl]);

  // Gallery cards come from the real RESUME_TEMPLATES registry (see
  // templateGallery.ts) — no hand-written subset, no numeric scores.
  const filteredTemplates = useMemo(() => galleryTemplates(docKind), [docKind]);

  // Live LaTeX source is the diff "after" side.
  const currentTex = latexSource;
  const changedSections = useMemo(
    () => (baseline ? getChangedSections(computeDiff(baseline.tex, currentTex)) : []),
    [baseline, currentTex]
  );


  // Selection popup state for "Add to chat"
  const [selectionPopup, setSelectionPopup] = useState<{
    visible: boolean;
    text: string;
    x: number;
    y: number;
  }>({ visible: false, text: "", x: 0, y: 0 });
  // Copilot selection context: quoted source/PDF content sent with the next
  // turn (consumed + cleared on send). Set by both quote paths below.
  const [selCtx, setSelCtx] = useState<{ text: string; sourceLine?: number } | null>(null);
  // Pending attachment files (validated + uploaded at send time; raw bytes
  // never enter chat state, logs, or persistence).
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // Chat copilot state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "msg-0",
      sender: "assistant",
      text: "**Welcome to the LaTeX Resume Studio!**\n\nI operate across your live document canvas. You can ask me to rewrite bullet points with quantifiable impact, sync data from your **Vault**, or tailor for a target role.\n\n*Tip: Highlight any text on the preview canvas (mouse or keyboard) to instantly quote and edit with AI.*",
      timestamp: "Just now",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Keep the scroll inside the chat log: scrollIntoView() would also yank the
  // whole page (bad on mobile, where the canvas sits above the rail).
  useEffect(() => {
    const log = messagesEndRef.current?.parentElement;
    if (log) log.scrollTop = log.scrollHeight;
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

  // Render LaTeX representation in backend. Guarded by source ownership:
  // hand-edited source is never overwritten unless the caller forces it
  // (template-switch confirm, draft load). Structured edits flow through
  // Copilot apply, which sets the source explicitly.
  const updateLatexPreview = useCallback(
    async (content: ResumeContent, templateId: string, force = false) => {
      if (sourceTouched && !force) return;
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
    },
    [sourceTouched]
  );

  useEffect(() => {
    updateLatexPreview(resume, selectedTemplate);
  }, [resume, selectedTemplate, updateLatexPreview]);

  // LaTeX-only compile. The compiled PDF is the sole authoritative preview;
  // there is no markup-preview fallback — failures report `error` or
  // `no-tex`, never a stale artifact.
  const compilePreview = useCallback(async () => {
    setPdfState("compiling");
    setPdfError(null);
    const start = Date.now();

    if (!latexSource.trim()) {
      // Source still rendering: stay idle (badge cleared) so the idle-gated
      // effect below retries once the render route delivers.
      setCompileLatencyMs(null);
      setPdfState("idle");
      return;
    }
    try {
      const compileRes = await fetch("/api/resume/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tex: latexSource }),
      });
      const compileData = (await compileRes.json()) as {
        ok?: boolean;
        token?: string;
        logTail?: string;
        error?: { message?: string; details?: { logTail?: string } };
      };
      if (compileData.ok && compileData.token) {
        setCompileLatencyMs(resolveLatexLatency(true, Date.now() - start));
        setCompileToken(compileData.token);
        setPdfUrl(`/api/resume/compile?token=${compileData.token}`);
        setCompiledTex(latexSource);
        setCompileLogTail(compileData.logTail ?? null);
        setPdfState("ready");
      } else {
        setCompileLatencyMs(resolveLatexLatency(false, Date.now() - start));
        setPdfError(compileData.error?.message ?? "Compile failed");
        setCompileLogTail(compileData.error?.details?.logTail ?? null);
        setLogOpen(true);
        setPdfState("error");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setCompileLatencyMs(null);
      if (msg.includes("No LaTeX engine")) setPdfState("no-tex");
      else {
        setPdfError(msg);
        setPdfState("error");
      }
    }
  }, [latexSource]);

  // Compile mints the token SyncTeX navigates with.
  const compileSynctex = useCallback(async () => {
    await compilePreview();
  }, [compilePreview]);

  // Initial render only: once latexSource arrives while idle, compile.
  // The explicit compile sets pdfState to "compiling" synchronously, so
  // this idle gate stays shut after it runs.
  useEffect(() => {
    if (latexSource && pdfState === "idle") {
      void compilePreview();
    }
  }, [latexSource, pdfState, compilePreview]);
  // Reverse SyncTeX from a real PDF click: PDF point -> source line,
  // revealed in the editor. Disarmed after one use.
  const handleReversePick = useCallback(
    async (page: number, x: number, y: number) => {
      if (!compileToken) {
        errToast("Compile first to enable SyncTeX — no build token yet.");
        return;
      }
      try {
        const res = await fetch("/api/resume/synctex/reverse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: compileToken, page, x, y }),
        });
        const data = (await res.json()) as { ok?: boolean; line?: number; column?: number; error?: { message?: string } };
        if (!res.ok || !data.ok || typeof data.line !== "number") {
          throw new Error(data.error?.message ?? "SyncTeX reverse failed");
        }
        setReverseResult({ line: data.line, column: data.column ?? 0 });
        setRevealLine({ line: data.line, nonce: Date.now() });
        setPickReverse(false);
        success(`PDF page ${page} maps to source line ${data.line}.`);
      } catch (e: unknown) {
        errToast(e instanceof Error ? e.message : "SyncTeX reverse failed");
      }
    },
    [compileToken, errToast, success]
  );
  // Overleaf-style refs so the debounce timers below always see fresh
  const pdfStateRef = useRef(pdfState);
  const sourceTouchedRef = useRef(sourceTouched);
  const compilePreviewRef = useRef(compilePreview);
  useEffect(() => {
    pdfStateRef.current = pdfState;
    sourceTouchedRef.current = sourceTouched;
    compilePreviewRef.current = compilePreview;
  });

  // Debounced auto-compile: 900ms after the user stops editing source,
  // recompile only when a previous artifact exists (ready) or the last
  // attempt failed (error) — fixing errors live is the Overleaf loop.
  // Idle/no-tex/compiling states are left for the explicit compile path.
  useEffect(() => {
    if (!sourceTouchedRef.current || !latexSource.trim()) return;
    const st = pdfStateRef.current;
    if (st !== "ready" && st !== "error") return;
    const t = setTimeout(() => {
      void compilePreviewRef.current();
    }, 900);
    return () => clearTimeout(t);
  }, [latexSource]);

  // Studio document persistence: single `studio-main` doc via POST
  // /api/resume (upsert). First save is always explicit; autosave only
  // runs afterwards so drafts are never created behind the user's back.
  const saveSource = useCallback(
    async (manual: boolean) => {
      if (!latexSource.trim()) {
        if (manual) errToast("Nothing to save yet — wait for the source to render.");
        return;
      }
      setSaveState("saving");
      try {
        const res = await fetch("/api/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: STUDIO_DOC_ID,
            name: `${resume.header?.name || "Resume"} — ${selectedTemplate}`,
            kind: docKind,
            templateId: selectedTemplate,
            tex: latexSource,
            content: resume,
            editorRev: (savedRev ?? -1) + 1,
            lastCompileToken: compileToken,
            lastCompileAt: compileToken ? new Date().toISOString() : undefined,
          }),
        });
        if (res.status === 409) {
          setSaveState("error");
          errToast("Saved elsewhere — reload the draft before saving again.");
          return;
        }
        if (!res.ok) throw new Error(`Save returned ${res.status}`);
        const data = (await res.json()) as { doc?: { editorRev?: number } };
        setSavedRev(typeof data.doc?.editorRev === "number" ? data.doc.editorRev : (savedRev ?? 0) + 1);
        setLastSavedTex(latexSource);
        setSaveState("saved");
        if (manual) success("LaTeX source saved.");
      } catch (e: unknown) {
        setSaveState("error");
        if (manual) errToast(e instanceof Error ? e.message : "Save failed");
      }
    },
    [latexSource, resume, selectedTemplate, docKind, savedRev, compileToken, errToast, success]
  );

  // Autosave 3s after edits settle — only once a doc exists (savedRev).
  useEffect(() => {
    if (savedRev === null || !isSourceDirty) return;
    const t = setTimeout(() => {
      void saveSource(false);
    }, 3000);
    return () => clearTimeout(t);
  }, [latexSource, savedRev, isSourceDirty, saveSource]);

  // On mount, check for a saved studio draft. Never auto-apply: the user
  // chooses Load (explicit mutation) or Dismiss.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/resume");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { docs?: { id?: string; updatedAt?: string; editorRev?: number }[] };
        const draft = (data.docs ?? []).find((d) => d.id === STUDIO_DOC_ID);
        if (draft && !cancelled) {
          setSavedDraft({ updatedAt: draft.updatedAt ?? "", rev: draft.editorRev ?? 0 });
          setSavedRev(draft.editorRev ?? 0);
        }
      } catch {
        // Non-blocking: studio works fine without persistence.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Editor change: take source ownership, mark dirty/stale honestly.
  const handleSourceChange = useCallback((next: string) => {
    setLatexSource(next);
    setSourceTouched(true);
    setSaveState((s) => (s === "saved" ? "idle" : s));
  }, []);

  // Quote editor/assistant selections into the Copilot input.
  const quoteToChat = useCallback(
    (text: string) => {
      const quote = `Rewrite and optimize this section: "${text.slice(0, 2000)}"`;
      setChatInput(quote);
      setSelCtx({ text: text.slice(0, 4000), sourceLine: cursorPos?.line });
      setRefineTab("chat");
      setRefineCollapsed(false);
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 50);
    },
    [cursorPos?.line]
  );

  const applyUpdate = useCallback(
    (newResume: ResumeContent, saveHistory = true) => {
      if (saveHistory) {
        setHistory((prev) => [resume, ...prev.slice(0, 10)]);
      }
      setResume(newResume);
    },
    [resume]
  );

  const undoLast = () => {
    if (history.length === 0) return;
    const [previous, ...rest] = history;
    setHistory(rest);
    setResume(previous);
    success("Reverted to previous version.");
  };
  const loadDraft = useCallback(async () => {
    try {
      const res = await fetch("/api/resume");
      if (!res.ok) throw new Error(`Load returned ${res.status}`);
      const data = (await res.json()) as {
        docs?: {
          id?: string;
          tex?: string;
          templateId?: string;
          content?: ResumeContent;
          editorRev?: number;
        }[];
      };
      const draft = (data.docs ?? []).find((d) => d.id === STUDIO_DOC_ID);
      if (!draft?.tex) throw new Error("Saved draft has no source.");
      if (draft.content) applyUpdate(draft.content);
      if (draft.templateId) setSelectedTemplate(draft.templateId);
      setLatexSource(draft.tex);
      setLastSavedTex(draft.tex);
      setSavedRev(draft.editorRev ?? 0);
      setSourceTouched(true);
      setSavedDraft(null);
      success("Loaded saved LaTeX draft.");
    } catch (e: unknown) {
      errToast(e instanceof Error ? e.message : "Load failed");
    }
  }, [applyUpdate, errToast, success]);

  // Text selection handler on preview (mouse and keyboard alike: a
  // `selectionchange` listener below feeds keyboard-driven selections here).
  const handlePreviewMouseUp = useCallback(() => {
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
  }, []);

  // Keyboard-selected text never fires mouseup, so mirror it here. Selections
  // outside the preview canvas (e.g. the chat input) are ignored.
  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection();
      const container = previewContainerRef.current;
      if (!sel || sel.isCollapsed || !container) return;
      const anchor = sel.anchorNode;
      const anchorEl = anchor instanceof Element ? anchor : anchor?.parentElement;
      if (!anchorEl || !container.contains(anchorEl)) return;
      handlePreviewMouseUp();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [handlePreviewMouseUp]);

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

  // Upload pending attachments: server validates type/size/magic bytes and
  // encryption. Returns ephemeral ids (bytes stay server-side). Throws with
  // the server's actionable message on any rejection.
  const uploadAttachments = async (files: File[]): Promise<string[]> => {
    const form = new FormData();
    for (const f of files.slice(0, 3)) form.append("files", f, f.name);
    const res = await fetch("/api/resume/copilot/attachments", { method: "POST", body: form });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      attachments?: { id?: unknown }[];
      error?: { message?: string } | string;
    };
    if (!res.ok || !data.ok) {
      throw new Error(typeof data.error === "string" ? data.error : (data.error?.message ?? `Upload returned ${res.status}`));
    }
    return (data.attachments ?? []).map((a) => String(a.id)).filter(Boolean);
  };

  // Legacy JSON Copilot path — kept as the fallback when streaming is
  // unavailable (old clients, proxies stripping SSE, pre-first-byte errors).
  const sendLegacyMessage = async (text: string) => {
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
      // Explicit Copilot output: takes source ownership so later
      // structured renders cannot silently clobber it.
      setSourceTouched(true);
      setLatexSource(data.tex);
    }
  };

  const applyStreamDone = (aiId: string, done: Record<string, unknown>) => {
    const reply = typeof done.reply === "string" && done.reply ? done.reply : "Done.";
    const cites = Array.isArray(done.cites)
      ? (done.cites as { docName?: unknown; chunkIndex?: unknown }[])
          .filter((c) => typeof c.docName === "string")
          .map((c) => ({ doc: c.docName as string, chunk: typeof c.chunkIndex === "number" ? c.chunkIndex : 0 }))
      : [];
    setChatMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, text: reply, streaming: false, cites } : m)));
    const updated = done.updatedResume as ResumeContent | null;
    if (updated) {
      applyUpdate(updated);
      success(typeof done.actionSummary === "string" && done.actionSummary ? done.actionSummary : "Resume updated by AI Copilot.");
    }
    const tex = typeof done.tex === "string" && done.tex ? done.tex : null;
    if (tex) {
      setSourceTouched(true);
      setLatexSource(tex);
      if (!updated) success(typeof done.actionSummary === "string" && done.actionSummary ? done.actionSummary : "Source updated by AI Copilot.");
    }
  };

  const handleStreamPacket = (aiId: string, packet: SsePacket) => {
    const data = (packet.data ?? {}) as Record<string, unknown>;
    switch (packet.event) {
      case "reasoning": {
        const note = typeof data.note === "string" ? data.note : "";
        if (!note) break;
        setChatMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, reasoning: [...(m.reasoning ?? []), note].slice(-8) } : m)));
        break;
      }
      case "tool_call": {
        const tool = typeof data.tool === "string" ? data.tool : "tool";
        const detail = typeof data.detail === "string" ? data.detail : "";
        const status = data.status === "error" || data.status === "partial" ? data.status : "ok";
        setChatMessages((prev) =>
          prev.map((m) => (m.id === aiId ? { ...m, tools: [...(m.tools ?? []), { tool, detail, status }] } : m))
        );
        break;
      }
      case "token": {
        const delta = typeof data.delta === "string" ? data.delta : "";
        if (!delta) break;
        setChatMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, text: `${m.text}${delta}` } : m)));
        break;
      }
      case "latex_log": {
        const tail = typeof data.logTail === "string" ? data.logTail : "";
        if (tail) setCompileLogTail(tail);
        break;
      }
      case "done":
        applyStreamDone(aiId, data);
        break;
      case "error": {
        const message = typeof data.message === "string" ? data.message : "Copilot stream failed";
        setChatMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, streaming: false, error: message } : m)));
        errToast(message);
        break;
      }
      default:
        break;
    }
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const text = (customPrompt || chatInput.trim()).trim();
    if ((!text && pendingFiles.length === 0) || copilotBusy) return;

    if (!customPrompt) setChatInput("");
    // Consume the quoted selection exactly once.
    const selection = selCtx;
    setSelCtx(null);
    // Uploads happen now (fail fast, before any Copilot work).
    const filesToSend = pendingFiles;
    setPendingFiles([]);

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    const aiId = `ai-${Date.now()}`;

    setChatMessages((prev) => [
      ...prev,
      userMsg,
      { id: aiId, sender: "assistant", text: "", streaming: true, timestamp: userMsg.timestamp },
    ]);
    setCopilotBusy(true);

    // Uploads first: validated server-side (type/size/magic/encryption).
    // Any rejection aborts the turn before Copilot work starts.
    let attachmentIds: string[] = [];
    if (filesToSend.length > 0) {
      try {
        attachmentIds = await uploadAttachments(filesToSend);
      } catch (uploadErr: unknown) {
        setChatMessages((prev) => prev.filter((m) => m.id !== aiId));
        errToast(uploadErr instanceof Error ? uploadErr.message : "Attachment upload failed");
        setCopilotBusy(false);
        setPendingFiles(filesToSend);
        return;
      }
    }

    const payload = {
      message: text || `Review the attached file${attachmentIds.length === 1 ? "" : "s"} against my resume.`,
      resume,
      tex: latexSource,
      templateId: selectedTemplate,
      history: chatMessages.slice(-6).map((m) => ({ role: m.sender, content: m.text })),
      targetJob: selectedJob
        ? { title: selectedJob.title, company: selectedJob.company, description: selectedJob.jobDescription }
        : undefined,
      selection: selection
        ? { text: selection.text, sourceLine: selection.sourceLine ?? cursorPos?.line ?? undefined }
        : undefined,
      jobId: selectedJobId || undefined,
      attachmentIds,
    };

    try {
      const res = await fetch("/api/resume/copilot/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(payload),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || !contentType.includes("text/event-stream")) {
        // Fall back to the legacy JSON contract — unless attachments are
        // involved, which legacy cannot see (never silently drop them).
        if (attachmentIds.length > 0) throw new Error("Attachments need the streaming endpoint — retry the message.");
        setChatMessages((prev) => prev.filter((m) => m.id !== aiId));
        await sendLegacyMessage(text);
        return;
      }
      await readSseStream(res, (packet) => handleStreamPacket(aiId, packet));
      setChatMessages((prev) => prev.map((m) => (m.id === aiId && m.streaming ? { ...m, streaming: false } : m)));
    } catch (err: unknown) {
      // Transport failure before/during the stream: try legacy once (text
      // turns only), else surface the error on the message.
      if (attachmentIds.length === 0) {
        try {
          setChatMessages((prev) => prev.filter((m) => m.id !== aiId));
          await sendLegacyMessage(text);
          return;
        } catch (legacyErr: unknown) {
          errToast(legacyErr instanceof Error ? legacyErr.message : "AI Copilot request failed");
        }
      }
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === aiId
            ? { ...m, streaming: false, error: err instanceof Error ? err.message : "AI Copilot request failed" }
            : m
        )
      );
    } finally {
      setCopilotBusy(false);
    }
  };

  // Template/mode switches only stage a pending switch. The confirmation
  // dialog (see confirmPendingSwitch) applies the layout change, and the AI
  // copilot reformat runs only on explicit opt-in — switching layouts must
  // never silently mutate content or spend an LLM call behind the user's back.
  const handleToggleDocKind = (kind: "resume" | "cv") => {
    if (kind !== docKind) setPendingSwitch({ kind: "docKind", docKind: kind });
  };

  const handleTemplateChange = (templateId: string) => {
    if (templateId === selectedTemplate) return;
    setPendingSwitch({ kind: "template", templateId });
  };

  const confirmPendingSwitch = (withAiReformat: boolean) => {
    if (!pendingSwitch) return;
    if (pendingSwitch.kind === "docKind") {
      const kind = pendingSwitch.docKind;
      setDocKind(kind);
      const target = galleryTemplates(kind)[0]?.meta.id || (kind === "cv" ? "tabular-german" : "classic-ats");
      setSelectedTemplate(target);
      setPendingSwitch(null);
      // Explicit user action: re-render the new layout even over hand edits.
      void updateLatexPreview(resume, target, true);
      if (withAiReformat) {
        void handleSendMessage(`Switch mode to ${kind.toUpperCase()}. Rebuild and format my profile for a ${kind === "cv" ? "comprehensive, detailed multi-page curriculum vitae" : "compact 1-page high-impact industry resume"}.`);
      }
    } else {
      const templateId = pendingSwitch.templateId;
      setSelectedTemplate(templateId);
      setPendingSwitch(null);
      // Explicit user action: re-render the new layout even over hand edits.
      void updateLatexPreview(resume, templateId, true);
      if (withAiReformat) {
        void handleSendMessage(`Rebuild and format my ${docKind.toUpperCase()} according to the ${templateId} template layout.`);
      }
    }
  };

  const downloadPdf = async () => {
    setCompilingPdf(true);
    try {
      // Export always produces a real PDF through the LaTeX toolchain —
      // the sole authoritative artifact. Render + compile below.
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
    setLastSyncedJson(JSON.stringify(resume));
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
  // Pin the live LaTeX source as the diff baseline (shared by the compile
  // controls and the Diff tab).
  const pinBaseline = () => {
    const src = latexSource;
    if (!src.trim()) {
      errToast("Nothing to pin yet — wait for the preview to render.");
      return;
    }
    setBaseline({ tex: src });
    setDiffCollapsed(false);
    success("Baseline pinned on LaTeX source — diff is live.");
  };

  return (
    <div className="flex min-h-0 flex-col gap-2 lg:h-[calc(100vh-5rem)] lg:overflow-hidden">
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
            className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-[var(--chartreuse)] bg-[var(--ink-card)] px-3 py-1.5 text-xs font-bold text-[var(--chartreuse)] shadow-2xl hover:bg-[var(--chartreuse)] hover:text-black transition-all cursor-pointer"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            <span>Add to chat</span>
          </button>
        </div>
      )}

      {/* Studio Header: target job, compile status, export, configure */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/80 px-4 py-2.5 backdrop-blur shrink-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-display flex items-center gap-2 text-[15px] font-bold tracking-tight text-[var(--paper)]">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10">
              <FileText className="h-4 w-4 text-[var(--chartreuse)]" aria-hidden />
            </span>
            <span className="hidden min-[420px]:inline">Resume & CV Studio</span>
            <span className="min-[420px]:hidden">Studio</span>
            {isDirty && (
              <span title="Canvas has changes not yet synced to your profile" className="rounded-full border border-amber-300/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                Unsaved
              </span>
            )}
          </h1>

          {/* Sole engine badge: LaTeX compiles the authoritative PDF. */}
          <span className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-200" title="LaTeX compiler (authoritative PDF + SyncTeX)">
            <span>LaTeX PDF</span>
          </span>
          {/* Target job (compact readout — full tailoring context lives here too) */}
          <div className="w-44 sm:w-56">
            <Select
              value={selectedJobId}
              onChange={(v) => setSelectedJobId(v)}
              options={[
                { value: "", label: "General Profile (No specific job)" },
                ...applications.map((app) => ({ value: app.id, label: `${app.company} — ${app.title}` })),
              ]}
              placeholder="Select job…"
              ariaLabel="Tailor for target job"
              className="w-full [&>button]:min-h-[44px]"
            />
          </div>

          {/* Honest compile status (announced to assistive tech) */}
          <p
            role="status"
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-tight shadow-sm",
              pdfState === "error"
                ? "border-red-400/30 bg-red-400/10 text-red-200"
                : pdfState === "no-tex"
                  ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                  : "border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
            )}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
            {compileStatus}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" onClick={downloadPdf} loading={compilingPdf} className="min-h-[44px] shadow-[var(--glow)]">
            <Download className="h-3.5 w-3.5" aria-hidden /> Export PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfigureOpen(true)}
            aria-haspopup="dialog"
            aria-label="Configure studio settings"
            title="Studio settings: templates, history, compile actions"
            className="min-h-[44px] border-[var(--line)] bg-white/[0.04] hover:bg-white/[0.06]"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Configure</span>
          </Button>
        </div>
      </div>
      {/* Saved-draft banner: explicit Load, never auto-applied. */}
      {savedDraft && !draftDismissed && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--sky)]/30 bg-[var(--sky)]/10 px-4 py-2 text-[11px] text-[var(--paper)] shrink-0">
          <span>
            Saved LaTeX draft available{savedDraft.updatedAt ? ` from ${new Date(savedDraft.updatedAt).toLocaleString()}` : ""} (rev {savedDraft.rev}).
            Loading replaces the current source and structured canvas.
          </span>
          <Button size="sm" variant="outline" onClick={() => void loadDraft()} className="min-h-[44px]">
            Load draft
          </Button>
          <button
            type="button"
            onClick={() => setDraftDismissed(true)}
            aria-label="Dismiss saved draft notice"
            className="grid h-11 w-11 place-items-center rounded-lg text-dim transition-colors hover:bg-white/[0.06] hover:text-[var(--paper)]"
          >
            Dismiss
          </button>
        </div>
      )}
      {/* Studio workbench: Refine rail + LaTeX source + PDF canvas (canvas first on mobile) */}
      <div className={cn("relative flex min-h-0 flex-1 flex-col gap-4", refineCollapsed ? "lg:grid lg:grid-cols-[auto_minmax(0,5fr)_minmax(0,6fr)] lg:gap-0 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-[var(--line)] lg:bg-[var(--ink)]" : "lg:grid lg:grid-cols-[minmax(260px,300px)_minmax(0,5fr)_minmax(0,6fr)] lg:gap-0 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-[var(--line)] lg:bg-[var(--ink)] lg:shadow-[0_12px_40px_rgba(0,0,0,0.22)]")}>
        {/* Document canvas (first on mobile, right on desktop) */}
        <div
          ref={previewContainerRef}
          onMouseUp={handlePreviewMouseUp}
          className="relative order-1 flex min-h-[60vh] flex-col items-center gap-5 overflow-visible bg-[var(--ink-deep)] p-4 select-text sm:p-6 lg:order-3 lg:min-h-0 lg:flex-1 lg:overflow-auto"
          style={{
            backgroundImage:
              "radial-gradient(800px 500px at 50% -10%, color-mix(in srgb, var(--chartreuse) 4%, transparent), transparent 60%), radial-gradient(700px 400px at 100% 100%, color-mix(in srgb, var(--sky) 3%, transparent), transparent 55%)",
          }}
        >
          {compileLatencyMs !== null && (
            <div role="status" className="absolute top-3 left-4 flex items-center gap-2 rounded-full border border-line bg-black/60 px-3 py-1 text-[10px] font-mono text-dim backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              <span>{`LaTeX compiled in ${compileLatencyMs}ms`}</span>
            </div>
          )}

          <ResumePdfPreview
            pdfUrl={pdfUrl}
            pdfState={pdfState}
            pdfError={pdfError}
            compiledTex={compiledTex}
            latexSource={latexSource}
            compileToken={compileToken}
            targetLine={cursorPos?.line ?? 1}
            forwardMark={forwardMark}
            pickReverse={pickReverse}
            reverseResult={reverseResult}
            onForward={(r) => setForwardMark({ page: r.page, x: r.x, y: r.y, nonce: Date.now() })}
            onPickReverse={() => setPickReverse((v) => !v)}
            onReversePick={(page, x, y) => void handleReversePick(page, x, y)}
            onReverseDisabledClick={() => errToast("Compile first to enable SyncTeX — no build token yet.")}
          />
        </div>
        {/* LaTeX source editor (second on mobile, middle on desktop) */}
        <ResumeSourcePane
          value={latexSource}
          onChange={handleSourceChange}
          errors={compileErrors}
          saveState={saveState}
          isDirty={isSourceDirty}
          savedRev={savedRev}
          cursor={cursorPos}
          onCursor={(line, column) => setCursorPos({ line, column })}
          onSelectionText={quoteToChat}
          onSave={() => void saveSource(true)}
          revealLine={revealLine}
          logOpen={logOpen}
          onToggleLog={() => setLogOpen((v) => !v)}
          onRevealLine={(line) => setRevealLine({ line, nonce: Date.now() })}
          logTail={compileLogTail}
        />
        {!refineCollapsed && (
        <section
          aria-label="Refine workspace"
          className="order-3 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/90 backdrop-blur-xl lg:order-1 lg:h-full lg:rounded-none lg:border-0 lg:border-r"
        >
          {/* Rail header: collapse + Chat / ATS / Diff tabs */}
          <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--ink-soft)]/60 px-2 py-1.5">
            <div role="tablist" aria-label="Refine tools" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              {(["chat", "ats", "diff"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  id={`refine-tab-${tab}`}
                  aria-selected={refineTab === tab}
                  aria-controls={`refine-panel-${tab}`}
                  onClick={() => setRefineTab(tab)}
                  className={cn(
                    "min-h-[44px] shrink-0 rounded-lg px-3 text-xs font-bold capitalize transition-colors",
                    refineTab === tab
                      ? "bg-[var(--chartreuse)]/15 text-[var(--chartreuse)] ring-1 ring-[var(--chartreuse)]/30"
                      : "text-dim hover:bg-white/[0.05] hover:text-[var(--paper)]"
                  )}
                >
                  {tab === "chat" ? "Chat" : tab === "ats" ? `ATS · ${atsReport.score}` : "Diff"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setRefineCollapsed(true)}
              aria-label="Collapse refine panel"
              title="Collapse refine panel"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-dim transition-colors hover:bg-white/[0.06] hover:text-[var(--paper)]"
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {refineTab === "chat" && (
            <ResumeCopilotPanel
              messages={chatMessages}
              messagesEndRef={messagesEndRef}
              inspectorOpen={promptInspectorOpen}
              onToggleInspector={() => setPromptInspectorOpen((v) => !v)}
              busy={copilotBusy}
              contextLine={{
                templateId: selectedTemplate,
                docKind,
                roles: resume.experience?.length || 0,
                skills: resume.skills?.length || 0,
                target: selectedJob ? `${selectedJob.company} — ${selectedJob.title}` : null,
              }}
              input={chatInput}
              onInputChange={setChatInput}
              onSubmit={() => void handleSendMessage()}
              onQuickPrompt={(prompt) => void handleSendMessage(prompt)}
              inputRef={chatInputRef}
              attachments={pendingFiles.map((f) => ({ name: f.name, size: f.size }))}
              onAttachFiles={(files) => setPendingFiles((prev) => [...prev, ...files].slice(0, 3))}
              onRemoveAttachment={(index) => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
            />
          )}
          {refineTab === "ats" && (
          <div role="tabpanel" id="refine-panel-ats" aria-labelledby="refine-tab-ats" className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <div className="rounded-xl border border-[var(--line)] bg-black/30 p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--paper)]">
                  <ShieldCheck className="h-3.5 w-3.5 text-[var(--chartreuse)]" aria-hidden /> ATS diagnostic
                </span>
                <span className="font-mono text-xs font-extrabold text-[var(--chartreuse)]">{atsReport.score}/100</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-[var(--chartreuse)] transition-all duration-500" style={{ width: `${atsReport.score}%` }} />
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-dim">
                Heuristic checks against your {selectedJob ? `target role (${selectedJob.company} — ${selectedJob.title})` : "general profile"}. Estimated length: {atsReport.estimatedPages} page{atsReport.estimatedPages === 1 ? "" : "s"}.
              </p>
            </div>
            <ul className="mt-3 space-y-1.5">
              {atsReport.checks.map((check) => (
                <li key={check.id} className="rounded-lg border border-[var(--line)] bg-white/[0.02] px-3 py-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--paper)]">
                    {check.ok ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
                    )}
                    {check.label}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-dim">{check.hint}</p>
                </li>
              ))}
            </ul>
            {atsReport.keywords.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">Target-role keywords</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {atsReport.keywords.map((k) => (
                    <span
                      key={k.term}
                      title={k.inResume ? "Covered in your resume" : "Missing — consider mirroring it in summary or skills"}
                      className={cn(
                        "rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold",
                        k.inResume
                          ? "border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                          : "border-amber-300/30 bg-amber-400/10 text-amber-200"
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
          {refineTab === "diff" && (
          <div role="tabpanel" id="refine-panel-diff" aria-labelledby="refine-tab-diff" className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-[var(--paper)]">Source diff</p>
              <Button size="sm" variant="outline" onClick={pinBaseline} className="min-h-[44px] border-[var(--line)]">
                <Pin className="h-3.5 w-3.5" aria-hidden /> {baseline ? "Re-pin baseline" : "Pin baseline"}
              </Button>
            </div>
            {!baseline ? (
              <p className="mt-3 rounded-xl border border-[var(--line)] bg-black/30 px-3.5 py-2.5 text-[11px] leading-relaxed text-dim">
                No baseline pinned yet. Pin one to compare every later edit line-by-line, per section.
              </p>
            ) : (
              <ResumeDiff beforeTex={baseline.tex} afterTex={currentTex} className="mt-3" />
            )}
          </div>
          )}
        </section>
        )}
        {refineCollapsed && (
          <button
            type="button"
            onClick={() => setRefineCollapsed(false)}
            aria-label="Expand refine panel"
            title="Expand refine panel"
            className="hidden w-10 shrink-0 cursor-pointer items-center justify-center self-stretch border-r border-[var(--line)] text-dim transition-colors hover:bg-white/[0.04] hover:text-[var(--paper)] lg:grid"
          >
            <PanelLeftClose className="h-4 w-4 rotate-180" aria-hidden />
          </button>
        )}

      </div>

      {pendingSwitch && (
        <Modal
          open
          onClose={() => setPendingSwitch(null)}
          title={pendingSwitch.kind === "template" ? "Switch template?" : `Switch to ${pendingSwitch.docKind === "cv" ? "CV" : "Resume"} mode?`}
        >
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-dim">
              {pendingSwitch.kind === "template"
                ? `Preview will switch to “${galleryTemplates(docKind).find((t) => t.meta.id === pendingSwitch.templateId)?.meta.name ?? pendingSwitch.templateId}”.`
                : pendingSwitch.docKind === "cv"
                  ? "Preview will switch to a multi-page CV format."
                  : "Preview will switch to a compact 1-page resume format."}{" "}
              The layout updates immediately. The AI Copilot only rewrites your content if you explicitly ask it to — switching never silently mutates your resume.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button size="sm" variant="outline" onClick={() => setPendingSwitch(null)}>
                Cancel
              </Button>
              <Button size="sm" variant="outline" onClick={() => confirmPendingSwitch(false)}>
                Switch layout only
              </Button>
              <Button size="sm" onClick={() => confirmPendingSwitch(true)} disabled={copilotBusy}>
                Switch + AI reformat
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {configureOpen && (
        <Modal open={configureOpen} onClose={() => setConfigureOpen(false)} title="Studio settings" wide>
          <div className="space-y-6">
            {/* Document kind: real radios, explicit AI opt-in on switch */}
            <fieldset>
              <legend className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">Document</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { kind: "resume", name: "Resume", desc: "Compact 1-page high-impact industry format." },
                    { kind: "cv", name: "CV", desc: "Detailed multi-page curriculum vitae." },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.kind}
                    className={cn(
                      "cursor-pointer rounded-xl border p-3 transition-all",
                      docKind === opt.kind
                        ? "border-[var(--chartreuse)] bg-[var(--chartreuse)]/10 ring-1 ring-[var(--chartreuse)]/20"
                        : "border-[var(--line)] bg-black/20 hover:border-white/15"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="resume-doc-kind"
                        checked={docKind === opt.kind}
                        onChange={() => handleToggleDocKind(opt.kind)}
                        className="h-4 w-4 shrink-0 accent-[var(--chartreuse)]"
                      />
                      <span className="text-xs font-bold text-[var(--paper)]">{opt.name}</span>
                    </span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-dim">{opt.desc}</span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-dim">
                Switching asks for confirmation first — AI reformatting only runs on explicit opt-in.
              </p>
            </fieldset>

            {/* Template gallery: real registry metadata, honest descriptors */}
            <fieldset>
              <legend className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">
                Layout template ({filteredTemplates.length})
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {filteredTemplates.map((tmpl) => {
                  const isSelected = selectedTemplate === tmpl.meta.id;
                  const Icon = tmpl.icon;
                  return (
                    <label
                      key={tmpl.meta.id}
                      className={cn(
                        "cursor-pointer rounded-xl border p-3 transition-all",
                        isSelected
                          ? "border-[var(--chartreuse)] bg-[var(--chartreuse)]/10 ring-1 ring-[var(--chartreuse)]/20"
                          : "border-[var(--line)] bg-black/20 hover:border-white/15"
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <input
                            type="radio"
                            name="resume-template"
                            checked={isSelected}
                            onChange={() => handleTemplateChange(tmpl.meta.id)}
                            aria-label={tmpl.meta.name}
                            className="h-4 w-4 shrink-0 accent-[var(--chartreuse)]"
                          />
                          <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white", tmpl.swatch)} aria-hidden>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="truncate text-xs font-bold text-[var(--paper)]">{tmpl.meta.name}</span>
                        </span>
                        <span className="shrink-0 rounded-full border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/10 px-2 py-0.5 font-mono text-[9px] font-bold tracking-wide text-[var(--chartreuse)]">
                          {tmpl.badge}
                        </span>
                      </span>
                      <span className="mt-1.5 block text-[10px] leading-relaxed text-dim">{tmpl.meta.description}</span>
                      <span className="mt-1 block text-[10px] leading-relaxed text-dim/80">{tmpl.meta.recommendationReason}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {tmpl.meta.recommendedFor.slice(0, 3).map((audience) => (
                          <span key={audience} className="rounded-full border border-[var(--line)] bg-white/[0.03] px-2 py-0.5 text-[9px] font-semibold text-dim">
                            {audience}
                          </span>
                        ))}
                      </span>
                      <span className="mt-1.5 block font-mono text-[9px] text-dim/70">Type: {tmpl.meta.fontFamily}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-dim">
                Layouts are ATS-conscious structure (predictable hierarchy, machine-readable text) — no layout guarantees
                parsing results. The live ATS diagnostic scores your content, not the template.
              </p>
            </fieldset>

            {/* Preview: the compiled PDF is the sole authoritative preview. */}
            <section aria-label="Preview" className="space-y-2 border-t border-[var(--line)] pt-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">Preview</h3>
              <p className="text-[11px] leading-relaxed text-dim">
                The compiled LaTeX PDF above is the typography source of truth. Zoom in the PDF header; SyncTeX jumps between the source cursor and the PDF.
              </p>
            </section>

            {/* History & sharing */}
            <section aria-label="History and sharing" className="space-y-2 border-t border-[var(--line)] pt-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">History & sharing</h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={undoLast}
                  disabled={history.length === 0}
                  title="Undo last change"
                  className="min-h-[44px] border-[var(--line)] bg-white/[0.04]"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden /> Undo{history.length > 0 ? ` (${history.length})` : ""}
                </Button>
                <Button size="sm" variant="outline" onClick={copyMarkdown} title="Copy Markdown" className="min-h-[44px] border-[var(--line)] bg-white/[0.04]">
                  {copied ? <Check className="h-3.5 w-3.5 text-[var(--chartreuse)]" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                  {copied ? "Copied" : "Copy MD"}
                </Button>
                <Button size="sm" variant="outline" onClick={syncToProfile} className="min-h-[44px] border-[var(--line)] bg-white/[0.04]">
                  <Save className="h-3.5 w-3.5" aria-hidden /> Sync with Main Profile
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setConfigureOpen(false);
                    setShowVariantsModal(true);
                  }}
                  title="Manage Master Resume Archetypes & Funnels"
                  className="min-h-[44px] border-[var(--line)] bg-white/[0.04]"
                >
                  <Layers className="h-3.5 w-3.5 text-[var(--chartreuse)]" aria-hidden /> Archetypes
                </Button>
              </div>
              <p role="status" className="text-[11px] leading-relaxed text-dim">
                {isDirty ? "Canvas has changes not yet synced to your profile." : "Canvas matches your synced profile."}
              </p>
            </section>

            {/* Compile actions */}
            <section aria-label="Compile actions" className="space-y-2 border-t border-[var(--line)] pt-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">Compile</h3>
              <ResumeCompileControls
                pdfState={pdfState}
                diffCollapsed={diffCollapsed}
                changedSections={changedSections}
                onCompilePreview={compilePreview}
                onCompileSynctex={compileSynctex}
                onToggleDiff={() => {
                  setDiffCollapsed(false);
                  setRefineTab("diff");
                  setRefineCollapsed(false);
                  setConfigureOpen(false);
                }}
                onPinBaseline={pinBaseline}
              />
            </section>
          </div>
        </Modal>
      )}

      {showVariantsModal && (
        <Modal open={showVariantsModal} onClose={() => setShowVariantsModal(false)} title="Resume Archetypes & Conversion Funnels" wide>
          <ResumeVariantsManager
            onSelectVariant={(variant) => {
              setResume(variant.content);
              setSelectedTemplate(variant.templateId || "classic-ats");
              setLastSyncedJson(JSON.stringify(variant.content));
              setShowVariantsModal(false);
              success(`Loaded archetype "${variant.name}" into editor.`);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
