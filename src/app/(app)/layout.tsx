"use client";

import Sidebar from "@/components/Sidebar";
import PageShell from "@/components/PageShell";
import { useAppearance } from "@/context/AppearanceContext";
import { cn } from "@/lib/utils";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { appearance } = useAppearance();

  return (
    <div className="min-h-full">
      <Sidebar />
      <main
        className={cn(
          "transition-[padding] duration-200",
          appearance.sidebarCollapsed ? "lg:pl-[76px]" : "lg:pl-[236px]",
        )}
      >
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8 lg:px-10">
          <PageShell>{children}</PageShell>
        </div>
      </main>
    </div>
  );
}
