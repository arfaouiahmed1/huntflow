"use client";
import Select from "@/components/ui/Select";

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
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { LLM_PROVIDERS, LLMProvider } from "@/lib/llm/providers";
import { MailSettings, CloudinarySettings } from "@/types";
import { cn } from "@/lib/utils";
import { CloudinarySettingsSchema } from "@/lib/validation";
import { isMasked } from "@/lib/masking";
import { toErrorMessage } from "@/lib/errors";
import type { LinkedInLoginResult } from "@/context/AppContext";

export default function SettingsPage() {
  const {
    providers,
    updateProviders,
    checkLinkedInSession,
    openLinkedInLogin,
    logoutLinkedIn,
    mailSettings,
    saveMailSettings,
    cloudinarySettings,
    saveCloudinarySettings,
    refreshData,
  } = useApp();
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
  }, [error, success]);

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

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--chartreuse)]">
          /settings
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--paper)]">Settings</h1>
        <p className="mt-1 text-sm text-dim">
          Configure providers, integrations, automation services, and local data controls.
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
          <Select
            value={addId}
            onChange={(id) => {
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
                    apiKey: '',
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
              ...LLM_PROVIDERS.filter((c) => !chain.some((p) => p.id === c.id)).map((c) => ({ value: c.id, label: c.label })),
            ]}
            placeholder="Add a provider…"
            ariaLabel="Add a provider"
            className="w-48"
          />
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

        <p className="mt-4 text-[10px] leading-relaxed text-dim">
          Account connection belongs here. Profile facts and imported career evidence belong in Profile &amp; Evidence Vault.
        </p>
      </section>

      {/* Cloudinary & Parallelism */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-[var(--paper)]">
            <ImageIcon className="h-4 w-4 text-[var(--chartreuse)]" /> Cloudinary Streaming & Parallel Crawler
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sky)]/40 bg-[var(--sky)]/10 px-2.5 py-0.5 text-[10px] font-bold text-[var(--sky)]">
            <Camera className="h-3 w-3" /> Live Visual Feeds
          </span>
        </div>
        <p className="mb-2 text-xs leading-relaxed text-dim">
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

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-[var(--line)] bg-[#0d0f14]/50 p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-[var(--chartreuse)]" />
              <p className="text-xs font-semibold text-[var(--paper)]">Crawler Concurrency Pool</p>
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

        <div className="mt-4 flex items-center justify-end gap-3">
          <Button size="sm" variant="outline" onClick={onTestCloudinary} loading={testingCloud}>
            <PlugZap className="h-3.5 w-3.5" /> Test & Sync to Agent
          </Button>
          <Button size="sm" onClick={onSaveCloudinary} loading={savingCloud}>
            <Save className="h-3.5 w-3.5" /> Save Media & Concurrency
          </Button>
        </div>
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
