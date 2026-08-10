"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Plus,
  Search,
  Mail,
  Link2,
  Phone,
  Star,
  Trash2,
  Briefcase,
  Building2,
  UserPlus,
  BadgeCheck,
  ArrowUpDown,
  ChevronDown,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Contact } from "@/types";
import { Button } from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import { palette, tint } from "@/lib/theme";

const RELATIONSHIP_META: Record<Contact["relationship"], { label: string; color: string }> = {
  recruiter: { label: "Recruiter", color: palette.sky },
  hiring_manager: { label: "Hiring Manager", color: palette.chartreuse },
  referral: { label: "Referral", color: palette.amber },
  talent_lead: { label: "Talent Lead", color: palette.sky },
  alumni: { label: "Alumni", color: palette.sky },
  other: { label: "Other", color: palette.paperDim },
};

const SOURCES: Contact["source"][] = ["linkedin", "email", "event", "referral", "other"];
const RELATIONSHIPS: Contact["relationship"][] = ["recruiter", "hiring_manager", "referral", "talent_lead", "alumni", "other"];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_TONES = [
  { bg: tint(palette.chartreuse, 0.14), fg: palette.chartreuse },
  { bg: tint(palette.sky, 0.14), fg: palette.sky },
  { bg: tint(palette.amber, 0.14), fg: palette.amber },
  { bg: tint(palette.coral, 0.14), fg: palette.coral },
  { bg: tint(palette.violet, 0.14), fg: palette.violet },
];

function toneFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 997;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

interface ContactForm {
  name: string;
  role: string;
  company: string;
  email: string;
  phone: string;
  linkedin: string;
  relationship: Contact["relationship"];
  source: Contact["source"];
  priority: Contact["priority"];
  notes: string;
}

const EMPTY_FORM: ContactForm = {
  name: "",
  role: "",
  company: "",
  email: "",
  phone: "",
  linkedin: "",
  relationship: "recruiter",
  source: "linkedin",
  priority: "medium",
  notes: "",
};

