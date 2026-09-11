"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from "react";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Link as LinkIcon,
  Globe,
  Plus,
  Trash2,
  Palette,
  Check,
  Sparkles,
  Layout,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/types";
import {
  type TexSettings,
  parseTexSettings,
  applyTexSettings,
} from "@/lib/pdf/texSettingsSync";
import TemplateVisualPreview from "./TemplateVisualPreview";

interface Props {
  tex: string;
  onApply: (newTex: string) => void;
  selectedTemplate: string;
  onSelectTemplate: (templateId: string) => void;
  templates: { id: string; name: string; badge: string; desc: string }[];
  className?: string;
  profile?: UserProfile;
  vaultHref?: string;
}

const ACCENT_PRESETS = [
  { name: "Navy Classic", hex: "1F3A5F", class: "bg-[#1F3A5F]" },
  { name: "Emerald Green", hex: "059669", class: "bg-[#059669]" },
  { name: "Royal Violet", hex: "6D28D9", class: "bg-[#6D28D9]" },
  { name: "Ruby Crimson", hex: "B91C1C", class: "bg-[#B91C1C]" },
  { name: "Tech Teal", hex: "0D9488", class: "bg-[#0D9488]" },
  { name: "Slate Charcoal", hex: "1E293B", class: "bg-[#1E293B]" },
];

const MARGIN_PRESETS = [
  { label: "Compact", value: "0.42in", desc: "Fits 15% more content on 1 page" },
  { label: "Standard", value: "0.55in", desc: "Balanced ATS standard margins" },
  { label: "Spacious", value: "0.70in", desc: "Generous whitespace & air" },
];

