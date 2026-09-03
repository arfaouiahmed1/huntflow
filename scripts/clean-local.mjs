#!/usr/bin/env node
/**
 * HUNTFLOW Local Cleanup Utility — scripts/clean-local.mjs
 *
 * Removes reproducible caches, compiler outputs, and temporary logs.
 * Preserves user databases (data/), session files, and agent artifacts by default.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const includeUserArtifacts = process.argv.includes("--include-user-artifacts");

const REPRODUCIBLE_TARGETS = [
  ".next",
  "coverage",
  "tsconfig.tsbuildinfo",
  "tsc.log",
  "tsc_errors.log",
  "vitest.log",
  ".playwright-mcp",
  "scrapling-agent/__pycache__",
  "tmp",
  "output/pdf",
];

const USER_ARTIFACT_TARGETS = [
  "data",
  "scrapling-agent/.agent_runs",
  "scrapling-agent/.linkedin_session",
];

console.log("🧹 Running HUNTFLOW local cache and build artifact cleanup...\n");

let cleanedCount = 0;

function removePath(relPath) {
  const full = path.join(ROOT, relPath);
  if (fs.existsSync(full)) {
    try {
      fs.rmSync(full, { recursive: true, force: true });
      console.log(`✓ Removed: ${relPath}`);
      cleanedCount++;
    } catch (err) {
      console.warn(`⚠ Could not remove ${relPath}: ${err.message}`);
    }
  }
}

for (const target of REPRODUCIBLE_TARGETS) {
  removePath(target);
}

// Clean python pycache recursively inside scrapling-agent
const scraplingDir = path.join(ROOT, "scrapling-agent");
if (fs.existsSync(scraplingDir)) {
  const cleanPycache = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "__pycache__") {
          fs.rmSync(p, { recursive: true, force: true });
          console.log(`✓ Removed: ${path.relative(ROOT, p)}`);
          cleanedCount++;
        } else if (e.name !== ".venv") {
          cleanPycache(p);
        }
      } else if (e.isFile() && e.name.endsWith(".log")) {
        fs.rmSync(p, { force: true });
        console.log(`✓ Removed log: ${path.relative(ROOT, p)}`);
        cleanedCount++;
      }
    }
  };
  try {
    cleanPycache(scraplingDir);
  } catch {
    // ignore
  }
}

if (includeUserArtifacts) {
  console.log("\n⚠ Removing user data and session artifacts (--include-user-artifacts flag passed)...");
  for (const target of USER_ARTIFACT_TARGETS) {
    removePath(target);
  }
} else {
  console.log("\n🔒 User databases (data/), session tokens, and run artifacts preserved.");
}

console.log(`\n✨ Local cleanup complete. Removed ${cleanedCount} cached item(s).`);
