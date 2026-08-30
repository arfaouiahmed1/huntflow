import type { Metadata } from "next";
import { Manrope, JetBrains_Mono, STIX_Two_Text } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import { AppearanceProvider } from "@/context/AppearanceContext";
import { ToasterProvider } from "@/components/ui/Toaster";
import { DevDiagnostics } from "@/components/dev/DevDiagnostics";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const documentSerif = STIX_Two_Text({
  variable: "--font-document",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "HUNTFLOW — Private AI Career Workspace",
  description:
    "Rank opportunities, tailor evidence-backed applications, and manage your career workflow from one local-first AI workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${documentSerif.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/* Server-side dev gate: in production builds this branch is false at
            build time, so the diagnostics client leaf is never rendered. The
            leaf and the /api/dev-tools route re-check the same contract. */}
        {process.env.NODE_ENV === "development" &&
        process.env.NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS !== "1" ? (
          <DevDiagnostics />
        ) : null}
        <ToasterProvider>
          <AppearanceProvider>
            <AppProvider>{children}</AppProvider>
          </AppearanceProvider>
        </ToasterProvider>
      </body>
    </html>
  );
}
