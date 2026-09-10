/**
 * Studio template gallery data: derived from the real
 * RESUME_TEMPLATES registry — never a hand-written subset.
 *
 * Each card shows real metadata only (name, description, recommendation
 * reason, audiences, LaTeX font). The registry's numeric atsScore is
 * intentionally NOT surfaced: it is a design heuristic, not a measured
 * vendor result, and rendering it as a score would be a fake guarantee.
 * No thumbnails: only previews rendered from real compiled PDFs would
 * be honest, and this gallery ships none rather than mockups.
 *
 * Browser-safe: imports the metadata module only (no fs/child_process),
 * so the client bundle stays clean.
 */

import {
  Award,
  BookOpen,
  Briefcase,
  Cpu,
  FileText,
  Globe,
  GraduationCap,
  Image,
  Landmark,
  Languages,
  LayoutDashboard,
  Leaf,
  Minus,
  Palette,
  Table,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { templatesForKind } from "@/lib/pdf/resumeTemplatesMeta";
import type { ResumeTemplateMeta } from "@/lib/pdf/resumeTemplatesMeta";
import type { ResumeDocKind } from "@/types";

export interface GalleryTemplate {
  meta: ResumeTemplateMeta;
  icon: LucideIcon;
  swatch: string;
  /** Honest short label from real metadata (primary audience). */
  badge: string;
}

const ICONS: Record<string, LucideIcon> = {
  "classic-ats": FileText,
  "modern-professional": Briefcase,
  executive: BookOpen,
  "tabular-german": Table,
  "modern-french": Globe,
  "mena-cv": Languages,
  "nordic-clean": Leaf,
  "creative-sidebar": Palette,
  "academic-cv": GraduationCap,
  "minimal-clean": Minus,
  "technical-modern": Cpu,
  "executive-elegant": Award,
  "developer-dashboard": LayoutDashboard,
  "academic-europass": Landmark,
  "creative-portfolio": Image,
};

const SWATCHES = [
  "bg-neutral-900",
  "bg-sky-700",
  "bg-teal-700",
  "bg-emerald-700",
  "bg-stone-900",
  "bg-zinc-800",
  "bg-blue-800",
  "bg-violet-700",
  "bg-amber-700",
];

/** Gallery cards for a studio doc kind, in registry order. */
export function galleryTemplates(kind: ResumeDocKind): GalleryTemplate[] {
  return templatesForKind(kind).map((meta, i) => ({
    meta,
    icon: ICONS[meta.id] ?? FileText,
    swatch: SWATCHES[i % SWATCHES.length],
    badge: meta.recommendedFor[0] ?? (kind === "cv" ? "CV" : "Resume"),
  }));
}

/** Studio doc kinds (letters live outside the Studio canvas). */
export const STUDIO_KINDS: ResumeDocKind[] = ["resume", "cv"];
