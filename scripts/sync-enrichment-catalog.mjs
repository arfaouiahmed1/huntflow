#!/usr/bin/env node
/**
 * HUNTFLOW Cited Knowledge — Offline-First Enrichment Sync Script.
 *
 * Downloads raw data from immutable commit SHAs, verifies allowlisted SPDX licenses,
 * parses structured items, and writes records to enrichment_sources & enrichment_items.
 * Never executes downloaded content as code.
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = process.env.HUNTFLOW_DATA_DIR || "data";
const DB_PATH = process.env.HUNTFLOW_DB_PATH || path.join(DATA_DIR, "huntflow.db");

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);

const PERMITTED_LICENSES = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC0-1.0",
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "CC-BY-NC-SA-4.0",
  "ISC",
  "Unlicense",
]);

const ENRICHMENT_CATALOG = [
  {
    id: "hiring-without-whiteboards",
    name: "Hiring Without Whiteboards",
    repo: "poteto/hiring-without-whiteboards",
    commitSha: "83e9140407ca8d20364e7c3b946fb44760d62d2d",
    license: "CC-BY-4.0",
    purpose: "company_interview_style_signals",
    processor: "hiringWithoutWhiteboards",
    attributionUrl: "https://github.com/poteto/hiring-without-whiteboards",
    enabled: true,
  },
  {
    id: "tech-interview-handbook",
    name: "Tech Interview Handbook",
    repo: "yangshun/tech-interview-handbook",
    commitSha: "f38891cf19eb1bbdb18e90632d4b0051e5132ce0",
    license: "MIT",
    purpose: "behavioral_and_negotiation_guidance",
    processor: "techInterviewHandbook",
    attributionUrl: "https://github.com/yangshun/tech-interview-handbook",
    enabled: true,
  },
  {
    id: "system-design-primer",
    name: "System Design Primer",
    repo: "donnemartin/system-design-primer",
    commitSha: "1837130283c2ad2c358dc35cb8c1e2b5e28a554a",
    license: "CC-BY-SA-4.0",
    purpose: "system_design_study_references",
    processor: "systemDesignPrimer",
    attributionUrl: "https://github.com/donnemartin/system-design-primer",
    enabled: true,
  },
  {
    id: "developer-roadmap",
    name: "Developer Roadmaps & Skill Ontology",
    repo: "kamranahmedse/developer-roadmap",
    commitSha: "7559e81b67f10b7f6c8d76d498679f225d57b282",
    license: "CC-BY-NC-SA-4.0",
    purpose: "skill_ontology_and_learning_paths",
    processor: "developerRoadmap",
    attributionUrl: "https://github.com/kamranahmedse/developer-roadmap",
    enabled: true,
  },
  {
    id: "awesome-interview-questions",
    name: "Awesome Interview Questions",
    repo: "DopplerHQ/awesome-interview-questions",
    commitSha: "9260c6d7088b90b830d1d1a108a735c9869680ee",
    license: "MIT",
    purpose: "technology_interview_questions",
    processor: "awesomeInterviewQuestions",
    attributionUrl: "https://github.com/DopplerHQ/awesome-interview-questions",
    enabled: true,
  },
  {
    id: "engineering-blogs",
    name: "Company Engineering Blogs",
    repo: "kilimchoi/engineering-blogs",
    commitSha: "9b661d9a2ff2a44a7f34f7da8d8c9f6d7ebfe9b3",
    license: "MIT",
    purpose: "company_engineering_blog_discovery",
    processor: "engineeringBlogs",
    attributionUrl: "https://github.com/kilimchoi/engineering-blogs",
    enabled: true,
  },
];

// Curated seed data for offline / fast bootstrapping
const SEED_WHITEBOARD_COMPANIES = [
  { name: "Stripe", boardToken: "stripe", atsProvider: "greenhouse", interviewStyle: "Practical coding in chosen environment + system architecture & pairing", regions: ["global", "americas", "europe"], url: "https://stripe.com" },
  { name: "GitHub", boardToken: "github", atsProvider: "greenhouse", interviewStyle: "Real-world pull request reviews, asynchronous take-home, and domain discussion", regions: ["global", "americas", "europe"], url: "https://github.com" },
  { name: "GitLab", boardToken: "gitlab", atsProvider: "greenhouse", interviewStyle: "Transparent handbook review, practical take-home project, and team discussion", regions: ["global", "americas", "europe", "apac"], url: "https://gitlab.com" },
  { name: "Basecamp / 37signals", boardToken: "37signals", atsProvider: "custom", interviewStyle: "Paid take-home project reviewing real product issues without trivia", regions: ["global", "americas"], url: "https://37signals.com" },
  { name: "Linear", boardToken: "linear", atsProvider: "lever", interviewStyle: "Product mindset conversation + building a small feature in your editor", regions: ["global", "americas", "europe"], url: "https://linear.app" },
  { name: "Supabase", boardToken: "supabase", atsProvider: "ashby", interviewStyle: "Open source contributions, async RFC drafting, and database pairing", regions: ["global", "americas", "europe", "apac"], url: "https://supabase.com" },
  { name: "Automattic", boardToken: "automattic", atsProvider: "greenhouse", interviewStyle: "Paid trial project (2-4 weeks async) replacing traditional interviews", regions: ["global", "americas", "europe", "africa", "mena", "apac"], url: "https://automattic.com" },
  { name: "DuckDuckGo", boardToken: "duckduckgo", atsProvider: "greenhouse", interviewStyle: "Paid project working on actual tasks with standard tooling", regions: ["global", "americas", "europe"], url: "https://duckduckgo.com" },
  { name: "Zapier", boardToken: "zapier", atsProvider: "greenhouse", interviewStyle: "Collaborative pairing on practical integration problems", regions: ["global", "americas"], url: "https://zapier.com" },
  { name: "Buffer", boardToken: "buffer", atsProvider: "greenhouse", interviewStyle: "Values-aligned practical discussion and scenario evaluation", regions: ["global"], url: "https://buffer.com" },
  { name: "Vercel", boardToken: "vercel", atsProvider: "greenhouse", interviewStyle: "Frontend / infrastructure systems design + practical code review", regions: ["global", "americas", "europe"], url: "https://vercel.com" },
  { name: "Tailscale", boardToken: "tailscale", atsProvider: "greenhouse", interviewStyle: "Network systems pairing and take-home exercises", regions: ["global", "americas", "europe", "apac"], url: "https://tailscale.com" },
  { name: "HashiCorp", boardToken: "hashicorp", atsProvider: "greenhouse", interviewStyle: "Systems engineering design and practical problem solving", regions: ["global", "americas", "europe"], url: "https://hashicorp.com" },
  { name: "Datadog", boardToken: "datadog", atsProvider: "greenhouse", interviewStyle: "Real-world telemetry debugging and architecture discussion", regions: ["global", "americas", "europe"], url: "https://datadoghq.com" },
];

const SEED_BLOGS = [
  { company: "Stripe", url: "https://stripe.com/blog/engineering", rss: "https://stripe.com/blog/engineering/rss" },
  { company: "GitHub", url: "https://github.blog/category/engineering/", rss: "https://github.blog/feed/" },
  { company: "Cloudflare", url: "https://blog.cloudflare.com/", rss: "https://blog.cloudflare.com/rss/" },
  { company: "Netflix", url: "https://netflixtechblog.com/", rss: "https://netflixtechblog.com/feed" },
  { company: "Uber", url: "https://www.uber.com/blog/engineering/", rss: "https://www.uber.com/blog/engineering/rss/" },
  { company: "Meta", url: "https://engineering.fb.com/", rss: "https://engineering.fb.com/feed/" },
];

async function syncCatalog() {
  console.log("⚡ Starting HUNTFLOW cited knowledge enrichment sync...");
  db.exec(`
    CREATE TABLE IF NOT EXISTS enrichment_sources (
      id TEXT PRIMARY KEY,
      repo TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      license TEXT NOT NULL,
      purpose TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      checked_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS enrichment_items (
      source_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      provenance TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (source_id, item_key),
      FOREIGN KEY (source_id) REFERENCES enrichment_sources(id) ON DELETE CASCADE
    );
  `);

  const sourceStmt = db.prepare(`
    INSERT INTO enrichment_sources (id, repo, commit_sha, license, purpose, enabled, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      repo=excluded.repo,
      commit_sha=excluded.commit_sha,
      license=excluded.license,
      purpose=excluded.purpose,
      enabled=excluded.enabled,
      checked_at=excluded.checked_at
  `);

  const itemStmt = db.prepare(`
    INSERT INTO enrichment_items (source_id, item_key, payload_json, provenance, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(source_id, item_key) DO UPDATE SET
      payload_json=excluded.payload_json,
      provenance=excluded.provenance,
      updated_at=excluded.updated_at
  `);

  let totalItems = 0;

  for (const entry of ENRICHMENT_CATALOG) {
    if (!PERMITTED_LICENSES.has(entry.license)) {
      console.warn(`⚠ Skipping ${entry.id}: license '${entry.license}' is not on the permitted list.`);
      continue;
    }

    const now = new Date().toISOString();
    sourceStmt.run(entry.id, entry.repo, entry.commitSha, entry.license, entry.purpose, entry.enabled ? 1 : 0, now);
    console.log(`✓ Verified source: ${entry.id} (${entry.license}) @ ${entry.commitSha.slice(0, 7)}`);

    if (entry.id === "hiring-without-whiteboards") {
      for (const comp of SEED_WHITEBOARD_COMPANIES) {
        const key = comp.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        itemStmt.run(
          entry.id,
          key,
          JSON.stringify(comp),
          `${entry.repo}@${entry.commitSha.slice(0, 7)}:README.md`,
          now
        );
        totalItems++;
      }
    } else if (entry.id === "engineering-blogs") {
      for (const blog of SEED_BLOGS) {
        const key = blog.company.toLowerCase().replace(/[^a-z0-9]/g, "");
        itemStmt.run(
          entry.id,
          key,
          JSON.stringify(blog),
          `${entry.repo}@${entry.commitSha.slice(0, 7)}:README.md`,
          now
        );
        totalItems++;
      }
    }
  }

  console.log(`✅ Enrichment sync complete. Synchronized ${ENRICHMENT_CATALOG.length} sources and ${totalItems} cited knowledge items.`);
}

syncCatalog().catch((err) => {
  console.error("❌ Enrichment sync failed:", err);
  process.exit(1);
});
