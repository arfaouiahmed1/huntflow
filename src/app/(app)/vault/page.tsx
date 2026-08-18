"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  UploadCloud,
  FileText,
  Trash2,
  Search,
  Loader2,
  FileUp,
  Database,
  Sparkles,
  User,
  MapPin,
  Phone,
  Mail,
  Briefcase,
  Globe,
  DollarSign,
  Clock,
  ShieldCheck,
  Save,
  CheckCircle2,
  Building,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/ui/Toaster";
import { Button } from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import DateField from "@/components/ui/DateField";
import ProfileCoach from "@/components/ProfileCoach";
import { cn } from "@/lib/utils";
import { palette } from "@/lib/theme";
import { UserProfile } from "@/types";

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
}

const VAULT_LABELS: { id: string; label: string; color: string }[] = [
  { id: "resume", label: "Resume", color: palette.chartreuse },
  { id: "cv", label: "CV", color: palette.sky },
  { id: "image", label: "Image", color: palette.violet },
  { id: "attestation", label: "Attestation", color: palette.amber },
  { id: "uni_paper", label: "Uni papers", color: palette.paperDim },
  { id: "uni_marks", label: "Uni marks", color: palette.coral },
];

const LABEL_META: Record<string, { label: string; color: string }> = Object.fromEntries(
  VAULT_LABELS.map((l) => [l.id, { label: l.label, color: l.color }])
);

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

export default function VaultPage() {
  const { profile, updateProfile } = useApp();
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState<"info" | "documents">("info");

  // Profile Form State
  const [profileForm, setProfileForm] = useState(profile);
  const [savingProfile, setSavingProfile] = useState(false);

  // Vault State
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [stats, setStats] = useState({ docs: 0, chunks: 0, bytes: 0 });
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const saveProfileInfo = () => {
    setSavingProfile(true);
    updateProfile(profileForm);
    setTimeout(() => {
      setSavingProfile(false);
      success("My Info profile updated & synchronized with SQLite!");
    }, 400);
  };

  const loadDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/vault");
      const data = await res.json();
      if (res.ok) {
        setDocs(data.docs ?? []);
        setStats(data.stats ?? { docs: 0, chunks: 0, bytes: 0 });
      }
    } catch {
      /* offline */
    }
  }, []);

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

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
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
      }
    } catch {
      error("Failed to delete document.");
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/vault/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setHits(data.hits ?? []);
    } catch {
      error("Vector search failed.");
    } finally {
      setSearching(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-[var(--line)] bg-white/[0.03] px-3.5 py-2.5 text-xs text-[var(--paper)] outline-none transition-colors placeholder:text-[var(--paper-dim)]/60 focus:border-[var(--chartreuse)]/50";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--paper)] flex items-center gap-2">
            <Archive className="h-6 w-6 text-[var(--chartreuse)]" /> My Info & Document Vault
          </h1>
          <p className="text-xs text-dim">
            Manage your complete applicant profile payload and PDF/DOCX documents for Auto-Apply agents.
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
            <User className="h-4 w-4" /> Applicant Info Form
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
            <FileText className="h-4 w-4" /> PDF & DOCX Vault ({docs.length})
          </button>
        </div>
      </div>

      {/* Profile Coach chat panel */}
      <ProfileCoach />

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
              <Button onClick={saveProfileInfo} loading={savingProfile}>
                <Save className="h-4 w-4" /> Save Profile Info
              </Button>
            </div>

            {/* General Info */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium text-dim mb-1 block">Full Name</label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-dim mb-1 block">Email Address</label>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-dim mb-1 block">Phone Number</label>
                <input
                  type="text"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Address */}
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
                <label className="text-xs font-medium text-dim mb-1 block">Country</label>
                <input
                  type="text"
                  placeholder="e.g. Tunisia"
                  value={profileForm.country || ""}
                  onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })}
                  className={inputClass}
                />
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
                  onChange={(e) => setProfileForm({ ...profileForm, linkedin: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-dim mb-1 block">GitHub Profile</label>
                <input
                  type="url"
                  placeholder="https://github.com/..."
                  value={profileForm.github || ""}
                  onChange={(e) => setProfileForm({ ...profileForm, github: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-dim mb-1 block">Portfolio / Personal Site</label>
                <input
                  type="url"
                  placeholder="https://yourname.dev"
                  value={profileForm.portfolio || ""}
                  onChange={(e) => setProfileForm({ ...profileForm, portfolio: e.target.value })}
                  className={inputClass}
                />
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

            <div className="flex justify-end">
              <Button onClick={saveProfileInfo} loading={savingProfile}>
                <Save className="h-4 w-4" /> Save Profile Info
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* DOCUMENT VAULT & VECTOR SEARCH */
        <div className="space-y-6">
          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-4 rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4 text-center">
            <div>
              <p className="text-xs text-dim">Documents</p>
              <p className="text-lg font-bold text-[var(--paper)]">{stats.docs}</p>
            </div>
            <div>
              <p className="text-xs text-dim">Embedded Chunks</p>
              <p className="text-lg font-bold text-[var(--chartreuse)]">{stats.chunks}</p>
            </div>
            <div>
              <p className="text-xs text-dim">Total Storage</p>
              <p className="text-lg font-bold text-[var(--sky)]">{fmtBytes(stats.bytes)}</p>
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
              accept=".pdf,.docx,.txt"
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
            <p className="text-xs text-dim mt-1">PDF, DOCX, or TXT up to 25 MB</p>
          </div>

          {/* Vector Search */}
          <div className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4 space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Semantic vector search across document vault..."
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
                <p className="text-xs text-dim">Found {hits.length} semantic chunk hit(s):</p>
                {hits.map((hit) => (
                  <div key={hit.chunkId} className="rounded-xl border border-[var(--line)] bg-black/20 p-3 text-xs">
                    <div className="flex justify-between font-semibold text-[var(--paper)] mb-1">
                      <span>{hit.docName}</span>
                      <span className="text-[var(--chartreuse)]">Score: {(hit.score * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-dim line-clamp-3">{hit.text}</p>
                  </div>
                ))}
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
                        <p className="text-[10px] text-dim">{fmtBytes(doc.size)} · {doc.chunkCount} chunks</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="text-dim hover:text-[var(--coral)] transition-colors p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
