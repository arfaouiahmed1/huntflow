"use client";
import Select from "@/components/ui/Select";
import SettingHelper from "@/components/settings/SettingHelper";

import { useState, useEffect, useRef } from "react";
import {
  Save,
  Trash2,
  Check,
  Cpu,
  Link2,
  LogIn,
  Download,
  Upload,
  RefreshCw,
  Mail,
  Unplug,
  PlugZap,
  ChevronUp,
  ChevronDown,
  Power,
  Key,
  Cookie,
  ShieldCheck,
  Copy,
  Camera,
  Image as ImageIcon,
  Layers,
  Route,
  Sparkles,
  Sun,
  Moon,
  Monitor,
  PanelLeftClose,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  GraduationCap,
  Compass,
  LayoutGrid,
  Table,
  FileText,
  Archive,
  Send,
  CheckCircle2,
  Bell,
  BellRing,
  Eye,
  Gauge,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import { useAppearance } from "@/context/AppearanceContext";
import { Button } from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { useToast } from "@/components/ui/Toaster";
import { LLM_PROVIDERS, LLMProvider, AgentModelRoute, nextProviderSlotId } from "@/lib/llm/providers";
import { MailSettings, CloudinarySettings } from "@/types";
import { cn } from "@/lib/utils";
import { CloudinarySettingsSchema } from "@/lib/validation";
import { isMasked } from "@/lib/masking";
import { toErrorMessage } from "@/lib/errors";
import type { LinkedInLoginResult } from "@/context/AppContext";
import {
  CRAWL_LIMIT_OPTIONS,
  WORKSPACE_PREFS_EVENT,
  WORKSPACE_PREFS_KEY,
  getStoredWorkspacePrefs,
  saveWorkspacePrefs,
  sendDesktopNotification,
  type TrackerSort,
  type WorkspacePrefs,
} from "@/lib/workspacePrefs";

const ROUTABLE_WORKFLOWS = [
  { id: "match_analysis", label: "Match analysis", hint: "Fit score and evidence gaps" },
  { id: "resume", label: "Resume copilot", hint: "Studio chat and drafting" },
  { id: "resume_patch", label: "Resume patch", hint: "Targeted LaTeX edits" },
  { id: "pitch", label: "Apply pitch", hint: "Auto-apply opening messages" },
  { id: "vault_assist", label: "Vault assistant", hint: "Evidence-grounded answers" },
  { id: "interviewPrep", label: "Interview prep", hint: "Practice questions and plans" },
  { id: "salaryIntel", label: "Salary intelligence", hint: "Compensation research" },
  { id: "outreachEmail", label: "Outreach writer", hint: "Network and recruiter email" },
  { id: "regionalNorms", label: "Regional norms", hint: "Country-specific application guidance" },
  { id: "resumeCVTailor", label: "CV tailoring", hint: "Experience and CV alignment" },
  { id: "letterTailor", label: "Letter tailoring", hint: "Cover and motivation letters" },
  { id: "atsAudit", label: "ATS audit", hint: "Keyword and formatting review" },
] as const;

const TRACKER_SORT_OPTIONS: { id: TrackerSort; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "match", label: "Best match" },
  { id: "company", label: "Company A–Z" },
  { id: "applied", label: "Recently applied" },
  { id: "followUp", label: "Follow-up due" },
];

const SETTINGS_TABS = [
  { id: "workspace", label: "Workspace", description: "Theme and navigation" },
  { id: "agents", label: "Agents", description: "Models and workflow routing" },
  { id: "crawler", label: "Crawler", description: "Concurrency and visual feeds" },
  { id: "connections", label: "Connections", description: "LinkedIn, Gmail, and mail" },
  { id: "data", label: "Data", description: "Backup and reset controls" },
  { id: "guide", label: "Guide", description: "How to use HUNTFLOW" },
  { id: "faq", label: "FAQ", description: "Answers and fixes" },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];
const SETTINGS_TAB_ICONS = {
  workspace: Sun,
  agents: Cpu,
  crawler: Layers,
  connections: Link2,
  data: Download,
  guide: GraduationCap,
  faq: BookOpen,
} as const;

type GuidePoint = { label: string; body: string };
type TabGuideData = {
  heading: string;
  points: GuidePoint[];
  next: string;
  cta?: { label: string; href: string };
};
const TAB_GUIDES: Record<SettingsTab, TabGuideData> = {
  workspace: {
    heading: "Workspace appearance",
    points: [
      { label: "What it controls", body: "Theme mode (light, dark, or follow system) and desktop navigation density." },
      { label: "When to use", body: "Personalize the look of the workspace, or free up horizontal space on wide monitors with compact navigation." },
    ],
    next: "Pick a mode below; it applies instantly. Compact navigation is also toggleable from the sidebar.",
  },
  agents: {
    heading: "AI engine & routing",
    points: [
      { label: "What it controls", body: "Which LLM providers power the app (a fallback chain) and which provider plus model each workflow prefers." },
      { label: "When to use", body: "First run to add provider keys, after a provider gets rate-limited, or to route heavy workflows to a specific model." },
    ],
    next: "Add a provider, import its models, and test the connection. Then assign per-agent routes below.",
  },
  crawler: {
    heading: "Media streaming & crawling",
    points: [
      { label: "What it controls", body: "Cloudinary media (live screenshot feeds in the console and job deck) and crawler worker concurrency." },
      { label: "When to use", body: "Enable live visual feeds, or tune how many boards crawl in parallel when discovery feels slow." },
    ],
    next: "Enter Cloudinary credentials (or rely on .env), then Test & Sync to Agent, then Save.",
  },
  connections: {
    heading: "Accounts & mail",
    points: [
      { label: "What it controls", body: "LinkedIn sign-in for auto-apply, Gmail OAuth for sending and syncing, plus IMAP/SMTP mail as a fallback." },
      { label: "When to use", body: "Before applying to jobs, or to send recruiter emails and receive replies from inside the app." },
    ],
    next: "Sign in to LinkedIn, then connect Gmail via OAuth. Keep career facts in the Evidence Vault.",
    cta: { label: "Open Evidence Vault", href: "/vault" },
  },
  data: {
    heading: "Backup & reset",
    points: [
      { label: "What it controls", body: "Full JSON export, restore from a backup, and a complete database reset." },
      { label: "When to use", body: "Before switching machines or after heavy cleanup, and only when you intend to wipe everything." },
    ],
    next: "Export a backup first, then restore to bring it back, or reset to begin clean.",
  },
  guide: {
    heading: "How to use HUNTFLOW",
    points: [
      { label: "What it is", body: "The end-to-end loop: discover roles, track them, analyze fit, tailor documents, and apply supervised." },
      { label: "How to use it", body: "Step through the workflow below with Next/Back, or jump to any step — every step links to the live surface." },
    ],
    next: "Start at step 1 on /jobs and work forward; each step builds on the previous one.",
    cta: { label: "Start discovering", href: "/jobs" },
  },
  faq: {
    heading: "Frequently asked questions",
    points: [
      { label: "What it covers", body: "Providers, local models, sidecar token, Gmail OAuth, LinkedIn li_at, Cloudinary, and backup/restore." },
      { label: "How to fix fast", body: "Every answer ends with the tab that fixes it — jump straight there instead of hunting." },
    ],
    next: "Still stuck? The in-app diagnostics and docs/ENVIRONMENT.md cover tokens and URLs.",
  },
};

type GuideStep = { icon: LucideIcon; title: string; body: string; href: string; cta: string };
const GUIDE_STEPS: GuideStep[] = [
  {
    icon: Compass,
    title: "Discover roles",
    body: "On /jobs, pick sources and run Discovery. Fresh postings land in the swipe deck ranked by fit — save the keepers, skip the rest.",
    href: "/jobs",
    cta: "Open Discovery",
  },
  {
    icon: LayoutGrid,
    title: "Track the pipeline",
    body: "Saved roles land in /tracker as wishlist. Drag them across applied → interviewing → offer, or switch to table/deck and sort by match.",
    href: "/tracker",
    cta: "Open Tracker",
  },
  {
    icon: CheckCircle2,
    title: "Analyze fit",
    body: "Open a job to run match analysis: fit score, evidence gaps, STAR cards, and interview questions grounded in your vault.",
    href: "/jobs",
    cta: "Review a role",
  },
  {
    icon: FileText,
    title: "Tailor documents",
    body: "In /resume, the Studio drafts tailored resumes, cover and motivation letters, then compiles them to LaTeX PDF with ATS checks.",
    href: "/resume",
    cta: "Open Resume Studio",
  },
  {
    icon: Archive,
    title: "Build vault evidence",
    body: "Add career facts, docs, and contacts to /vault. Every agent answer cites this evidence instead of inventing it.",
    href: "/vault",
    cta: "Open Vault",
  },
  {
    icon: Send,
    title: "Apply supervised",
    body: "On /agent, the 11-agent pipeline researches, tailors, and prefills — then pauses at a human review gate. Nothing submits silently.",
    href: "/agent",
    cta: "Open Apply Agent",
  },
];