export default function NetworkPage() {
  const { contacts, applications, addContact, updateContact, deleteContact } = useApp();
  const { success, error } = useToast();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "name" | "priority">("newest");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);

  const companyNames = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const j of applications) {
      const key = j.company.toLowerCase().replace(/[^a-z]/g, "");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(j.id);
    }
    return map;
  }, [applications]);

  const filtered = contacts.filter((c) => {
    const q = query.toLowerCase();
    if (!q) return true;
    return [c.name, c.role, c.company, c.email].join(" ").toLowerCase().includes(q);
  });

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const weight = { high: 0, medium: 1, low: 2 } as const;
    arr.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (sort === "priority") return (weight[a.priority] ?? 1) - (weight[b.priority] ?? 1);
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
    return arr;
  }, [filtered, sort]);

  const highPriority = contacts.filter((c) => c.priority === "high").length;
  const recruiters = contacts.filter((c) => c.relationship === "recruiter" || c.relationship === "talent_lead").length;

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (c: Contact) => {
    setEditing(c);
    setForm({
      name: c.name,
      role: c.role,
      company: c.company,
      email: c.email,
      phone: c.phone,
      linkedin: c.linkedin,
      relationship: c.relationship,
      source: c.source,
      priority: c.priority,
      notes: c.notes,
    });
    setFormOpen(true);
  };

  const submit = () => {
    if (!form.name.trim()) {
      error("Name is required.");
      return;
    }
    if (editing) {
      updateContact(editing.id, { ...form });
      success(`Updated ${form.name}.`);
    } else {
      const companyIds = companyNames.get(form.company.toLowerCase().replace(/[^a-z]/g, "")) ?? [];
      addContact({ ...form, companyIds });
      success(`${form.name} added to your network.`);
    }
    setFormOpen(false);
  };

  const togglePriority = (c: Contact) => {
    updateContact(c.id, { priority: c.priority === "high" ? "medium" : "high" });
  };

  const remove = (c: Contact) => {
    if (confirm(`Remove ${c.name} from your network?`)) {
      deleteContact(c.id);
      success(`${c.name} removed.`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--chartreuse)]">/network</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--paper)]">Your Network</h1>
          <p className="mt-1 text-sm text-dim">
            Recruiters, hiring managers, referrals — everyone who can open a door.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Add Contact
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "People tracked", value: contacts.length, icon: Users, color: "var(--sky)" },
          { label: "Recruiters & talent leads", value: recruiters, icon: BadgeCheck, color: "var(--chartreuse)" },
          { label: "High priority", value: highPriority, icon: Star, color: "var(--amber)" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5">
            <Icon className="h-5 w-5" style={{ color }} />
            <p className="mt-3 font-mono text-3xl font-bold tabular-nums" style={{ color }}>
              {String(value).padStart(2, "0")}
            </p>
            <p className="mt-1 text-xs text-dim">{label}</p>
          </div>
        ))}
      </div>

      {/* Search + sort */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, company, role, email…"
            className="w-full rounded-xl border border-[var(--line)] bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-[var(--paper)] placeholder:text-dim/60 focus:border-[var(--chartreuse)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--chartreuse)]/20"
          />
        </div>
        <div className="relative sm:w-48">
          <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "newest" | "name" | "priority")}
            className="w-full appearance-none rounded-xl border border-[var(--line)] bg-[var(--ink-card)] py-2.5 pl-9 pr-8 text-sm font-semibold text-[var(--paper)] outline-none transition-colors focus:border-[var(--chartreuse)]/50"
          >
            <option value="newest">Recently added</option>
            <option value="name">Name A–Z</option>
            <option value="priority">Priority (high first)</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
        </div>
      </div>

      {/* Contact grid */}
      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] p-12 text-center">
          <UserPlus className="mx-auto h-8 w-8 text-dim" />
          <p className="mt-3 text-sm font-semibold text-[var(--paper)]">
            {contacts.length === 0 ? "Your network is empty" : "No contacts match"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-dim">
            {contacts.length === 0
              ? "Every recruiter, hiring manager, or alumni you connect with goes here. Add your first person to start building leverage."
              : "Try a different search."}
          </p>
          {contacts.length === 0 && (
            <Button className="mt-4" onClick={openNew}>
              <Plus className="h-4 w-4" /> Add your first contact
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {sorted.map((c) => {
              const tone = toneFor(c.name);
              const rel = RELATIONSHIP_META[c.relationship];
              return (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="group rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/70 p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--chartreuse)]/30 hover:shadow-lg hover:shadow-black/20"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="grid h-11 w-11 place-items-center rounded-xl font-display text-sm font-bold"
                        style={{ background: tone.bg, color: tone.fg }}
                      >
                        {initials(c.name)}
                      </div>
                      <div>
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--paper)]">
                          {c.name}
                          {c.priority === "high" && <Star className="h-3.5 w-3.5 fill-[var(--amber)] text-[var(--amber)]" />}
                        </p>
                        <p className="text-xs text-dim">{c.role || "—"}</p>
                      </div>
                    </div>
                    <span
                      className="rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider"
                      style={{ borderColor: `${rel.color}40`, background: `${rel.color}14`, color: rel.color }}
                    >
                      {rel.label}
                    </span>
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-dim">
                    {c.company && (
                      <p className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5" /> {c.company}
                      </p>
                    )}
                    {c.email && (
                      <p className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5" />
                        <a href={`mailto:${c.email}`} className="truncate text-[var(--sky)] hover:underline">
                          {c.email}
                        </a>
                      </p>
                    )}
                    {c.linkedin && (
                      <p className="flex items-center gap-2">
                        <Link2 className="h-3.5 w-3.5" />
                        <a
                          href={c.linkedin.startsWith("http") ? c.linkedin : `https://${c.linkedin}`}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-[var(--sky)] hover:underline"
                        >
                          {c.linkedin}
                        </a>
                      </p>
                    )}
                    {c.phone && (
                      <p className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5" /> {c.phone}
                      </p>
                    )}
                    {c.lastContacted && (
                      <p className="flex items-center gap-2 text-[11px]">
                        <Briefcase className="h-3.5 w-3.5" /> Last contact {new Date(c.lastContacted).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  {c.notes && <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-dim">{c.notes}</p>}

                  <div className="mt-4 flex items-center justify-between border-t border-[var(--line)]/50 pt-3 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => togglePriority(c)}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-dim hover:text-[var(--amber)]"
                    >
                      <Star className={cn("h-3.5 w-3.5", c.priority === "high" && "fill-[var(--amber)] text-[var(--amber)]")} />
                      {c.priority === "high" ? "High priority" : "Mark high"}
                    </button>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(c)} className="text-[11px] font-semibold text-[var(--sky)] hover:underline">
                        Edit
                      </button>
                      <button onClick={() => remove(c)} className="flex items-center gap-1 text-[11px] font-semibold text-[var(--coral)] hover:underline">
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Add/Edit modal */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit contact" : "New contact"} wide>
        <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Name *</span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-lg border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Role</span>
                  <input
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    placeholder="Talent Acquisition Lead"
                    className="w-full rounded-lg border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Company</span>
                  <input
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    placeholder="DataDome"
                    className="w-full rounded-lg border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Email</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-lg border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">LinkedIn</span>
                  <input
                    value={form.linkedin}
                    onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
                    placeholder="linkedin.com/in/…"
                    className="w-full rounded-lg border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Relationship</span>
                    <select
                      value={form.relationship}
                      onChange={(e) => setForm({ ...form, relationship: e.target.value as Contact["relationship"] })}
                      className="w-full rounded-lg border border-[var(--line)] bg-[var(--ink-soft)] px-3 py-2 text-sm text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
                    >
                      {RELATIONSHIPS.map((r) => (
                        <option key={r} value={r}>
                          {RELATIONSHIP_META[r].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Source</span>
                    <select
                      value={form.source}
                      onChange={(e) => setForm({ ...form, source: e.target.value as Contact["source"] })}
                      className="w-full rounded-lg border border-[var(--line)] bg-[var(--ink-soft)] px-3 py-2 text-sm text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
                    >
                      {SOURCES.map((s) => (
                        <option key={s} value={s}>
                          {s[0].toUpperCase() + s.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-dim">Notes</span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                    placeholder="Context — where you met, what they said, follow-up angle…"
                    className="w-full resize-none rounded-lg border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--paper)] focus:border-[var(--chartreuse)]/50 focus:outline-none"
                  />
                </label>
              </div>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] bg-white/[0.02] px-5 py-4">
          <Button variant="outline" onClick={() => setFormOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>{editing ? "Save changes" : "Add contact"}</Button>
        </div>
      </Modal>
    </div>
  );
}
