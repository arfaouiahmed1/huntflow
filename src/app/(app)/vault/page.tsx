"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  UploadCloud,
  FileText,
  Trash2,
  Search,
  Loader2,
  User,
  Globe,
  ShieldCheck,
  Save,
  Database,
  BrainCircuit,
  GitMerge,
  SearchCheck,
  LockKeyhole,
  ArrowRight,
  Eye,
  X,
  ScanSearch,
  Copy,
  Quote,
  Check,
  Link2,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/ui/Toaster";
import { Button } from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import DateField from "@/components/ui/DateField";
import ProfileCoach from "@/components/ProfileCoach";
import { cn } from "@/lib/utils";

import {
  VaultProfileSchema,
  VaultSearchSchema,
  VaultFileValidation,
  formatZodErrors,
} from "@/lib/validation";

interface VaultDoc {
  id: string;
  filename: string;
  mime: string;
  size: number;
  status: "indexing" | "ready" | "failed";
  embedModel: string;
  chunkCount: number;
  label: string;
  createdAt: string;
}

interface SearchHit {
  docId: string;
  docName: string;
  chunkId: number;
  text: string;
  score: number;
  model: string;
  chunkIndex: number;
  semanticScore: number;
  lexicalScore: number;
  semanticRank?: number;
  lexicalRank?: number;
  matchedTerms: string[];
  strategy: "hybrid" | "vector" | "lexical";
}

interface RetrievalMeta {
  strategy: string;
  searchedChunks: number;
  vectorModels: string[];
}

interface ChunkInspect {
  idx: number;
  content: string;
  tokens: number;
  embedding_len: number;
}

function autoLabel(filename: string): string {
  const name = filename.toLowerCase();
  if (/resume|curriculum/.test(name)) return "resume";
  if (/(^|[^a-z])cv([^a-z]|$)/.test(name)) return "cv";
  if (/mark|grade|transcript|results|score/.test(name)) return "uni_marks";
  if (/paper|essay|thesis|lecture|note|assignment|report|slide/.test(name)) return "uni_paper";
  if (/attestat|certif|diploma|degree/.test(name)) return "attestation";
  if (/\.(jpe?g|png|gif|webp|heic|bmp)$/.test(name) || /photo|picture|scan|passport|id card/.test(name)) return "image";
  return "";
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function ProfileSyncBadge({ saving }: { saving: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold",
        saving
          ? "border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]"
          : "border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
      )}
      aria-live="polite"
    >
      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
      {saving ? "Syncing…" : "Synced with SQLite"}
    </span>
  );
}

