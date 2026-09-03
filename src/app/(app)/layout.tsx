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
        <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
          <PageShell>{children}</PageShell>
        </div>
      </main>
    </div>
  );
}
