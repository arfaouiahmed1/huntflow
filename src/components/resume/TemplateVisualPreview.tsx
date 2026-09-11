"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface Props {
  templateId: string;
  className?: string;
  name?: string;
  title?: string;
}

export default function TemplateVisualPreview({
  templateId,
  className,
  name = "ALEX JOHNSON",
  title = "Senior Software Engineer",
}: Props) {
  // Preset accent colors matching the actual templates in src/lib/pdf/templates/*.tex
  const config = useMemo(() => {
    switch (templateId) {
      case "modern-professional":
        return {
          type: "banner",
          accent: "#1F3A5F",
          secondary: "#3B82F6",
          font: "font-sans",
          bg: "bg-white",
          ink: "#111827",
        };
      case "technical-modern":
        return {
          type: "technical",
          accent: "#0D9488",
          secondary: "#14B8A6",
          font: "font-mono",
          bg: "bg-[#FAFAFA]",
          ink: "#0F172A",
        };
      case "minimal-clean":
        return {
          type: "minimal",
          accent: "#059669",
          secondary: "#10B981",
          font: "font-sans",
          bg: "bg-[#FFFFFF]",
          ink: "#18181B",
        };
      case "executive":
        return {
          type: "executive",
          accent: "#78350F",
          secondary: "#B45309",
          font: "font-serif",
          bg: "bg-[#FEFDFB]",
          ink: "#1C1917",
        };
      case "tabular-german":
        return {
          type: "tabular",
          accent: "#27272A",
          secondary: "#52525B",
          font: "font-sans",
          bg: "bg-white",
          ink: "#18181B",
        };
      case "modern-french":
        return {
          type: "french",
          accent: "#1E40AF",
          secondary: "#60A5FA",
          font: "font-sans",
          bg: "bg-white",
          ink: "#1E293B",
        };
      case "creative-sidebar":
        return {
          type: "sidebar",
          accent: "#4F46E5",
          secondary: "#818CF8",
          font: "font-sans",
          bg: "bg-white",
          ink: "#1F2937",
        };
      case "nordic-clean":
        return {
          type: "nordic",
          accent: "#334155",
          secondary: "#64748B",
          font: "font-sans",
          bg: "bg-white",
          ink: "#0F172A",
        };
      case "developer-dashboard":
        return {
          type: "dashboard",
          accent: "#0F172A",
          secondary: "#22D3EE",
          font: "font-sans",
          bg: "bg-white",
          ink: "#0F172A",
        };
      case "letter-cover":
      case "letter-modern":
      case "letter-minimal":
      case "letter-motivation":
      case "letter-motivation-fr":
      case "letter-anschreiben-de":
        return {
          type: "letter",
          accent: "#1F3A5F",
          secondary: "#4B5563",
          font: "font-serif",
          bg: "bg-white",
          ink: "#1F2937",
        };
      case "classic-ats":
      default:
        return {
          type: "classic",
          accent: "#1F3A5F",
          secondary: "#4B5563",
          font: "font-sans",
          bg: "bg-white",
          ink: "#1F2937",
        };
    }
  }, [templateId]);
  return (
    <div
      className={cn(
        "relative aspect-[8.5/11] w-full overflow-hidden rounded-xl border border-line shadow-sm select-none transition-transform",
        config.bg,
        className
      )}
    >
      {/* 1. Modern Professional: Top Accent Banner */}
      {config.type === "banner" && (
        <div className="flex h-full flex-col text-[7px] leading-none text-slate-800">
          <div style={{ backgroundColor: config.accent }} className="p-2 text-white">
            <div className="font-bold uppercase tracking-wider text-[8px]">{name}</div>
            <div className="mt-0.5 opacity-90 text-[6px]">{title}</div>
            <div className="mt-1 flex gap-1 opacity-75 text-[5px]">
              <span>alex@dev.io</span>
              <span>•</span>
              <span>+1 555-0192</span>
              <span>•</span>
              <span>SF, CA</span>
            </div>
          </div>
          <div className="flex-1 space-y-1.5 p-2">
            <div>
              <div style={{ color: config.accent }} className="font-bold uppercase tracking-wider text-[6.5px]">
                Professional Summary
              </div>
              <div style={{ borderColor: config.accent }} className="mt-0.5 border-b-[1.5px]" />
              <div className="mt-1 space-y-0.5 opacity-70">
                <div className="h-1 w-full bg-slate-300 rounded-xs" />
                <div className="h-1 w-4/5 bg-slate-300 rounded-xs" />
              </div>
            </div>
            <div>
              <div style={{ color: config.accent }} className="font-bold uppercase tracking-wider text-[6.5px]">
                Experience
              </div>
              <div style={{ borderColor: config.accent }} className="mt-0.5 border-b-[1.5px]" />
              <div className="mt-1 space-y-1">
                <div>
                  <div className="flex justify-between font-bold text-[6px]">
                    <span>Lead Engineer — TechCorp</span>
                    <span style={{ color: config.secondary }}>2022 – Pres</span>
                  </div>
                  <div className="mt-0.5 space-y-0.5 pl-1 opacity-70">
                    <div className="h-0.5 w-full bg-slate-400 rounded-xs" />
                    <div className="h-0.5 w-5/6 bg-slate-400 rounded-xs" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between font-bold text-[6px]">
                    <span>Senior Developer — ScaleAI</span>
                    <span style={{ color: config.secondary }}>2020 – 2022</span>
                  </div>
                  <div className="mt-0.5 space-y-0.5 pl-1 opacity-70">
                    <div className="h-0.5 w-11/12 bg-slate-400 rounded-xs" />
                  </div>
                </div>
              </div>
            </div>
            <div>
              <div style={{ color: config.accent }} className="font-bold uppercase tracking-wider text-[6.5px]">
                Skills & Stack
              </div>
              <div style={{ borderColor: config.accent }} className="mt-0.5 border-b-[1.5px]" />
              <div className="mt-1 flex flex-wrap gap-0.5">
                {["TypeScript", "React", "Next.js", "Docker", "Python"].map((s) => (
                  <span key={s} className="rounded bg-slate-100 px-1 py-0.5 text-[4.5px] font-semibold text-slate-700">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Technical Modern: High-Density Monospace Grid */}
      {config.type === "technical" && (
        <div className="flex h-full flex-col font-mono text-[7px] leading-none text-slate-900 p-2.5 space-y-1.5">
          <div className="border-b border-teal-600 pb-1">
            <div className="font-bold text-[8.5px] text-teal-800">{`> ${name}`}</div>
            <div className="text-[6px] text-teal-600 mt-0.5">{`$ role: ${title}`}</div>
            <div className="text-[5px] text-slate-500 mt-0.5">alex@dev.io | github.com/alex | sf-ca</div>
          </div>
          <div className="space-y-1">
            <div className="text-teal-700 font-bold text-[6px] uppercase tracking-wider">[ 01. Tech Skills ]</div>
            <div className="grid grid-cols-2 gap-0.5 text-[5px]">
              <div className="bg-teal-50 p-0.5 rounded border border-teal-200">LANGS: TS, Py, Go, Rust</div>
              <div className="bg-teal-50 p-0.5 rounded border border-teal-200">OPS: Docker, K8s, AWS</div>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-teal-700 font-bold text-[6px] uppercase tracking-wider">[ 02. Work History ]</div>
            <div className="space-y-0.5 text-[5.5px]">
              <div className="flex justify-between font-bold">
                <span>Principal Eng // Nexus</span>
                <span className="text-teal-600">2022-NOW</span>
              </div>
              <div className="h-0.5 w-full bg-slate-300 rounded-xs" />
              <div className="h-0.5 w-4/5 bg-slate-300 rounded-xs" />
            </div>
            <div className="space-y-0.5 text-[5.5px]">
              <div className="flex justify-between font-bold">
                <span>Software Eng // CloudScale</span>
                <span className="text-teal-600">2020-2022</span>
              </div>
              <div className="h-0.5 w-full bg-slate-300 rounded-xs" />
            </div>
          </div>
        </div>
      )}

      {/* 3. Minimal Clean: Generous Whitespace & Left Border Accent */}
      {config.type === "minimal" && (
        <div className="flex h-full flex-col text-[7px] leading-none text-zinc-900 p-2.5 space-y-2">
          <div>
            <div className="font-light tracking-wide text-[9px] text-zinc-900">{name}</div>
            <div style={{ color: config.accent }} className="font-medium text-[6px] mt-0.5">
              {title}
            </div>
            <div className="text-[5px] text-zinc-400 mt-0.5">alex@dev.io · +1 555-0192 · san francisco</div>
          </div>
          <div className="space-y-1">
            <div style={{ borderColor: config.accent }} className="border-l-2 pl-1 font-semibold text-[6.5px] uppercase tracking-wider text-zinc-700">
              Summary
            </div>
            <div className="space-y-0.5 pl-1 opacity-60">
              <div className="h-1 w-full bg-zinc-300 rounded-xs" />
              <div className="h-1 w-3/4 bg-zinc-300 rounded-xs" />
            </div>
          </div>
          <div className="space-y-1">
            <div style={{ borderColor: config.accent }} className="border-l-2 pl-1 font-semibold text-[6.5px] uppercase tracking-wider text-zinc-700">
              Experience
            </div>
            <div className="space-y-1 pl-1">
              <div>
                <div className="font-medium text-[6px]">Lead Architect — Nexus</div>
                <div className="h-0.5 w-full bg-zinc-300 rounded-xs mt-0.5" />
              </div>
              <div>
                <div className="font-medium text-[6px]">Staff Engineer — Cloud</div>
                <div className="h-0.5 w-4/5 bg-zinc-300 rounded-xs mt-0.5" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Executive Serif: Formal Centered Layout with Rules */}
      {config.type === "executive" && (
        <div className="flex h-full flex-col font-serif text-[7px] leading-none text-stone-900 p-2.5 space-y-1.5">
          <div className="text-center border-b border-stone-300 pb-1.5">
            <div className="font-bold text-[9px] uppercase tracking-widest text-stone-900">{name}</div>
            <div style={{ color: config.accent }} className="italic text-[6px] mt-0.5">
              {title}
            </div>
            <div className="text-[5px] text-stone-500 mt-0.5">SAN FRANCISCO, CA ◆ ALEX@DEV.IO ◆ +1 555-0192</div>
          </div>
          <div className="space-y-1">
            <div className="text-center font-bold text-[6.5px] uppercase tracking-widest text-stone-800 border-b border-stone-200 pb-0.5">
              Executive Profile
            </div>
            <div className="space-y-0.5 opacity-70 px-1">
              <div className="h-1 w-full bg-stone-300 rounded-xs" />
              <div className="h-1 w-5/6 bg-stone-300 rounded-xs" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-center font-bold text-[6.5px] uppercase tracking-widest text-stone-800 border-b border-stone-200 pb-0.5">
              Leadership & Career
            </div>
            <div className="space-y-1 px-1">
              <div>
                <div className="flex justify-between font-bold text-[6px]">
                  <span>VP of Technology — Corp</span>
                  <span className="italic">2021 – Present</span>
                </div>
                <div className="h-0.5 w-full bg-stone-300 rounded-xs mt-0.5" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Tabular German: DACH 2-Column (Date Left, Content Right) */}
      {config.type === "tabular" && (
        <div className="flex h-full flex-col text-[7px] leading-none text-zinc-900 p-2 space-y-1.5">
          <div className="border-b border-zinc-800 pb-1">
            <div className="font-extrabold uppercase tracking-tight text-[8.5px]">{name}</div>
            <div className="text-[6px] text-zinc-600 font-semibold">{title}</div>
            <div className="text-[5px] text-zinc-500 mt-0.5">München, Deutschland · alex@dev.io</div>
          </div>
          <div className="space-y-1">
            <div className="font-bold uppercase text-[6px] tracking-wider text-zinc-800 bg-zinc-100 p-0.5">
              Berufserfahrung
            </div>
            <div className="space-y-1 text-[5.5px]">
              <div className="grid grid-cols-[38px_1fr] gap-1">
                <span className="font-bold text-zinc-500">2022–heute</span>
                <div>
                  <span className="font-bold">Lead Engineer</span> — Tech GmbH
                  <div className="h-0.5 w-full bg-zinc-300 rounded-xs mt-0.5" />
                </div>
              </div>
              <div className="grid grid-cols-[38px_1fr] gap-1">
                <span className="font-bold text-zinc-500">2019–2022</span>
                <div>
                  <span className="font-bold">Senior Entwickler</span> — Cloud AG
                  <div className="h-0.5 w-4/5 bg-zinc-300 rounded-xs mt-0.5" />
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="font-bold uppercase text-[6px] tracking-wider text-zinc-800 bg-zinc-100 p-0.5">
              Ausbildung
            </div>
            <div className="grid grid-cols-[38px_1fr] gap-1 text-[5.5px]">
              <span className="font-bold text-zinc-500">2015–2019</span>
              <div>B.Sc. Informatik — TU München</div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Creative Sidebar: 30% Accent Sidebar + 70% Main */}
      {config.type === "sidebar" && (
        <div className="grid h-full grid-cols-[32%_68%] text-[7px] leading-none">
          <div style={{ backgroundColor: "#EEF2FF" }} className="p-1.5 space-y-2 border-r border-indigo-200">
            <div className="h-6 w-6 rounded-full bg-indigo-200 mx-auto" />
            <div className="space-y-1">
              <div className="font-bold text-[5.5px] uppercase tracking-wider text-indigo-900">Contact</div>
              <div className="space-y-0.5 text-[4.5px] text-indigo-700">
                <div>alex@dev.io</div>
                <div>+1 555-0192</div>
                <div>SF, CA</div>
              </div>
            </div>
            <div className="space-y-1">
              <div className="font-bold text-[5.5px] uppercase tracking-wider text-indigo-900">Skills</div>
              <div className="flex flex-wrap gap-0.5">
                {["TS", "React", "Next", "Docker"].map((s) => (
                  <span key={s} className="rounded bg-indigo-100 px-0.5 py-0.5 text-[4px] font-bold text-indigo-800">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="p-2 space-y-1.5 bg-white">
            <div>
              <div className="font-bold uppercase tracking-wider text-[8px] text-slate-900">{name}</div>
              <div className="text-[6px] font-medium text-indigo-600">{title}</div>
            </div>
            <div className="space-y-1">
              <div className="font-bold uppercase text-[6px] text-slate-800 border-b border-indigo-200 pb-0.5">
                Experience
              </div>
              <div className="space-y-0.5">
                <div className="font-bold text-[5.5px]">Lead Engineer — Nexus</div>
                <div className="h-0.5 w-full bg-slate-300 rounded-xs" />
                <div className="h-0.5 w-3/4 bg-slate-300 rounded-xs" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. Modern French: European standard with competencies block */}
      {config.type === "french" && (
        <div className="flex h-full flex-col text-[7px] leading-none text-slate-800 p-2.5 space-y-1.5">
          <div className="border-b-2 border-blue-800 pb-1">
            <div className="font-extrabold uppercase tracking-tight text-[8.5px] text-blue-900">{name}</div>
            <div className="text-[6px] font-semibold text-blue-700 mt-0.5">{title}</div>
            <div className="text-[5px] text-slate-500 mt-0.5">Paris, France · alex@dev.fr · +33 6 12 34 56 78</div>
          </div>
          <div className="space-y-1">
            <div className="font-bold uppercase tracking-wider text-[6px] text-blue-800 bg-blue-50 px-1 py-0.5 rounded">
              Compétences Clés
            </div>
            <div className="flex flex-wrap gap-1 px-0.5 text-[5px]">
              <span className="font-semibold text-blue-900">• Architecture Web</span>
              <span className="font-semibold text-blue-900">• Cloud & DevOps</span>
              <span className="font-semibold text-blue-900">• Python / Next.js</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="font-bold uppercase tracking-wider text-[6px] text-blue-800 bg-blue-50 px-1 py-0.5 rounded">
              Parcours Professionnel
            </div>
            <div className="space-y-1 px-0.5">
              <div>
                <div className="flex justify-between font-bold text-[6px]">
                  <span>Lead Développeur — VentePrivée</span>
                  <span className="text-blue-700 font-semibold">2021 – Présent</span>
                </div>
                <div className="h-0.5 w-full bg-slate-300 rounded-xs mt-0.5" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. Nordic Clean: Scandinavian Minimalist Slate */}
      {config.type === "nordic" && (
        <div className="flex h-full flex-col text-[7px] leading-none text-slate-800 p-2.5 space-y-2">
          <div className="border-b border-slate-300 pb-1">
            <div className="font-light tracking-widest uppercase text-[8.5px] text-slate-900">{name}</div>
            <div className="text-[6px] font-normal text-slate-600 mt-0.5">{title}</div>
            <div className="text-[5px] text-slate-400 mt-0.5">Stockholm, Sweden · alex@dev.se</div>
          </div>
          <div className="space-y-1">
            <div className="font-medium text-[6.5px] uppercase tracking-wider text-slate-700">
              Profile
            </div>
            <div className="space-y-0.5 opacity-60">
              <div className="h-1 w-full bg-slate-300 rounded-xs" />
              <div className="h-1 w-5/6 bg-slate-300 rounded-xs" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="font-medium text-[6.5px] uppercase tracking-wider text-slate-700">
              Selected Experience
            </div>
            <div className="space-y-1">
              <div>
                <div className="flex justify-between font-medium text-[6px]">
                  <span>Staff Engineer — Spotify</span>
                  <span className="text-slate-500">2021 — NOW</span>
                </div>
                <div className="h-0.5 w-full bg-slate-300 rounded-xs mt-0.5" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. Developer Dashboard: dark sidebar + metric main column */}
      {config.type === "dashboard" && (
        <div className="grid h-full grid-cols-[34%_66%] text-[7px] leading-none">
          <div style={{ backgroundColor: config.accent }} className="p-1.5 space-y-2 text-white">
            <div>
              <div className="font-bold uppercase tracking-wider text-[7.5px]">{name}</div>
              <div style={{ color: config.secondary }} className="mt-0.5 text-[5.5px] font-semibold">{title}</div>
            </div>
            <div className="space-y-0.5 text-[4.5px] opacity-80">
              <div>alex@dev.io</div>
              <div>github.com/alex</div>
              <div>SF, CA</div>
            </div>
            <div>
              <div style={{ color: config.secondary }} className="font-bold text-[5px] uppercase tracking-wider">Stack</div>
              <div className="mt-1 flex flex-wrap gap-0.5">
                {["TS", "Go", "K8s", "AWS"].map((s) => (
                  <span key={s} className="rounded bg-white/10 px-1 py-0.5 text-[4px] font-bold">{s}</span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ color: config.secondary }} className="font-bold text-[5px] uppercase tracking-wider">Metrics</div>
              <div className="mt-1 space-y-1">
                <div className="rounded bg-white/10 p-1"><div className="font-bold text-[6px]">-42% p99</div></div>
                <div className="rounded bg-white/10 p-1"><div className="font-bold text-[6px]">$2M saved</div></div>
              </div>
            </div>
          </div>
          <div className="space-y-1.5 bg-white p-2">
            <div>
              <div className="font-bold uppercase tracking-wider text-[6px] text-slate-900">Experience</div>
              <div className="mt-0.5 h-0.5 w-full rounded-full" style={{ backgroundColor: config.secondary }} />
              <div className="mt-1 space-y-1">
                <div className="font-bold text-[5.5px] text-slate-900">Lead Engineer — Nexus</div>
                <div className="h-0.5 w-full rounded-xs bg-slate-300" />
                <div className="h-0.5 w-4/5 rounded-xs bg-slate-300" />
              </div>
            </div>
            <div>
              <div className="font-bold uppercase tracking-wider text-[6px] text-slate-900">Projects</div>
              <div className="mt-0.5 h-0.5 w-full rounded-full" style={{ backgroundColor: config.secondary }} />
              <div className="mt-1 h-0.5 w-full rounded-xs bg-slate-300" />
            </div>
          </div>
        </div>
      )}

      {/* 10. Cover / Motivation Letter: sender block + paragraphs */}
      {config.type === "letter" && (
        <div className="flex h-full flex-col bg-white p-2.5 font-serif text-[7px] leading-snug text-slate-900">
          <div className="font-bold text-[8px]">{name}</div>
          <div className="mt-0.5 text-[5px] text-slate-500">alex@dev.io · San Francisco, CA</div>
          <div className="mt-1 text-[5px] text-slate-500">Hiring Manager</div>
          <div className="mt-1.5 space-y-1 text-[5.5px] text-slate-700">
            <div className="h-1 w-full rounded-xs bg-slate-300" />
            <div className="h-1 w-full rounded-xs bg-slate-300" />
            <div className="h-1 w-4/5 rounded-xs bg-slate-300" />
            <div className="h-1 w-full rounded-xs bg-slate-300" />
            <div className="h-1 w-3/5 rounded-xs bg-slate-300" />
          </div>
          <div className="mt-2 text-[5.5px] italic text-slate-600">Sincerely,</div>
          <div className="text-[6px] font-bold">{name}</div>
        </div>
      )}

      {/* 11. Classic ATS Default: Single-column standard */}
      {config.type === "classic" && (
        <div className="flex h-full flex-col text-[7px] leading-none text-slate-900 p-2.5 space-y-1.5">
          <div className="border-b border-slate-900 pb-1">
            <div className="font-bold uppercase tracking-wide text-[8.5px] text-slate-950">{name}</div>
            <div style={{ color: config.accent }} className="font-semibold text-[6px] mt-0.5">
              {title}
            </div>
            <div className="text-[5px] text-slate-600 mt-0.5">alex@dev.io | +1 (555) 234-5678 | San Francisco, CA</div>
          </div>
          <div className="space-y-1">
            <div style={{ color: config.accent }} className="font-bold uppercase tracking-wider text-[6.5px]">
              Summary
            </div>
            <div style={{ borderColor: config.accent }} className="border-b-[0.7px]" />
            <div className="space-y-0.5 opacity-70">
              <div className="h-1 w-full bg-slate-300 rounded-xs" />
              <div className="h-1 w-4/5 bg-slate-300 rounded-xs" />
            </div>
          </div>
          <div className="space-y-1">
            <div style={{ color: config.accent }} className="font-bold uppercase tracking-wider text-[6.5px]">
              Experience
            </div>
            <div style={{ borderColor: config.accent }} className="border-b-[0.7px]" />
            <div className="space-y-1">
              <div>
                <div className="flex justify-between font-bold text-[6px]">
                  <span>Lead Full-Stack Engineer — Nexus</span>
                  <span style={{ color: config.accent }}>2022 – Present</span>
                </div>
                <div className="space-y-0.5 pl-1 opacity-70 mt-0.5">
                  <div className="h-0.5 w-full bg-slate-400 rounded-xs" />
                  <div className="h-0.5 w-5/6 bg-slate-400 rounded-xs" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
