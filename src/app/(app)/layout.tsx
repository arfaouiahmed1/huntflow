import Sidebar from "@/components/Sidebar";
import PageShell from "@/components/PageShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      <Sidebar />
      <main className="lg:pl-[236px]">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8 lg:px-10">
          <PageShell>{children}</PageShell>
        </div>
      </main>
    </div>
  );
}
