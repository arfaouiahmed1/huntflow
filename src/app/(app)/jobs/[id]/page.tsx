"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import JobDetailView from "@/components/JobDetailView";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = params?.id ?? null;
  const router = useRouter();
  const { applications, dataReady } = useApp();

  const job = useMemo(
    () => applications.find((a) => a.id === jobId) || null,
    [applications, jobId]
  );

  if (!job) {
    if (!dataReady) {
      return (
        <div className="animate-pulse space-y-5">
          <div className="h-5 w-32 rounded-lg bg-white/5" />
          <div className="h-64 rounded-3xl border border-[var(--line)] bg-[var(--ink-card)]/40" />
          <div className="h-28 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/40" />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="h-96 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/40" />
            <div className="h-80 rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/40" />
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--ink-card)]/60 p-16 text-center">
        <p className="text-sm font-semibold text-[var(--paper)]">Job not found</p>
        <p className="mt-1 text-xs text-dim">It may have been removed.</p>
        <Button variant="outline" className="mt-5" onClick={() => router.push("/jobs")}>
          <ArrowLeft className="h-4 w-4" /> Back to Job Finder
        </Button>
      </div>
    );
  }

  return (
    <JobDetailView
      job={job}
      mode="page"
      onClose={() => router.push("/jobs")}
      onDelete={() => router.push("/jobs")}
    />
  );
}