type FaqItem = { q: string; a: string; action?: { label: string; tab: SettingsTab } };
const FAQS: FaqItem[] = [
  {
    q: "How does the AI fallback chain work?",
    a: "Every request tries your enabled providers top-to-bottom and hops on failure (rate limits, outages, bad JSON — 3 attempts per provider with backoff). The first enabled provider also powers legacy single-provider features. Keys stay in your local database, never in git.",
    action: { label: "Open Agents tab", tab: "agents" },
  },
  {
    q: "Can I use a local model with Ollama?",
    a: "Yes. Add a provider pointed at your local endpoint (e.g. http://localhost:11434/v1) — a key is optional for local models. Then Test it and optionally pin heavy workflows to it via per-agent routing.",
    action: { label: "Open Agents tab", tab: "agents" },
  },
  {
    q: "What is the sidecar token (HUNTFLOW_AGENT_TOKEN)?",
    a: "A shared secret between Next.js and the Python Scrapling agent, sent as the X-Huntflow-Token header. Set the same value in .env for both sides. LinkedIn sessions, crawling, and auto-apply need the sidecar running (default http://127.0.0.1:8001).",
    action: { label: "Open Connections tab", tab: "connections" },
  },
  {
    q: "How do I connect Gmail?",
    a: "Create a Web-application OAuth client in Google Cloud Console, save the Client ID + Secret here, add the shown Redirect URI to Google's authorized list, then Connect with Google OAuth. IMAP/SMTP with an app password works as a fallback for sending and syncing.",
    action: { label: "Open Connections tab", tab: "connections" },
  },
  {
    q: "How do I connect LinkedIn (li_at)?",
    a: "Either use the browser login window, or paste your li_at session cookie (linkedin.com → F12 → Application → Cookies → copy li_at). If LinkedIn shows a checkpoint, complete the verification in your browser and refresh; session-locked means another login is in progress — wait and retry.",
    action: { label: "Open Connections tab", tab: "connections" },
  },
  {
    q: "Do I need Cloudinary?",
    a: "No — without it, screenshots stay local in .agent_runs/. With it, live browser screenshots stream to the agent console and job deck during scraping and automation. Values saved here take precedence over CLOUDINARY_* in .env.",
    action: { label: "Open Crawler tab", tab: "crawler" },
  },
  {
    q: "How do backup, restore, and reset work?",
    a: "Export downloads one JSON snapshot (jobs, contacts, emails, interviews, reminders, memories, vault, settings, usage). Restore replaces everything and re-seeds. Reset wipes the database and local cache and reloads clean — your AI engine keys stay untouched. Always export before resetting.",
    action: { label: "Open Data tab", tab: "data" },
  },
];