export default function ResumeCustomizer({
  tex,
  onApply,
  selectedTemplate,
  onSelectTemplate,
  templates,
  profile,
  vaultHref = "/vault",
}: Props) {
  const [tab, setTab] = useState<"info" | "style" | "templates">("info");
  const [settings, setSettings] = useState<TexSettings>(() => parseTexSettings(tex));
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");

  // Sync when tex changes from external edits
  useEffect(() => {
    setSettings(parseTexSettings(tex));
  }, [tex]);

  const updateSetting = <K extends keyof TexSettings>(key: K, value: TexSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    const patchedTex = applyTexSettings(tex, { [key]: value });
    onApply(patchedTex);
  };

  const autofillFromProfile = () => {
    if (!profile) return;
    const patch: Partial<TexSettings> = {};
    if (profile.name) patch.name = profile.name;
    if (profile.targetTitle) patch.title = profile.targetTitle;
    if (profile.email) patch.email = profile.email;
    if (profile.phone) patch.phone = profile.phone;
    if (profile.location) patch.location = profile.location;
    if (profile.linkedin) patch.linkedin = profile.linkedin;
    if (profile.github) patch.github = profile.github;
    if (profile.portfolio) patch.portfolio = profile.portfolio;
    if (Object.keys(patch).length === 0) return;
    setSettings((prev) => ({ ...prev, ...patch }));
    onApply(applyTexSettings(tex, patch));
  };

  const addCustomField = () => {
    if (!newFieldLabel.trim() || !newFieldValue.trim()) return;
    const updatedFields = [...settings.customFields, { label: newFieldLabel.trim(), value: newFieldValue.trim() }];
    setSettings({ ...settings, customFields: updatedFields });
    setNewFieldLabel("");
    setNewFieldValue("");
    const patchedTex = applyTexSettings(tex, { customFields: updatedFields });
    onApply(patchedTex);
  };

  const removeCustomField = (index: number) => {
    const updatedFields = settings.customFields.filter((_, i) => i !== index);
    setSettings({ ...settings, customFields: updatedFields });
    const patchedTex = applyTexSettings(tex, { customFields: updatedFields });
    onApply(patchedTex);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--ink-card)] text-[var(--paper)]">
      {/* Navigation tabs */}
      <div className="flex border-b border-[var(--line)] bg-[var(--ink-soft)] px-2 py-1.5 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setTab("info")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer",
            tab === "info"
              ? "bg-[var(--chartreuse)] text-neutral-950 font-bold shadow-sm"
              : "text-dim hover:text-[var(--paper)] hover:bg-white/[0.05]"
          )}
        >
          <User className="h-3.5 w-3.5" /> Info & Contacts
        </button>
        <button
          type="button"
          onClick={() => setTab("style")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer",
            tab === "style"
              ? "bg-[var(--chartreuse)] text-neutral-950 font-bold shadow-sm"
              : "text-dim hover:text-[var(--paper)] hover:bg-white/[0.05]"
          )}
        >
          <Palette className="h-3.5 w-3.5" /> Style & Visuals
        </button>
        <button
          type="button"
          onClick={() => setTab("templates")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer",
            tab === "templates"
              ? "bg-[var(--chartreuse)] text-neutral-950 font-bold shadow-sm"
              : "text-dim hover:text-[var(--paper)] hover:bg-white/[0.05]"
          )}
        >
          <Layout className="h-3.5 w-3.5" /> Templates ({templates.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Tab 1: Info & Contacts */}
        {tab === "info" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-[var(--ink-soft)]/50 px-3 py-2">
              <p className="text-[11px] text-dim flex-1 min-w-[180px]">Autofill contact fields from your profile, or manage source evidence in the vault.</p>
              <button type="button" onClick={autofillFromProfile} className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-semibold text-[var(--paper)] transition-colors hover:border-[var(--chartreuse)]/50 hover:text-[var(--chartreuse)]">
                Pull from profile
              </button>
              <a href={vaultHref} className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-semibold text-[var(--paper)] transition-colors hover:border-[var(--chartreuse)]/50 hover:text-[var(--chartreuse)]">
                Open Vault
              </a>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-semibold text-dim block mb-1">Full Name</label>
                <div className="relative">
                  <User className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-dim" />
                  <input
                    type="text"
                    value={settings.name}
                    onChange={(e) => updateSetting("name", e.target.value)}
                    placeholder="Full Name"
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--ink-soft)] text-xs text-[var(--paper)] outline-none focus:border-[var(--chartreuse)]/60"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-dim block mb-1">Target Title / Role</label>
                <div className="relative">
                  <Sparkles className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-dim" />
                  <input
                    type="text"
                    value={settings.title}
                    onChange={(e) => updateSetting("title", e.target.value)}
                    placeholder="e.g. Lead Full-Stack Engineer"
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--ink-soft)] text-xs text-[var(--paper)] outline-none focus:border-[var(--chartreuse)]/60"
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-semibold text-dim block mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-dim" />
                  <input
                    type="email"
                    value={settings.email}
                    onChange={(e) => updateSetting("email", e.target.value)}
                    placeholder="alex@example.com"
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--ink-soft)] text-xs text-[var(--paper)] outline-none focus:border-[var(--chartreuse)]/60"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-dim block mb-1">Phone</label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-dim" />
                  <input
                    type="text"
                    value={settings.phone}
                    onChange={(e) => updateSetting("phone", e.target.value)}
                    placeholder="+1 (555) 234-5678"
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--ink-soft)] text-xs text-[var(--paper)] outline-none focus:border-[var(--chartreuse)]/60"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-[11px] font-semibold text-dim block mb-1">Location</label>
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-dim" />
                  <input
                    type="text"
                    value={settings.location}
                    onChange={(e) => updateSetting("location", e.target.value)}
                    placeholder="City, State"
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--ink-soft)] text-xs text-[var(--paper)] outline-none focus:border-[var(--chartreuse)]/60"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-dim block mb-1">LinkedIn</label>
                <div className="relative">
                  <LinkIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-dim" />
                  <input
                    type="text"
                    value={settings.linkedin}
                    onChange={(e) => updateSetting("linkedin", e.target.value)}
                    placeholder="linkedin.com/in/alex"
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--ink-soft)] text-xs text-[var(--paper)] outline-none focus:border-[var(--chartreuse)]/60"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-dim block mb-1">Portfolio / Website</label>
                <div className="relative">
                  <Globe className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-dim" />
                  <input
                    type="text"
                    value={settings.portfolio}
                    onChange={(e) => updateSetting("portfolio", e.target.value)}
                    placeholder="alex.dev"
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--ink-soft)] text-xs text-[var(--paper)] outline-none focus:border-[var(--chartreuse)]/60"
                  />
                </div>
              </div>
            </div>

            {/* Custom Specific Info Fields (e.g. Visa Status, Clearance) */}
            <div className="border-t border-[var(--line)] pt-3">
              <label className="text-[11px] font-semibold text-[var(--paper)] block mb-1">
                Specific Custom Info Fields (e.g. Visa Status, Clearance, Languages)
              </label>
              <div className="space-y-2 mt-2">
                {settings.customFields.map((cf, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-28 text-xs font-semibold px-2 py-1 rounded bg-[var(--ink-soft)] border border-[var(--line)] truncate">
                      {cf.label}
                    </span>
                    <span className="flex-1 text-xs px-2 py-1 rounded bg-[var(--ink-soft)] border border-[var(--line)] truncate">
                      {cf.value}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCustomField(idx)}
                      className="p-1 text-dim hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                <div className="flex gap-2 items-center pt-1">
                  <input
                    type="text"
                    placeholder="Field name (e.g. Work Auth)"
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    className="w-32 px-2 py-1 rounded border border-[var(--line)] bg-[var(--ink-soft)] text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Value (e.g. US Citizen / Green Card)"
                    value={newFieldValue}
                    onChange={(e) => setNewFieldValue(e.target.value)}
                    className="flex-1 px-2 py-1 rounded border border-[var(--line)] bg-[var(--ink-soft)] text-xs"
                  />
                  <Button size="sm" variant="outline" onClick={addCustomField} className="h-7 px-2 text-xs">
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Style & Visuals (Icons, Photo, Accent, Margins) */}
        {tab === "style" && (
          <div className="space-y-5">
            {/* Contact Icons Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--line)] bg-[var(--ink-soft)]/50">
              <div>
                <p className="text-xs font-bold text-[var(--paper)]">Contact Line Icons</p>
                <p className="text-[11px] text-dim">Display FontAwesome icons for email, phone, location & socials.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.useIcons}
                  onChange={(e) => updateSetting("useIcons", e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-neutral-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--chartreuse)]" />
              </label>
            </div>

            {/* Profile Photo Toggle */}
            <div className="space-y-2 p-3 rounded-xl border border-[var(--line)] bg-[var(--ink-soft)]/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[var(--paper)]">Profile Headshot / Photo</p>
                  <p className="text-[11px] text-dim">Include a framed photo in the top right header block.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showPhoto}
                    onChange={(e) => updateSetting("showPhoto", e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-neutral-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--chartreuse)]" />
                </label>
              </div>
              {settings.showPhoto && (
                <div className="pt-2">
                  <label className="text-[11px] font-semibold text-dim block mb-1">Image URL / Filename</label>
                  <input
                    type="text"
                    value={settings.photoUrl}
                    onChange={(e) => updateSetting("photoUrl", e.target.value)}
                    placeholder="https://... or photo.png"
                    className="w-full px-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--ink-card)] text-xs text-[var(--paper)] outline-none"
                  />
                </div>
              )}
            </div>

            {/* Accent Color Presets */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-dim block">Accent Color</label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {ACCENT_PRESETS.map((preset) => {
                  const isSelected = settings.accentColor.toUpperCase() === preset.hex.toUpperCase();
                  return (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => updateSetting("accentColor", preset.hex)}
                      className={cn(
                        "flex items-center gap-1.5 p-2 rounded-lg border text-left transition-all cursor-pointer",
                        isSelected
                          ? "border-[var(--chartreuse)] bg-[var(--chartreuse)]/10 ring-1 ring-[var(--chartreuse)]"
                          : "border-[var(--line)] bg-[var(--ink-soft)]/50 hover:bg-[var(--ink-soft)]"
                      )}
                    >
                      <span className={cn("h-4 w-4 rounded-full shrink-0 shadow-xs", preset.class)} />
                      <span className="text-[10px] font-bold truncate">{preset.name.split(" ")[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Margins / Density */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-dim block">Page Margin & Spacing Density</label>
              <div className="grid gap-2 sm:grid-cols-3">
                {MARGIN_PRESETS.map((mp) => {
                  const isSelected = settings.margin === mp.value;
                  return (
                    <button
                      key={mp.value}
                      type="button"
                      onClick={() => updateSetting("margin", mp.value)}
                      className={cn(
                        "p-2.5 rounded-xl border text-left transition-all cursor-pointer",
                        isSelected
                          ? "border-[var(--chartreuse)] bg-[var(--chartreuse)]/10 ring-1 ring-[var(--chartreuse)]"
                          : "border-[var(--line)] bg-[var(--ink-soft)]/50 hover:bg-[var(--ink-soft)]"
                      )}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold">{mp.label}</span>
                        <span className="font-mono text-[10px] text-dim">{mp.value}</span>
                      </div>
                      <p className="text-[10px] text-dim mt-1">{mp.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Visual Template Gallery (with Visual Mockups) */}
        {tab === "templates" && (
          <div className="space-y-4">
            <p className="text-xs text-dim">
              Click any template to instantly switch layout without losing your bullets or custom edits.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {templates.map((tmpl) => {
                const isSelected = selectedTemplate === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => onSelectTemplate(tmpl.id)}
                    className={cn(
                      "group flex flex-col p-2 rounded-2xl border text-left transition-all cursor-pointer",
                      isSelected
                        ? "border-[var(--chartreuse)] bg-[var(--chartreuse)]/10 ring-2 ring-[var(--chartreuse)]/50 shadow-md"
                        : "border-line bg-[var(--ink-soft)]/40 hover:bg-[var(--ink-soft)] hover:border-[var(--chartreuse)]/40"
                    )}
                  >
                    {/* Visual miniature mockup */}
                    <div className="relative w-full rounded-xl overflow-hidden mb-2 shadow-xs group-hover:scale-[1.02] transition-transform">
                      <TemplateVisualPreview templateId={tmpl.id} name={settings.name} title={settings.title} />
                      {isSelected && (
                        <div className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--chartreuse)] text-neutral-950 shadow">
                          <Check className="h-3 w-3 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-1">
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
          </div>
        )}
      </div>
    </div>
  );
}
