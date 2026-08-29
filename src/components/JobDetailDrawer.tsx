"use client";

import { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "@/context/AppContext";
import JobDetailView from "@/components/JobDetailView";

export default function JobDetailDrawer({
  jobId,
  onClose,
}: {
  jobId: string | null;
  onClose: () => void;
}) {
  const { applications } = useApp();

  const job = useMemo(
    () => (jobId ? applications.find((a) => a.id === jobId) || null : null),
    [applications, jobId]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (jobId) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [jobId, onClose]);

  if (!job) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        data-testid="job-drawer"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-[560px] flex-col border-l border-[var(--line)] bg-[var(--ink-soft)] shadow-2xl overflow-hidden"
      >
        <JobDetailView
          job={job}
          mode="drawer"
          onClose={onClose}
          onDelete={onClose}
        />
      </motion.aside>
    </AnimatePresence>
  );
}