export default function SettingsPage() {
  const {
    providers,
    updateProviders,
    agentModelRoutes,
    updateAgentModelRoutes,
    checkLinkedInSession,
    openLinkedInLogin,
    logoutLinkedIn,
    mailSettings,
    saveMailSettings,
    cloudinarySettings,
    saveCloudinarySettings,
    refreshData,
  } = useApp();
  const { appearance, resolvedTheme, setMode, setSidebarCollapsed } = useAppearance();
  const { success, error, warn } = useToast();
  const [liStatus, setLiStatus] = useState<"checking" | "signed-in" | "signed-out">("checking");
  const [liDetails, setLiDetails] = useState<LinkedInLoginResult | null>(null);
  const [liBusy, setLiBusy] = useState(false);
  const [liCookie, setLiCookie] = useState("");
  const [liCookieOpen, setLiCookieOpen] = useState(false);
  const [liCookieBusy, setLiCookieBusy] = useState(false);
  const [armReset, setArmReset] = useState(false);
  const [mailForm, setMailForm] = useState<MailSettings>({ ...mailSettings });
  const [testingMail, setTestingMail] = useState(false);
  const [mailResult, setMailResult] = useState<"untested" | "ok" | "failed">("untested");
  const [cloudForm, setCloudForm] = useState<CloudinarySettings>({ ...cloudinarySettings });
  const [prevCloudinary, setPrevCloudinary] = useState(cloudinarySettings);
  if (cloudinarySettings !== prevCloudinary) {
    setPrevCloudinary(cloudinarySettings);
    setCloudForm({ ...cloudinarySettings });
  }
  const [savingCloud, setSavingCloud] = useState(false);
  const [testingCloud, setTestingCloud] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<{
    connected: boolean;
    email?: string;
    expiry?: number;
    clientConfigured?: boolean;
    redirectUri?: string;
  }>({
    connected: false,
  });
  const [gmailBusy, setGmailBusy] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [googleConfigOpen, setGoogleConfigOpen] = useState(false);
  const [googleConfigBusy, setGoogleConfigBusy] = useState(false);
  const [googleClientStatus, setGoogleClientStatus] = useState<{
    configured: boolean;
    clientId?: string;
    source?: string;
    redirectUri?: string;
  }>({ configured: false });
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [addId, setAddId] = useState("");
  const [testResults, setTestResults] = useState<Record<string, ProviderTestStatus>>({});
  const [modelCatalogs, setModelCatalogs] = useState<Record<string, string[]>>({});
  const [importingModels, setImportingModels] = useState<Record<string, boolean>>({});
  const [modelImportErrors, setModelImportErrors] = useState<Record<string, string>>({});
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("workspace");
  const [guideStep, setGuideStep] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [prefs, setPrefs] = useState<WorkspacePrefs>(() => getStoredWorkspacePrefs());
  const chain = providers;

  // Live-sync prefs changed in another tab; the initializer above covers first paint.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === WORKSPACE_PREFS_KEY || event.key === null) setPrefs(getStoredWorkspacePrefs());
    };
    const onPrefsChange = () => setPrefs(getStoredWorkspacePrefs());
    window.addEventListener("storage", onStorage);
    window.addEventListener(WORKSPACE_PREFS_EVENT, onPrefsChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(WORKSPACE_PREFS_EVENT, onPrefsChange);
    };
  }, []);

  const patchPrefs = (patch: Partial<WorkspacePrefs>) => setPrefs(saveWorkspacePrefs(patch));

  const onTestDesktopNotification = async () => {
    const result = await sendDesktopNotification(
      "HUNTFLOW test notification",
      "Desktop notifications are on — crawl and save events will ping you here.",
      { requestPermission: true }
    );
    if (result === "sent") success("Test notification sent — check your OS tray.");
    else if (result === "denied") error("Browser blocked notifications — allow them in site settings, then retry.");
    else if (result === "unsupported") error("This browser does not support desktop notifications.");
    else warn("Enable desktop notifications first, then send a test.");
  };

  const resetAllData = async () => {
    if (!armReset) {
      setArmReset(true);
      setTimeout(() => setArmReset(false), 4000);
      return;
    }
    try {
      const res = await fetch("/api/data/reset", { method: "POST" });
      if (!res.ok) throw new Error(`DB reset failed (HTTP ${res.status})`);
    } catch (err) {
      error(err instanceof Error ? err.message : "DB reset failed — SQLite data may remain; only the local cache was cleared.");
    }
    ["job_finder_apps", "job_finder_profile", "huntflow_insights", "huntflow_storage_version"].forEach((k) =>
      localStorage.removeItem(k)
    );
    window.location.reload();
  };

  const replaceProvider = (id: string, patch: Partial<LLMProvider>): LLMProvider[] =>
    chain.map((p) => (p.id === id ? { ...p, ...patch } : p));

  const moveProvider = (id: string, dir: -1 | 1): LLMProvider[] => {
    const i = chain.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= chain.length) return chain;
    const next = [...chain];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  const runTest = async (p: LLMProvider) => {
    setTestResults((r) => ({ ...r, [p.id]: { testing: true } }));
    try {
      const res = await fetch("/api/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: p }),
      });
      const data: Record<string, unknown> = (await res.json().catch(() => ({} as Record<string, unknown>))) as Record<string, unknown>;
      if (!res.ok) throw new Error(typeof data.error === "object" ? JSON.stringify(data.error) : (typeof data.error === "string" ? data.error : `HTTP ${res.status}`));
      const latency = typeof data.latencyMs === "number" ? (data.latencyMs as number) : undefined;
      const attempts = typeof data.attempts === "number" ? (data.attempts as number) : undefined;
      setTestResults((r) => ({ ...r, [p.id]: { ok: true, latency, attempts } }));
      const modelLabel = typeof data.model === "string" ? (data.model as string) : p.label;
      const latencyStr = latency !== undefined ? `${latency}ms` : "?";
      const attemptsStr = attempts !== undefined ? ` · ${attempts} attempt${attempts === 1 ? "" : "s"}` : "";
      success(`Connected — ${modelLabel} · ${latencyStr}${attemptsStr} (PER_PROVIDER_ATTEMPTS=3, 429/408 jitter)`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : (typeof err === "object" && err !== null ? JSON.stringify(err) : String(err));
      setTestResults((r) => ({ ...r, [p.id]: { ok: false, error: errMsg } }));
      error(`Test failed — ${errMsg}`);
    }
  };

  const importModels = async (provider: LLMProvider) => {
    setImportingModels((current) => ({ ...current, [provider.id]: true }));
    setModelImportErrors((current) => ({ ...current, [provider.id]: "" }));
    try {
      const res = await fetch("/api/llm/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerSlotId: provider.id,
          providerId: provider.providerId,
          apiKey: provider.apiKey,
          baseURL: provider.baseURL,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { models?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const models = Array.isArray(data.models) ? data.models : [];
      setModelCatalogs((current) => ({ ...current, [provider.id]: models }));
      success(models.length ? `Imported ${models.length} ${provider.label} model${models.length === 1 ? "" : "s"}.` : "No models were returned by this provider.");
    } catch (err) {
      const message = toErrorMessage(err) || "Could not import this provider's models.";
      setModelImportErrors((current) => ({ ...current, [provider.id]: message }));
      error(message);
    } finally {
      setImportingModels((current) => ({ ...current, [provider.id]: false }));
    }
  };

  const upsertAgentModelRoute = (agent: string, patch: Partial<AgentModelRoute>) => {
    const current = agentModelRoutes.find((route) => route.agent === agent);
    const next = {
      agent,
      providerSlotId: patch.providerSlotId ?? current?.providerSlotId ?? chain.find((provider) => provider.enabled)?.id ?? "",
      model: patch.model ?? current?.model ?? "",
    };
    if (!next.providerSlotId) return;
    updateAgentModelRoutes([
      ...agentModelRoutes.filter((route) => route.agent !== agent),
      next,
    ]);
  };

  const clearAgentModelRoute = (agent: string) => {
    updateAgentModelRoutes(agentModelRoutes.filter((route) => route.agent !== agent));
  };

  const refreshLiStatus = async () => {
    setLiStatus("checking");
    try {
      const result = await checkLinkedInSession();
      setLiDetails(result);
      setLiStatus(result.authenticated ? "signed-in" : "signed-out");
    } catch (err) {
      setLiDetails({
        authenticated: false,
        state: "error",
        reason: err instanceof Error ? err.message : "LinkedIn session check failed.",
        recovery: "Confirm the local Scrapling agent is running, then retry.",
      });
      setLiStatus("signed-out");
    }
  };

  useEffect(() => {
    let cancelled = false;
    checkLinkedInSession()
      .then((result) => {
        if (!cancelled) {
          setLiDetails(result);
          setLiStatus(result.authenticated ? "signed-in" : "signed-out");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLiDetails({
            authenticated: false,
            state: "error",
            reason: err instanceof Error ? err.message : "LinkedIn session check failed.",
          });
          setLiStatus("signed-out");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [checkLinkedInSession]);

  const onTestCloudinary = async () => {
    setTestingCloud(true);
    try {
      // Masked values (••••XXXX) mean "unchanged" — omit them so the sidecar keeps its real/env-backed credentials.
      const res = await fetch("/api/agent/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cloudinary_cloud_name: cloudForm.cloudName || undefined,
          ...(isMasked(cloudForm.apiKey) ? {} : { cloudinary_api_key: cloudForm.apiKey || undefined }),
          ...(isMasked(cloudForm.apiSecret) ? {} : { cloudinary_api_secret: cloudForm.apiSecret || undefined }),
          max_concurrency: cloudForm.concurrency,
        }),
      });
      const data = await res.json();
      if (res.ok && data.cloudinary_configured) {
        success("Cloudinary CDN & Crawler Concurrency configured successfully on agent!");
      } else if (res.ok) {
        success(`Agent config updated: ${cloudForm.concurrency || 4} parallel crawler workers (local snapshots only).`);
      } else {
        error(data.error || "Failed to update configuration on agent sidecar.");
      }
    } catch (err) {
      error(err instanceof Error ? err.message : "Failed to connect to agent");
    } finally {
      setTestingCloud(false);
    }
  };

  const onSaveCloudinary = async () => {
    const parsed = CloudinarySettingsSchema.safeParse(cloudForm);
    if (!parsed.success) {
      error(parsed.error.issues[0]?.message || "Invalid Cloudinary settings.");
      return;
    }
    setSavingCloud(true);
    try {
      await saveCloudinarySettings({
        cloudName: parsed.data.cloudName || "",
        apiKey: parsed.data.apiKey || "",
        apiSecret: parsed.data.apiSecret || "",
        concurrency: parsed.data.concurrency ?? 1,
      });
      await onTestCloudinary();
      success("Cloudinary & Parallelism settings saved!");
    } catch (err) {
      error(toErrorMessage(err) || "Failed to save Cloudinary settings.");
    } finally {
      setSavingCloud(false);
    }
  };

  const refreshGmailStatus = async () => {
    try {
      const res = await fetch("/api/auth/gmail/status", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { connected: boolean; email?: string; expiry?: number };
        setGmailStatus(data);
      } else {
        setGmailStatus({ connected: false });
      }
    } catch (_err) {
      // Probe failure → disconnected badge is the user-facing signal; toast per refresh would spam.
      void _err;
      setGmailStatus({ connected: false });
    }
  };

  const onGmailDisconnect = async () => {
    setGmailBusy(true);
    try {
      await fetch("/api/auth/gmail/revoke", { method: "POST" });
      setGmailStatus({ connected: false });
      success("Gmail disconnected — mail falls back to app-password settings.");
    } catch (err) {
      error(toErrorMessage(err) || "Failed to disconnect Gmail.");
    } finally {
      setGmailBusy(false);
    }
  };

  const refreshGoogleConfig = async () => {
    try {
      const res = await fetch("/api/auth/gmail/config", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setGoogleClientStatus(data);
      } else {
        warn(`Google OAuth config unavailable (HTTP ${res.status}).`);
      }
    } catch (err) {
      warn(err instanceof Error ? err.message : "Could not read Google OAuth config.");
    }
  };

  const onSaveGoogleConfig = async () => {
    if (!googleClientId.trim() || !googleClientSecret.trim()) {
      error("Both Client ID and Client Secret are required.");
      return;
    }
    setGoogleConfigBusy(true);
    try {
      const res = await fetch("/api/auth/gmail/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: googleClientId, clientSecret: googleClientSecret }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save Google credentials");
      }
      success("Google OAuth client credentials saved! Click 'Connect Gmail' to authorize.");
      setGoogleClientId("");
      setGoogleClientSecret("");
      setGoogleConfigOpen(false);
      await refreshGoogleConfig();
      await refreshGmailStatus();
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : "Failed to save Google credentials");
    } finally {
      setGoogleConfigBusy(false);
    }
  };

  const onLinkedInCookieAuth = async () => {
    if (!liCookie.trim()) {
      error("Please paste your li_at session cookie.");
      return;
    }
    setLiCookieBusy(true);
    try {
      const res = await fetch("/api/linkedin/cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: liCookie.trim() }),
      });
      const data = (await res.json()) as LinkedInLoginResult & { error?: string };
      setLiDetails(data);
      if (data.authenticated) {
        setLiStatus("signed-in");
        setLiCookie("");
        setLiCookieOpen(false);
        success("LinkedIn session verified and saved successfully!");
      } else {
        error(data.reason || data.error || "LinkedIn could not verify this session cookie.");
      }
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : "LinkedIn cookie login failed");
    } finally {
      setLiCookieBusy(false);
    }
  };

  /* Gmail OAuth: reflect connect/disconnect (and the /settings?gmail=… redirect) into the UI. */
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const gmail = params.get("gmail");
    if (gmail === "connected") {
      success("Gmail connected — IMAP + SMTP now use OAuth.");
      window.history.replaceState({}, "", "/settings");
    } else if (gmail === "error") {
      const reason = params.get("reason") || "unknown";
      error(`Gmail connection failed (${reason}) — check OAuth Client ID / Secret and redirect URI.`);
      window.history.replaceState({}, "", "/settings");
    }

    fetch("/api/auth/gmail/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { connected: false }))
      .then((data) => {
        if (!cancelled) setGmailStatus(data);
      })
      .catch(() => {
        if (!cancelled) setGmailStatus({ connected: false });
      });

    fetch("/api/auth/gmail/config", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setGoogleClientStatus(data);
      })
      .catch((err) => {
        if (!cancelled) warn(err instanceof Error ? err.message : "Google OAuth config unavailable.");
      });

    return () => {
      cancelled = true;
    };
  }, [error, success, warn]);

  const exportBackup = async () => {
    setBackupBusy(true);
    try {
      const res = await fetch("/api/data/export?download=1");
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `huntflow-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      success("Backup downloaded.");
    } catch (e) {
      error(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBackupBusy(false);
    }
  };

  const onRestoreFile = async (file: File) => {
    setRestoreBusy(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/data/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; counts?: Record<string, number> };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const counts = data.counts ?? {};
      try {
        await Promise.allSettled([
          refreshData(),
          fetch("/api/vault", { cache: "no-store" }).then(async (r) => {
            if (r.ok) {
              const v = await r.json().catch(() => null);
              if (v && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("huntflow:vault-refreshed", { detail: v }));
            }
          }),
        ]);
      } catch (err) {
        warn(err instanceof Error ? err.message : "Import saved, but workspace refresh failed — reload if data looks stale.");
      }
      success(
        `Restored — ${counts.jobs ?? 0} jobs, ${counts.contacts ?? 0} contacts, ${counts.vaultDocs ?? 0} vault docs`
      );
    } catch (e) {
      error(e instanceof Error ? e.message : "Restore failed.");
    } finally {
      setRestoreBusy(false);
    }
  };

  const onLinkedInLogin = async () => {
    setLiBusy(true);
    try {
      const result = await openLinkedInLogin();
      setLiDetails(result);
      setLiStatus(result.authenticated ? "signed-in" : "signed-out");
      if (result.checkpoint && !result.authenticated) {
        error(result.reason || "LinkedIn requires a verification checkpoint.");
        return;
      }
      if (result.authenticated) {
        success("Signed in to LinkedIn.");
      } else if (result.reason) {
        error(result.reason);
      }
    } catch (err) {
      setLiStatus("signed-out");
      const message = err instanceof Error ? err.message : "LinkedIn login window failed.";
      setLiDetails({ authenticated: false, state: "error", reason: message });
      error(message);
    } finally {
      setLiBusy(false);
    }
  };

  const onLinkedInLogout = async () => {
    setLiBusy(true);
    try {
      await logoutLinkedIn();
      setLiStatus("signed-out");
      setLiDetails({ authenticated: false, state: "signed_out", reason: "The persistent LinkedIn session was cleared." });
      success("Signed out of LinkedIn.");
    } catch (err) {
      setLiStatus("signed-out");
      error(err instanceof Error ? err.message : "LinkedIn sign-out failed on the agent — the browser session may persist.");
    } finally {
      setLiBusy(false);
    }
  };

  const field =
    "w-full rounded-xl border border-[var(--line)] bg-white/[0.03] px-3.5 py-2.5 text-sm text-[var(--paper)] outline-none transition-colors placeholder:text-[var(--paper-dim)]/60 focus:border-[var(--chartreuse)]/50";
  const liStateLabel = liStatus === "checking"
    ? "Checking session…"
    : liStatus === "signed-in"
      ? "Connected"
      : liDetails?.state === "checkpoint"
        ? "Verification required"
        : liDetails?.state === "login_in_progress"
          ? "Login in progress"
          : liDetails?.state === "session_locked"
            ? "Session profile busy"
            : "Not signed in";
  const liNeedsAttention = ["checkpoint", "login_in_progress", "session_locked"].includes(liDetails?.state || "");
  const activeProviders = chain.filter((c) => c.enabled).length;
  const guide = GUIDE_STEPS[Math.min(guideStep, GUIDE_STEPS.length - 1)];
  const GuideIcon = guide.icon;

  return (
    <div className="w-full space-y-6">
      <div>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--chartreuse)]">
          /settings
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--paper)]">Settings</h1>
        <p className="mt-1 text-sm text-dim">
          Configure providers, integrations, automation services, and local data controls.
        </p>
      </div>

      {/* Live status overview — each card jumps to the tab that owns it. */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Integration status overview">
        <StatusCard
          icon={Cpu}
          label="AI engine"
          value={chain.length === 0 ? "No providers" : `${activeProviders} active · ${chain.length} total`}
          tone={activeProviders > 0 ? "ok" : "warn"}
          onOpen={() => setActiveTab("agents")}
        />
        <StatusCard
          icon={Link2}
          label="LinkedIn"
          value={liStateLabel}
          tone={liStatus === "signed-in" ? "ok" : liNeedsAttention ? "warn" : "bad"}
          onOpen={() => setActiveTab("connections")}
        />
        <StatusCard
          icon={Mail}
          label="Gmail"
          value={gmailStatus.connected ? (gmailStatus.email ? `Connected · ${gmailStatus.email}` : "Connected") : "Not connected"}
          tone={gmailStatus.connected ? "ok" : "bad"}
          onOpen={() => setActiveTab("connections")}
        />
        <StatusCard
          icon={Camera}
          label="Media feeds"
          value={cloudForm.cloudName ? `Cloudinary · ${cloudForm.cloudName}` : "Local snapshots"}
          tone={cloudForm.cloudName ? "ok" : "idle"}
          onOpen={() => setActiveTab("crawler")}
        />
      </div>

      <nav className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-2 shadow-[0_12px_40px_rgba(0,0,0,0.08)]" aria-label="Settings sections">
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Settings sections">
          {SETTINGS_TABS.map((tab) => {
            const Icon = SETTINGS_TAB_ICONS[tab.id];
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`settings-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="settings-content"
                data-testid={`settings-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "group w-full min-w-[148px] flex-1 shrink-0 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chartreuse)]",
                  selected
                    ? "border-[var(--chartreuse)]/45 bg-[var(--chartreuse)]/10 text-[var(--paper)]"
                    : "border-transparent text-dim hover:border-[var(--line)] hover:bg-white/[0.03] hover:text-[var(--paper)]",
                )}
              >
                <span className="flex items-center gap-2 text-xs font-semibold">
                  <Icon className={cn("h-3.5 w-3.5", selected ? "text-[var(--chartreuse)]" : "text-dim group-hover:text-[var(--paper)]")} />
                  {tab.label}
                </span>
                <span className="mt-1 block truncate text-[10px] text-dim">{tab.description}</span>
              </button>
            );
          })}
        </div>
        <p className="px-2 pt-2 text-[10px] font-mono uppercase tracking-[0.16em] text-dim" aria-live="polite">
          Editing {SETTINGS_TABS.find((tab) => tab.id === activeTab)?.label} settings
        </p>
      </nav>

      <div id="settings-content" role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`} className="space-y-6">
      <TabGuide key={`guide-${activeTab}`} data={TAB_GUIDES[activeTab]} />
      {activeTab === "workspace" && (
        <div className="space-y-6">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5 sm:p-6">
          <SectionHeading
            icon={Sun}
            accent="text-[var(--chartreuse)]"
            title="Appearance & navigation"
            helper="Theme mode applies instantly across the app. Compact navigation collapses the desktop sidebar to icons."
            helperLabel="Appearance and navigation"
          />
          <p className="mb-4 mt-1 text-xs leading-relaxed text-dim">
            Choose the workspace theme and keep the desktop navigation as roomy or compact as you prefer.
          </p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Appearance mode">
            <button
              type="button"
              onClick={() => setMode("light")}
              aria-pressed={appearance.mode === "light"}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-[11px] font-semibold transition-colors",
                appearance.mode === "light"
                  ? "border-[var(--chartreuse)]/50 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                  : "border-[var(--line)] bg-white/[0.02] text-dim hover:text-[var(--paper)]",
              )}
            >
              <Sun className="h-4 w-4" /> Light
            </button>
            <button
              type="button"
              onClick={() => setMode("dark")}
              aria-pressed={appearance.mode === "dark"}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-[11px] font-semibold transition-colors",
                appearance.mode === "dark"
                  ? "border-[var(--chartreuse)]/50 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                  : "border-[var(--line)] bg-white/[0.02] text-dim hover:text-[var(--paper)]",
              )}
            >
              <Moon className="h-4 w-4" /> Dark
            </button>
            <button
              type="button"
              onClick={() => setMode("system")}
              aria-pressed={appearance.mode === "system"}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-[11px] font-semibold transition-colors",
                appearance.mode === "system"
                  ? "border-[var(--chartreuse)]/50 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                  : "border-[var(--line)] bg-white/[0.02] text-dim hover:text-[var(--paper)]",
              )}
            >
              <Monitor className="h-4 w-4" /> System
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white/[0.02] px-3 py-2.5">
            <Checkbox
              checked={appearance.sidebarCollapsed}
              onChange={setSidebarCollapsed}
              label="Compact desktop navigation"
              description="You can also toggle it from the sidebar."
              aria-label="Compact desktop navigation"
            />
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-1 text-[10px] font-semibold text-dim">
              <PanelLeftClose className="h-3 w-3" /> {appearance.mode === "system" ? `System · ${resolvedTheme}` : `${appearance.mode} mode`}
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5 sm:p-6">
          <SectionHeading
            icon={LayoutGrid}
            accent="text-[var(--sky)]"
            title="Defaults & display"
            helper="These defaults load when Tracker and Discovery open, and the display toggles apply instantly across the app. Everything is stored in your browser — no server round-trip."
            helperLabel="Defaults and display"
          />
          <p className="mb-4 mt-1 text-xs leading-relaxed text-dim">
            Skip repetitive setup: pick the views you open every day and how dense the workspace feels.
          </p>
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
                Default Tracker view
                <SettingHelper label="Default Tracker view" text="The /tracker layout used on first open: board (kanban columns), table (sortable rows), or deck (swipe cards). You can still switch views per session." />
              </p>
              <Segmented
                ariaLabel="Default Tracker view"
                value={prefs.trackerView}
                onChange={(trackerView) => patchPrefs({ trackerView })}
                options={[
                  { value: "board", label: "Board", icon: LayoutGrid },
                  { value: "table", label: "Table", icon: Table },
                  { value: "deck", label: "Deck", icon: Layers },
                ]}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
                  Default Tracker sort
                  <SettingHelper label="Default Tracker sort" text="How /tracker orders roles on first open. Column headers still re-sort per session." />
                </p>
                <Select
                  value={prefs.trackerSort}
                  onChange={(trackerSort) => patchPrefs({ trackerSort: trackerSort as TrackerSort })}
                  options={TRACKER_SORT_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                  placeholder="Sort…"
                  ariaLabel="Default Tracker sort"
                  className="w-full"
                />
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
                  Default result limit
                  <SettingHelper label="Default result limit" text="How many ranked results /jobs requests per Discovery run. Lower is faster; higher covers more boards." />
                </p>
                <Select
                  value={String(prefs.crawlLimit) as "25" | "50" | "100" | "200"}
                  onChange={(v) => patchPrefs({ crawlLimit: Number(v) })}
                  options={CRAWL_LIMIT_OPTIONS.map((n) => ({ value: String(n), label: `${n} results` }))}
                  placeholder="Result limit…"
                  ariaLabel="Default result limit"
                  className="w-full"
                />
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
                Default Discovery view
                <SettingHelper label="Default Discovery view" text="The /jobs layout used on first open: deck (swipe one role at a time) or matrix (scan the ranked grid)." />
              </p>
              <Segmented
                ariaLabel="Default Discovery view"
                value={prefs.jobsView}
                onChange={(jobsView) => patchPrefs({ jobsView })}
                options={[
                  { value: "deck", label: "Deck", icon: Layers },
                  { value: "matrix", label: "Matrix", icon: LayoutGrid },
                ]}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white/[0.02] px-3 py-2.5">
                <Checkbox
                  checked={prefs.showThumbnails}
                  onChange={(showThumbnails) => patchPrefs({ showThumbnails })}
                  label="Visual proof thumbnails"
                  description="Show listing screenshots on cards and detail pages."
                  aria-label="Visual proof thumbnails"
                />
                <Eye className="h-4 w-4 shrink-0 text-dim" aria-hidden="true" />
                <SettingHelper label="Visual proof thumbnails" text="Hides or shows listing-proof screenshots everywhere (job cards, detail pages). Proof data is kept — only the display changes." />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white/[0.02] px-3 py-2.5">
                <Checkbox
                  checked={prefs.compactDensity}
                  onChange={(compactDensity) => patchPrefs({ compactDensity })}
                  label="Compact density"
                  description="Tighter panel padding across the workspace."
                  aria-label="Compact density"
                />
                <Gauge className="h-4 w-4 shrink-0 text-dim" aria-hidden="true" />
                <SettingHelper label="Compact density" text="Trims panel padding app-wide so more content fits per screen. Turn off for the roomier default." />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white/[0.02] px-3 py-2.5">
                <Checkbox
                  checked={prefs.desktopNotifications}
                  onChange={(desktopNotifications) => patchPrefs({ desktopNotifications })}
                  label="Desktop notifications"
                  description="OS-level pings for crawl and save events."
                  aria-label="Desktop notifications"
                />
                <span className="inline-flex items-center gap-2">
                  {prefs.desktopNotifications && (
                    <button
                      type="button"
                      onClick={onTestDesktopNotification}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] px-2 py-1 text-[10px] font-semibold text-dim transition-colors hover:text-[var(--paper)]"
                    >
                      <BellRing className="h-3 w-3" /> Send test
                    </button>
                  )}
                  <Bell className="h-4 w-4 shrink-0 text-dim" aria-hidden="true" />
                </span>
                <SettingHelper label="Desktop notifications" text="Lets crawl completions and saves ping your OS tray. The browser asks permission once when you send the test." />
              </div>
            </div>
          </div>
        </section>
        </div>
      )}

      {activeTab === "agents" && (
        <div className="space-y-6">
      {/* LLM Engine */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5 sm:p-6">
        <SectionHeading
          icon={Cpu}
          accent="text-[var(--chartreuse)]"
          title="AI Engine"
          helper="Providers form a fallback chain: every request tries them top-to-bottom and hops on failure (rate limits, outages, bad JSON). Keys stay in your local database. The first enabled provider also powers legacy single-provider features."
          helperLabel="AI Engine"
          right={
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 px-2.5 py-1 text-[10px] font-semibold text-[var(--chartreuse)]">
              <Sparkles className="h-3 w-3" /> {activeProviders} active · {chain.length} total
            </span>
          }
        />
        <p className="mb-4 mt-1 text-xs leading-relaxed text-dim">
          Add providers as a fallback chain. Use the arrows to set priority, Test each key, and import models for dropdown picks.
        </p>

        {/* Chain rows */}
        <div className="space-y-2">
          {chain.length === 0 && (
            <div className="rounded-xl border border-dashed border-[var(--line)] p-4 text-center text-xs text-dim">
              No providers configured — every generation will use the built-in fallback templates.
            </div>
          )}
          {chain.map((p, i) => (
            <ProviderRow
              key={p.id}
              provider={p}
              index={i}
              total={chain.length}
              status={testResults[p.id]}
              onPatch={(patch) => updateProviders(replaceProvider(p.id, patch))}
              onMove={(dir) => updateProviders(moveProvider(p.id, dir))}
              onRemove={() => updateProviders(chain.filter((c) => c.id !== p.id))}
              onToggle={() => updateProviders(replaceProvider(p.id, { enabled: !p.enabled }))}
              onTest={() => runTest(p)}
              models={modelCatalogs[p.id]}
              importingModels={Boolean(importingModels[p.id])}
              modelImportError={modelImportErrors[p.id]}
              onImportModels={() => importModels(p)}
            />
          ))}
        </div>

        {/* Add provider */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Select
            value={addId}
            onChange={(id) => {
              if (!id) return;
              const cfg = LLM_PROVIDERS.find((c) => c.id === id);
              if (cfg) {
                const slotId = nextProviderSlotId(chain, cfg.id);
                const hasAnotherKey = chain.some((provider) => provider.providerId === cfg.id);
                updateProviders([
                  ...chain,
                  {
                    id: slotId,
                    label: hasAnotherKey ? `${cfg.label} · key ${slotId.replace(`${cfg.id}-`, "")}` : cfg.label,
                    providerId: cfg.id,
                    kind: cfg.kind ?? "openai",
                    apiKey: "",
                    model: cfg.defaultModel,
                    baseURL: cfg.baseURL,
                    temperature: 0.7,
                    enabled: true,
                    capabilities: cfg.capabilities ?? [],
                  },
                ]);
              }
              setAddId("");
            }}
            options={[
              { value: "", label: "Add a provider…" },
              ...LLM_PROVIDERS.map((c) => ({
                value: c.id,
                label: chain.some((provider) => provider.providerId === c.id) ? `${c.label} · add another key` : c.label,
                hint: c.hint,
              })),
            ]}
            placeholder="Add a provider…"
            ariaLabel="Add a provider"
            className="w-48"
          />
          <span className="text-[10px] text-dim">{activeProviders} active · {chain.length} total</span>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5 sm:p-6">
        <SectionHeading
          icon={Route}
          accent="text-[var(--sky)]"
          title="Per-agent model routing"
          helper="Give a workflow a preferred provider key and model; the saved chain stays its automatic fallback for rate limits, timeouts, and outages. Reset returns a workflow to the chain default."
          helperLabel="Per-agent model routing"
          right={
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 px-2.5 py-1 text-[10px] font-semibold text-[var(--chartreuse)]">
              <Sparkles className="h-3 w-3" /> {agentModelRoutes.length} explicit route{agentModelRoutes.length === 1 ? "" : "s"}
            </span>
          }
        />
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-dim">
          Give each workflow a preferred provider key and model. The saved provider chain remains its automatic
          fallback path for rate limits, timeouts, and upstream outages.
        </p>

        {chain.some((provider) => provider.enabled) ? (
          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {ROUTABLE_WORKFLOWS.map((workflow) => {
              const route = agentModelRoutes.find((item) => item.agent === workflow.id);
              const provider = chain.find((item) => item.id === route?.providerSlotId && item.enabled);
              const models = provider
                ? [...new Set([provider.model, ...(modelCatalogs[provider.id] ?? [])])].filter(Boolean)
                : [];
              return (
                <div key={workflow.id} className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--sky)]/10 text-[var(--sky)]">
                      <Cpu className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-[var(--paper)]">{workflow.label}</p>
                        {route ? <span className="rounded-full border border-[var(--sky)]/30 bg-[var(--sky)]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--sky)]">override</span> : <span className="text-[9px] uppercase tracking-[0.12em] text-dim">chain default</span>}
                      </div>
                      <p className="mt-0.5 text-[10px] text-dim">{workflow.hint}</p>
                    </div>
                    {route && (
                      <button type="button" onClick={() => clearAgentModelRoute(workflow.id)} className="text-[10px] font-semibold text-dim transition-colors hover:text-[var(--coral)]">
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Select
                      value={route?.providerSlotId ?? ""}
                      onChange={(providerSlotId) => {
                        if (!providerSlotId) {
                          clearAgentModelRoute(workflow.id);
                          return;
                        }
                        const selected = chain.find((item) => item.id === providerSlotId);
                        upsertAgentModelRoute(workflow.id, { providerSlotId, model: selected?.model ?? "" });
                      }}
                      options={[
                        { value: "", label: "Use chain default" },
                        ...chain.filter((item) => item.enabled).map((item) => ({ value: item.id, label: item.label, hint: item.model })),
                      ]}
                      placeholder="Use chain default"
                      ariaLabel={`${workflow.label} provider`}
                    />
                    {route && models.length ? (
                      <Select
                        value={route.model}
                        onChange={(model) => upsertAgentModelRoute(workflow.id, { model })}
                        options={models.map((model) => ({ value: model, label: model }))}
                        placeholder="Choose model"
                        ariaLabel={`${workflow.label} model`}
                      />
                    ) : route ? (
                      <input
                        className={cn(miniField, "w-full")}
                        value={route.model}
                        placeholder="model id"
                        aria-label={`${workflow.label} model`}
                        onChange={(event) => upsertAgentModelRoute(workflow.id, { model: event.target.value })}
                      />
                    ) : (
                      <div className="flex items-center rounded-lg border border-dashed border-[var(--line)] px-2.5 text-[10px] text-dim">Provider default</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-[var(--line)] p-4 text-center text-xs text-dim">
            Add and enable a provider above before assigning models to workflows.
          </div>
        )}
      </section>
      </div>
      )}

      <div className={activeTab === "connections" || activeTab === "crawler" ? "space-y-6" : "hidden"}>
      {/* LinkedIn */}
      <section className={cn("rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5 sm:p-6", activeTab === "connections" ? "" : "hidden")}>
        <SectionHeading
          icon={Link2}
          accent="text-[var(--chartreuse)]"
          title="LinkedIn"
          helper="Powers auto-apply and LinkedIn discovery through the local Scrapling agent (:8001). Sign in once via the browser window, or paste an li_at session cookie for a manual session."
          helperLabel="LinkedIn"
        />
        <p className="mb-4 mt-1 text-xs leading-relaxed text-dim">
          Connect your real LinkedIn account. Authenticate via a real browser login window or directly paste your session cookie (<code className="font-mono text-xs text-[var(--chartreuse)]">li_at</code>).
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold",
              liStatus === "signed-in"
                ? "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                : liStatus === "checking"
                  ? "border-[var(--line)] bg-white/[0.03] text-dim"
                  : liNeedsAttention
                    ? "border-[var(--amber)]/40 bg-[var(--amber)]/10 text-[var(--amber)]"
                    : "border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)]"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                liStatus === "signed-in" ? "bg-[var(--chartreuse)]" : liStatus === "checking" ? "bg-dim" : liNeedsAttention ? "bg-[var(--amber)]" : "bg-[var(--coral)]"
              )}
            />
            {liStateLabel}
          </span>

          {liStatus !== "signed-in" ? (
            <>
              <Button size="sm" onClick={onLinkedInLogin} loading={liBusy}>
                <LogIn className="h-3.5 w-3.5" /> Browser Login Window
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLiCookieOpen(!liCookieOpen)}>
                <Cookie className="h-3.5 w-3.5" /> {liCookieOpen ? "Hide Cookie Input" : "Connect with Session Cookie"}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={onLinkedInLogout} variant="outline" loading={liBusy}>
              Sign out
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={refreshLiStatus} disabled={liBusy}>
            <RefreshCw className={cn("h-3.5 w-3.5", liStatus === "checking" && "animate-spin")} /> Refresh
          </Button>
        </div>

        {liDetails && liStatus !== "checking" && (
          <div className="mt-4 rounded-xl border border-[var(--line)] bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[var(--paper)]">Session diagnostic</p>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-dim">
                {liDetails.method?.replace("_", " ") || "local agent"}
                {liDetails.checkedAt ? " · " + new Date(liDetails.checkedAt).toLocaleTimeString() : ""}
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--paper)]/85">
              {liDetails.reason || (liDetails.authenticated ? "LinkedIn authenticated the local session." : "No authenticated session was detected.")}
            </p>
            {liDetails.recovery && !liDetails.authenticated && (
              <p className="mt-2 border-l-2 border-[var(--amber)]/50 pl-3 text-[11px] leading-relaxed text-dim">
                Next step: {liDetails.recovery}
              </p>
            )}
          </div>
        )}

        {liCookieOpen && liStatus !== "signed-in" && (
          <div className="mt-4 rounded-xl border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--paper)] flex items-center gap-1.5">
                <Cookie className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> LinkedIn Session Cookie (<code className="font-mono text-[11px] text-[var(--chartreuse)]">li_at</code>)
              </p>
              <span className="text-[10px] text-dim">Manual local session</span>
            </div>
            <p className="text-[11px] text-dim leading-relaxed">
              Open linkedin.com in your browser, press F12 → Application → Cookies → copy the value of <code className="font-mono text-[var(--paper)]">li_at</code> and paste it below:
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className={cn(field, "flex-1 font-mono text-xs")}
                placeholder="AQEDATk... (paste your li_at cookie here)"
                type="password"
                value={liCookie}
                onChange={(e) => setLiCookie(e.target.value)}
              />
              <Button size="sm" onClick={onLinkedInCookieAuth} loading={liCookieBusy}>
                <ShieldCheck className="h-3.5 w-3.5" /> Authenticate
              </Button>
            </div>
          </div>
        )}

        <p className="mt-4 text-[10px] leading-relaxed text-dim">
          Account connection belongs here. Profile facts and imported career evidence belong in Profile &amp; Evidence Vault.
        </p>
      </section>

      {/* Cloudinary & Parallelism */}
      <section className={cn("rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5 sm:p-6", activeTab === "crawler" ? "" : "hidden")}>
        <SectionHeading
          icon={ImageIcon}
          accent="text-[var(--chartreuse)]"
          title="Cloudinary Streaming & Parallel Crawler"
          helper="Cloudinary hosts live browser screenshots so the console and deck can stream them. Concurrency is how many boards crawl in parallel — higher is faster but heavier on rate limits. Values saved here override .env."
          helperLabel="Cloudinary streaming and parallel crawler"
          right={
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sky)]/40 bg-[var(--sky)]/10 px-2.5 py-0.5 text-[10px] font-bold text-[var(--sky)]">
              <Camera className="h-3 w-3" /> Live Visual Feeds
            </span>
          }
        />
        <p className="mb-2 mt-1 text-xs leading-relaxed text-dim">
          Configure Cloudinary to stream live browser screenshots to the web console and job deck during scraping and form automation. Set the maximum crawler worker concurrency for controlled parallel discovery.
        </p>
        <p className="mb-4 text-[11px] leading-relaxed text-dim">
          Or set <code className="font-mono text-[10px] text-[var(--chartreuse)]">CLOUDINARY_CLOUD_NAME</code> /{" "}
          <code className="font-mono text-[10px] text-[var(--chartreuse)]">CLOUDINARY_API_KEY</code> /{" "}
          <code className="font-mono text-[10px] text-[var(--chartreuse)]">CLOUDINARY_API_SECRET</code> in .env — values saved here take precedence over .env.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
              Cloud Name
              <SettingHelper label="Cloud Name" text="Your Cloudinary cloud name (e.g. dktc34wxa). Find it on the Cloudinary dashboard after signing up." />
            </label>
            <input
              className={field}
              placeholder="e.g. dktc34wxa"
              value={cloudForm.cloudName || ""}
              onChange={(e) => setCloudForm((prev) => ({ ...prev, cloudName: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
              API Key
              <SettingHelper label="API Key" text="Cloudinary API key. Masked values (••••) mean unchanged — the sidecar keeps its stored secret." />
            </label>
            <input
              className={field}
              placeholder="e.g. 123456789012345"
              value={cloudForm.apiKey || ""}
              onChange={(e) => setCloudForm((prev) => ({ ...prev, apiKey: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
              API Secret
              <SettingHelper label="API Secret" text="Cloudinary API secret. Stored locally and synced to the sidecar on Test & Sync." />
            </label>
            <input
              type="password"
              className={field}
              placeholder="••••••••••••"
              value={cloudForm.apiSecret || ""}
              onChange={(e) => setCloudForm((prev) => ({ ...prev, apiSecret: e.target.value }))}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col justify-between gap-4 rounded-xl border border-[var(--line)] bg-[var(--ink-deep)]/50 p-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-[var(--chartreuse)]" />
              <p className="text-xs font-semibold text-[var(--paper)]">Crawler Concurrency Pool</p>
              <SettingHelper label="Crawler Concurrency Pool" text="Parallel workers scraping job boards at once. Start at 1–2; raise it when crawls feel slow and boards tolerate it." />
            </div>
            <p className="text-[11px] text-dim">
              Number of parallel workers scraping job boards simultaneously. Higher values crawl faster.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={String(cloudForm.concurrency || 1) as "1" | "2" | "4" | "6" | "8" | "12"}
              onChange={(v) => setCloudForm((prev) => ({ ...prev, concurrency: Number(v) }))}
              options={[
                { value: "1", label: "1 Worker (Serial · Default)" },
                { value: "2", label: "2 Workers" },
                { value: "4", label: "4 Workers" },
                { value: "6", label: "6 Workers (Fast)" },
                { value: "8", label: "8 Workers (Turbo)" },
                { value: "12", label: "12 Workers (Max)" },
              ]}
              ariaLabel="Concurrency"
              className="w-44"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          <Button size="sm" variant="outline" onClick={onTestCloudinary} loading={testingCloud}>
            <PlugZap className="h-3.5 w-3.5" /> Test & Sync to Agent
          </Button>
          <Button size="sm" onClick={onSaveCloudinary} loading={savingCloud}>
            <Save className="h-3.5 w-3.5" /> Save Media & Concurrency
          </Button>
        </div>
      </section>
      </div>

      {/* Email */}
      <section className={cn("rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5 sm:p-6", activeTab === "connections" ? "" : "hidden")}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <SectionHeading
            icon={Mail}
            accent="text-[var(--chartreuse)]"
            title="Email & Gmail Integration"
            helper="Official Google OAuth (XOAUTH2) is the recommended path for sending and syncing. IMAP/SMTP with an app password is the manual fallback when OAuth isn't configured."
            helperLabel="Email and Gmail integration"
          />
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-dim hover:text-[var(--paper)]"
            onClick={() => setGoogleConfigOpen(!googleConfigOpen)}
          >
            <Key className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
            {googleConfigOpen ? "Hide Google Credentials" : "Google Cloud OAuth Config"}
          </Button>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-dim">
          Connect your Gmail account via official Google OAuth 2.0 (XOAUTH2) to send applications, recruiter emails, and sync incoming responses.
        </p>

        {/* Google OAuth Credentials Configuration Panel */}
        {googleConfigOpen && (
          <div className="mb-5 rounded-xl border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/5 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[var(--paper)] flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> Google Cloud OAuth Credentials
              </p>
              <span className="text-[10px] font-mono text-[var(--chartreuse)]">
                {googleClientStatus.configured ? `Configured via ${googleClientStatus.source}` : "Not configured yet"}
              </span>
            </div>
            <p className="text-[11px] text-dim leading-relaxed">
              Create an OAuth 2.0 Client ID in your Google Cloud Console (Type: Web Application) and add the Authorized Redirect URI below:
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-black/40 px-3 py-1.5 text-xs font-mono text-[var(--paper)]">
              <span className="text-dim text-[10px] uppercase">Redirect URI:</span>
              <span className="flex-1 truncate">{googleClientStatus.redirectUri || "http://localhost:3000/api/auth/gmail/callback"}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(googleClientStatus.redirectUri || "http://localhost:3000/api/auth/gmail/callback");
                  setCopiedRedirect(true);
                  setTimeout(() => setCopiedRedirect(false), 2000);
                }}
                className="text-[11px] font-sans text-[var(--chartreuse)] hover:underline flex items-center gap-1"
              >
                {copiedRedirect ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copiedRedirect ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 pt-1">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
                  Google Client ID
                </label>
                <input
                  className={cn(field, "font-mono text-xs")}
                  placeholder="xxxxx.apps.googleusercontent.com"
                  value={googleClientId}
                  onChange={(e) => setGoogleClientId(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
                  Google Client Secret
                </label>
                <input
                  className={cn(field, "font-mono text-xs")}
                  type="password"
                  placeholder="GOCSPX-xxxxxx"
                  value={googleClientSecret}
                  onChange={(e) => setGoogleClientSecret(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" onClick={onSaveGoogleConfig} loading={googleConfigBusy}>
                <Save className="h-3.5 w-3.5" /> Save Google Credentials
              </Button>
            </div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold",
              mailSettings.smtpHost || gmailStatus.connected
                ? "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                : "border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)]"
            )}
          >
            {mailSettings.smtpHost || gmailStatus.connected ? <PlugZap className="h-3 w-3" /> : <Unplug className="h-3 w-3" />}
            {mailSettings.smtpHost || gmailStatus.connected ? "Email connected" : "Not connected"}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold",
              gmailStatus.connected
                ? "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                : "border-[var(--line)] bg-white/[0.03] text-dim"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                gmailStatus.connected ? "bg-[var(--chartreuse)]" : "bg-dim"
              )}
            />
            Gmail · {gmailStatus.connected ? `Connected as ${gmailStatus.email}` : "Not connected"}
          </span>
          {gmailStatus.connected ? (
            <Button size="sm" variant="outline" onClick={onGmailDisconnect} loading={gmailBusy}>
              <Unplug className="h-3.5 w-3.5" /> Disconnect
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                if (!googleClientStatus.configured && !gmailStatus.clientConfigured) {
                  setGoogleConfigOpen(true);
                  error("Please enter your Google Client ID & Secret first or set them in .env.local.");
                  return;
                }
                // OAuth needs a full document navigation so the API route can
                // redirect the browser to Google's external consent screen.
                window.location.assign(new URL("/api/auth/gmail/authorize", window.location.origin));
              }}
            >
              <PlugZap className="h-3.5 w-3.5" /> Connect with Google OAuth
            </Button>
          )}
          {mailResult === "ok" && <span className="text-[11px] font-bold text-[var(--chartreuse)]">✓ Connection verified</span>}
          {mailResult === "failed" && <span className="text-[11px] font-bold text-[var(--coral)]">✕ Connection failed</span>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--line)]/50 bg-white/[0.02] p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
              IMAP — receive · app password (fallback)
              <SettingHelper label="IMAP fallback" text="Manual receive path used only when Gmail OAuth isn't connected. Needs a Google app password, not your login password." />
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input
                className={field}
                aria-label="IMAP host"
                placeholder="imap.gmail.com"
                value={mailForm.imapHost}
                onChange={(e) => setMailForm({ ...mailForm, imapHost: e.target.value })}
              />
              <input
                className={field}
                aria-label="IMAP port"
                placeholder="993"
                type="number"
                value={mailForm.imapPort}
                onChange={(e) => setMailForm({ ...mailForm, imapPort: Number(e.target.value) || 993 })}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                className={field}
                aria-label="IMAP user"
                placeholder="you@gmail.com"
                value={mailForm.imapUser}
                onChange={(e) => setMailForm({ ...mailForm, imapUser: e.target.value })}
              />
              <input
                className={field}
                aria-label="IMAP app password"
                placeholder="app password"
                type="password"
                value={mailForm.imapPass}
                onChange={(e) => setMailForm({ ...mailForm, imapPass: e.target.value })}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[var(--line)]/50 bg-white/[0.02] p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
              SMTP — send · app password (fallback)
              <SettingHelper label="SMTP fallback" text="Manual send path used only when Gmail OAuth isn't connected. Test & save verifies both IMAP and SMTP respond." />
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input
                className={field}
                aria-label="SMTP host"
                placeholder="smtp.gmail.com"
                value={mailForm.smtpHost}
                onChange={(e) => setMailForm({ ...mailForm, smtpHost: e.target.value })}
              />
              <input
                className={field}
                aria-label="SMTP port"
                placeholder="587"
                type="number"
                value={mailForm.smtpPort}
                onChange={(e) => setMailForm({ ...mailForm, smtpPort: Number(e.target.value) || 587 })}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                className={field}
                aria-label="SMTP user"
                placeholder="you@gmail.com"
                value={mailForm.smtpUser}
                onChange={(e) => setMailForm({ ...mailForm, smtpUser: e.target.value })}
              />
              <input
                className={field}
                aria-label="SMTP app password"
                placeholder="app password"
                type="password"
                value={mailForm.smtpPass}
                onChange={(e) => setMailForm({ ...mailForm, smtpPass: e.target.value })}
              />
            </div>
          </div>

          <div className="sm:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              className={field}
              aria-label="From name"
              placeholder="From name"
              value={mailForm.fromName}
              onChange={(e) => setMailForm({ ...mailForm, fromName: e.target.value })}
            />
            <input
              className={field}
              aria-label="From email"
              placeholder="From email"
              value={mailForm.fromEmail}
              onChange={(e) => setMailForm({ ...mailForm, fromEmail: e.target.value })}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            loading={testingMail}
            disabled={!mailForm.smtpHost && !mailForm.imapHost}
            onClick={async () => {
              setTestingMail(true);
              setMailResult("untested");
              try {
                saveMailSettings(mailForm);
                const res = await fetch("/api/mail/test", { method: "POST" });
                const data = await res.json();
                if (!res.ok) {
                  throw new Error(typeof data.error === 'object' ? JSON.stringify(data.error) : data.error || `HTTP ${res.status}`);
                } else {
                  setMailResult("ok");
                  success("Email connection verified — IMAP + SMTP both respond.");
                }
              } catch (e) {
                setMailResult("failed");
                error(e instanceof Error ? e.message : "Connection test failed.");
              } finally {
                setTestingMail(false);
              }
            }}
          >
            <PlugZap className="h-3.5 w-3.5" /> Test & save connection
          </Button>
          {mailSettings.smtpHost && (
            <span className="text-[10px] text-dim">
              Last saved: {mailSettings.smtpUser || "—"} · Password stored locally in the HUNTFLOW database.
            </span>
          )}
        </div>
      </section>

      {/* Backup & restore */}
      {activeTab === "data" && (
      <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--line)]/70 bg-white/[0.02] p-5 sm:p-6">
        <SectionHeading
          icon={Download}
          accent="text-[var(--chartreuse)]"
          title="Backup & Restore"
          helper="Export downloads one JSON file with everything (jobs, contacts, emails, interviews, reminders, memories, vault, settings, usage). Restore replaces the whole workspace from such a file — export first."
          helperLabel="Backup and restore"
        />
        <p className="mb-4 mt-1 text-xs leading-relaxed text-dim">
          Download a full JSON snapshot (jobs, contacts, emails, interviews, reminders, memories, vault, settings,
          usage) or restore one. Restoring replaces everything and re-seeds after import.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={exportBackup}
            disabled={backupBusy}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 px-4 py-2 text-xs font-bold text-[var(--chartreuse)] transition-all active:scale-[0.97] hover:bg-[var(--chartreuse)]/20 disabled:opacity-50"
          >
            {backupBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export backup
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={restoreBusy}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-white/[0.03] px-4 py-2 text-xs font-bold text-[var(--paper)] transition-all active:scale-[0.97] hover:bg-white/[0.06] disabled:opacity-50"
          >
            {restoreBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {restoreBusy ? "Restoring…" : "Restore from backup"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onRestoreFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-[var(--coral)]/25 bg-[var(--coral)]/[0.04] p-5 sm:p-6">
        <SectionHeading
          icon={Trash2}
          accent="text-[var(--coral)]"
          title="Danger Zone"
          helper="Wipes the database and local cache, then reloads with a fresh register. Profile and insights reset too; provider keys are never touched. The first click only arms — the second confirms."
          helperLabel="Danger zone"
        />
        <p className="mb-4 mt-1 text-xs leading-relaxed text-dim">
          Wipes the database (jobs, contacts, emails, interviews, reminders) and re-seeds your application register.
          Profile and insights are reset too; your AI engine key stays untouched.
        </p>
        <button
          onClick={resetAllData}
          className={cn(
            "rounded-lg border px-4 py-2 text-xs font-bold transition-all active:scale-[0.97]",
            armReset
              ? "border-[var(--coral)] bg-[var(--coral)] text-ink"
              : "border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)] hover:bg-[var(--coral)]/20"
          )}
        >
          {armReset ? "Click again to confirm — this wipes everything" : "Reset all data"}
        </button>
      </section>
      </div>
      )}

      {/* Guided tutorial */}
      {activeTab === "guide" && (
      <div className="space-y-6">
        <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70">
          <div className="border-b border-[var(--line)] bg-white/[0.02] px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
                Step {Math.min(guideStep, GUIDE_STEPS.length - 1) + 1} of {GUIDE_STEPS.length}
              </p>
              <div className="flex gap-1" aria-hidden="true">
                {GUIDE_STEPS.map((step, i) => (
                  <span
                    key={step.title}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === guideStep ? "w-6 bg-[var(--chartreuse)]" : i < guideStep ? "w-3 bg-[var(--chartreuse)]/50" : "w-3 bg-white/10"
                    )}
                  />
                ))}
              </div>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-[var(--chartreuse)] transition-all"
                style={{ width: `${((Math.min(guideStep, GUIDE_STEPS.length - 1) + 1) / GUIDE_STEPS.length) * 100}%` }}
              />
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]">
                <GuideIcon className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold text-[var(--paper)]">{guide.title}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-dim">{guide.body}</p>
                <Link
                  href={guide.href}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 px-3.5 py-2 text-xs font-bold text-[var(--chartreuse)] transition-colors hover:bg-[var(--chartreuse)]/20"
                >
                  {guide.cta} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setGuideStep((s) => Math.max(0, s - 1))}
                disabled={guideStep === 0}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
              <Button
                size="sm"
                onClick={() => setGuideStep((s) => Math.min(GUIDE_STEPS.length - 1, s + 1))}
                disabled={guideStep === GUIDE_STEPS.length - 1}
              >
                Next <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="All workflow steps">
          {GUIDE_STEPS.map((step, i) => {
            const Icon = step.icon;
            const current = i === guideStep;
            return (
              <button
                key={step.title}
                type="button"
                onClick={() => setGuideStep(i)}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chartreuse)]/60",
                  current
                    ? "border-[var(--chartreuse)]/50 bg-[var(--chartreuse)]/[0.07]"
                    : "border-[var(--line)] bg-white/[0.02] hover:border-[var(--line)] hover:bg-white/[0.04]"
                )}
              >
                <span className="flex items-center gap-2.5">
                  <span className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                    current ? "bg-[var(--chartreuse)]/15 text-[var(--chartreuse)]" : "bg-white/[0.04] text-dim"
                  )}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-bold text-[var(--paper)]">
                    <span className="mr-1.5 font-mono text-[10px] text-dim">{i + 1}</span>
                    {step.title}
                  </span>
                  {current && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-[var(--chartreuse)]" aria-hidden="true" />}
                </span>
                <span className="mt-2 block text-[11px] leading-relaxed text-dim">{step.body}</span>
              </button>
            );
          })}
        </section>
      </div>
      )}

      {/* FAQ */}
      {activeTab === "faq" && (
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5 sm:p-6" aria-label="Frequently asked questions">
        <SectionHeading
          icon={BookOpen}
          accent="text-[var(--amber)]"
          title="Frequently asked questions"
          helper="Short answers to the setup questions that come up most. Each one points at the tab that fixes it."
          helperLabel="Frequently asked questions"
        />
        <div className="mt-4 space-y-2">
          {FAQS.map((faq, i) => {
            const open = openFaq === i;
            return (
              <div
                key={faq.q}
                className={cn(
                  "overflow-hidden rounded-xl border transition-colors",
                  open ? "border-[var(--chartreuse)]/30 bg-white/[0.03]" : "border-[var(--line)] bg-white/[0.015]"
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(open ? null : i)}
                  aria-expanded={open}
                  aria-controls={`faq-panel-${i}`}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chartreuse)]/60"
                >
                  <span className={cn("font-mono text-[10px]", open ? "text-[var(--chartreuse)]" : "text-dim")}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 text-xs font-semibold text-[var(--paper)]">{faq.q}</span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-dim transition-transform", open && "rotate-180 text-[var(--chartreuse)]")} aria-hidden="true" />
                </button>
                {open && (
                  <div id={`faq-panel-${i}`} className="px-4 pb-4">
                    <p className="max-w-3xl text-xs leading-relaxed text-dim">{faq.a}</p>
                    {faq.action && (
                      <button
                        type="button"
                        onClick={() => setActiveTab(faq.action!.tab)}
                        className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--chartreuse)] hover:underline"
                      >
                        {faq.action.label} <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      )}
      </div>
    </div>
  );
}

interface ProviderTestStatus {
  testing?: boolean;
  ok?: boolean;
  latency?: number;
  attempts?: number;
  error?: string;
}

const iconBtn =
  "rounded-md border border-[var(--line)]/60 p-1 text-dim transition-colors hover:border-[var(--line)] hover:text-[var(--paper)] disabled:opacity-30 disabled:hover:border-[var(--line)]/60 disabled:hover:text-dim";

const miniField =
  "rounded-lg border border-[var(--line)] bg-[var(--ink-card)] px-2.5 py-1.5 text-[11px] text-[var(--paper)] outline-none placeholder:text-dim/60 focus:border-[var(--chartreuse)]/50";

function StatusCard({
  icon: Icon,
  label,
  value,
  tone,
  onOpen,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: "ok" | "warn" | "bad" | "idle";
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group min-w-0 rounded-xl border border-[var(--line)] bg-[var(--ink-card)]/70 px-3 py-2.5 text-left transition-colors hover:border-[var(--chartreuse)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chartreuse)]/60"
    >
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" /> {label}
      </span>
      <span className="mt-1 flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            tone === "ok" ? "bg-[var(--chartreuse)]" : tone === "warn" ? "bg-[var(--amber)]" : tone === "bad" ? "bg-[var(--coral)]" : "bg-dim"
          )}
        />
        <span className="truncate text-[11px] font-semibold text-[var(--paper)]">{value}</span>
      </span>
    </button>
  );
}

