/**
 * Import Notion-exported job tracker CSVs into src/lib/seedData.ts
 *
 * Usage: node scripts/import-notion.mjs <applications.csv> <watch.csv>
 * Output: src/lib/seedData.ts (typed JobApplication[] seeds)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "src", "lib", "seedData.ts");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

function toRows(file) {
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => {
      obj[h] = (r[i] ?? "").trim();
    });
    return obj;
  });
}

function parseDate(value) {
  if (!value) return undefined;
  const v = value.trim();
  const iso = /^\d{4}-\d{2}-\d{2}/.test(v);
  const t = iso ? new Date(v) : new Date(Date.parse(v));
  if (isNaN(t.getTime())) return undefined;
  return t.toISOString().slice(0, 10);
}

const FIT_SCORE = { A: 85, B: 70, C: 55 };

function fitScore(fit) {
  if (!fit) return undefined;
  const m = String(fit).match(/\b([ABC])\b/);
  return m ? FIT_SCORE[m[1]] : undefined;
}

const JUNK_SALARY = /^(not stated|not listed|unspecified|n\/a|competitive|unpaid)$/i;

function buildJob({ id, title, company, location, salary, url, status, appliedDate, deadline, followUpDue, priority, jobDescription, notes, matchScore, createdDate }) {
  const job = {
    id,
    title: title || "Untitled role",
    company: company || "Unknown",
    location: location || "Remote / Flexible",
    status,
    jobDescription: jobDescription || "",
    createdDate: createdDate || "2026-07-30",
  };
  if (salary && !JUNK_SALARY.test(salary)) job.salary = salary;
  if (url) job.url = url;
  if (appliedDate) job.appliedDate = appliedDate;
  if (deadline) job.deadline = deadline;
  if (followUpDue) job.followUpDue = followUpDue;
  if (priority) job.priority = priority;
  if (notes) job.notes = notes;
  if (matchScore != null) job.matchScore = matchScore;
  return job;
}

const seeds = [];
const seen = new Set();

function addJob(job) {
  const key = `${job.company}|${job.title}`.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  seeds.push(job);
}

// ---- Applications register -------------------------------------------------
function importApplications(file) {
  const rows = toRows(file);
  let i = 0;
  for (const r of rows) {
    const stage = r["Stage"] || "";
    const isApplied = /applied/i.test(stage);
    const status = isApplied ? "applied" : "wishlist";
    const parts = [];
    if (r["Next action"]) parts.push(`Next: ${r["Next action"]}`);
    if (r["Reason"]) parts.push(r["Reason"]);
    if (r["Notes"]) parts.push(r["Notes"]);
    if (r["Application channel"]) parts.push(`Channel: ${r["Application channel"]}`);
    if (r["Recruiter / Outreach"]) parts.push(`Recruiter: ${r["Recruiter / Outreach"]}`);
    if (r["ATS keywords"]) parts.push(`ATS keywords: ${r["ATS keywords"]}`);
    const notes = parts.filter(Boolean).join(" · ");

    addJob(buildJob({
      id: `seed-${++i}`,
      title: r["Task"] || r["Role"] || "Untitled role",
      company: r["Company"] || "Unknown",
      location: [r["Location"], r["Work mode"]].filter(Boolean).join(" · "),
      salary: r["Compensation"],
      url: r["Link"],
      status,
      appliedDate: parseDate(r["Applied on"]),
      deadline: parseDate(r["Application deadline"]),
      followUpDue: parseDate(r["Follow-up due"]),
      priority: (r["Priority"] || "").toLowerCase() || undefined,
      jobDescription: r["Job summary"] || "",
      notes: notes || undefined,
      matchScore: fitScore(r["Fit tier"]),
      createdDate: parseDate(r["Applied on"]) || parseDate(r["Last verified"]) || "2026-07-30",
    }));
  }
  return i;
}

// ---- Tunisia watch list ----------------------------------------------------
function importWatch(file) {
  const rows = toRows(file);
  let i = 0;
  for (const r of rows) {
    const decision = r["Decision"] || "";
    const keep = /promoted.*apply|watch|consider/i.test(decision) && !/skip/i.test(decision);
    const role = r["Roles listed"] || "";
    if (!keep) continue;
    if (/no recent matching/i.test(role)) continue;
    const parts = [];
    if (r["Reason"]) parts.push(r["Reason"]);
    if (role) parts.push(`Roles: ${role}`);
    if (r["Freshness"]) parts.push(`Freshness: ${r["Freshness"]}`);
    if (r["Posted on"]) parts.push(`Posted: ${r["Posted on"]}`);

    addJob(buildJob({
      id: `seed-watch-${++i}`,
      title: r["Post / Company"] || role || "Untitled role",
      company: r["Company"] || (r["Post / Company"] || "").split(" — ")[0] || "Unknown",
      location: r["Location"] || "Remote / Flexible",
      url: r["Post URL"],
      status: "wishlist",
      jobDescription: r["Reason"] || "",
      notes: parts.filter(Boolean).join(" · ") || undefined,
      matchScore: fitScore(r["Fit"]),
      createdDate: parseDate(r["Posted on"]) || "2026-07-30",
    }));
  }
  return i;
}

const appsFile = process.argv[2];
const watchFile = process.argv[3];
if (!appsFile || !watchFile) {
  console.error("Usage: node scripts/import-notion.mjs <applications.csv> <watch.csv>");
  process.exit(1);
}

const nApps = importApplications(appsFile);
const nWatch = importWatch(watchFile);

const output = `import { JobApplication } from "../types";

// Auto-generated by scripts/import-notion.mjs — do not edit by hand.
export const seedJobs: JobApplication[] = ${JSON.stringify(seeds, null, 2)};
`;

fs.writeFileSync(OUT, output, "utf8");
console.log(`Wrote ${OUT}`);
console.log(`  applications: ${nApps} rows parsed`);
console.log(`  watch list:   ${nWatch} rows imported`);
console.log(`  total seeds:  ${seeds.length}`);
