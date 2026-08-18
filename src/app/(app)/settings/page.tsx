"use client";

import { useState, useEffect, useRef } from "react";
import {
  Save,
  User,
  Briefcase,
  GraduationCap,
  Trash2,
  Plus,
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
  ExternalLink,
  ShieldCheck,
  HelpCircle,
  Copy,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { LLM_PROVIDERS, LLMProvider } from "@/lib/llm/providers";
import { UserProfile, WorkExperience, Education, MailSettings } from "@/types";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const {
    profile,
    updateProfile,
    providers,
    updateProviders,
    checkLinkedInSession,
    openLinkedInLogin,
    logoutLinkedIn,
    importLinkedInProfile,
    mailSettings,
    saveMailSettings,
  } = useApp();
  const { success, error } = useToast();
  const [form, setForm] = useState({ ...profile });
  const [saved, setSaved] = useState(false);
  const [liStatus, setLiStatus] = useState<"checking" | "signed-in" | "signed-out">("checking");
  const [liBusy, setLiBusy] = useState(false);
  const [liHandle, setLiHandle] = useState("");
  const [liCookie, setLiCookie] = useState("");
  const [liCookieOpen, setLiCookieOpen] = useState(false);
  const [liCookieBusy, setLiCookieBusy] = useState(false);
  const [armReset, setArmReset] = useState(false);
  const [mailForm, setMailForm] = useState<MailSettings>({ ...mailSettings });
  const [testingMail, setTestingMail] = useState(false);
  const [mailResult, setMailResult] = useState<"untested" | "ok" | "failed">("untested");
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
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const chain = providers;

  const resetAllData = async () => {
    if (!armReset) {
      setArmReset(true);
      setTimeout(() => setArmReset(false), 4000);
      return;
    }
    try {
      const res = await fetch("/api/data/reset", { method: "POST" });
      if (!res.ok) throw new Error("DB reset failed");
    } catch {
      /* still wipe the browser cache below */
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === 'object' ? JSON.stringify(data.error) : data.error || `HTTP ${res.status}`);
      setTestResults((r) => ({ ...r, [p.id]: { ok: true, latency: (data as { latencyMs?: number }).latencyMs } }));
      success(`Connected — ${(data as { model?: string }).model ?? p.label}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : (typeof err === "object" && err !== null ? JSON.stringify(err) : String(err));
      setTestResults((r) => ({ ...r, [p.id]: { ok: false, error: errMsg } }));
      error(`Test failed — ${errMsg}`);
    }
  };

  const refreshLiStatus = async () => {
    setLiStatus("checking");
    try {
      const ok = await checkLinkedInSession();
      setLiStatus(ok ? "signed-in" : "signed-out");
    } catch {
      setLiStatus("signed-out");
    }
  };

  useEffect(() => {
    refreshLiStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshGmailStatus = async () => {
    try {
      const res = await fetch("/api/auth/gmail/status", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { connected: boolean; email?: string; expiry?: number };
        setGmailStatus(data);
      } else {
        setGmailStatus({ connected: false });
      }
    } catch {
      setGmailStatus({ connected: false });
    }
  };

  const onGmailDisconnect = async () => {
    setGmailBusy(true);
    try {
      await fetch("/api/auth/gmail/revoke", { method: "POST" });
      setGmailStatus({ connected: false });
      success("Gmail disconnected — mail falls back to app-password settings.");
    } catch {
      error("Failed to disconnect Gmail.");
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
      }
    } catch {}
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
      const data = await res.json();
      if (data.authenticated) {
        setLiStatus("signed-in");
        setLiCookie("");
        setLiCookieOpen(false);
        success("LinkedIn session verified and saved successfully!");
        if (liHandle.trim()) {
          onImportProfile();
        }
      } else {
        error(data.error || "LinkedIn session cookie could not be verified. Ensure your cookie is active.");
      }
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : "LinkedIn cookie login failed");
    } finally {
      setLiCookieBusy(false);
    }
  };

  /* Gmail OAuth: reflect connect/disconnect (and the /settings?gmail=… redirect) into the UI. */
  useEffect(() => {
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
    refreshGmailStatus();
    refreshGoogleConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      success(
        `Restored — ${counts.jobs ?? 0} jobs, ${counts.contacts ?? 0} contacts, ${counts.vaultDocs ?? 0} vault docs`
      );
      window.location.reload();
    } catch (e) {
      error(e instanceof Error ? e.message : "Restore failed.");
      setRestoreBusy(false);
    }
  };

  const onLinkedInLogin = async () => {
    setLiBusy(true);
    try {
      const { authenticated, profile: li, checkpoint } = await openLinkedInLogin();
      setLiStatus(authenticated ? "signed-in" : "signed-out");
      if (checkpoint && !authenticated) {
        error("Finish verification in the browser window, then press Refresh");
        return;
      }
      if (authenticated && li) {
        setForm((f) => ({
          ...f,
          name: li.name || f.name,
          location: li.location || f.location,
          summary: li.about || f.summary,
          skills: li.skills?.length ? li.skills : f.skills,
          experience: li.experience?.map((exp, i) => ({
            id: "exp-" + Date.now() + "-" + i,
            company: exp.company || "",
            role: exp.role || "",
            duration: exp.duration || "",
            bulletPoints: exp.details || [],
          })) || f.experience,
          education: li.education?.map((edu, i) => ({
            id: "edu-" + Date.now() + "-" + i,
            degree: edu.degree || "",
            school: edu.school || "",
            year: "",
          })) || f.education,
        }));
        const handle = liHandle.trim();
        if (handle) {
          fetch("/api/data/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ linkedin_handle: handle }),
          }).catch(() => undefined);
        }
        success(`Signed in — imported ${li.name || "profile"} for review.`);
      } else if (authenticated) {
        success("Signed in to LinkedIn.");
      }
    } catch {
      setLiStatus("signed-out");
    } finally {
      setLiBusy(false);
    }
  };

  const onLinkedInLogout = async () => {
    setLiBusy(true);
    try {
      await logoutLinkedIn();
      setLiStatus("signed-out");
      success("Signed out of LinkedIn.");
    } catch {
      setLiStatus("signed-out");
    } finally {
      setLiBusy(false);
    }
  };

  const onImportProfile = async () => {
    if (!liHandle.trim()) return;
    setLiBusy(true);
    try {
      const li = await importLinkedInProfile(liHandle.trim());
      setForm((f) => ({
        ...f,
        name: li.name || f.name,
        location: li.location || f.location,
        summary: li.about || f.summary,
        skills: li.skills?.length ? li.skills : f.skills,
        experience: li.experience?.map((exp, i) => ({
          id: "exp-" + Date.now() + "-" + i,
          company: exp.company || "",
          role: exp.role || "",
          duration: exp.duration || "",
          bulletPoints: exp.details || [],
        })) || f.experience,
        education: li.education?.map((edu, i) => ({
          id: "edu-" + Date.now() + "-" + i,
          degree: edu.degree || "",
          school: edu.school || "",
          year: "",
        })) || f.education,
      }));
      success(`Imported ${li.name || "profile"} — review and save.`);
    } catch (e) {
      error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setLiBusy(false);
    }
  };

  const field =
    "w-full rounded-xl border border-[var(--line)] bg-white/[0.03] px-3.5 py-2.5 text-sm text-[var(--paper)] outline-none transition-colors placeholder:text-[var(--paper-dim)]/60 focus:border-[var(--chartreuse)]/50";

  const set = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    updateProfile(form);
    setSaved(true);
    success("Profile saved.");
    setTimeout(() => setSaved(false), 1800);
  };

  const updateSkill = (i: number, v: string) => {
    const skills = [...form.skills];
    skills[i] = v;
    set("skills", skills);
  };

  const updateExp = (i: number, key: keyof WorkExperience, v: string) => {
    const exp = form.experience.map((e, idx) => (idx === i ? { ...e, [key]: v } : e));
    set("experience", exp);
  };

  const updateEdu = (i: number, key: keyof Education, v: string) => {
    const edu = form.education.map((e, idx) => (idx === i ? { ...e, [key]: v } : e));
    set("education", edu);
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--chartreuse)]">
          /settings
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--paper)]">Your Profile</h1>
        <p className="mt-1 text-sm text-dim">
          This powers match scoring, document tailoring, and the auto-apply agent.
        </p>
      </div>

      {/* LLM Engine */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-display text-sm font-semibold text-[var(--paper)]">
          <Cpu className="h-4 w-4 text-[var(--chartreuse)]" /> AI Engine
        </h2>
        <p className="mb-4 text-xs leading-relaxed text-dim">
          Add providers as a fallback chain. Every request tries them top-to-bottom and hops on
          failure (rate limits, outages, bad JSON). Keys stay in your local database. The first
          enabled provider also powers the legacy single-provider features.
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
            />
          ))}
        </div>

        {/* Add provider */}
        <div className="mt-4 flex items-center gap-2">
          <select
            value={addId}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              const cfg = LLM_PROVIDERS.find((c) => c.id === id);
              if (cfg && !chain.some((c) => c.id === id)) {
                updateProviders([
                  ...chain,
                  {
                    id: cfg.id,
                    label: cfg.label,
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
            className="rounded-lg border border-[var(--line)] bg-[var(--ink-card)] px-3 py-1.5 text-[11px] text-[var(--paper)] outline-none"
          >
            <option value="">Add a provider…</option>
            {LLM_PROVIDERS.filter((c) => !chain.some((p) => p.id === c.id)).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-dim">{chain.filter((c) => c.enabled).length} active · {chain.length} total</span>
        </div>
      </section>

      {/* LinkedIn */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-display text-sm font-semibold text-[var(--paper)]">
          <Link2 className="h-4 w-4 text-[var(--chartreuse)]" /> LinkedIn
        </h2>
        <p className="mb-4 text-xs leading-relaxed text-dim">
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
                  : "border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)]"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                liStatus === "signed-in" ? "bg-[var(--chartreuse)]" : liStatus === "checking" ? "bg-dim" : "bg-[var(--coral)]"
              )}
            />
            {liStatus === "signed-in" ? "Connected" : liStatus === "checking" ? "Checking session…" : "Not signed in"}
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

        {liCookieOpen && liStatus !== "signed-in" && (
          <div className="mt-4 rounded-xl border border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--paper)] flex items-center gap-1.5">
                <Cookie className="h-3.5 w-3.5 text-[var(--chartreuse)]" /> LinkedIn Session Cookie (<code className="font-mono text-[11px] text-[var(--chartreuse)]">li_at</code>)
              </p>
              <span className="text-[10px] text-dim">100% Reliable Local Session</span>
            </div>
            <p className="text-[11px] text-dim leading-relaxed">
              Open linkedin.com in your browser, press F12 → Application → Cookies → copy the value of <code className="font-mono text-[var(--paper)]">li_at</code> and paste it below:
            </p>
            <div className="flex gap-2">
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

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex-1">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
              Profile handle (auto-imported after sign-in)
            </label>
            <input
              className={field}
              placeholder="linkedin.com/in/your-handle"
              value={liHandle}
              disabled={liStatus !== "signed-in"}
              onChange={(e) => setLiHandle(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            className="sm:mt-5"
            disabled={liStatus !== "signed-in" || !liHandle.trim()}
            loading={liBusy && liStatus === "signed-in"}
            onClick={onImportProfile}
          >
            <Download className="h-3.5 w-3.5" /> Import profile
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-dim">
          Fills name, headline, location, summary, skills, experience and education into the form below — press Save Profile to keep them.
        </p>
      </section>

      {/* Email */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-[var(--paper)]">
            <Mail className="h-4 w-4 text-[var(--chartreuse)]" /> Email & Gmail Integration
          </h2>
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
            <div className="flex items-center justify-between">
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
                window.location.assign("/api/auth/gmail/authorize");
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
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">IMAP — receive · app password (fallback)</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                className={field}
                placeholder="imap.gmail.com"
                value={mailForm.imapHost}
                onChange={(e) => setMailForm({ ...mailForm, imapHost: e.target.value })}
              />
              <input
                className={field}
                placeholder="993"
                type="number"
                value={mailForm.imapPort}
                onChange={(e) => setMailForm({ ...mailForm, imapPort: Number(e.target.value) || 993 })}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                className={field}
                placeholder="you@gmail.com"
                value={mailForm.imapUser}
                onChange={(e) => setMailForm({ ...mailForm, imapUser: e.target.value })}
              />
              <input
                className={field}
                placeholder="app password"
                type="password"
                value={mailForm.imapPass}
                onChange={(e) => setMailForm({ ...mailForm, imapPass: e.target.value })}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[var(--line)]/50 bg-white/[0.02] p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">SMTP — send · app password (fallback)</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                className={field}
                placeholder="smtp.gmail.com"
                value={mailForm.smtpHost}
                onChange={(e) => setMailForm({ ...mailForm, smtpHost: e.target.value })}
              />
              <input
                className={field}
                placeholder="587"
                type="number"
                value={mailForm.smtpPort}
                onChange={(e) => setMailForm({ ...mailForm, smtpPort: Number(e.target.value) || 587 })}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                className={field}
                placeholder="you@gmail.com"
                value={mailForm.smtpUser}
                onChange={(e) => setMailForm({ ...mailForm, smtpUser: e.target.value })}
              />
              <input
                className={field}
                placeholder="app password"
                type="password"
                value={mailForm.smtpPass}
                onChange={(e) => setMailForm({ ...mailForm, smtpPass: e.target.value })}
              />
            </div>
          </div>

          <div className="sm:col-span-2 grid grid-cols-2 gap-2">
            <input
              className={field}
              placeholder="From name"
              value={mailForm.fromName}
              onChange={(e) => setMailForm({ ...mailForm, fromName: e.target.value })}
            />
            <input
              className={field}
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

      {/* Basics */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold text-[var(--paper)]">
          <User className="h-4 w-4 text-[var(--chartreuse)]" /> Basics
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Full Name</label>
            <input className={field} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Email</label>
            <input className={field} value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Phone</label>
            <input className={field} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Location</label>
            <input className={field} value={form.location} onChange={(e) => set("location", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Target Title</label>
            <input className={field} value={form.targetTitle} onChange={(e) => set("targetTitle", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Professional Summary</label>
            <textarea
              className={field + " min-h-[90px] resize-y"}
              value={form.summary}
              onChange={(e) => set("summary", e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">LinkedIn</label>
            <input className={field} placeholder="linkedin.com/in/…" value={form.linkedin || ""} onChange={(e) => set("linkedin", e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">GitHub</label>
            <input className={field} placeholder="github.com/…" value={form.github || ""} onChange={(e) => set("github", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Portfolio</label>
            <input className={field} placeholder="https://…" value={form.portfolio || ""} onChange={(e) => set("portfolio", e.target.value)} />
          </div>
        </div>
      </section>

      {/* Skills */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold text-[var(--paper)]">
          <Briefcase className="h-4 w-4 text-[var(--chartreuse)]" /> Skills
        </h2>
        <div className="flex flex-wrap gap-2">
          {form.skills.map((s, i) => (
            <div key={i} className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-white/[0.03] pl-3 pr-1.5 py-1">
              <input
                value={s}
                onChange={(e) => updateSkill(i, e.target.value)}
                className="w-24 bg-transparent text-xs font-medium text-[var(--paper)] outline-none"
              />
              <button
                onClick={() => set("skills", form.skills.filter((_, idx) => idx !== i))}
                className="grid h-5 w-5 place-items-center rounded-full text-dim transition-colors hover:bg-[var(--coral)]/20 hover:text-[var(--coral)]"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => set("skills", [...form.skills, ""])}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--line)] px-3 py-1 text-xs font-medium text-dim transition-colors hover:border-[var(--chartreuse)]/40 hover:text-[var(--chartreuse)]"
          >
            <Plus className="h-3 w-3" /> Add skill
          </button>
        </div>
      </section>

      {/* Experience */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold text-[var(--paper)]">
          <Briefcase className="h-4 w-4 text-[var(--chartreuse)]" /> Experience
        </h2>
        <div className="space-y-4">
          {form.experience.map((exp, i) => (
            <div key={exp.id} className="space-y-3 rounded-xl border border-[var(--line)] p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <input className={field} placeholder="Company" value={exp.company} onChange={(e) => updateExp(i, "company", e.target.value)} />
                <input className={field} placeholder="Role" value={exp.role} onChange={(e) => updateExp(i, "role", e.target.value)} />
                <input className={field} placeholder="Duration" value={exp.duration} onChange={(e) => updateExp(i, "duration", e.target.value)} />
              </div>
              {exp.bulletPoints.map((bp, j) => (
                <div key={j} className="flex gap-2">
                  <input
                    className={field}
                    placeholder="Achievement bullet…"
                    value={bp}
                    onChange={(e) => {
                      const bullets = [...exp.bulletPoints];
                      bullets[j] = e.target.value;
                      set("experience", form.experience.map((x, idx) => (idx === i ? { ...x, bulletPoints: bullets } : x)));
                    }}
                  />
                  <button
                    onClick={() => set("experience", form.experience.map((x, idx) => (idx === i ? { ...x, bulletPoints: x.bulletPoints.filter((_, bi) => bi !== j) } : x)))}
                    className="shrink-0 text-dim hover:text-[var(--coral)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => set("experience", form.experience.map((x, idx) => (idx === i ? { ...x, bulletPoints: [...x.bulletPoints, ""] } : x)))}
              >
                <Plus className="h-3.5 w-3.5" /> Add bullet
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              set("experience", [...form.experience, { id: "exp-" + Date.now(), company: "", role: "", duration: "", bulletPoints: [""] }])
            }
          >
            <Plus className="h-3.5 w-3.5" /> Add role
          </Button>
        </div>
      </section>

      {/* Education */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold text-[var(--paper)]">
          <GraduationCap className="h-4 w-4 text-[var(--chartreuse)]" /> Education
        </h2>
        <div className="space-y-3">
          {form.education.map((edu, i) => (
            <div key={edu.id} className="grid gap-3 sm:grid-cols-4">
              <input className={field + " sm:col-span-2"} placeholder="Degree" value={edu.degree} onChange={(e) => updateEdu(i, "degree", e.target.value)} />
              <input className={field} placeholder="School" value={edu.school} onChange={(e) => updateEdu(i, "school", e.target.value)} />
              <input className={field} placeholder="Year" value={edu.year} onChange={(e) => updateEdu(i, "year", e.target.value)} />
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => set("education", [...form.education, { id: "edu-" + Date.now(), degree: "", school: "", year: "" }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add education
          </Button>
        </div>
      </section>

      {/* Backup & restore */}
      <section className="rounded-2xl border border-[var(--line)]/70 bg-white/[0.02] p-6">
        <h2 className="mb-1 flex items-center gap-2 font-display text-sm font-semibold text-[var(--paper)]">
          <Download className="h-4 w-4" /> Backup & Restore
        </h2>
        <p className="mb-4 text-xs leading-relaxed text-dim">
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
      <section className="rounded-2xl border border-[var(--coral)]/25 bg-[var(--coral)]/[0.04] p-6">
        <h2 className="mb-1 flex items-center gap-2 font-display text-sm font-semibold text-[var(--coral)]">
          <Trash2 className="h-4 w-4" /> Danger Zone
        </h2>
        <p className="mb-4 text-xs leading-relaxed text-dim">
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

      <div className="flex justify-end pb-8">
        <Button onClick={save}>
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? "Saved!" : "Save Profile"}
        </Button>
      </div>
    </div>
  );
}

interface ProviderTestStatus {
  testing?: boolean;
  ok?: boolean;
  latency?: number;
  error?: string;
}

const iconBtn =
  "rounded-md border border-[var(--line)]/60 p-1 text-dim transition-colors hover:border-[var(--line)] hover:text-[var(--paper)] disabled:opacity-30 disabled:hover:border-[var(--line)]/60 disabled:hover:text-dim";

const miniField =
  "rounded-lg border border-[var(--line)] bg-[var(--ink-card)] px-2.5 py-1.5 text-[11px] text-[var(--paper)] outline-none placeholder:text-dim/60 focus:border-[var(--chartreuse)]/50";

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
        <input
          className={miniField}
          value={p.model}
          placeholder="model id"
          title="Model"
          onChange={(e) => onPatch({ model: e.target.value })}
        />
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
              <span className="text-[var(--chartreuse)]">ok · {status.latency ?? "?"}ms</span>
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