function SectionHeading({
  icon: Icon,
  accent,
  title,
  helper,
  helperLabel,
  right,
}: {
  icon: LucideIcon;
  accent: string;
  title: string;
  helper: string;
  helperLabel: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex min-w-0 items-center gap-2 font-display text-sm font-semibold text-[var(--paper)]">
        <Icon className={cn("h-4 w-4 shrink-0", accent)} aria-hidden="true" />
        <span className="truncate">{title}</span>
        <SettingHelper label={helperLabel} text={helper} />
      </h2>
      {right}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: LucideIcon }[];
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const Icon = option.icon;
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chartreuse)]/60",
              selected
                ? "border-[var(--chartreuse)]/50 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                : "border-[var(--line)] bg-white/[0.02] text-dim hover:text-[var(--paper)]"
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function TabGuide({ data }: { data: TabGuideData }) {
  return (
    <aside className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display text-xs font-semibold text-[var(--paper)]">
          <Sparkles className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> {data.heading}
        </p>
        {data.cta && (
          <Link
            href={data.cta.href}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--chartreuse)] transition-colors hover:text-[var(--paper)] hover:underline"
          >
            {data.cta.label} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-[11px] leading-relaxed md:grid-cols-3">
        {data.points.map((point) => (
          <div key={point.label}>
            <dt className="font-semibold uppercase tracking-[0.1em] text-dim">{point.label}</dt>
            <dd className="mt-1 text-[var(--paper)]/85">{point.body}</dd>
          </div>
        ))}
        <div>
          <dt className="font-semibold uppercase tracking-[0.1em] text-dim">What to do next</dt>
          <dd className="mt-1 text-[var(--paper)]/85">{data.next}</dd>
        </div>
      </dl>
    </aside>
  );
}