export default function VaultPage() {
  const { profile, updateProfile, importLinkedInProfile } = useApp();
  const { success, error, warn } = useToast();
  const [activeTab, setActiveTab] = useState<"info" | "documents">("info");

  // Profile Form State
  const [profileForm, setProfileForm] = useState(profile);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [importingProfile, setImportingProfile] = useState(false);
  const resumeImportRef = useRef<HTMLInputElement>(null);

  // Vault State
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [stats, setStats] = useState({ docs: 0, chunks: 0, bytes: 0 });
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [retrieval, setRetrieval] = useState<RetrievalMeta | null>(null);
  const [searched, setSearched] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Chunk inspector drawer state — per-doc, no full embeddings exposed
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorDoc, setInspectorDoc] = useState<VaultDoc | null>(null);
  const [inspectorChunks, setInspectorChunks] = useState<ChunkInspect[] | null>(null);
  const [inspectorModel, setInspectorModel] = useState("");
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const [copiedChunkId, setCopiedChunkId] = useState<number | null>(null);

  const [assistQuery, setAssistQuery] = useState("");
  const [assistLoading, setAssistLoading] = useState(false);
  const [assistAnswer, setAssistAnswer] = useState("");
  const [assistHits, setAssistHits] = useState<SearchHit[]>([]);
  const [assistSource, setAssistSource] = useState("");
  const [assistError, setAssistError] = useState("");

  const saveProfileInfo = async () => {
    const parsed = VaultProfileSchema.safeParse(profileForm);
    if (!parsed.success) {
      const errMap = formatZodErrors(parsed.error);
      setProfileErrors(errMap);
      error(parsed.error.issues[0]?.message || "Please fix validation errors in your profile.");
      return;
    }
    setProfileErrors({});
    setSavingProfile(true);
    try {
      const res = await fetch("/api/data/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: JSON.stringify(profileForm) }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (typeof data?.error === "string") msg = data.error;
          else if (typeof data?.message === "string") msg = data.message;
        } catch (_parseErr) {
          void _parseErr;
        }
        throw new Error(msg);
      }
      updateProfile(profileForm);
      success("My Info profile updated & synchronized with SQLite!");
    } catch (e) {
      error(e instanceof Error ? e.message : "Failed to save profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const loadDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/vault");
      const data = await res.json();
      if (res.ok) {
        setDocs(data.docs ?? []);
        setStats(data.stats ?? { docs: 0, chunks: 0, bytes: 0 });
      } else {
        error(data?.error || `Vault ${res.status}`);
      }
    } catch (e) {
      error(e instanceof Error ? e.message : "Vault unavailable — check connection.");
    }
  }, [error]);

  useEffect(() => {
    let ignore = false;
    async function init() {
      if (!ignore) await loadDocs();
    }
    init();
    return () => {
      ignore = true;
    };
  }, [loadDocs]);

  useEffect(() => {
    const onVaultRefreshed = (e: Event) => {
      const detail = (e as CustomEvent).detail as { docs?: VaultDoc[]; stats?: { docs: number; chunks: number; bytes: number } } | undefined;
      if (detail?.docs) {
        setDocs(detail.docs);
        if (detail.stats) setStats(detail.stats);
      } else {
        void loadDocs();
      }
    };
    window.addEventListener("huntflow:vault-refreshed", onVaultRefreshed as EventListener);
    return () => window.removeEventListener("huntflow:vault-refreshed", onVaultRefreshed as EventListener);
  }, [loadDocs]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const check = VaultFileValidation.validateFile(file);
      if (!check.valid) {
        error(check.error || `File ${file.name} is invalid.`);
        return;
      }
    }

    setBusy(true);
    let count = 0;
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const resolvedLabel = uploadLabel || autoLabel(file.name);
        if (resolvedLabel) form.append("label", resolvedLabel);
        const res = await fetch("/api/vault", { method: "POST", body: form });
        if (res.ok) count++;
      }
      if (count > 0) {
        success(`Uploaded ${count} document(s) to vault.`);
        loadDocs();
      }
    } catch (e) {
      error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/vault?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        success("Document deleted.");
        loadDocs();
      } else {
        const data = await res.json().catch(() => ({}));
        error((data as { error?: string })?.error || `Delete failed ${res.status}`);
      }
    } catch (err) {
      error(err instanceof Error ? err.message : "Failed to delete document.");
    }
  };

  const handleToggleEmbed = async (doc: VaultDoc) => {
    const nextModel = doc.embedModel === "local" ? "openai|text-embedding-3-small" : "local";
    try {
      const res = await fetch("/api/vault", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: doc.id, embedModel: nextModel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `toggle failed ${res.status}`);
      success(`Embedding set to ${nextModel} for ${doc.filename}`);
      loadDocs();
    } catch (e) {
      error(e instanceof Error ? e.message : "Failed to update embedding model.");
    }
  };

  const handleSearch = async () => {
    const parsed = VaultSearchSchema.safeParse({ query });
    if (!parsed.success) {
      error(parsed.error.issues[0]?.message || "Search query too short.");
      return;
    }

    setSearching(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/vault/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string })?.error || `Search failed ${res.status}`);
      setHits(data.hits ?? []);
      setRetrieval(data.retrieval ?? null);
    } catch (err) {
      error(err instanceof Error ? err.message : "Vault retrieval failed.");
    } finally {
      setSearching(false);
    }
  };

  const openInspector = async (doc: VaultDoc) => {
    setInspectorDoc(doc);
    setInspectorOpen(true);
    setInspectorChunks(null);
    setInspectorModel(doc.embedModel);
    setInspectorLoading(true);
    try {
      const res = await fetch(`/api/vault/chunks?docId=${encodeURIComponent(doc.id)}`);
      const data = await res.json();
      if (!res.ok) {
        error(data.error || "Failed to load chunks.");
        setInspectorOpen(false);
        return;
      }
      setInspectorChunks((data.chunks ?? []) as ChunkInspect[]);
      setInspectorModel(data.embedModel ?? doc.embedModel);
    } catch (err) {
      error(err instanceof Error ? err.message : "Failed to load chunks.");
      setInspectorOpen(false);
    } finally {
      setInspectorLoading(false);
    }
  };

  const closeInspector = () => {
    setInspectorOpen(false);
  };

  const handleVaultAssist = async () => {
    const q = assistQuery.trim();
    if (!q) {
      error("Enter a question for vault assist.");
      return;
    }
    setAssistLoading(true);
    setAssistError("");
    setAssistAnswer("");
    setAssistHits([]);
    setAssistSource("");
    try {
      const res = await fetch("/api/vault/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, k: 3 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || data?.error || `assist failed ${res.status}`);
      setAssistAnswer((data.answer as string) ?? "");
      setAssistHits((data.hits ?? []) as SearchHit[]);
      setAssistSource((data.source as string) ?? "");
      if ((data.source as string) === "heuristic_fallback") {
        setAssistError("Offline — vault evidence only (heuristic_fallback).");
      }
    } catch (e) {
      setAssistError(e instanceof Error ? e.message : "Vault assist failed.");
    } finally {
      setAssistLoading(false);
    }
  };

  const handleCopyCite = async (hit: SearchHit) => {
    const citation = `${hit.docName}#${hit.chunkIndex} [${hit.model}/${hit.strategy}] — "${hit.text.slice(0, 280).replace(/\s+/g, " ").trim()}" (fused ${hit.score.toFixed(4)} · lexical ${hit.lexicalScore.toFixed(4)} #${hit.lexicalRank ?? "—"} · vector ${hit.semanticScore.toFixed(4)} #${hit.semanticRank ?? "—"})`;
    try {
      await navigator.clipboard.writeText(citation);
      setCopiedChunkId(hit.chunkId);
      success(`Citation copied: ${hit.docName}#${hit.chunkIndex}`);
      window.setTimeout(() => setCopiedChunkId((prev) => (prev === hit.chunkId ? null : prev)), 1800);
    } catch (err) {
      error(err instanceof Error ? err.message : "Clipboard copy failed.");
    }
  };

  useEffect(() => {
    if (!inspectorOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInspectorOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [inspectorOpen]);

  const inputClass =
    "w-full rounded-xl border border-[var(--line)] bg-white/[0.03] px-3.5 py-2.5 text-xs text-[var(--paper)] outline-none transition-colors placeholder:text-[var(--paper-dim)]/60 focus:border-[var(--chartreuse)]/50";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--paper)] flex items-center gap-2">
            <Archive className="h-6 w-6 text-[var(--chartreuse)]" /> Profile & Evidence Vault
          </h1>
          <p className="text-xs text-dim">
            Keep reusable career facts, source documents, and retrieval evidence in one private workspace.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl border border-[var(--line)] bg-white/[0.02] p-1">
          <button
            onClick={() => setActiveTab("info")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all",
              activeTab === "info"
                ? "bg-[var(--chartreuse)] text-ink"
                : "text-dim hover:text-[var(--paper)]"
            )}
          >
            <User className="h-4 w-4" /> Applicant Profile
          </button>
          <button
            onClick={() => setActiveTab("documents")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all",
              activeTab === "documents"
                ? "bg-[var(--chartreuse)] text-ink"
                : "text-dim hover:text-[var(--paper)]"
            )}
          >
            <FileText className="h-4 w-4" /> Evidence Vault ({docs.length})
          </button>
        </div>
      </div>

      {/* Profile coaching is intentionally separated from evidence retrieval. */}
      {activeTab === "info" && <ProfileCoach />}

      {activeTab === "info" ? (
        /* APPLICANT INFO FORM */
        <div className="space-y-6">
          <div className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
              <div>
                <h2 className="text-base font-semibold text-[var(--paper)] flex items-center gap-2">
                  <User className="h-5 w-5 text-[var(--chartreuse)]" /> Personal & Contact Payload
                </h2>
                <p className="text-xs text-dim">
                  Used by Auto-Apply Agent to automatically populate live application form fields.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input ref={resumeImportRef} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setImportingProfile(true);
                  try {
                    const txt = await f.text().catch(async () => {
                      // pdf/docx will be handled server-side via vault upload; fallback to upload then parse
                      const fd = new FormData();
                      fd.append("file", f);
                      fd.append("label", "resume");
                      const up = await fetch("/api/vault", { method: "POST", body: fd });
                      if (!up.ok) throw new Error("Upload failed");
                      const j = await up.json().catch(() => ({}));
                      // try to refetch docs and use first chunk as preview
                      return j?.doc?.filename || f.name;
                    });
                    // heuristic extraction — keeps it local-first without LLM
                    const emailMatch = txt.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
                    const phoneMatch = txt.match(/(\+?\d[\d\s\-.()]{7,}\d)/);
                    const zipMatch = txt.match(/\b\d{4,6}\b/);
                    const patch: Record<string, string> = {};
                    if (emailMatch) patch.email = emailMatch[0];
                    if (phoneMatch) patch.phone = phoneMatch[0].trim().slice(0, 30);
                    if (zipMatch) patch.postalCode = zipMatch[0];
                    // name heuristic: first non-empty line
                    const firstLine = txt.split("\n").map((s: string)=>s.trim()).find(Boolean);
                    if (firstLine && firstLine.length < 60 && !firstLine.includes("@")) patch.name = firstLine;
                    if (Object.keys(patch).length) {
                      setProfileForm((prev) => ({ ...prev, ...patch }));
                      success(`Resume parsed — ${Object.keys(patch).join(", ")} prefilled. Review and save.`);
                    } else {
                      warn("Resume uploaded — no fields auto-detected. Fill ZIP/state manually then save.");
                      // still upload to vault for RAG
                      const fd = new FormData();
                      fd.append("file", f);
                      fd.append("label", "resume");
                      await fetch("/api/vault", { method: "POST", body: fd });
                      loadDocs();
                    }
                  } catch (err) {
                    error(err instanceof Error ? err.message : "Resume import failed");
                  } finally {
                    setImportingProfile(false);
                    if (e.target) e.target.value = "";
                  }
                }} />
                <Button variant="outline" size="sm" loading={importingProfile} onClick={async () => {
                  const handleRaw = profileForm.linkedin || "";
                  let handle = handleRaw.trim();
                  if (!handle) {
                    const input = window.prompt("Paste your LinkedIn profile URL or handle (e.g. https://linkedin.com/in/ahmed-arfaoui or ahmed-arfaoui):");
                    if (!input) return;
                    handle = input.trim();
                  }
                  // extract handle from URL
                  try {
                    const u = new URL(handle);
                    const parts = u.pathname.split("/").filter(Boolean);
                    const idx = parts.indexOf("in");
                    handle = idx >= 0 && parts[idx+1] ? parts[idx+1] : parts[parts.length-1] || handle;
                  } catch { /* not a URL, treat as handle */ handle = handle.split("/").filter(Boolean).pop() || handle; }
                  handle = handle.replace(/^@/, "");
                  if (!handle) { error("Invalid LinkedIn handle"); return; }
                  setImportingProfile(true);
                  try {
                    const data = await importLinkedInProfile(handle);
                    const patch: Record<string, string> = {};
                    if (data.name) patch.name = data.name;
                    if (data.headline) patch.headline = data.headline;
                    // location often contains city + country; split heuristic
                    if (data.location) {
                      const loc = data.location;
                      patch.location = loc;
                      const locParts = loc.split(",").map(s=>s.trim());
                      if (locParts[0]) patch.city = locParts[0];
                      if (locParts[1]) patch.country = locParts[1];
                    }
                    if (data.about) patch.summary = data.about.slice(0, 3000);
                    if (data.skills?.length) patch.skills = data.skills as unknown as string;
                    // experience/education are arrays — show toast but keep form for manual review if large
                    setProfileForm((prev) => ({ ...prev, ...patch } as typeof prev));
                    success(`LinkedIn import — ${data.name || handle} (${data.experience?.length || 0} roles, ${data.skills?.length || 0} skills) prefilled. Review ZIP/state then save.`);
                  } catch (err) {
                    error(err instanceof Error ? err.message : "LinkedIn import failed — check sidecar and handle");
                  } finally { setImportingProfile(false); }
                }}>
                  <Link2 className="h-3.5 w-3.5" /> Import from LinkedIn
                </Button>
                <Button variant="outline" size="sm" loading={importingProfile} onClick={() => resumeImportRef.current?.click()}>
                  <UploadCloud className="h-3.5 w-3.5" /> Import from Resume
                </Button>
                <ProfileSyncBadge saving={savingProfile} />
                <Button onClick={saveProfileInfo} loading={savingProfile} disabled={savingProfile}>
                  <Save className="h-4 w-4" /> Save Profile Info
                </Button>
              </div>
            </div>

            {/* General Info */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium text-dim mb-1 block">Full Name *</label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => {
                    setProfileForm({ ...profileForm, name: e.target.value });
                    if (profileErrors.name) setProfileErrors((p) => ({ ...p, name: "" }));
                  }}
                  className={cn(inputClass, profileErrors.name && "border-[var(--coral)] focus:border-[var(--coral)]")}
                />
                {profileErrors.name && (
                  <p className="mt-1 text-[11px] text-[var(--coral)]">{profileErrors.name}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-dim mb-1 block">Email Address *</label>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => {
                    setProfileForm({ ...profileForm, email: e.target.value });
                    if (profileErrors.email) setProfileErrors((p) => ({ ...p, email: "" }));
                  }}
                  className={cn(inputClass, profileErrors.email && "border-[var(--coral)] focus:border-[var(--coral)]")}
                />
                {profileErrors.email && (
                  <p className="mt-1 text-[11px] text-[var(--coral)]">{profileErrors.email}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-dim mb-1 block">Phone Number</label>
                <input
                  type="text"
                  value={profileForm.phone}
                  onChange={(e) => {
                    setProfileForm({ ...profileForm, phone: e.target.value });
                    if (profileErrors.phone) setProfileErrors((p) => ({ ...p, phone: "" }));
                  }}
                  className={cn(inputClass, profileErrors.phone && "border-[var(--coral)] focus:border-[var(--coral)]")}
                />
                {profileErrors.phone && (
                  <p className="mt-1 text-[11px] text-[var(--coral)]">{profileErrors.phone}</p>
                )}
              </div>
            </div>

            {/* Address — Street, City, State, ZIP, Country (ZIP required for Auto-Apply form fills) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-dim mb-1 block">Street Address</label>
                <input
                  type="text"
                  placeholder="e.g. Avenue Habib Bourguiba"
                  value={profileForm.address || ""}
                  onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-dim mb-1 block">City</label>
                <input
                  type="text"
                  placeholder="e.g. Tunis"
                  value={profileForm.city || ""}
                  onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-dim mb-1 block">State / Governorate</label>
                <input
                  type="text"
                  placeholder="e.g. Tunis"
                  value={profileForm.state || ""}
                  onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <label className="text-xs font-medium text-dim mb-1 block">Postal Code <span className="text-[10px] text-[var(--chartreuse)]">(ZIP)</span></label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 1000"
                  value={profileForm.postalCode || ""}
                  onChange={(e) => setProfileForm({ ...profileForm, postalCode: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-dim mb-1 block">Country</label>
                <input
                  type="text"
                  placeholder="e.g. Tunisia"
                  value={profileForm.country || ""}
                  onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div className="sm:col-span-2 flex items-end">
                <p className="text-[11px] leading-relaxed text-dim">ZIP + State are used by the Auto-Apply agent to fill <span className="text-[var(--paper)]">address / city / zip / country</span> fields on external ATS forms.</p>
              </div>
            </div>

            {/* Social Links */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium text-dim mb-1 block">LinkedIn Profile</label>
                <input
                  type="url"
                  placeholder="https://linkedin.com/in/..."
                  value={profileForm.linkedin || ""}
                  onChange={(e) => {
                    setProfileForm({ ...profileForm, linkedin: e.target.value });
                    if (profileErrors.linkedin) setProfileErrors((p) => ({ ...p, linkedin: "" }));
                  }}
                  className={cn(inputClass, profileErrors.linkedin && "border-[var(--coral)] focus:border-[var(--coral)]")}
                />
                {profileErrors.linkedin && (
                  <p className="mt-1 text-[11px] text-[var(--coral)]">{profileErrors.linkedin}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-dim mb-1 block">GitHub Profile</label>
                <input
                  type="url"
                  placeholder="https://github.com/..."
                  value={profileForm.github || ""}
                  onChange={(e) => {
                    setProfileForm({ ...profileForm, github: e.target.value });
                    if (profileErrors.github) setProfileErrors((p) => ({ ...p, github: "" }));
                  }}
                  className={cn(inputClass, profileErrors.github && "border-[var(--coral)] focus:border-[var(--coral)]")}
                />
                {profileErrors.github && (
                  <p className="mt-1 text-[11px] text-[var(--coral)]">{profileErrors.github}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-dim mb-1 block">Portfolio / Personal Site</label>
                <input
                  type="url"
                  placeholder="https://yourname.dev"
                  value={profileForm.portfolio || ""}
                  onChange={(e) => {
                    setProfileForm({ ...profileForm, portfolio: e.target.value });
                    if (profileErrors.portfolio) setProfileErrors((p) => ({ ...p, portfolio: "" }));
                  }}
                  className={cn(inputClass, profileErrors.portfolio && "border-[var(--coral)] focus:border-[var(--coral)]")}
                />
                {profileErrors.portfolio && (
                  <p className="mt-1 text-[11px] text-[var(--coral)]">{profileErrors.portfolio}</p>
                )}
              </div>
            </div>

            {/* Work & Legal Preferences */}
            <div className="border-t border-[var(--line)] pt-4 space-y-4">
              <h3 className="text-sm font-semibold text-[var(--paper)] flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[var(--chartreuse)]" /> Work Eligibility & Application Preferences
              </h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-dim mb-1 block">Work Permit Status</label>
                  <Select
                    value={profileForm.workPermitStatus}
                    onChange={(v) => setProfileForm({ ...profileForm, workPermitStatus: v })}
                    className="w-full"
                    options={[
                      { value: "authorized", label: "Authorized to work (No sponsorship needed)" },
                      { value: "sponsorship_required", label: "Requires Visa Sponsorship" },
                      { value: "citizen", label: "Citizen / Permanent Resident" },
                      { value: "green_card", label: "Green Card Holder" },
                      { value: "eu_passport", label: "EU Passport Holder" },
                    ]}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-dim mb-1 block">Desired Salary Expectation</label>
                  <input
                    type="text"
                    placeholder="e.g. $90,000 - $120,000 USD"
                    value={profileForm.desiredSalary || ""}
                    onChange={(e) => setProfileForm({ ...profileForm, desiredSalary: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-dim mb-1 block">Notice Period</label>
                  <input
                    type="text"
                    placeholder="e.g. Immediate / 2 Weeks"
                    value={profileForm.noticePeriod || ""}
                    onChange={(e) => setProfileForm({ ...profileForm, noticePeriod: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-dim mb-1 block">Preferred Work Mode</label>
                  <Select
                    value={profileForm.preferredWorkMode}
                    onChange={(v) => setProfileForm({ ...profileForm, preferredWorkMode: v })}
                    className="w-full"
                    options={[
                      { value: "remote", label: "Remote Only" },
                      { value: "hybrid", label: "Hybrid" },
                      { value: "onsite", label: "Onsite" },
                    ]}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-dim mb-1 block">Willingness to Relocate</label>
                  <Select
                    value={profileForm.willingnessToRelocate}
                    onChange={(v) => setProfileForm({ ...profileForm, willingnessToRelocate: v })}
                    className="w-full"
                    options={[
                      { value: "yes", label: "Yes" },
                      { value: "no", label: "No" },
                      { value: "remote_only", label: "Remote Only" },
                    ]}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-dim mb-1 block">Years of Experience</label>
                  <input
                    type="number"
                    value={profileForm.yearsOfExperience || 2}
                    onChange={(e) => setProfileForm({ ...profileForm, yearsOfExperience: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Demographics & Logistics */}
            <div className="border-t border-[var(--line)] pt-4 space-y-4">
              <h3 className="text-sm font-semibold text-[var(--paper)] flex items-center gap-2">
                <Globe className="h-4 w-4 text-[var(--chartreuse)]" /> Demographics & Logistics
              </h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-dim mb-1 block">Date of Birth</label>
                  <DateField
                    value={profileForm.dateOfBirth}
                    onChange={(iso) => setProfileForm({ ...profileForm, dateOfBirth: iso })}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-dim mb-1 block">Nationality</label>
                  <input
                    type="text"
                    placeholder="e.g. Tunisian"
                    value={profileForm.nationality || ""}
                    onChange={(e) => setProfileForm({ ...profileForm, nationality: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-dim mb-1 block">Visa Status</label>
                  <input
                    type="text"
                    placeholder="e.g. H1B, F1 OPT"
                    value={profileForm.visaStatus || ""}
                    onChange={(e) => setProfileForm({ ...profileForm, visaStatus: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-dim mb-1 block">Gender</label>
                  <input
                    type="text"
                    placeholder="e.g. Male, Female, Non-binary"
                    value={profileForm.gender || ""}
                    onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-dim mb-1 block">Veteran Status</label>
                  <input
                    type="text"
                    placeholder="e.g. Non-veteran"
                    value={profileForm.veteranStatus || ""}
                    onChange={(e) => setProfileForm({ ...profileForm, veteranStatus: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-dim mb-1 block">Disability Status</label>
                  <input
                    type="text"
                    placeholder="e.g. None, Prefer not to say"
                    value={profileForm.disabilityStatus || ""}
                    onChange={(e) => setProfileForm({ ...profileForm, disabilityStatus: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-dim mb-1 block">Clearance Level</label>
                  <input
                    type="text"
                    placeholder="e.g. Top Secret, Secret, None"
                    value={profileForm.clearanceLevel || ""}
                    onChange={(e) => setProfileForm({ ...profileForm, clearanceLevel: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-dim mb-1 block">Driver&apos;s License</label>
                  <input
                    type="text"
                    placeholder="e.g. Class C, None"
                    value={profileForm.driversLicense || ""}
                    onChange={(e) => setProfileForm({ ...profileForm, driversLicense: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-dim mb-1 block">Languages Spoken</label>
                  <input
                    type="text"
                    placeholder="e.g. English (Native), Spanish (B2)"
                    value={profileForm.languagesSpoken || ""}
                    onChange={(e) => setProfileForm({ ...profileForm, languagesSpoken: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-dim mb-1 block">Marital Status</label>
                  <input
                    type="text"
                    placeholder="e.g. Single, Married"
                    value={profileForm.maritalStatus || ""}
                    onChange={(e) => setProfileForm({ ...profileForm, maritalStatus: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-dim mb-1 block">Salary Expectations</label>
                  <input
                    type="text"
                    placeholder="e.g. $100k - $120k"
                    value={profileForm.salaryExpectations || ""}
                    onChange={(e) => setProfileForm({ ...profileForm, salaryExpectations: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-dim mb-1 block">Availability</label>
                  <input
                    type="text"
                    placeholder="e.g. Immediate, 2 weeks notice"
                    value={profileForm.availability || ""}
                    onChange={(e) => setProfileForm({ ...profileForm, availability: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="text-xs font-medium text-dim mb-1 block">References</label>
                  <textarea
                    placeholder="e.g. Available upon request..."
                    value={profileForm.references || ""}
                    onChange={(e) => setProfileForm({ ...profileForm, references: e.target.value })}
                    className={cn(inputClass, "min-h-[80px] resize-y")}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <ProfileSyncBadge saving={savingProfile} />
              <Button onClick={saveProfileInfo} loading={savingProfile} disabled={savingProfile}>
                <Save className="h-4 w-4" /> Save Profile Info
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* DOCUMENT VAULT & HYBRID RETRIEVAL */
        <div className="space-y-6">
          <section className="overflow-hidden rounded-2xl border border-[var(--chartreuse)]/20 bg-[linear-gradient(120deg,rgba(185,237,87,0.10),rgba(19,26,35,0.76)_42%,rgba(107,199,255,0.08))] p-5 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--chartreuse)]">
                  <SearchCheck className="h-4 w-4" /> Evidence-grounded RAG
                </div>
                <h2 className="text-xl font-bold text-[var(--paper)]">Find the source before the AI writes the claim.</h2>
                <p className="mt-2 text-sm leading-relaxed text-dim">
                  HUNTFLOW parses your documents, creates overlapping chunks, ranks them with BM25 and vector similarity,
                  then fuses both result lists. Every answer can carry the document, chunk, and retrieval signals that support it.
                </p>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-semibold text-dim" aria-label="Document retrieval pipeline">
                {[
                  [FileText, "Parse"],
                  [Database, "Chunk"],
                  [BrainCircuit, "Embed"],
                  [GitMerge, "Fuse"],
                ].map(([Icon, label], index) => {
                  const StepIcon = Icon as typeof FileText;
                  return (
                    <div key={label as string} className="contents">
                      <div className="flex min-w-16 flex-col items-center gap-1.5 rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2">
                        <StepIcon className="h-4 w-4 text-[var(--chartreuse)]" />
                        <span>{label as string}</span>
                      </div>
                      {index < 3 && <ArrowRight className="h-3.5 w-3.5 text-dim" />}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Stats Bar */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[var(--line)] bg-white/[0.025] p-4">
              <p className="text-xs text-dim">Documents</p>
              <p className="mt-1 text-2xl font-bold text-[var(--paper)]">{stats.docs}</p>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white/[0.025] p-4">
              <p className="text-xs text-dim">Embedded Chunks</p>
              <p className="mt-1 text-2xl font-bold text-[var(--chartreuse)]">{stats.chunks}</p>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white/[0.025] p-4">
              <p className="text-xs text-dim">Total Storage</p>
              <p className="mt-1 text-2xl font-bold text-[var(--sky)]">{fmtBytes(stats.bytes)}</p>
            </div>
          </div>

          {/* Upload Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all",
              dragOver
                ? "border-[var(--chartreuse)] bg-[var(--chartreuse)]/10"
                : "border-[var(--line)] bg-white/[0.01] hover:border-[var(--chartreuse)]/50 hover:bg-white/[0.02]"
            )}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            {busy ? (
              <Loader2 className="h-8 w-8 animate-spin text-[var(--amber)] mb-2" />
            ) : (
              <UploadCloud className="h-8 w-8 text-[var(--chartreuse)] mb-2" />
            )}
            <p className="text-sm font-semibold text-[var(--paper)]">
              Drop resumes, references, transcripts, or certifications here
            </p>
            <p className="text-xs text-dim mt-1">PDF, DOCX, TXT, or Markdown · up to 25 MB</p>
            <p className="mt-3 flex items-center gap-1.5 text-[10px] text-dim">
              <LockKeyhole className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
              Stored in local SQLite. Text is sent externally only when you configure a remote embedding provider.
            </p>
          </div>

          {/* Hybrid Search */}
          <div className="rounded-2xl border border-[var(--line)] bg-white/[0.025] p-4 sm:p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--paper)]">Search your evidence base</h3>
              <p className="mt-1 text-xs text-dim">Hybrid BM25 + vector retrieval with explainable fusion signals.</p>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Where did I use LangGraph in production?"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className={inputClass}
              />
              <Button onClick={handleSearch} loading={searching}>
                <Search className="h-4 w-4" /> Search
              </Button>
            </div>

            {searched && (
              <div className="space-y-2 mt-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-dim">
                  <span>{hits.length} ranked chunk{hits.length === 1 ? "" : "s"}</span>
                  {retrieval && (
                    <span className="rounded-full border border-[var(--line)] bg-black/20 px-2.5 py-1">
                      {retrieval.strategy} · {retrieval.searchedChunks} chunks searched
                    </span>
                  )}
                </div>
                {hits.map((hit, index) => (
                  <article key={hit.chunkId} className="rounded-xl border border-[var(--line)] bg-black/20 p-4 text-xs">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] text-[var(--chartreuse)]">#{index + 1}</span>
                          <span className="font-semibold text-[var(--paper)]">{hit.docName}</span>
                          <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-white/[0.04] px-2 py-0.5 text-[9px] font-medium text-dim">
                            {hit.model}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-[var(--chartreuse)]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--chartreuse)]">
                            {hit.strategy}
                          </span>
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-dim">
                          <span>Chunk {hit.chunkIndex + 1}</span>
                          <span className="opacity-40">·</span>
                          <span className="font-mono text-[10px] text-[var(--paper)]/70">fused {hit.score.toFixed(4)}</span>
                          <span className="hidden items-center gap-1 sm:inline-flex">
                            <Quote className="h-3 w-3 text-dim/60" />
                            <span className="truncate max-w-[220px]">{hit.docName}#{hit.chunkIndex}</span>
                          </span>
                        </p>
                      </div>
                      <button
                        onClick={() => handleCopyCite(hit)}
                        aria-label={`Copy citation for ${hit.docName} chunk ${hit.chunkIndex}`}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                          copiedChunkId === hit.chunkId
                            ? "border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/15 text-[var(--chartreuse)]"
                            : "border-[var(--line)] bg-white/[0.03] text-dim hover:border-[var(--chartreuse)]/40 hover:text-[var(--paper)]"
                        )}
                      >
                        {copiedChunkId === hit.chunkId ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedChunkId === hit.chunkId ? "Copied" : "Cite"}
                      </button>
                    </div>
                    <p className="line-clamp-4 leading-relaxed text-[var(--paper)]/80">{hit.text}</p>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                      <div className="rounded-lg border border-[var(--line)] bg-white/[0.02] px-2.5 py-2">
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-dim">Fused</p>
                        <p className="mt-0.5 font-mono text-[11px] font-bold text-[var(--paper)]">{hit.score.toFixed(4)}</p>
                        <p className="text-[9px] text-dim">RRF + overlap boost</p>
                      </div>
                      <div className="rounded-lg border border-[var(--line)] bg-white/[0.02] px-2.5 py-2">
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-dim">Lexical</p>
                        <p className="mt-0.5 font-mono text-[11px] font-bold text-[var(--paper)]">
                          {hit.lexicalRank ? `#${hit.lexicalRank}` : "—"} <span className="font-normal text-dim">· {hit.lexicalScore.toFixed(4)}</span>
                        </p>
                        <p className="text-[9px] text-dim">BM25 rank · score</p>
                      </div>
                      <div className="rounded-lg border border-[var(--line)] bg-white/[0.02] px-2.5 py-2">
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-dim">Vector</p>
                        <p className="mt-0.5 font-mono text-[11px] font-bold text-[var(--paper)]">
                          {hit.semanticRank ? `#${hit.semanticRank}` : "—"} <span className="font-normal text-dim">· {hit.semanticScore.toFixed(4)}</span>
                        </p>
                        <p className="text-[9px] text-dim">cosine rank · score</p>
                      </div>
                    </div>
                    {hit.matchedTerms.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {hit.matchedTerms.map((term) => (
                          <span key={term} className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[9px] text-dim">{term}</span>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 truncate font-mono text-[9px] text-dim/60">
                      {hit.docName}#{hit.chunkIndex} · {hit.model} · {hit.strategy} · fused {hit.score.toFixed(4)}
                    </p>
                  </article>
                ))}
                {hits.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[var(--line)] p-5 text-center text-xs text-dim">
                    No supporting passage found. Try a concrete skill, employer, project, or outcome.
                  </div>
                )}
              </div>
            )}
          </div>

          <div data-testid="vault-assist-panel" className="rounded-2xl border border-[var(--line)] bg-white/[0.025] p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-[var(--chartreuse)]" />
              <h3 className="text-sm font-semibold text-[var(--paper)]">Vault assist — LLM diffusion</h3>
              <span className="rounded-full border border-[var(--line)] bg-black/20 px-2 py-0.5 text-[10px] text-dim">callLLM + sharedContext v2 + vault hits</span>
            </div>
            <p className="text-xs text-dim">Ask with shared pipeline context and vault evidence. Inline assist, not isolated /api/generate.</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={assistQuery}
                onChange={(e) => setAssistQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleVaultAssist()}
                placeholder="e.g. Summarize my LangGraph production evidence for recruiters"
                className={inputClass}
                data-testid="vault-assist-input"
              />
              <Button onClick={handleVaultAssist} loading={assistLoading} data-testid="vault-assist-button">
                <Search className="h-4 w-4" /> Assist
              </Button>
            </div>
            {(assistAnswer || assistLoading || assistError || assistHits.length > 0) && (
              <div className="rounded-xl border border-[var(--line)] bg-black/20 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Quote className="h-3.5 w-3.5 text-[var(--chartreuse)]" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-dim">Answer</span>
                  {assistSource && <span className="ml-auto rounded-full border border-[var(--line)] bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-dim">{assistSource}</span>}
                </div>
                <p data-testid="vault-assist-answer" className="whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--paper)]/90">
                  {assistLoading ? "…" : assistAnswer}
                </p>
                {assistHits.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {assistHits.map((h) => (
                      <span key={`${h.docName}-${h.chunkIndex}`} className="inline-flex items-center gap-1 rounded-full border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/10 px-2 py-1 text-[10px] font-semibold text-[var(--chartreuse)]">
                        <Quote className="h-3 w-3" />{h.docName}#{h.chunkIndex} · {(h.score * 100).toFixed(0)}% · {h.model}
                      </span>
                    ))}
                  </div>
                )}
                {assistError && <p className="mt-2 text-xs text-[var(--amber)]">{assistError}</p>}
              </div>
            )}
          </div>

          {/* Document List */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--paper)]">Uploaded Documents</h3>
            {docs.length === 0 ? (
              <p className="text-xs text-dim italic">No documents uploaded yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-white/[0.02] p-3.5"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <FileText className="h-5 w-5 text-[var(--chartreuse)] shrink-0" />
                      <div className="truncate">
                        <p className="text-xs font-semibold text-[var(--paper)] truncate">{doc.filename}</p>
                        <p className="text-[10px] text-dim">
                          {fmtBytes(doc.size)} · {doc.chunkCount} chunks · {doc.embedModel}
                        </p>
                        {doc.label && <p className="mt-1 text-[9px] uppercase tracking-wider text-[var(--chartreuse)]">{doc.label}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleEmbed(doc)}
                        aria-label={`Toggle embedding for ${doc.filename}`}
                        title="Per-doc embedding consent: local keeps text on-device; openai sends chunks to embedding provider"
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition-colors",
                          doc.embedModel === "local"
                            ? "border-[var(--line)] bg-white/[0.03] text-dim hover:border-[var(--chartreuse)]/40"
                            : "border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                        )}
                      >
                        {doc.embedModel === "local" ? "local" : "openai"}
                      </button>
                      <button
                        onClick={() => openInspector(doc)}
                        aria-label={`Inspect chunks for ${doc.filename}`}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-dim transition-colors hover:border-[var(--chartreuse)]/40 hover:text-[var(--paper)]"
                        )}
                      >
                        <Eye className="h-3.5 w-3.5" /> Inspect
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        aria-label={`Delete ${doc.filename}`}
                        className="text-dim hover:text-[var(--coral)] transition-colors p-1.5"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {inspectorOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Chunk inspector for ${inspectorDoc?.filename ?? "document"}`}
          className="fixed inset-0 z-50 flex justify-end"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeInspector} />
          <div
            className={cn(
              "relative flex h-full w-full max-w-[720px] flex-col border-l border-[var(--line)] bg-[var(--ink-card)] shadow-2xl",
              "animate-in slide-in-from-right"
            )}
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--paper)]">
                  <ScanSearch className="h-4 w-4 text-[var(--chartreuse)]" /> Chunk inspector
                </h2>
                <p className="mt-0.5 truncate text-[11px] text-dim">
                  {inspectorDoc ? `${inspectorDoc.filename} · ${inspectorModel || inspectorDoc.embedModel} · ${inspectorChunks?.length ?? inspectorDoc.chunkCount} chunks` : "Loading…"}
                </p>
              </div>
              <button
                onClick={closeInspector}
                aria-label="Close inspector"
                className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] bg-white/[0.03] text-dim transition-colors hover:bg-white/5 hover:text-[var(--paper)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {searched && hits.length > 0 && (
              <div className="border-b border-[var(--line)] bg-[var(--chartreuse)]/5 px-5 py-2.5 text-[11px] text-dim">
                <span className="font-semibold text-[var(--paper)]">RRF active</span> — hybrid fusion of BM25 + vector ranks shown per chunk when this document was returned by “{query}”. Lexical/vector ranks are reciprocal-rank-fused; no raw vectors are exposed.
              </div>
            )}

            <div className="flex-1 overflow-auto p-4">
              {inspectorLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-xs text-dim">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--chartreuse)]" />
                  Loading chunks…
                </div>
              ) : !inspectorChunks || inspectorChunks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--line)] p-8 text-center text-xs text-dim">
                  No chunks indexed for this document.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[var(--line)]">
                  <div className="overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-dim">
                        <tr>
                          <th className="px-3 py-2.5 font-semibold">idx</th>
                          <th className="px-3 py-2.5 font-semibold">tokens</th>
                          <th className="px-3 py-2.5 font-semibold">model</th>
                          <th className="px-3 py-2.5 font-semibold">content (≤300)</th>
                          {searched && hits.length > 0 && (
                            <th className="px-3 py-2.5 font-semibold">RRF</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--line)]">
                        {(() => {
                          const hitByIdx = new Map<number, SearchHit>();
                          if (searched && hits.length > 0 && inspectorDoc) {
                            for (const h of hits) {
                              if (h.docId === inspectorDoc.id) hitByIdx.set(h.chunkIndex, h);
                            }
                          }
                          return inspectorChunks.map((chunk) => {
                            const hit = hitByIdx.get(chunk.idx);
                            return (
                              <tr key={chunk.idx} className={cn("align-top", hit && "bg-[var(--chartreuse)]/5")}>
                                <td className="px-3 py-3 font-mono text-[11px] text-[var(--chartreuse)]">{chunk.idx}</td>
                                <td className="px-3 py-3 text-[11px] text-dim">{chunk.tokens}</td>
                                <td className="px-3 py-3 text-[11px] text-dim">{inspectorModel || inspectorDoc?.embedModel}</td>
                                <td className="max-w-[360px] px-3 py-3">
                                  <p className="line-clamp-3 break-words text-[11px] leading-relaxed text-[var(--paper)]/80">
                                    {chunk.content.slice(0, 300)}
                                    {chunk.content.length > 300 ? "…" : ""}
                                  </p>
                                </td>
                                {searched && hits.length > 0 && (
                                  <td className="px-3 py-3">
                                    {hit ? (
                                      <div className="space-y-1">
                                        <span className="inline-flex rounded-full bg-[var(--chartreuse)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--chartreuse)]">
                                          {hit.score.toFixed(4)}
                                        </span>
                                        <div className="text-[10px] leading-tight text-dim">
                                          L {hit.lexicalRank ? `#${hit.lexicalRank}` : "—"} · V {hit.semanticRank ? `#${hit.semanticRank}` : "—"}
                                        </div>
                                        {hit.matchedTerms.length > 0 && (
                                          <div className="flex flex-wrap gap-1">
                                            {hit.matchedTerms.slice(0, 4).map((t) => (
                                              <span key={t} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-dim">
                                                {t}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-[10px] text-dim">—</span>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <p className="mt-3 text-[10px] text-dim">
                Content is truncated to 300 characters per chunk for preview. Use search to see fusion signals. Raw embedding vectors are not shown.
              </p>
            </div>

            <div className="border-t border-[var(--line)] bg-white/[0.02] px-5 py-3 flex items-center justify-between">
              <span className="text-[10px] text-dim">GET /api/vault/chunks?docId={inspectorDoc?.id ?? ""}</span>
              <Button variant="ghost" size="sm" onClick={closeInspector}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
