import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* pdf-parse resolves its pdf.worker.mjs relative to the package at
     runtime — externalizing keeps that relative import intact. */
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