function ProviderRow({
  provider: p,
  index,
  total,
  status,
  onPatch,
  onMove,
  onRemove,
  onToggle,
  onTest,
  models,
  importingModels,
  modelImportError,
  onImportModels,
}: {
  provider: LLMProvider;
  index: number;
  total: number;
  status?: ProviderTestStatus;
  onPatch: (patch: Partial<LLMProvider>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onToggle: () => void;
  onTest: () => void;
  models?: string[];
  importingModels: boolean;
  modelImportError?: string;
  onImportModels: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-opacity",
        p.enabled ? "border-[var(--line)] bg-white/[0.02]" : "border-[var(--line)]/40 bg-white/[0.01] opacity-60"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--line)] font-mono text-[10px] text-dim">
          {index + 1}
        </span>
        <p className="text-xs font-bold text-[var(--paper)]">{p.label}</p>
        <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-wider text-dim">
          {p.kind ?? "openai"}
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[9px] font-bold",
            p.enabled
              ? "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
              : "border-[var(--line)] text-dim"
          )}
        >
          {p.enabled ? "active" : "off"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button title="Move up" disabled={index === 0} onClick={() => onMove(-1)} className={iconBtn}>
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button title="Move down" disabled={index === total - 1} onClick={() => onMove(1)} className={iconBtn}>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button title={p.enabled ? "Disable" : "Enable"} onClick={onToggle} className={iconBtn}>
            <Power className={cn("h-3.5 w-3.5", p.enabled && "text-[var(--chartreuse)]")} />
          </button>
          <button title="Remove" onClick={onRemove} className={iconBtn}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1.4fr_1.6fr_auto]">
        <div className="min-w-0">
          {models?.length ? (
            <Select
              value={p.model}
              onChange={(model) => onPatch({ model })}
              options={[...new Set([p.model, ...models])].filter(Boolean).map((model) => ({ value: model, label: model }))}
              placeholder="Choose a model"
              ariaLabel={`${p.label} model`}
              className="w-full"
            />
          ) : (
            <input
              className={cn(miniField, "w-full")}
              value={p.model}
              placeholder="model id"
              title="Model"
              onChange={(e) => onPatch({ model: e.target.value })}
            />
          )}
          <button
            type="button"
            onClick={onImportModels}
            disabled={importingModels}
            className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--sky)] transition-colors hover:text-[var(--paper)] disabled:opacity-50"
          >
            {importingModels ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            {importingModels ? "Importing models…" : models?.length ? `${models.length} imported · refresh` : "Import provider models"}
          </button>
          {modelImportError && <p className="mt-1 truncate text-[10px] text-[var(--coral)]">{modelImportError}</p>}
        </div>
        <input
          className={miniField}
          type="password"
          value={p.apiKey}
          placeholder={p.baseURL?.includes("localhost") || p.baseURL?.includes("127.0.0.1") ? "key optional (local)" : "sk-…"}
          title="API key"
          onChange={(e) => onPatch({ apiKey: e.target.value })}
        />
        <input
          className={miniField}
          value={p.baseURL || ""}
          placeholder={p.baseURL?.includes("localhost") || p.baseURL?.includes("127.0.0.1") ? "http://localhost:11434/v1" : "https://api…/v1"}
          title="Base URL"
          onChange={(e) => onPatch({ baseURL: e.target.value })}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={onTest}
            disabled={status?.testing}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 px-2.5 py-1.5 text-[10px] font-bold text-[var(--chartreuse)] transition-colors hover:bg-[var(--chartreuse)]/20 disabled:opacity-50"
          >
            {status?.testing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <PlugZap className="h-3 w-3" />}
            Test
          </button>
          <div className="min-w-0 flex-1 truncate text-[10px] text-dim">
            {status?.testing ? (
              "pinging…"
            ) : status?.ok ? (
              <span className="text-[var(--chartreuse)]" title="PER_PROVIDER_ATTEMPTS=3 · 429/408 jitter 1s*2^n">
                ok · {status.latency ?? "?"}ms{status.attempts !== undefined ? ` · ${status.attempts} attempt${status.attempts === 1 ? "" : "s"}` : ""}
              </span>
            ) : status?.error ? (
              <span className="text-[var(--coral)]">{status.error}</span>
            ) : (
              "untested"
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
