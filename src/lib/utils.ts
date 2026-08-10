import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { palette } from "./theme";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function relativeDays(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  const diff = Math.round((d.getTime() - Date.now()) / 86400000);
  if (diff === 0) return "Today";
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  return `${diff}d left`;
}

export function scoreColor(score: number) {
  if (score >= 85) return palette.chartreuse;
  if (score >= 70) return palette.amber;
  return palette.coral;
}
