import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The desktop app opens the workspace by IP while the development server
  // initializes on localhost. Next 16 otherwise blocks the client chunks.
  allowedDevOrigins: ["127.0.0.1"],
  /* pdf-parse resolves its pdf.worker.mjs relative to the package at
     runtime — externalizing keeps that relative import intact. */
  serverExternalPackages: ["pdf-parse"],
  outputFileTracingIncludes: {
    "/api/resume/*": ["./src/lib/pdf/templates/*.tex"],
    "/api/pdf": ["./src/lib/pdf/templates/*.tex"],
  },
};

export default nextConfig;
