#!/usr/bin/env node
/**
 * HUNTFLOW Environment Validator — scripts/check-env-examples.mjs
 *
 * Verifies that all process.env and os.environ references in the codebase
 * are documented in the canonical .env.example template.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENV_EXAMPLE = path.join(ROOT, ".env.example");

if (!fs.existsSync(ENV_EXAMPLE)) {
  console.error("❌ .env.example missing at repository root");
  process.exit(1);
}

const exampleContent = fs.readFileSync(ENV_EXAMPLE, "utf-8");
const documentedKeys = new Set();

for (const line of exampleContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const match = trimmed.match(/^([A-Z0-9_]+)=/);
  if (match) {
    documentedKeys.add(match[1]);
  }
}

console.log(`📋 Found ${documentedKeys.size} documented environment keys in .env.example`);

// Scan source files for environment variable references
const scannedKeys = new Set();

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === ".next" ||
        entry.name === "coverage" ||
        entry.name === ".venv" ||
        entry.name === ".claude" ||
        entry.name === ".omo" ||
        entry.name === ".agents" ||
        entry.name === "dist"
      ) {
        continue;
      }
      scanDir(fullPath);
    } else if (
      entry.isFile() &&
      /\.(ts|tsx|js|mjs|py)$/.test(entry.name) &&
      !entry.name.includes("test")
    ) {
      const content = fs.readFileSync(fullPath, "utf-8");

      // Match process.env.KEY or process.env["KEY"]
      const jsMatches = content.matchAll(/process\.env(?:\.([A-Z0-9_]+)|\[["']([A-Z0-9_]+)["']\])/g);
      for (const m of jsMatches) {
        const key = m[1] || m[2];
        if (key && !["NODE_ENV", "VERCEL", "PORT", "PWD"].includes(key)) {
          scannedKeys.add(key);
        }
      }

      // Match os.environ.get("KEY") or os.environ["KEY"]
      const pyMatches = content.matchAll(/os\.environ(?:\.get\(["']([A-Z0-9_]+)["']|\[["']([A-Z0-9_]+)["']\])/g);
      for (const m of pyMatches) {
        const key = m[1] || m[2];
        if (key) {
          scannedKeys.add(key);
        }
      }
    }
  }
}

scanDir(path.join(ROOT, "src"));
if (fs.existsSync(path.join(ROOT, "scrapling-agent"))) {
  scanDir(path.join(ROOT, "scrapling-agent"));
}

const undocumented = [];
for (const key of scannedKeys) {
  if (!documentedKeys.has(key)) {
    undocumented.push(key);
  }
}

if (undocumented.length > 0) {
  console.error(`❌ Found ${undocumented.length} undocumented environment variable(s) used in codebase:`);
  for (const k of undocumented) {
    console.error(`   - ${k}`);
  }
  process.exit(1);
}

console.log(`✅ All ${scannedKeys.size} referenced environment variables are documented in .env.example!`);
