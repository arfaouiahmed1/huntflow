import { ApplicationStatus } from "@/types";
import { cn } from "@/lib/utils";
import { palette } from "@/lib/theme";

export const statusConfig: Record<ApplicationStatus, { label: string; dot: string; text: string; bg: string }> = {
  wishlist: { label: "Wishlist", dot: palette.sky, text: "text-sky", bg: "bg-sky/10 border-sky/25" },
  applied: { label: "Applied", dot: palette.violet, text: "text-violet", bg: "bg-violet/10 border-violet/25" },
  interviewing: { label: "Interviewing", dot: palette.amber, text: "text-amber", bg: "bg-amber/10 border-amber/25" },
  offer: { label: "Offer", dot: palette.chartreuse, text: "text-chartreuse", bg: "bg-chartreuse/10 border-chartreuse/25" },
  rejected: { label: "Rejected", dot: palette.coral, text: "text-coral", bg: "bg-coral/10 border-coral/25" },
};

export const STATUS_ORDER: ApplicationStatus[] = ["wishlist", "applied", "interviewing", "offer", "rejected"];

export default function StatusBadge({ status, size = "md" }: { status: ApplicationStatus; size?: "sm" | "md" }) {
  const c = statusConfig[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        c.bg,
        c.text,
        size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10px]"
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}
