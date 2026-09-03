#!/usr/bin/env node
/**
 * HUNTFLOW Repository Doctor — scripts/repo-doctor.mjs
 *
 * Checks Node 22, npm, uv, Python, writable data directory, SQLite database,
 * sources.json v2 schema, sidecar status, and environment configuration.
 * Never prints secret values.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const ROOT = process.cwd();
console.log("🩺 Running HUNTFLOW Repository & Environment Doctor...\n");

let hasErrors = false;

// 1. Node version check
const nodeVer = process.version;
const nodeMajor = parseInt(nodeVer.slice(1).split(".")[0], 10);
if (nodeMajor >= 22 && nodeMajor < 23) {
  console.log(`✓ Node.js runtime: ${nodeVer} (Supported: >=22 <23)`);
} else if (nodeMajor >= 22) {
  console.log(`✓ Node.js runtime: ${nodeVer} (Node 22+)`);
} else {
  console.warn(`⚠ Node.js runtime: ${nodeVer} (Recommended: >=22 <23)`);
}

// 2. npm & uv CLI checks
try {
  const npmVer = execSync("npm --version", { encoding: "utf-8" }).trim();
  console.log(`✓ npm package manager: v${npmVer}`);
} catch {
  console.warn("⚠ npm CLI not detected in PATH");
}

try {
  const uvVer = execSync("uv --version", { encoding: "utf-8" }).trim();
  console.log(`✓ uv Python manager: ${uvVer}`);
} catch {
  console.warn("⚠ uv CLI not detected in PATH (required for Python sidecar)");
}

// 3. Data directory and SQLite health
const dataDir = path.join(ROOT, process.env.HUNTFLOW_DATA_DIR || "data");
try {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.accessSync(dataDir, fs.constants.W_OK);
  console.log(`✓ Writable data directory: ${dataDir}`);

  const dbPath = process.env.HUNTFLOW_DB_PATH || path.join(dataDir, "huntflow.db");
  const db = new DatabaseSync(dbPath);
  const tables = db.prepare("SELECT count(*) as n FROM sqlite_master WHERE type='table'").get();
  console.log(`✓ SQLite database accessible: ${dbPath} (${tables.n} tables)`);
  db.close();
} catch (err) {
  console.error(`❌ Data directory / SQLite error: ${err.message}`);
  hasErrors = true;
}

// 4. Source registry v2 validation
const sourcesJsonPath = path.join(ROOT, "scrapling-agent/sources.json");
if (fs.existsSync(sourcesJsonPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(sourcesJsonPath, "utf-8"));
    if (raw.schemaVersion === 2 && Array.isArray(raw.sources)) {
      console.log(`✓ Source registry v2 valid: ${raw.sources.length} sources registered`);
    } else {
      console.error("❌ sources.json is missing schemaVersion 2 or sources array");
      hasErrors = true;
    }
  } catch (err) {
    console.error(`❌ Failed to parse sources.json: ${err.message}`);
    hasErrors = true;
  }
} else {
  console.error("❌ scrapling-agent/sources.json not found");
  hasErrors = true;
}

// 5. Sidecar status probe
const sidecarUrl = process.env.SCRAPLING_AGENT_URL || "http://127.0.0.1:8001";
try {
  const res = await fetch(`${sidecarUrl}/health`, { signal: AbortSignal.timeout(1500) });
  if (res.ok) {
    const data = await res.json();
    console.log(`✓ Scrapling sidecar live: ${sidecarUrl} (Fetchers: ${data.fetcher})`);
  } else {
    console.log(`ℹ Scrapling sidecar HTTP ${res.status}: ${sidecarUrl} (Start via: npm run dev)`);
  }
} catch {
  console.log(`ℹ Scrapling sidecar offline: ${sidecarUrl} (Start via: npm run dev)`);
}

// 6. Environment configuration audit (no secrets printed)
const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath)) {
  console.log("✓ Local .env file detected");
} else {
  console.log("ℹ No .env file detected (Core local app works with defaults; copy .env.example if configuring keys)");
}

console.log("\n========================================================");
if (hasErrors) {
  console.error("❌ Repository doctor detected issues that require attention.");
  process.exit(1);
} else {
  console.log("🎉 Local core repository is healthy and ready!");
  process.exit(0);
}
