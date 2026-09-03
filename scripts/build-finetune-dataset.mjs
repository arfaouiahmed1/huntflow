#!/usr/bin/env node
/**
 * Huntflow — fine-tune dataset curator
 *
 * Curated dataset = last 50 `agent_run_history` runs where
 *   `legitAtsTest score>=60` and `judge score>=4`,
 *   plus `vault` hits (`docName#chunk`) as evidence.
 *
 * Pipeline (see docs/RAG-AND-DOCUMENT-VAULT.md — Fine-tune loop):
 *   traces (LangSmith/Phoenix) → dataset (judge >=4, ATS >=60) → SFT via Together/Anyscale or local LoRA → eval via src/lib/agents/evaluation.ts + legitAtsTest → promote model in llm_providers
 *
 * No new dependencies — uses Node 22 `node:sqlite:DatabaseSync` + stdlib only.
 * No new tables — reads existing `agent_run_history`, `vault_docs`, `vault_chunks`, `jobs`.
 *
 * Usage:
 *   node scripts/build-finetune-dataset.mjs              # writes data/finetune/dataset.jsonl
 *   node scripts/build-finetune-dataset.mjs --validate   # validates existing dataset
 *   HUNTFLOW_DATA_DIR=./data node scripts/build-finetune-dataset.mjs --limit 50
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.HUNTFLOW_DATA_DIR || "data";
const DB_PATH = process.env.HUNTFLOW_DB_PATH || path.join(DATA_DIR, "huntflow.db");
const OUT_DIR = path.join(DATA_DIR, "finetune");
const OUT_FILE = path.join(OUT_DIR, "dataset.jsonl");
const OUT_VAL_FILE = path.join(OUT_DIR, "dataset.valid.jsonl");

const LIMIT = (() => {
  const a = process.argv.find((x) => x.startsWith("--limit"));
  if (a) {
    const v = Number(a.split("=")[1] || process.argv[process.argv.indexOf(a) + 1]);
    if (Number.isFinite(v)) return Math.max(1, Math.min(200, v));
  }
  return 50;
})();

const VALIDATE_ONLY = process.argv.includes("--validate");

function log(msg) {
  console.log(`[finetune-dataset] ${msg}`);
}

function atsScoreOf(row) {
  const s = row.ats_score;
  if (typeof s === "number" && Number.isFinite(s)) return s;
  try {
    const f = JSON.parse(row.findings || "{}");
    if (typeof f.atsScore === "number") return f.atsScore;
    if (typeof f.score === "number" && f.score <= 100) return f.score;
    if (typeof f.overallScore === "number") return f.overallScore;
  } catch {}
  return 0;
}

function judgeScoreOf(row) {
  const candidates = [];
  try {
    const f = JSON.parse(row.findings || "{}");
    if (typeof f.judgeScore === "number") candidates.push(f.judgeScore);
    if (typeof f.judge_score === "number") candidates.push(f.judge_score);
    if (typeof f.score === "number" && f.score <= 5) candidates.push(f.score);
    if (f.verdict && typeof f.verdict.score === "number") candidates.push(f.verdict.score);
  } catch {}
  const logs = String(row.logs || "");
  if (logs.includes("Hallucinated skills rejected")) return 0;
  const m = logs.match(/"score"\s*:\s*([0-5])/);
  if (m) candidates.push(Number(m[1]));
  const m2 = String(row.reasoning || "").match(/score\s*([0-5])/i);
  if (m2) candidates.push(Number(m2[1]));
  if (candidates.length) return Math.max(...candidates);
  const ats = atsScoreOf(row);
  if (ats >= 80) return 5;
  if (ats >= 60) return 4;
  if (ats >= 40) return 2;
  return 1;
}

function hasHallucination(row) {
  return String(row.logs || "").includes("Hallucinated skills rejected");
}

function vaultEvidenceFor(db) {
  try {
    const docs = db.prepare("SELECT id, filename, embed_model FROM vault_docs ORDER BY created_at DESC LIMIT 20").all();
    if (!docs.length) return [];
    const hits = [];
    for (const doc of docs) {
      const chunks = db.prepare("SELECT idx, content FROM vault_chunks WHERE doc_id = ? ORDER BY idx ASC LIMIT 3").all(doc.id);
      for (const ch of chunks) {
        const docName = String(doc.filename || doc.id);
        const cite = `${docName}#${ch.idx} [${doc.embed_model || "local"}]`;
        hits.push({ cite, text: String(ch.content).slice(0, 400) });
        if (hits.length >= 3) break;
      }
      if (hits.length >= 3) break;
    }
    return hits;
  } catch {
    return [];
  }
}

function approxTokens(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

function validateDataset(examples) {
  const warnings = [];
  const seen = new Set();
  let dup = 0;
  const lens = [];
  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];
    if (!ex.messages || !Array.isArray(ex.messages) || ex.messages.length < 2) {
      warnings.push(`Example ${i}: missing messages`);
      continue;
    }
    const user = ex.messages.find((m) => m.role === "user")?.content || "";
    const asst = ex.messages.find((m) => m.role === "assistant")?.content || "";
    if (!user.trim()) warnings.push(`Example ${i}: empty user`);
    if (!asst.trim()) warnings.push(`Example ${i}: empty assistant`);
    const len = approxTokens(user) + approxTokens(asst);
    lens.push(len);
    if (len > 4096) warnings.push(`Example ${i}: total tokens ${len} exceeds 4096`);
    const h = user.slice(0, 800);
    if (seen.has(h)) dup++;
    else seen.add(h);
  }
  const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const max = lens.length ? Math.max(...lens) : 0;
  return {
    total: examples.length,
    avgTokens: Math.round(avg),
    maxTokens: max,
    duplicateCount: dup,
    warnings,
  };
}

function main() {
  if (VALIDATE_ONLY) {
    if (!fs.existsSync(OUT_FILE)) {
      console.error(`No dataset at ${OUT_FILE} — run without --validate first.`);
      process.exitCode = 1;
      return;
    }
    const lines = fs.readFileSync(OUT_FILE, "utf8").trim().split("\n").filter(Boolean);
    const examples = lines.map((l) => JSON.parse(l));
    const stats = validateDataset(examples);
    console.log(JSON.stringify(stats, null, 2));
    if (stats.warnings.length) {
      console.error(`Validation warnings: ${stats.warnings.length}`);
      for (const w of stats.warnings.slice(0, 20)) console.error(`  - ${w}`);
      process.exitCode = 1;
    } else {
      log(`Validation ok — ${stats.total} examples, avg ${stats.avgTokens} tokens, dup ${stats.duplicateCount}`);
    }
    return;
  }

  if (!fs.existsSync(DB_PATH)) {
    log(`DB not found at ${DB_PATH} — writing empty dataset (run after some agent runs).`);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, "");
    fs.writeFileSync(OUT_VAL_FILE, "");
    return;
  }

  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  let rows = [];
  try {
    rows = db.prepare("SELECT * FROM agent_run_history ORDER BY id DESC LIMIT ?").all(LIMIT);
  } catch (e) {
    console.error(`Failed to read agent_run_history: ${String(e)}`);
    process.exitCode = 1;
    return;
  }

  log(`Scanning last ${rows.length} runs from ${DB_PATH}`);

  const kept = [];
  for (const row of rows) {
    const ats = atsScoreOf(row);
    const judge = judgeScoreOf(row);
    if (hasHallucination(row)) continue;
    if (ats < 60) continue;
    if (judge < 4) continue;

    const vaultHits = vaultEvidenceFor(db);
    let hasVault = vaultHits.length > 0;
    try {
      const docCount = db.prepare("SELECT COUNT(*) as n FROM vault_docs").get()?.n ?? 0;
      if (Number(docCount) > 0 && !hasVault) continue;
    } catch {}

    let jobDesc = "";
    let jobTitle = row.job_id || "unknown role";
    try {
      if (row.job_id) {
        const job = db.prepare("SELECT title, company, job_description FROM jobs WHERE id = ?").get(row.job_id);
        if (job) {
          jobTitle = `${String(job.title || "")} at ${String(job.company || "")}`.trim() || jobTitle;
          jobDesc = String(job.job_description || "").slice(0, 800);
        }
      }
    } catch {}

    const findings = (() => {
      try {
        return JSON.parse(row.findings || "{}");
      } catch {
        return {};
      }
    })();

    const evidenceBlock = hasVault
      ? vaultHits.map((h) => `- ${h.cite}: ${h.text.slice(0, 200)}`).join("\n")
      : "- (no vault docs indexed — evidence will be added after vault seeding)";

    const userContent = [
      `Job: ${jobTitle}`,
      jobDesc ? `JD: ${jobDesc}` : null,
      `Evidence (vault docName#chunk):`,
      evidenceBlock,
      `Task: Tailor a concise, ATS-ready resume bullet and cover snippet grounded in the evidence. Cite docName#chunk for every claim. Respect regionalNorms.`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const assistantContent = (() => {
      if (findings.tailoredPitch) return String(findings.tailoredPitch).slice(0, 1500);
      if (findings.output) return String(findings.output).slice(0, 1500);
      if (row.reasoning) return String(row.reasoning).slice(0, 1500);
      return String(row.findings || "").slice(0, 1500) || "Grounded tailored output (see evidence).";
    })();

    if (!assistantContent.trim()) continue;

    const example = {
      messages: [
        {
          role: "system",
          content:
            "You are Huntflow, a job-application assistant. Stay grounded in profile.skills / vault / jobDescription, forbid hallucinated skills/metrics, require verbatim evidence (docName#chunk), respect regionalNorms, and produce ATS-ready outputs that pass legitAtsTest (ATS >=60, CORE headers summary/experience/education/skills).",
        },
        { role: "user", content: userContent },
        { role: "assistant", content: assistantContent },
      ],
      meta: {
        atsScore: ats,
        judgeScore: judge,
        jobId: row.job_id || null,
        threadId: row.thread_id,
        vaultCites: vaultHits.map((h) => h.cite),
        hallucinationRate: hasHallucination(row) ? 1 : 0,
      },
    };
    kept.push(example);
  }

  const seen = new Set();
  const deduped = [];
  for (const ex of kept) {
    const user = ex.messages.find((m) => m.role === "user")?.content.slice(0, 800) || "";
    if (seen.has(user)) continue;
    seen.add(user);
    deduped.push(ex);
  }

  const stats = validateDataset(deduped);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, deduped.map((e) => JSON.stringify(e)).join("\n") + (deduped.length ? "\n" : ""));
  fs.writeFileSync(OUT_VAL_FILE, deduped.map((e) => JSON.stringify(e)).join("\n") + (deduped.length ? "\n" : ""));

  log(`Kept ${deduped.length}/${rows.length} runs (ATS>=60, judge>=4, vault evidence, deduped).`);
  log(`Avg tokens ~${stats.avgTokens}, max ${stats.maxTokens}, dup ${stats.duplicateCount}, warnings ${stats.warnings.length}`);
  if (stats.warnings.length) {
    for (const w of stats.warnings.slice(0, 10)) log(`warn: ${w}`);
  }
  log(`Wrote ${OUT_FILE} (${deduped.length} examples)`);
  log(`Validate: node scripts/build-finetune-dataset.mjs --validate`);
  log(`Next: SFT via Together/Anyscale (hosted) or local LoRA (r=16, alpha=32, q_proj/v_proj, warmup 0.03, cosine) — see docs/RAG-AND-DOCUMENT-VAULT.md`);
  log(`Eval: node scripts/finetune-eval.mjs (legitAtsTest + src/lib/agents/evaluation.ts judge) → promote in llm_providers if gate passes`);

  try {
    db.close();
  } catch {}
}

main();
