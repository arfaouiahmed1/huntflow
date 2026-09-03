import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import {
  Contact,
  EmailMessage,
  InterviewEvent,
  JobApplication,
  NotificationItem,
  Reminder,
  ResumeContent,
  ResumeDoc,
  ResumeVariant,
} from "@/types";
import type {
  SourceDefinition,
  SourceSyncState,
  CrawlerRunSummary,
  SavedSearchRecord,
  EnrichmentSourceRecord,
  EnrichmentItemRecord,
  JobSourceEdge,
} from "./crawler/contracts";
import { redactSettings } from "./masking";
import { seedJobs } from "./seedData";
import { initialProfile } from "./initialData";
// without asking Next's file tracer to follow the entire repository.
const DATA_DIR = process.env.HUNTFLOW_DATA_DIR || "data";
const DB_PATH = process.env.HUNTFLOW_DB_PATH || path.join(DATA_DIR, "huntflow.db");

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

/** Close the singleton connection (used by tests for isolation). */
export function closeDb() {
  try {
    db?.close();
  } catch {
    /* ignore */
  }
  db = null;
}

export interface BrowserSessionConfig {
  id: string;
  name: string;
  cookies?: Array<{ name: string; value: string; domain: string }>;
  userAgent?: string;
  proxyUrl?: string;
  visionEnabled?: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

export const browserSessionsRepo = {
  get(id = "default"): BrowserSessionConfig | null {
    try {
      const raw = settingsRepo.get(`browser_session:${id}`);
      return raw ? (JSON.parse(raw) as BrowserSessionConfig) : null;
    } catch {
      return null;
    }
  },
  set(session: BrowserSessionConfig): void {
    settingsRepo.set(`browser_session:${session.id}`, JSON.stringify(session));
  },
  list(): BrowserSessionConfig[] {
    try {
      const db = getDb();
      const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'browser_session:%'").all() as Array<{ key: string; value: string }>;
      return rows.map((r) => JSON.parse(r.value) as BrowserSessionConfig);
    } catch {
      return [];
    }
  },
  delete(id: string): void {
    settingsRepo.remove(`browser_session:${id}`);
  },
};


export function migrate(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      postal_code TEXT,
      salary TEXT,
      url TEXT,
      status TEXT NOT NULL DEFAULT 'wishlist',
      applied_date TEXT,
      deadline TEXT,
      follow_up_due TEXT,
      priority TEXT,
      job_description TEXT NOT NULL DEFAULT '',
      notes TEXT,
      match_score INTEGER,
      skills_gap TEXT,
      documents TEXT,
      star_flashcards TEXT,
      interview_questions TEXT,
      job_brief TEXT,
      salary_intel TEXT,
      auto_apply_status TEXT NOT NULL DEFAULT 'idle',
      auto_apply_logs TEXT,
      employer_review TEXT,
      fit_category TEXT,
      multi_agent_outputs TEXT,
      source TEXT,
      hiring_post INTEGER NOT NULL DEFAULT 0,
      created_date TEXT NOT NULL,
      company_logo TEXT,
      screenshot_url TEXT,
      cloudinary_url TEXT,
      skip_reason TEXT,
      canonical_key TEXT,
      first_seen_at TEXT,
      last_seen_at TEXT,
      posted_at TEXT,
      closed_at TEXT,
      seniority TEXT,
      work_mode TEXT,
      employment_type TEXT,
      salary_min REAL,
      salary_max REAL,
      salary_currency TEXT,
      visa_signal TEXT,
      tech_tags TEXT,
      source_confidence REAL,
      sources_count INTEGER,
      ranking_breakdown TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      linkedin TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'other',
      relationship TEXT NOT NULL DEFAULT 'other',
      notes TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'medium',
      last_contacted TEXT,
      company_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      contact_id TEXT,
      job_id TEXT,
      direction TEXT NOT NULL DEFAULT 'sent',
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      sent_at TEXT NOT NULL,
      thread_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      read INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY,
      job_id TEXT,
      title TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'video',
      scheduled_at TEXT NOT NULL,
      duration_min INTEGER NOT NULL DEFAULT 45,
      location TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'scheduled',
      rating INTEGER,
      review TEXT,
      prep TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'custom',
      ref_id TEXT,
      due_at TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (datetime('now')),
      agent TEXT NOT NULL DEFAULT 'generate',
      kind TEXT NOT NULL DEFAULT 'completion',
      provider TEXT,
      model TEXT,
      status TEXT NOT NULL DEFAULT 'ok',
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      cost_est REAL NOT NULL DEFAULT 0,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL DEFAULT 'note',
      content TEXT NOT NULL,
      job_id TEXT,
      source TEXT NOT NULL DEFAULT 'system',
      importance INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      run_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS memory_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id INTEGER NOT NULL,
      embedding TEXT NOT NULL DEFAULT '[]',
      model TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS agent_state (
      agent TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (agent, key)
    );
    CREATE TABLE IF NOT EXISTS vault_docs (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'indexing',
      embed_model TEXT NOT NULL DEFAULT 'local',
      chunk_count INTEGER NOT NULL DEFAULT 0,
      label TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vault_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id TEXT NOT NULL,
      idx INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL,
      tokens INTEGER NOT NULL DEFAULT 0,
      embedding TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS resume_docs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'resume',
      template_id TEXT NOT NULL DEFAULT 'classic-ats',
      tex TEXT NOT NULL DEFAULT '',
      content TEXT,
      source TEXT NOT NULL DEFAULT 'scratch',
      source_doc_id TEXT,
      target_job_id TEXT,
      auto_compile INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS resume_variants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      archetype TEXT NOT NULL,
      tag TEXT NOT NULL,
      template_id TEXT NOT NULL DEFAULT 'classic-ats',
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS questionnaires (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS agent_checkpoints (
      thread_id TEXT NOT NULL,
      checkpoint_ns TEXT NOT NULL DEFAULT '',
      checkpoint_id TEXT NOT NULL,
      parent_checkpoint_id TEXT,
      type TEXT,
      checkpoint BLOB NOT NULL,
      metadata BLOB,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
    );
    CREATE TABLE IF NOT EXISTS agent_checkpoint_writes (
      thread_id TEXT NOT NULL,
      checkpoint_ns TEXT NOT NULL DEFAULT '',
      checkpoint_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      channel TEXT NOT NULL,
      type TEXT,
      value BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
    );
    CREATE TABLE IF NOT EXISTS agent_run_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL,
      job_id TEXT,
      agent_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      region TEXT,
      ats_score INTEGER,
      reasoning TEXT,
      findings TEXT,
      logs TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'info',
      link TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_emails_job_id ON emails(job_id);
    CREATE INDEX IF NOT EXISTS idx_emails_contact_id ON emails(contact_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_date ON jobs(created_date);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_interviews_job_id ON interviews(job_id);
    CREATE INDEX IF NOT EXISTS idx_interviews_scheduled ON interviews(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_reminders_ref_due ON reminders(ref_id, due_at);
    CREATE INDEX IF NOT EXISTS idx_vault_chunks_doc_id ON vault_chunks(doc_id);
    CREATE INDEX IF NOT EXISTS idx_memory_job_id ON memory(job_id);
    CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_log(ts);
    CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_thread ON agent_checkpoints(thread_id);
    CREATE INDEX IF NOT EXISTS idx_agent_checkpoint_writes_thread ON agent_checkpoint_writes(thread_id);
    CREATE INDEX IF NOT EXISTS idx_agent_run_history_thread ON agent_run_history(thread_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

    CREATE TABLE IF NOT EXISTS crawler_sources (
      id TEXT PRIMARY KEY,
      definition_json TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'builtin',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS crawler_source_state (
      source_id TEXT PRIMARY KEY,
      cursor TEXT,
      etag TEXT,
      last_modified TEXT,
      content_hash TEXT,
      last_success_at TEXT,
      last_attempt_at TEXT,
      next_run_at TEXT,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      circuit_open_until TEXT,
      FOREIGN KEY (source_id) REFERENCES crawler_sources(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS crawler_runs (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      query_json TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      fetched_count INTEGER NOT NULL DEFAULT 0,
      accepted_count INTEGER NOT NULL DEFAULT 0,
      duplicate_count INTEGER NOT NULL DEFAULT 0,
      error_json TEXT
    );

    CREATE TABLE IF NOT EXISTS crawler_jobs_staging (
      run_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      normalized_hash TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (run_id, source_id, external_id)
    );

    CREATE TABLE IF NOT EXISTS job_source_edges (
      job_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      source_url TEXT NOT NULL DEFAULT '',
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      missing_successful_syncs INTEGER NOT NULL DEFAULT 0,
      closed_at TEXT,
      PRIMARY KEY (source_id, external_id),
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saved_searches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'all',
      query_json TEXT NOT NULL,
      cadence_minutes INTEGER NOT NULL DEFAULT 180,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

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

    CREATE INDEX IF NOT EXISTS idx_crawler_runs_status ON crawler_runs(status);
    CREATE INDEX IF NOT EXISTS idx_job_source_edges_job_id ON job_source_edges(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_source_edges_source ON job_source_edges(source_id);
    CREATE INDEX IF NOT EXISTS idx_saved_searches_next_run ON saved_searches(next_run_at);
    CREATE INDEX IF NOT EXISTS idx_enrichment_items_source ON enrichment_items(source_id);
  `);
  /* Idempotent column additions for databases created before a column existed */
  const addColumn = (table: string, column: string, ddl: string) => {
    const cols = new Set(
      (database.prepare(`PRAGMA table_info(${table})`).all() as Record<string, unknown>[]).map((r) => String(r.name))
    );
    if (!cols.has(column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  addColumn("vault_docs", "label", "label TEXT NOT NULL DEFAULT ''");
  addColumn("jobs", "employer_review", "employer_review TEXT");
  addColumn("jobs", "fit_category", "fit_category TEXT");
  addColumn("jobs", "multi_agent_outputs", "multi_agent_outputs TEXT");
  addColumn("jobs", "source", "source TEXT");
  addColumn("jobs", "hiring_post", "hiring_post INTEGER NOT NULL DEFAULT 0");
  addColumn("jobs", "screenshot_url", "screenshot_url TEXT");
  addColumn("jobs", "cloudinary_url", "cloudinary_url TEXT");
  addColumn("jobs", "skip_reason", "skip_reason TEXT");
  addColumn("jobs", "postal_code", "postal_code TEXT");
  addColumn("memory", "expires_at", "expires_at TEXT");
  addColumn("memory", "run_id", "run_id TEXT");
  addColumn("jobs", "canonical_key", "canonical_key TEXT");
  addColumn("jobs", "first_seen_at", "first_seen_at TEXT");
  addColumn("jobs", "last_seen_at", "last_seen_at TEXT");
  addColumn("jobs", "posted_at", "posted_at TEXT");
  addColumn("jobs", "closed_at", "closed_at TEXT");
  addColumn("jobs", "seniority", "seniority TEXT");
  addColumn("jobs", "work_mode", "work_mode TEXT");
  addColumn("jobs", "employment_type", "employment_type TEXT");
  addColumn("jobs", "salary_min", "salary_min REAL");
  addColumn("jobs", "salary_max", "salary_max REAL");
  addColumn("jobs", "salary_currency", "salary_currency TEXT");
  addColumn("jobs", "visa_signal", "visa_signal TEXT");
  addColumn("jobs", "tech_tags", "tech_tags TEXT");
  addColumn("jobs", "source_confidence", "source_confidence REAL");
  addColumn("jobs", "sources_count", "sources_count INTEGER");
  addColumn("jobs", "ranking_breakdown", "ranking_breakdown TEXT");
  database.exec("CREATE INDEX IF NOT EXISTS idx_memory_expires_at ON memory(expires_at);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_memory_embeddings_memory_id ON memory_embeddings(memory_id);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_jobs_canonical_key ON jobs(canonical_key);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_jobs_work_mode ON jobs(work_mode);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_jobs_seniority ON jobs(seniority);");
}

// ---------------------------------------------------------------------------
// Row <-> entity mapping
// ---------------------------------------------------------------------------

const JOB_COLUMNS = [
  "id", "title", "company", "location", "salary", "url", "status",
  "applied_date", "deadline", "follow_up_due", "priority", "job_description",
  "notes", "match_score", "skills_gap", "documents", "star_flashcards",
  "interview_questions", "job_brief", "salary_intel", "auto_apply_status",
  "auto_apply_logs", "employer_review", "fit_category", "multi_agent_outputs",
  "source", "hiring_post", "created_date", "company_logo",
  "postal_code",
  "screenshot_url", "cloudinary_url", "skip_reason",
  "canonical_key", "first_seen_at", "last_seen_at", "posted_at", "closed_at",
  "seniority", "work_mode", "employment_type", "salary_min", "salary_max",
  "salary_currency", "visa_signal", "tech_tags", "source_confidence",
  "sources_count", "ranking_breakdown",
] as const;

function rowToJob(row: Record<string, unknown>): JobApplication {
  const json = (v: unknown, fallback: unknown) => {
    if (typeof v !== "string" || !v) return fallback;
    try {
      return JSON.parse(v);
    } catch {
      return fallback;
    }
  };
  return {
    id: String(row.id),
    title: String(row.title),
    company: String(row.company),
    location: String(row.location ?? ""),
    salary: (row.salary as string) || undefined,
    url: (row.url as string) || undefined,
    status: row.status as JobApplication["status"],
    appliedDate: (row.applied_date as string) || undefined,
    deadline: (row.deadline as string) || undefined,
    followUpDue: (row.follow_up_due as string) || undefined,
    priority: (row.priority as JobApplication["priority"]) || undefined,
    jobDescription: String(row.job_description ?? ""),
    notes: (row.notes as string) || undefined,
    matchScore: row.match_score == null ? undefined : Number(row.match_score),
    skillsGap: json(row.skills_gap, undefined),
    documents: json(row.documents, undefined),
    starFlashcards: json(row.star_flashcards, undefined),
    interviewQuestions: json(row.interview_questions, undefined),
    jobBrief: json(row.job_brief, undefined),
    salaryIntel: json(row.salary_intel, undefined),
    autoApplyStatus: (row.auto_apply_status as JobApplication["autoApplyStatus"]) ?? "idle",
    autoApplyLogs: json(row.auto_apply_logs, []),
    employerReview: json(row.employer_review, undefined),
    fitCategory: (row.fit_category as JobApplication["fitCategory"]) || undefined,
    multiAgentOutputs: json(row.multi_agent_outputs, undefined),
    source: (row.source as string) || undefined,
    hiringPost: row.hiring_post ? Boolean(Number(row.hiring_post)) : undefined,
    createdDate: String(row.created_date),
    companyLogo: (row.company_logo as string) || undefined,
    screenshotUrl: (row.screenshot_url as string) || undefined,
    cloudinaryUrl: (row.cloudinary_url as string) || undefined,
    skipReason: (row.skip_reason as string) || undefined,
    postalCode: (row.postal_code as string) || undefined,
    canonicalKey: (row.canonical_key as string) || undefined,
    firstSeenAt: (row.first_seen_at as string) || undefined,
    lastSeenAt: (row.last_seen_at as string) || undefined,
    postedAt: (row.posted_at as string) || undefined,
    closedAt: (row.closed_at as string) || undefined,
    seniority: (row.seniority as JobApplication["seniority"]) || undefined,
    workMode: (row.work_mode as JobApplication["workMode"]) || undefined,
    employmentType: (row.employment_type as JobApplication["employmentType"]) || undefined,
    salaryMin: row.salary_min == null ? undefined : Number(row.salary_min),
    salaryMax: row.salary_max == null ? undefined : Number(row.salary_max),
    salaryCurrency: (row.salary_currency as string) || undefined,
    visaSignal: (row.visa_signal as JobApplication["visaSignal"]) || undefined,
    techTags: json(row.tech_tags, undefined),
    sourceConfidence: row.source_confidence == null ? undefined : Number(row.source_confidence),
    sourcesCount: row.sources_count == null ? undefined : Number(row.sources_count),
    rankingBreakdown: json(row.ranking_breakdown, undefined),
  };
}

function jobToRow(job: JobApplication): Record<string, unknown> {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location ?? "",
    salary: job.salary ?? null,
    url: job.url ?? null,
    status: job.status,
    applied_date: job.appliedDate ?? null,
    deadline: job.deadline ?? null,
    follow_up_due: job.followUpDue ?? null,
    priority: job.priority ?? null,
    job_description: job.jobDescription ?? "",
    notes: job.notes ?? null,
    match_score: job.matchScore ?? null,
    skills_gap: job.skillsGap ? JSON.stringify(job.skillsGap) : null,
    documents: job.documents ? JSON.stringify(job.documents) : null,
    star_flashcards: job.starFlashcards ? JSON.stringify(job.starFlashcards) : null,
    interview_questions: job.interviewQuestions ? JSON.stringify(job.interviewQuestions) : null,
    job_brief: job.jobBrief ? JSON.stringify(job.jobBrief) : null,
    salary_intel: job.salaryIntel ? JSON.stringify(job.salaryIntel) : null,
    auto_apply_status: job.autoApplyStatus ?? "idle",
    auto_apply_logs: job.autoApplyLogs?.length ? JSON.stringify(job.autoApplyLogs) : null,
    employer_review: job.employerReview ? JSON.stringify(job.employerReview) : null,
    fit_category: job.fitCategory ?? null,
    multi_agent_outputs: job.multiAgentOutputs ? JSON.stringify(job.multiAgentOutputs) : null,
    source: job.source ?? null,
    hiring_post: job.hiringPost ? 1 : 0,
    created_date: job.createdDate,
    company_logo: job.companyLogo ?? null,
    screenshot_url: job.screenshotUrl ?? null,
    cloudinary_url: job.cloudinaryUrl ?? null,
    skip_reason: job.skipReason ?? null,
    postal_code: job.postalCode ?? null,
    canonical_key: job.canonicalKey ?? null,
    first_seen_at: job.firstSeenAt ?? null,
    last_seen_at: job.lastSeenAt ?? null,
    posted_at: job.postedAt ?? null,
    closed_at: job.closedAt ?? null,
    seniority: job.seniority ?? null,
    work_mode: job.workMode ?? null,
    employment_type: job.employmentType ?? null,
    salary_min: job.salaryMin ?? null,
    salary_max: job.salaryMax ?? null,
    salary_currency: job.salaryCurrency ?? null,
    visa_signal: job.visaSignal ?? null,
    tech_tags: job.techTags?.length ? JSON.stringify(job.techTags) : null,
    source_confidence: job.sourceConfidence ?? null,
    sources_count: job.sourcesCount ?? null,
    ranking_breakdown: job.rankingBreakdown ? JSON.stringify(job.rankingBreakdown) : null,
    updated_at: new Date().toISOString(),
  };
}

function rowToContact(row: Record<string, unknown>): Contact {
  return {
    id: String(row.id),
    name: String(row.name),
    role: String(row.role ?? ""),
    company: String(row.company ?? ""),
    email: String(row.email ?? ""),
    phone: String(row.phone ?? ""),
    linkedin: String(row.linkedin ?? ""),
    source: (row.source as Contact["source"]) ?? "other",
    relationship: (row.relationship as Contact["relationship"]) ?? "other",
    notes: String(row.notes ?? ""),
    priority: (row.priority as Contact["priority"]) ?? "medium",
    lastContacted: (row.last_contacted as string) || undefined,
    companyIds: parseJsonArray<string>(String(row.company_ids ?? "[]")),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function parseJsonArray<T = unknown>(raw: string, fallback: T[] = [] as T[]): T[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function rowToEmail(row: Record<string, unknown>): EmailMessage {
  return {
    id: String(row.id),
    contactId: (row.contact_id as string) || undefined,
    jobId: (row.job_id as string) || undefined,
    direction: (row.direction as EmailMessage["direction"]) ?? "sent",
    subject: String(row.subject ?? ""),
    body: String(row.body ?? ""),
    sentAt: String(row.sent_at),
    threadId: String(row.thread_id ?? ""),
    status: (row.status as EmailMessage["status"]) ?? "draft",
    read: Boolean(row.read),
  };
}

function rowToInterview(row: Record<string, unknown>): InterviewEvent {
  return {
    id: String(row.id),
    jobId: (row.job_id as string) || undefined,
    title: String(row.title ?? ""),
    type: (row.type as InterviewEvent["type"]) ?? "video",
    scheduledAt: String(row.scheduled_at),
    durationMin: Number(row.duration_min ?? 45),
    location: String(row.location ?? ""),
    notes: String(row.notes ?? ""),
    status: (row.status as InterviewEvent["status"]) ?? "scheduled",
    rating: row.rating == null ? undefined : Number(row.rating),
    review: (row.review as string) || undefined,
    prep: row.prep ? parseJsonArray(String(row.prep), undefined) as InterviewEvent["prep"] : undefined,
    createdAt: String(row.created_at),
  };
}

function rowToReminder(row: Record<string, unknown>): Reminder {
  return {
    id: String(row.id),
    kind: (row.kind as Reminder["kind"]) ?? "custom",
    refId: (row.ref_id as string) || undefined,
    dueAt: String(row.due_at),
    done: Boolean(row.done),
    note: String(row.note ?? ""),
    createdAt: String(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export const jobsRepo = {
  list(): JobApplication[] {
    const stmt = getDb().prepare("SELECT * FROM jobs ORDER BY created_date DESC");
    return stmt.all().map((r) => rowToJob(r as Record<string, unknown>));
  },
  get(id: string): JobApplication | null {
    const row = getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(id);
    return row ? rowToJob(row as Record<string, unknown>) : null;
  },
  upsert(job: JobApplication) {
    const cols = JOB_COLUMNS;
    const row = jobToRow(job);
    const keys = [...cols, "updated_at"];
    const placeholders = keys.map(() => "?").join(", ");
    const stmt = getDb().prepare(
      `INSERT INTO jobs (${keys.join(", ")}) VALUES (${placeholders})
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title, company=excluded.company, location=excluded.location,
         salary=excluded.salary, url=excluded.url, status=excluded.status,
         applied_date=excluded.applied_date, deadline=excluded.deadline,
         follow_up_due=excluded.follow_up_due, priority=excluded.priority,
         job_description=excluded.job_description, notes=excluded.notes,
         match_score=excluded.match_score, skills_gap=excluded.skills_gap,
         documents=excluded.documents, star_flashcards=excluded.star_flashcards,
         interview_questions=excluded.interview_questions, job_brief=excluded.job_brief,
         salary_intel=excluded.salary_intel, auto_apply_status=excluded.auto_apply_status,
         auto_apply_logs=excluded.auto_apply_logs, employer_review=excluded.employer_review,
         fit_category=excluded.fit_category, multi_agent_outputs=excluded.multi_agent_outputs,
         source=excluded.source, hiring_post=excluded.hiring_post,
         company_logo=excluded.company_logo,
         screenshot_url=excluded.screenshot_url,
         cloudinary_url=excluded.cloudinary_url,
         skip_reason=excluded.skip_reason,
         postal_code=excluded.postal_code,
         canonical_key=excluded.canonical_key,
         first_seen_at=excluded.first_seen_at,
         last_seen_at=excluded.last_seen_at,
         posted_at=excluded.posted_at,
         closed_at=excluded.closed_at,
         seniority=excluded.seniority,
         work_mode=excluded.work_mode,
         employment_type=excluded.employment_type,
         salary_min=excluded.salary_min,
         salary_max=excluded.salary_max,
         salary_currency=excluded.salary_currency,
         visa_signal=excluded.visa_signal,
         tech_tags=excluded.tech_tags,
         source_confidence=excluded.source_confidence,
         sources_count=excluded.sources_count,
         ranking_breakdown=excluded.ranking_breakdown,
         updated_at=excluded.updated_at`
    );
    stmt.run(...(keys.map((k) => (row[k] === undefined ? null : row[k])) as never[]));
    return job;
  },
  remove(id: string) {
    const db = getDb();
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM emails WHERE job_id = ?").run(id);
      db.prepare("DELETE FROM interviews WHERE job_id = ?").run(id);
      db.prepare("DELETE FROM reminders WHERE ref_id = ?").run(id);
      db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  },
  removeAll(insideTxn = false) {
    const db = getDb();
    if (!insideTxn) db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM emails WHERE job_id IS NOT NULL").run();
      db.prepare("DELETE FROM interviews WHERE job_id IS NOT NULL").run();
      db.prepare("DELETE FROM reminders WHERE ref_id IS NOT NULL").run();
      db.prepare("DELETE FROM jobs").run();
      if (!insideTxn) db.exec("COMMIT");
    } catch (err) {
      if (!insideTxn) db.exec("ROLLBACK");
      throw err;
    }
  },
  count(): number {
    const row = getDb().prepare("SELECT COUNT(*) AS n FROM jobs").get();
    return Number((row as Record<string, unknown>).n);
  },
  findByCanonicalKey(canonicalKey: string): JobApplication | null {
    const row = getDb().prepare("SELECT * FROM jobs WHERE canonical_key = ?").get(canonicalKey);
    return row ? rowToJob(row as Record<string, unknown>) : null;
  },
  findByUrl(url: string): JobApplication | null {
    const row = getDb().prepare("SELECT * FROM jobs WHERE url = ?").get(url);
    return row ? rowToJob(row as Record<string, unknown>) : null;
  },
  findActiveByCompanyAndTitle(company: string, title: string): JobApplication | null {
    const row = getDb().prepare("SELECT * FROM jobs WHERE LOWER(company) = LOWER(?) AND LOWER(title) = LOWER(?) AND closed_at IS NULL").get(company, title);
    return row ? rowToJob(row as Record<string, unknown>) : null;
  },
  closeJob(id: string, closedAt = new Date().toISOString()): void {
    getDb().prepare("UPDATE jobs SET closed_at = ?, updated_at = ? WHERE id = ?").run(closedAt, closedAt, id);
  },
};

export const crawlerSourcesRepo = {
  get(id: string): SourceDefinition | null {
    const row = getDb().prepare("SELECT * FROM crawler_sources WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    try {
      return JSON.parse(String(row.definition_json)) as SourceDefinition;
    } catch {
      return null;
    }
  },
  list(): Array<{ id: string; definition: SourceDefinition; origin: string; enabled: boolean; createdAt: string; updatedAt: string }> {
    const rows = getDb().prepare("SELECT * FROM crawler_sources ORDER BY id ASC").all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      definition: JSON.parse(String(r.definition_json)) as SourceDefinition,
      origin: String(r.origin),
      enabled: Boolean(r.enabled),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  },
  upsert(id: string, definition: SourceDefinition, origin = "builtin", enabled = true): void {
    const now = new Date().toISOString();
    getDb().prepare(`
      INSERT INTO crawler_sources (id, definition_json, origin, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        definition_json=excluded.definition_json,
        origin=excluded.origin,
        enabled=excluded.enabled,
        updated_at=excluded.updated_at
    `).run(id, JSON.stringify(definition), origin, enabled ? 1 : 0, now, now);
  },
  setEnabled(id: string, enabled: boolean): void {
    const now = new Date().toISOString();
    getDb().prepare("UPDATE crawler_sources SET enabled = ?, updated_at = ? WHERE id = ?").run(enabled ? 1 : 0, now, id);
  },
  delete(id: string): void {
    getDb().prepare("DELETE FROM crawler_sources WHERE id = ?").run(id);
  },
  deleteAll(): void {
    getDb().prepare("DELETE FROM crawler_sources").run();
  },
};

export const crawlerSourceStateRepo = {
  get(sourceId: string): SourceSyncState | null {
    const row = getDb().prepare("SELECT * FROM crawler_source_state WHERE source_id = ?").get(sourceId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      sourceId: String(row.source_id),
      cursor: (row.cursor as string) || null,
      etag: (row.etag as string) || null,
      lastModified: (row.last_modified as string) || null,
      contentHash: (row.content_hash as string) || null,
      lastSuccessAt: (row.last_success_at as string) || null,
      lastAttemptAt: (row.last_attempt_at as string) || null,
      nextRunAt: (row.next_run_at as string) || null,
      consecutiveFailures: Number(row.consecutive_failures ?? 0),
      circuitOpenUntil: (row.circuit_open_until as string) || null,
    };
  },
  upsert(state: SourceSyncState): void {
    getDb().prepare(`
      INSERT INTO crawler_source_state (
        source_id, cursor, etag, last_modified, content_hash,
        last_success_at, last_attempt_at, next_run_at, consecutive_failures, circuit_open_until
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id) DO UPDATE SET
        cursor=excluded.cursor,
        etag=excluded.etag,
        last_modified=excluded.last_modified,
        content_hash=excluded.content_hash,
        last_success_at=excluded.last_success_at,
        last_attempt_at=excluded.last_attempt_at,
        next_run_at=excluded.next_run_at,
        consecutive_failures=excluded.consecutive_failures,
        circuit_open_until=excluded.circuit_open_until
    `).run(
      state.sourceId,
      state.cursor ?? null,
      state.etag ?? null,
      state.lastModified ?? null,
      state.contentHash ?? null,
      state.lastSuccessAt ?? null,
      state.lastAttemptAt ?? null,
      state.nextRunAt ?? null,
      state.consecutiveFailures ?? 0,
      state.circuitOpenUntil ?? null
    );
  },
  recordAttempt(
    sourceId: string,
    success: boolean,
    options?: {
      cursor?: string | null;
      etag?: string | null;
      lastModified?: string | null;
      contentHash?: string | null;
      circuitOpenUntil?: string | null;
      cadenceMinutes?: number;
    }
  ): void {
    const prev = this.get(sourceId);
    const now = new Date();
    const nowIso = now.toISOString();
    const consecutive = success ? 0 : (prev?.consecutiveFailures ?? 0) + 1;
    let circuitOpen = options?.circuitOpenUntil ?? prev?.circuitOpenUntil ?? null;
    if (!success && consecutive >= 3) {
      circuitOpen = new Date(now.getTime() + 90 * 1000).toISOString();
    } else if (success) {
      circuitOpen = null;
    }
    const cadence = options?.cadenceMinutes ?? 180;
    const nextRun = new Date(now.getTime() + cadence * 60 * 1000).toISOString();

    this.upsert({
      sourceId,
      cursor: options?.cursor !== undefined ? options.cursor : (prev?.cursor ?? null),
      etag: options?.etag !== undefined ? options.etag : (prev?.etag ?? null),
      lastModified: options?.lastModified !== undefined ? options.lastModified : (prev?.lastModified ?? null),
      contentHash: options?.contentHash !== undefined ? options.contentHash : (prev?.contentHash ?? null),
      lastSuccessAt: success ? nowIso : (prev?.lastSuccessAt ?? null),
      lastAttemptAt: nowIso,
      nextRunAt: nextRun,
      consecutiveFailures: consecutive,
      circuitOpenUntil: circuitOpen,
    });
  },
  list(): SourceSyncState[] {
    const rows = getDb().prepare("SELECT * FROM crawler_source_state").all() as Record<string, unknown>[];
    return rows.map((row) => ({
      sourceId: String(row.source_id),
      cursor: (row.cursor as string) || null,
      etag: (row.etag as string) || null,
      lastModified: (row.last_modified as string) || null,
      contentHash: (row.content_hash as string) || null,
      lastSuccessAt: (row.last_success_at as string) || null,
      lastAttemptAt: (row.last_attempt_at as string) || null,
      nextRunAt: (row.next_run_at as string) || null,
      consecutiveFailures: Number(row.consecutive_failures ?? 0),
      circuitOpenUntil: (row.circuit_open_until as string) || null,
    }));
  },
  deleteAll(): void {
    getDb().prepare("DELETE FROM crawler_source_state").run();
  },
};

export const crawlerRunsRepo = {
  create(run: { id: string; channel: string; query?: string; status?: string }): void {
    const now = new Date().toISOString();
    getDb().prepare(`
      INSERT INTO crawler_runs (id, channel, query_json, status, started_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(run.id, run.channel, run.query ? JSON.stringify({ query: run.query }) : null, run.status ?? "running", now);
  },
  update(
    id: string,
    patch: {
      status?: "pending" | "running" | "completed" | "partial" | "failed";
      finishedAt?: string;
      fetchedCount?: number;
      acceptedCount?: number;
      duplicateCount?: number;
      errors?: Array<{ sourceId: string; error: string; recoverable: boolean }>;
    }
  ): void {
    const existing = this.get(id);
    if (!existing) return;
    const finishedAt = patch.finishedAt ?? (patch.status && ["completed", "partial", "failed"].includes(patch.status) ? new Date().toISOString() : existing.finishedAt ?? null);
    getDb().prepare(`
      UPDATE crawler_runs
      SET status = COALESCE(?, status),
          finished_at = COALESCE(?, finished_at),
          fetched_count = COALESCE(?, fetched_count),
          accepted_count = COALESCE(?, accepted_count),
          duplicate_count = COALESCE(?, duplicate_count),
          error_json = COALESCE(?, error_json)
      WHERE id = ?
    `).run(
      patch.status ?? null,
      finishedAt,
      patch.fetchedCount ?? null,
      patch.acceptedCount ?? null,
      patch.duplicateCount ?? null,
      patch.errors ? JSON.stringify(patch.errors) : null,
      id
    );
  },
  get(id: string): CrawlerRunSummary | null {
    const row = getDb().prepare("SELECT * FROM crawler_runs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    let errors: Array<{ sourceId: string; error: string; recoverable: boolean }> | undefined = undefined;
    if (row.error_json && typeof row.error_json === "string") {
      try { errors = JSON.parse(row.error_json); } catch { /* ignore */ }
    }
    return {
      runId: String(row.id),
      channel: (row.channel as CrawlerRunSummary["channel"]) || "all",
      status: (row.status as CrawlerRunSummary["status"]) || "completed",
      startedAt: String(row.started_at),
      finishedAt: (row.finished_at as string) || undefined,
      plannedSources: 0,
      fetchedCount: Number(row.fetched_count ?? 0),
      acceptedCount: Number(row.accepted_count ?? 0),
      duplicateCount: Number(row.duplicate_count ?? 0),
      errors,
    };
  },
  listRecent(limit = 20): CrawlerRunSummary[] {
    const rows = getDb().prepare("SELECT * FROM crawler_runs ORDER BY started_at DESC LIMIT ?").all(limit) as Record<string, unknown>[];
    return rows.map((row) => {
      let errors: Array<{ sourceId: string; error: string; recoverable: boolean }> | undefined = undefined;
      if (row.error_json && typeof row.error_json === "string") {
        try { errors = JSON.parse(row.error_json); } catch { /* ignore */ }
      }
      return {
        runId: String(row.id),
        channel: (row.channel as CrawlerRunSummary["channel"]) || "all",
        status: (row.status as CrawlerRunSummary["status"]) || "completed",
        startedAt: String(row.started_at),
        finishedAt: (row.finished_at as string) || undefined,
        plannedSources: 0,
        fetchedCount: Number(row.fetched_count ?? 0),
        acceptedCount: Number(row.accepted_count ?? 0),
        duplicateCount: Number(row.duplicate_count ?? 0),
        errors,
      };
    });
  },
  deleteAll(): void {
    getDb().prepare("DELETE FROM crawler_runs").run();
  },
};

export const crawlerJobsStagingRepo = {
  stage(runId: string, sourceId: string, externalId: string, payload: unknown, normalizedHash?: string): void {
    const now = new Date().toISOString();
    getDb().prepare(`
      INSERT INTO crawler_jobs_staging (run_id, source_id, external_id, payload_json, normalized_hash, received_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, source_id, external_id) DO UPDATE SET
        payload_json=excluded.payload_json,
        normalized_hash=excluded.normalized_hash,
        received_at=excluded.received_at
    `).run(runId, sourceId, externalId, JSON.stringify(payload), normalizedHash ?? null, now);
  },
  listByRun(runId: string): Array<{ runId: string; sourceId: string; externalId: string; payload: unknown; normalizedHash?: string; receivedAt: string }> {
    const rows = getDb().prepare("SELECT * FROM crawler_jobs_staging WHERE run_id = ?").all(runId) as Record<string, unknown>[];
    return rows.map((r) => ({
      runId: String(r.run_id),
      sourceId: String(r.source_id),
      externalId: String(r.external_id),
      payload: JSON.parse(String(r.payload_json)),
      normalizedHash: (r.normalized_hash as string) || undefined,
      receivedAt: String(r.received_at),
    }));
  },
  deleteByRun(runId: string): void {
    getDb().prepare("DELETE FROM crawler_jobs_staging WHERE run_id = ?").run(runId);
  },
  listAll(limit = 100000): Array<{ runId: string; sourceId: string; externalId: string; payload: unknown; normalizedHash?: string; receivedAt: string }> {
    const rows = getDb().prepare("SELECT * FROM crawler_jobs_staging LIMIT ?").all(limit) as Record<string, unknown>[];
    return rows.map((r) => ({
      runId: String(r.run_id),
      sourceId: String(r.source_id),
      externalId: String(r.external_id),
      payload: JSON.parse(String(r.payload_json)),
      normalizedHash: (r.normalized_hash as string) || undefined,
      receivedAt: String(r.received_at),
    }));
  },
  deleteAll(): void {
    getDb().prepare("DELETE FROM crawler_jobs_staging").run();
  },
};

export const jobSourceEdgesRepo = {
  upsertEdge(edge: {
    jobId: string;
    sourceId: string;
    externalId: string;
    sourceUrl?: string;
    firstSeenAt?: string;
    lastSeenAt?: string;
    missingSuccessfulSyncs?: number;
    closedAt?: string | null;
  }): void {
    const now = new Date().toISOString();
    getDb().prepare(`
      INSERT INTO job_source_edges (
        job_id, source_id, external_id, source_url, first_seen_at, last_seen_at, missing_successful_syncs, closed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id, external_id) DO UPDATE SET
        job_id=excluded.job_id,
        source_url=excluded.source_url,
        last_seen_at=excluded.last_seen_at,
        missing_successful_syncs=0,
        closed_at=excluded.closed_at
    `).run(
      edge.jobId,
      edge.sourceId,
      edge.externalId,
      edge.sourceUrl ?? "",
      edge.firstSeenAt ?? now,
      edge.lastSeenAt ?? now,
      edge.missingSuccessfulSyncs ?? 0,
      edge.closedAt ?? null
    );
  },
  listByJob(jobId: string): JobSourceEdge[] {
    const rows = getDb().prepare("SELECT * FROM job_source_edges WHERE job_id = ?").all(jobId) as Record<string, unknown>[];
    return rows.map((r) => ({
      jobId: String(r.job_id),
      sourceId: String(r.source_id),
      externalId: String(r.external_id),
      sourceUrl: String(r.source_url ?? ""),
      firstSeenAt: String(r.first_seen_at),
      lastSeenAt: String(r.last_seen_at),
      missingSuccessfulSyncs: Number(r.missing_successful_syncs ?? 0),
      closedAt: (r.closed_at as string) || null,
    }));
  },
  findJobBySourceAndExternal(sourceId: string, externalId: string): string | null {
    const row = getDb().prepare("SELECT job_id FROM job_source_edges WHERE source_id = ? AND external_id = ?").get(sourceId, externalId) as Record<string, unknown> | undefined;
    return row ? String(row.job_id) : null;
  },
  incrementMissingSyncs(sourceId: string, seenExternalIds: Set<string>): Array<{ jobId: string; closed: boolean }> {
    const edges = getDb().prepare("SELECT * FROM job_source_edges WHERE source_id = ? AND closed_at IS NULL").all(sourceId) as Record<string, unknown>[];
    const results: Array<{ jobId: string; closed: boolean }> = [];
    const now = new Date().toISOString();

    for (const e of edges) {
      const extId = String(e.external_id);
      if (!seenExternalIds.has(extId)) {
        const missingCount = Number(e.missing_successful_syncs ?? 0) + 1;
        const jobId = String(e.job_id);
        if (missingCount >= 2) {
          getDb().prepare("UPDATE job_source_edges SET missing_successful_syncs = ?, closed_at = ? WHERE source_id = ? AND external_id = ?").run(missingCount, now, sourceId, extId);
          results.push({ jobId, closed: true });
        } else {
          getDb().prepare("UPDATE job_source_edges SET missing_successful_syncs = ? WHERE source_id = ? AND external_id = ?").run(missingCount, sourceId, extId);
          results.push({ jobId, closed: false });
        }
      }
    }
    return results;
  },
  listAll(limit = 100000): JobSourceEdge[] {
    const rows = getDb().prepare("SELECT * FROM job_source_edges LIMIT ?").all(limit) as Record<string, unknown>[];
    return rows.map((r) => ({
      jobId: String(r.job_id),
      sourceId: String(r.source_id),
      externalId: String(r.external_id),
      sourceUrl: String(r.source_url ?? ""),
      firstSeenAt: String(r.first_seen_at),
      lastSeenAt: String(r.last_seen_at),
      missingSuccessfulSyncs: Number(r.missing_successful_syncs ?? 0),
      closedAt: (r.closed_at as string) || null,
    }));
  },
  deleteAll(): void {
    getDb().prepare("DELETE FROM job_source_edges").run();
  },
};

export const savedSearchesRepo = {
  create(search: { id?: string; name: string; channel?: string; query?: unknown; queryJson?: string; cadenceMinutes?: number; enabled?: boolean }): SavedSearchRecord {
    const id = search.id || `search_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    let queryJson = "{}";
    if (typeof search.queryJson === "string") {
      queryJson = search.queryJson;
    } else if (typeof search.query === "string") {
      queryJson = search.query;
    } else if (search.query !== undefined) {
      queryJson = JSON.stringify(search.query);
    }
    const cadence = search.cadenceMinutes ?? 180;
    const nextRun = new Date(Date.now() + cadence * 60 * 1000).toISOString();
    getDb().prepare(`
      INSERT INTO saved_searches (id, name, channel, query_json, cadence_minutes, enabled, next_run_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, search.name, search.channel ?? "all", queryJson, cadence, search.enabled !== false ? 1 : 0, nextRun, now, now);

    return {
      id,
      name: search.name,
      channel: (search.channel as SavedSearchRecord["channel"]) || "all",
      queryJson,
      cadenceMinutes: cadence,
      enabled: search.enabled !== false,
      nextRunAt: nextRun,
      createdAt: now,
      updatedAt: now,
    };
  },
  get(id: string): SavedSearchRecord | null {
    const r = getDb().prepare("SELECT * FROM saved_searches WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      id: String(r.id),
      name: String(r.name),
      channel: (r.channel as SavedSearchRecord["channel"]) || "all",
      queryJson: String(r.query_json),
      cadenceMinutes: Number(r.cadence_minutes ?? 180),
      enabled: Boolean(r.enabled),
      lastRunAt: (r.last_run_at as string) || null,
      nextRunAt: (r.next_run_at as string) || null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  },
  list(): SavedSearchRecord[] {
    const rows = getDb().prepare("SELECT * FROM saved_searches ORDER BY created_at DESC").all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      channel: (r.channel as SavedSearchRecord["channel"]) || "all",
      queryJson: String(r.query_json),
      cadenceMinutes: Number(r.cadence_minutes ?? 180),
      enabled: Boolean(r.enabled),
      lastRunAt: (r.last_run_at as string) || null,
      nextRunAt: (r.next_run_at as string) || null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  },
  update(id: string, patch: Partial<SavedSearchRecord>): void {
    const now = new Date().toISOString();
    getDb().prepare(`
      UPDATE saved_searches
      SET name = COALESCE(?, name),
          channel = COALESCE(?, channel),
          query_json = COALESCE(?, query_json),
          cadence_minutes = COALESCE(?, cadence_minutes),
          enabled = COALESCE(?, enabled),
          updated_at = ?
      WHERE id = ?
    `).run(
      patch.name ?? null,
      patch.channel ?? null,
      patch.queryJson ?? null,
      patch.cadenceMinutes ?? null,
      patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : null,
      now,
      id
    );
  },
  recordRun(id: string, nextRunAt?: string): void {
    const now = new Date();
    const existing = this.get(id);
    const cadence = existing?.cadenceMinutes ?? 180;
    const next = nextRunAt || new Date(now.getTime() + cadence * 60 * 1000).toISOString();
    getDb().prepare("UPDATE saved_searches SET last_run_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?").run(
      now.toISOString(),
      next,
      now.toISOString(),
      id
    );
  },
  delete(id: string): void {
    getDb().prepare("DELETE FROM saved_searches WHERE id = ?").run(id);
  },
  deleteAll(): void {
    getDb().prepare("DELETE FROM saved_searches").run();
  },
};

export const enrichmentSourcesRepo = {
  upsert(source: { id: string; repo: string; commitSha: string; license: string; purpose: string; enabled?: boolean }): void {
    const now = new Date().toISOString();
    getDb().prepare(`
      INSERT INTO enrichment_sources (id, repo, commit_sha, license, purpose, enabled, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        repo=excluded.repo,
        commit_sha=excluded.commit_sha,
        license=excluded.license,
        purpose=excluded.purpose,
        enabled=excluded.enabled,
        checked_at=excluded.checked_at
    `).run(source.id, source.repo, source.commitSha, source.license, source.purpose, source.enabled !== false ? 1 : 0, now);
  },
  get(id: string): EnrichmentSourceRecord | null {
    const r = getDb().prepare("SELECT * FROM enrichment_sources WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      id: String(r.id),
      repo: String(r.repo),
      commitSha: String(r.commit_sha),
      license: String(r.license),
      purpose: String(r.purpose),
      enabled: Boolean(r.enabled),
      checkedAt: String(r.checked_at),
    };
  },
  list(): EnrichmentSourceRecord[] {
    const rows = getDb().prepare("SELECT * FROM enrichment_sources").all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      repo: String(r.repo),
      commitSha: String(r.commit_sha),
      license: String(r.license),
      purpose: String(r.purpose),
      enabled: Boolean(r.enabled),
      checkedAt: String(r.checked_at),
    }));
  },
  deleteAll(): void {
    getDb().prepare("DELETE FROM enrichment_sources").run();
  },
};

export const enrichmentItemsRepo = {
  upsert(item: { sourceId: string; itemKey: string; payload?: unknown; payloadJson?: string; provenance?: string }): void {
    const now = new Date().toISOString();
    let payloadJson = "{}";
    if (typeof item.payloadJson === "string") {
      payloadJson = item.payloadJson;
    } else if (item.payload !== undefined) {
      payloadJson = typeof item.payload === "string" ? item.payload : JSON.stringify(item.payload);
    }
    getDb().prepare(`
      INSERT INTO enrichment_items (source_id, item_key, payload_json, provenance, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(source_id, item_key) DO UPDATE SET
        payload_json=excluded.payload_json,
        provenance=excluded.provenance,
        updated_at=excluded.updated_at
    `).run(item.sourceId, item.itemKey, payloadJson, item.provenance ?? "", now);
  },
  get(sourceId: string, itemKey: string): EnrichmentItemRecord | null {
    const r = getDb().prepare("SELECT * FROM enrichment_items WHERE source_id = ? AND item_key = ?").get(sourceId, itemKey) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      sourceId: String(r.source_id),
      itemKey: String(r.item_key),
      payloadJson: String(r.payload_json),
      provenance: String(r.provenance ?? ""),
      updatedAt: String(r.updated_at),
    };
  },
  listBySource(sourceId: string, limit = 1000): EnrichmentItemRecord[] {
    const rows = getDb().prepare("SELECT * FROM enrichment_items WHERE source_id = ? LIMIT ?").all(sourceId, limit) as Record<string, unknown>[];
    return rows.map((r) => ({
      sourceId: String(r.source_id),
      itemKey: String(r.item_key),
      payloadJson: String(r.payload_json),
      provenance: String(r.provenance ?? ""),
      updatedAt: String(r.updated_at),
    }));
  },
  findItemsByQuery(sourceId: string, query: string, limit = 50): EnrichmentItemRecord[] {
    const rows = getDb().prepare("SELECT * FROM enrichment_items WHERE source_id = ? AND (item_key LIKE ? OR payload_json LIKE ?) LIMIT ?").all(
      sourceId,
      `%${query}%`,
      `%${query}%`,
      limit
    ) as Record<string, unknown>[];
    return rows.map((r) => ({
      sourceId: String(r.source_id),
      itemKey: String(r.item_key),
      payloadJson: String(r.payload_json),
      provenance: String(r.provenance ?? ""),
      updatedAt: String(r.updated_at),
    }));
  },
  listAll(limit = 100000): EnrichmentItemRecord[] {
    const rows = getDb().prepare("SELECT * FROM enrichment_items LIMIT ?").all(limit) as Record<string, unknown>[];
    return rows.map((r) => ({
      sourceId: String(r.source_id),
      itemKey: String(r.item_key),
      payloadJson: String(r.payload_json),
      provenance: String(r.provenance ?? ""),
      updatedAt: String(r.updated_at),
    }));
  },
  deleteAll(): void {
    getDb().prepare("DELETE FROM enrichment_items").run();
  },
};

export const contactsRepo = {
  list(): Contact[] {
    const stmt = getDb().prepare("SELECT * FROM contacts ORDER BY created_at DESC");
    return stmt.all().map((r) => rowToContact(r as Record<string, unknown>));
  },
  get(id: string): Contact | null {
    const row = getDb().prepare("SELECT * FROM contacts WHERE id = ?").get(id);
    return row ? rowToContact(row as Record<string, unknown>) : null;
  },
  upsert(contact: Contact) {
    getDb()
      .prepare(
        `INSERT INTO contacts (id, name, role, company, email, phone, linkedin, source,
           relationship, notes, priority, last_contacted, company_ids, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, role=excluded.role, company=excluded.company,
           email=excluded.email, phone=excluded.phone, linkedin=excluded.linkedin,
           source=excluded.source, relationship=excluded.relationship,
           notes=excluded.notes, priority=excluded.priority,
           last_contacted=excluded.last_contacted, company_ids=excluded.company_ids,
           updated_at=excluded.updated_at`
      )
      .run(
        contact.id, contact.name, contact.role, contact.company, contact.email,
        contact.phone, contact.linkedin, contact.source, contact.relationship,
        contact.notes, contact.priority, contact.lastContacted ?? null,
        JSON.stringify(contact.companyIds ?? []), contact.createdAt, contact.updatedAt
      );
    return contact;
  },
  remove(id: string) {
    getDb().prepare("DELETE FROM contacts WHERE id = ?").run(id);
  },
  removeAll() {
    getDb().prepare("DELETE FROM contacts").run();
  },
};

export const emailsRepo = {
  list(): EmailMessage[] {
    const stmt = getDb().prepare("SELECT * FROM emails ORDER BY sent_at DESC");
    return stmt.all().map((r) => rowToEmail(r as Record<string, unknown>));
  },
  get(id: string): EmailMessage | null {
    const row = getDb().prepare("SELECT * FROM emails WHERE id = ?").get(id);
    return row ? rowToEmail(row as Record<string, unknown>) : null;
  },
  listForJob(jobId: string): EmailMessage[] {
    const stmt = getDb().prepare("SELECT * FROM emails WHERE job_id = ? ORDER BY sent_at ASC");
    return stmt.all(jobId).map((r) => rowToEmail(r as Record<string, unknown>));
  },
  upsert(email: EmailMessage) {
    getDb()
      .prepare(
        `INSERT INTO emails (id, contact_id, job_id, direction, subject, body, sent_at,
           thread_id, status, read)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           contact_id=excluded.contact_id, job_id=excluded.job_id,
           direction=excluded.direction, subject=excluded.subject, body=excluded.body,
           sent_at=excluded.sent_at, thread_id=excluded.thread_id,
           status=excluded.status, read=excluded.read`
      )
      .run(
        email.id, email.contactId ?? null, email.jobId ?? null, email.direction,
        email.subject, email.body, email.sentAt, email.threadId, email.status,
        email.read ? 1 : 0
      );
    return email;
  },
  remove(id: string) {
    getDb().prepare("DELETE FROM emails WHERE id = ?").run(id);
  },
  removeAll() {
    getDb().prepare("DELETE FROM emails").run();
  },
};

export const interviewsRepo = {
  list(): InterviewEvent[] {
    const stmt = getDb().prepare("SELECT * FROM interviews ORDER BY scheduled_at ASC");
    return stmt.all().map((r) => rowToInterview(r as Record<string, unknown>));
  },
  get(id: string): InterviewEvent | null {
    const row = getDb().prepare("SELECT * FROM interviews WHERE id = ?").get(id);
    return row ? rowToInterview(row as Record<string, unknown>) : null;
  },
  upsert(interview: InterviewEvent) {
    getDb()
      .prepare(
        `INSERT INTO interviews (id, job_id, title, type, scheduled_at, duration_min,
           location, notes, status, rating, review, prep, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           job_id=excluded.job_id, title=excluded.title, type=excluded.type,
           scheduled_at=excluded.scheduled_at, duration_min=excluded.duration_min,
           location=excluded.location, notes=excluded.notes, status=excluded.status,
           rating=excluded.rating, review=excluded.review, prep=excluded.prep`
      )
      .run(
        interview.id, interview.jobId ?? null, interview.title, interview.type,
        interview.scheduledAt, interview.durationMin, interview.location,
        interview.notes, interview.status, interview.rating ?? null,
        interview.review ?? null,
        interview.prep?.length ? JSON.stringify(interview.prep) : null,
        interview.createdAt
      );
    return interview;
  },
  remove(id: string) {
    getDb().prepare("DELETE FROM interviews WHERE id = ?").run(id);
  },
  removeAll() {
    getDb().prepare("DELETE FROM interviews").run();
  },
};

export const remindersRepo = {
  list(): Reminder[] {
    const stmt = getDb().prepare("SELECT * FROM reminders ORDER BY due_at ASC");
    return stmt.all().map((r) => rowToReminder(r as Record<string, unknown>));
  },
  get(id: string): Reminder | null {
    const row = getDb().prepare("SELECT * FROM reminders WHERE id = ?").get(id);
    return row ? rowToReminder(row as Record<string, unknown>) : null;
  },
  upsert(reminder: Reminder) {
    getDb()
      .prepare(
        `INSERT INTO reminders (id, kind, ref_id, due_at, done, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           kind=excluded.kind, ref_id=excluded.ref_id, due_at=excluded.due_at,
           done=excluded.done, note=excluded.note`
      )
      .run(
        reminder.id, reminder.kind, reminder.refId ?? null, reminder.dueAt,
        reminder.done ? 1 : 0, reminder.note, reminder.createdAt
      );
    return reminder;
  },
  remove(id: string) {
    getDb().prepare("DELETE FROM reminders WHERE id = ?").run(id);
  },
  removeAll() {
    getDb().prepare("DELETE FROM reminders").run();
  },
};

export const settingsRepo = {
  get(key: string): string | null {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? String((row as Record<string, unknown>).value) : null;
  },
  set(key: string, value: string) {
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(key, value);
  },
  remove(key: string) {
    getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
  },
  all(): Record<string, string> {
    const rows = getDb().prepare("SELECT key, value FROM settings").all();
    return Object.fromEntries(rows.map((r) => {
      const row = r as Record<string, unknown>;
      return [String(row.key), String(row.value)];
    }));
  },
  wipe() {
    getDb().prepare("DELETE FROM settings").run();
  },
};

export const metaRepo = {
  get(key: string): string | null {
    const row = getDb().prepare("SELECT value FROM meta WHERE key = ?").get(key);
    return row ? String((row as Record<string, unknown>).value) : null;
  },
  set(key: string, value: string) {
    getDb()
      .prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(key, value);
  },
};

export interface UsageEntry {
  id?: number;
  agent: string;
  kind: "completion" | "embedding";
  provider?: string;
  model?: string;
  status: "ok" | "error" | "fallback";
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  costEst: number;
  error?: string;
}

export interface MemoryEntry {
  id?: number;
  kind: "note" | "insight" | "fact" | "decision" | "outcome";
  content: string;
  jobId?: string;
  source: string;
  importance: number;
  expiresAt?: string | null;
  runId?: string | null;
  createdAt?: string;
}

export interface MemoryEmbedding {
  id?: number;
  memoryId: number;
  embedding: number[];
  model: string;
  createdAt?: string;
}

export const memoryRepo = {
  add(entry: Omit<MemoryEntry, "id" | "createdAt">): MemoryEntry {
    const db = getDb();
    const res = db
      .prepare(
        `INSERT INTO memory (kind, content, job_id, source, importance, expires_at, run_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.kind,
        entry.content,
        entry.jobId ?? null,
        entry.source ?? "manual",
        entry.importance ?? 0,
        entry.expiresAt ?? null,
        entry.runId ?? null
      );
    return {
      id: Number(res.lastInsertRowid),
      ...entry,
      source: entry.source ?? "manual",
      importance: entry.importance ?? 0,
      expiresAt: entry.expiresAt ?? null,
      runId: entry.runId ?? null,
      createdAt: new Date().toISOString(),
    };
  },
  list(opts: { kind?: string; jobId?: string; source?: string; runId?: string; includeExpired?: boolean; limit?: number } = {}): MemoryEntry[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (opts.kind) { where.push("kind = ?"); args.push(opts.kind); }
    if (opts.jobId) { where.push("job_id = ?"); args.push(opts.jobId); }
    if (opts.source) { where.push("source = ?"); args.push(opts.source); }
    if (opts.runId !== undefined) { where.push("run_id = ?"); args.push(opts.runId); }
    if (opts.includeExpired === false) { where.push("(expires_at IS NULL OR expires_at > ?)"); args.push(new Date().toISOString()); }
    const sql = `SELECT * FROM memory ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`;
    args.push(opts.limit ?? 100);
    return getDb()
      .prepare(sql)
      .all(...args)
      .map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: Number(row.id),
          kind: String(row.kind) as MemoryEntry["kind"],
          content: String(row.content),
          jobId: row.job_id ? String(row.job_id) : undefined,
          source: String(row.source),
          importance: Number(row.importance),
          expiresAt: row.expires_at ? String(row.expires_at) : null,
          runId: row.run_id ? String(row.run_id) : null,
          createdAt: String(row.created_at),
        };
      });
  },
  addWithTTL(entry: Omit<MemoryEntry, "id" | "createdAt" | "expiresAt">, daysTTL = 7): MemoryEntry {
    const days = Math.max(7, Math.min(30, daysTTL));
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    return memoryRepo.add({ ...entry, expiresAt });
  },
  listShort(opts: { kind?: string; jobId?: string; source?: string; runId?: string; includeExpired?: boolean; limit?: number } = {}): MemoryEntry[] {
    const where: string[] = ["expires_at IS NOT NULL"];
    const args: (string | number)[] = [];
    if (opts.kind) { where.push("kind = ?"); args.push(opts.kind); }
    if (opts.jobId) { where.push("job_id = ?"); args.push(opts.jobId); }
    if (opts.source) { where.push("source = ?"); args.push(opts.source); }
    if (opts.runId !== undefined) { where.push("run_id = ?"); args.push(opts.runId); }
    if (opts.includeExpired !== true) { where.push("expires_at > ?"); args.push(new Date().toISOString()); }
    const sql = `SELECT * FROM memory WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ?`;
    args.push(opts.limit ?? 100);
    return getDb()
      .prepare(sql)
      .all(...args)
      .map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: Number(row.id),
          kind: String(row.kind) as MemoryEntry["kind"],
          content: String(row.content),
          jobId: row.job_id ? String(row.job_id) : undefined,
          source: String(row.source),
          importance: Number(row.importance),
          expiresAt: row.expires_at ? String(row.expires_at) : null,
          runId: row.run_id ? String(row.run_id) : null,
          createdAt: String(row.created_at),
        };
      });
  },
  listLong(opts: { kind?: string; jobId?: string; source?: string; limit?: number } = {}): MemoryEntry[] {
    const where: string[] = ["expires_at IS NULL"];
    const args: (string | number)[] = [];
    if (opts.kind) { where.push("kind = ?"); args.push(opts.kind); }
    if (opts.jobId) { where.push("job_id = ?"); args.push(opts.jobId); }
    if (opts.source) { where.push("source = ?"); args.push(opts.source); }
    const sql = `SELECT * FROM memory WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ?`;
    args.push(opts.limit ?? 100);
    return getDb()
      .prepare(sql)
      .all(...args)
      .map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: Number(row.id),
          kind: String(row.kind) as MemoryEntry["kind"],
          content: String(row.content),
          jobId: row.job_id ? String(row.job_id) : undefined,
          source: String(row.source),
          importance: Number(row.importance),
          expiresAt: null,
          runId: row.run_id ? String(row.run_id) : null,
          createdAt: String(row.created_at),
        };
      });
  },
  embedFor(memoryId: number, embedding: number[], model = "local"): ReturnType<typeof memoryEmbeddingsRepo.upsert> {
    return memoryEmbeddingsRepo.upsert({ memoryId, embedding, model });
  },
  get(id: number): MemoryEntry | null {
    const row = getDb().prepare("SELECT * FROM memory WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: Number(row.id),
      kind: String(row.kind) as MemoryEntry["kind"],
      content: String(row.content),
      jobId: row.job_id ? String(row.job_id) : undefined,
      source: String(row.source),
      importance: Number(row.importance),
      expiresAt: row.expires_at ? String(row.expires_at) : null,
      runId: row.run_id ? String(row.run_id) : null,
      createdAt: String(row.created_at),
    };
  },
  delete(id: number) {
    const db = getDb();
    db.prepare("DELETE FROM memory_embeddings WHERE memory_id = ?").run(id);
    db.prepare("DELETE FROM memory WHERE id = ?").run(id);
  },
  prune(max = 500) {
    try {
      memoryRepo.deleteExpired();
    } catch {
      /* ignore purge errors, continue to cap prune */
    }
    const db = getDb();
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM memory WHERE id NOT IN (SELECT id FROM memory ORDER BY id DESC LIMIT ?)").run(max);
      db.prepare("DELETE FROM memory_embeddings WHERE memory_id NOT IN (SELECT id FROM memory)").run();
      db.exec("COMMIT");
    } catch (e) {
      try { db.exec("ROLLBACK"); } catch { /* ignore */ }
      throw e;
    }
  },
  wipe() {
    const db = getDb();
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM memory_embeddings").run();
      db.prepare("DELETE FROM memory").run();
      db.exec("COMMIT");
    } catch (e) {
      try { db.exec("ROLLBACK"); } catch { /* ignore */ }
      throw e;
    }
  },
  deleteExpired(nowIso = new Date().toISOString()) {
    const db = getDb();
    const rows = db.prepare("SELECT id FROM memory WHERE expires_at IS NOT NULL AND expires_at <= ?").all(nowIso) as Record<string, unknown>[];
    if (!rows.length) return 0;
    db.exec("BEGIN");
    try {
      for (const r of rows) {
        const id = Number(r.id);
        db.prepare("DELETE FROM memory_embeddings WHERE memory_id = ?").run(id);
      }
      db.prepare("DELETE FROM memory WHERE expires_at IS NOT NULL AND expires_at <= ?").run(nowIso);
      db.exec("COMMIT");
    } catch (e) {
      try { db.exec("ROLLBACK"); } catch { /* ignore */ }
      throw e;
    }
    return rows.length;
  },
  pruneExpired(nowIso = new Date().toISOString()) {
    return memoryRepo.deleteExpired(nowIso);
  },
};

export const memoryEmbeddingsRepo = {
  upsert(entry: Omit<MemoryEmbedding, "id" | "createdAt"> & { id?: number }): MemoryEmbedding {
    const db = getDb();
    const existing = entry.id
      ? (db.prepare("SELECT id FROM memory_embeddings WHERE id = ?").get(entry.id) as Record<string, unknown> | undefined)
      : undefined;
    if (existing) {
      db.prepare("UPDATE memory_embeddings SET memory_id = ?, embedding = ?, model = ? WHERE id = ?").run(
        entry.memoryId,
        JSON.stringify(entry.embedding),
        entry.model ?? "local",
        entry.id!
      );
      const row = db.prepare("SELECT * FROM memory_embeddings WHERE id = ?").get(entry.id!) as Record<string, unknown>;
      return {
        id: Number(row.id),
        memoryId: Number(row.memory_id),
        embedding: parseJsonArray(String(row.embedding)) as number[],
        model: String(row.model),
        createdAt: String(row.created_at),
      };
    }
    const res = db
      .prepare("INSERT INTO memory_embeddings (memory_id, embedding, model) VALUES (?, ?, ?)")
      .run(entry.memoryId, JSON.stringify(entry.embedding), entry.model ?? "local");
    const row = db.prepare("SELECT * FROM memory_embeddings WHERE id = ?").get(res.lastInsertRowid) as Record<string, unknown>;
    return {
      id: Number(row.id),
      memoryId: Number(row.memory_id),
      embedding: parseJsonArray(String(row.embedding)) as number[],
      model: String(row.model),
      createdAt: String(row.created_at),
    };
  },
  insert(entry: Omit<MemoryEmbedding, "id" | "createdAt">): MemoryEmbedding {
    return memoryEmbeddingsRepo.upsert(entry);
  },
  list(limit = 10000): MemoryEmbedding[] {
    const rows = getDb().prepare("SELECT * FROM memory_embeddings ORDER BY id ASC LIMIT ?").all(limit) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: Number(row.id),
      memoryId: Number(row.memory_id),
      embedding: parseJsonArray(String(row.embedding)) as number[],
      model: String(row.model),
      createdAt: String(row.created_at),
    }));
  },
  listByMemoryId(memoryId: number): MemoryEmbedding[] {
    const rows = getDb().prepare("SELECT * FROM memory_embeddings WHERE memory_id = ? ORDER BY id ASC").all(memoryId) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: Number(row.id),
      memoryId: Number(row.memory_id),
      embedding: parseJsonArray(String(row.embedding)) as number[],
      model: String(row.model),
      createdAt: String(row.created_at),
    }));
  },
  get(id: number): MemoryEmbedding | null {
    const row = getDb().prepare("SELECT * FROM memory_embeddings WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: Number(row.id),
      memoryId: Number(row.memory_id),
      embedding: parseJsonArray(String(row.embedding)) as number[],
      model: String(row.model),
      createdAt: String(row.created_at),
    };
  },
  deleteByMemoryId(memoryId: number) {
    getDb().prepare("DELETE FROM memory_embeddings WHERE memory_id = ?").run(memoryId);
  },
  delete(id: number) {
    getDb().prepare("DELETE FROM memory_embeddings WHERE id = ?").run(id);
  },
  wipe() {
    getDb().prepare("DELETE FROM memory_embeddings").run();
  },
};

export interface AgentState {
  agent: string;
  key: string;
  value: string;
  updatedAt: string;
}

export const agentStateRepo = {
  get(agent: string, key: string): string | null {
    const row = getDb().prepare("SELECT value FROM agent_state WHERE agent = ? AND key = ?").get(agent, key);
    return row ? String((row as Record<string, unknown>).value) : null;
  },
  set(agent: string, key: string, value: string) {
    getDb()
      .prepare(
        `INSERT INTO agent_state (agent, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(agent, key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`
      )
      .run(agent, key, value);
  },
  all(agent: string): AgentState[] {
    const rows = getDb().prepare("SELECT * FROM agent_state WHERE agent = ?").all(agent);
    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        agent: String(row.agent),
        key: String(row.key),
        value: String(row.value),
        updatedAt: String(row.updated_at),
      };
    });
  },
};

export interface VaultDoc {
  id: string;
  filename: string;
  mime: string;
  size: number;
  status: "indexing" | "ready" | "failed";
  embedModel: string;
  chunkCount: number;
  label: string;
  createdAt: string;
}

export interface VaultChunk {
  id: number;
  docId: string;
  idx: number;
  content: string;
  tokens: number;
  embedding: number[];
}

function rowToVaultDoc(row: Record<string, unknown>): VaultDoc {
  return {
    id: String(row.id),
    filename: String(row.filename),
    mime: String(row.mime),
    size: Number(row.size),
    status: String(row.status) as VaultDoc["status"],
    embedModel: String(row.embed_model),
    chunkCount: Number(row.chunk_count),
    label: row.label ? String(row.label) : "",
    createdAt: String(row.created_at),
  };
}

function rowToVaultChunk(row: Record<string, unknown>): VaultChunk {
  return {
    id: Number(row.id),
    docId: String(row.doc_id),
    idx: Number(row.idx),
    content: String(row.content),
    tokens: Number(row.tokens),
    embedding: parseJsonArray(String(row.embedding ?? "[]")) as number[],
  };
}

export const vaultRepo = {
  upsertDoc(doc: VaultDoc) {
    getDb()
      .prepare(
        `INSERT INTO vault_docs (id, filename, mime, size, status, embed_model, chunk_count, label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status=excluded.status, embed_model=excluded.embed_model,
           chunk_count=excluded.chunk_count, size=excluded.size, label=excluded.label`
      )
      .run(doc.id, doc.filename, doc.mime, doc.size, doc.status, doc.embedModel, doc.chunkCount, doc.label ?? "", doc.createdAt);
  },
  setLabel(id: string, label: string) {
    getDb().prepare("UPDATE vault_docs SET label = ? WHERE id = ?").run(label, id);
  },
  setEmbedModel(id: string, embedModel: string) {
    getDb().prepare("UPDATE vault_docs SET embed_model = ? WHERE id = ?").run(embedModel, id);
  },
  listDocs(): VaultDoc[] {
    return getDb()
      .prepare("SELECT * FROM vault_docs ORDER BY created_at DESC")
      .all()
      .map((r) => rowToVaultDoc(r as Record<string, unknown>));
  },
  getDoc(id: string): VaultDoc | null {
    const row = getDb().prepare("SELECT * FROM vault_docs WHERE id = ?").get(id);
    return row ? rowToVaultDoc(row as Record<string, unknown>) : null;
  },
  deleteDoc(id: string) {
    const db = getDb();
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM vault_chunks WHERE doc_id = ?").run(id);
      db.prepare("DELETE FROM vault_docs WHERE id = ?").run(id);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  },
  deleteChunks(docId: string) {
    getDb().prepare("DELETE FROM vault_chunks WHERE doc_id = ?").run(docId);
  },
  insertChunk(chunk: Omit<VaultChunk, "id">) {
    getDb()
      .prepare(
        "INSERT INTO vault_chunks (doc_id, idx, content, tokens, embedding) VALUES (?, ?, ?, ?, ?)"
      )
      .run(chunk.docId, chunk.idx, chunk.content, chunk.tokens, JSON.stringify(chunk.embedding));
  },
  chunksFor(docId: string): VaultChunk[] {
    return getDb()
      .prepare("SELECT * FROM vault_chunks WHERE doc_id = ? ORDER BY idx")
      .all(docId)
      .map((r) => rowToVaultChunk(r as Record<string, unknown>));
  },
  allChunks(limit = 5000): VaultChunk[] {
    return getDb()
      .prepare("SELECT * FROM vault_chunks ORDER BY id LIMIT ?")
      .all(limit)
      .map((r) => rowToVaultChunk(r as Record<string, unknown>));
  },
  distinctEmbedModels(): string[] {
    const rows = getDb().prepare("SELECT DISTINCT embed_model FROM vault_docs").all();
    return rows.map((r) => String((r as Record<string, unknown>).embed_model));
  },
  allChunksWithModel(): (VaultChunk & { embedModel: string })[] {
    const rows = getDb()
      .prepare(
        `SELECT c.id, c.doc_id, c.idx, c.content, c.tokens, c.embedding, d.embed_model
         FROM vault_chunks c JOIN vault_docs d ON d.id = c.doc_id ORDER BY c.id`
      )
      .all();
    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return { ...rowToVaultChunk(row), embedModel: String(row.embed_model) };
    });
  },
  stats() {
    const docs = Number(
      (getDb().prepare("SELECT COUNT(*) AS n FROM vault_docs").get() as Record<string, unknown>).n
    );
    const chunks = Number(
      (getDb().prepare("SELECT COUNT(*) AS n FROM vault_chunks").get() as Record<string, unknown>).n
    );
    const bytes = Number(
      (
        getDb().prepare("SELECT COALESCE(SUM(size), 0) AS n FROM vault_docs").get() as Record<string, unknown>
      ).n
    );
    return { docs, chunks, bytes };
  },
  wipe(insideTxn = false) {
    const db = getDb();
    if (!insideTxn) db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM vault_chunks").run();
      db.prepare("DELETE FROM vault_docs").run();
      if (!insideTxn) db.exec("COMMIT");
    } catch (err) {
      if (!insideTxn) db.exec("ROLLBACK");
      throw err;
    }
  },
};

/* ---------------------------------------------------------------------------
 * Resume documents
 * --------------------------------------------------------------------------- */

function rowToResumeDoc(row: Record<string, unknown>): ResumeDoc {
  let content: ResumeContent | undefined;
  if (typeof row.content === "string" && row.content) {
    try {
      content = JSON.parse(row.content) as ResumeContent;
    } catch {
      content = undefined;
    }
  }
  return {
    id: String(row.id),
    name: String(row.name),
    kind: (String(row.kind) as ResumeDoc["kind"]) ?? "resume",
    templateId: String(row.template_id ?? "classic-ats"),
    tex: String(row.tex ?? ""),
    content,
    source: (String(row.source) as ResumeDoc["source"]) ?? "scratch",
    sourceDocId: (row.source_doc_id as string) || undefined,
    targetJobId: (row.target_job_id as string) || undefined,
    autoCompile: Boolean(row.auto_compile),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export const resumeRepo = {
  list(): ResumeDoc[] {
    const rows = getDb().prepare("SELECT * FROM resume_docs ORDER BY updated_at DESC").all();
    return rows.map((r) => rowToResumeDoc(r as Record<string, unknown>));
  },
  get(id: string): ResumeDoc | null {
    const row = getDb().prepare("SELECT * FROM resume_docs WHERE id = ?").get(id);
    return row ? rowToResumeDoc(row as Record<string, unknown>) : null;
  },
  upsert(doc: ResumeDoc) {
    getDb()
      .prepare(
        `INSERT INTO resume_docs (id, name, kind, template_id, tex, content, source,
           source_doc_id, target_job_id, auto_compile, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, kind=excluded.kind, template_id=excluded.template_id,
           tex=excluded.tex, content=excluded.content, source=excluded.source,
           source_doc_id=excluded.source_doc_id, target_job_id=excluded.target_job_id,
           auto_compile=excluded.auto_compile, updated_at=excluded.updated_at`
      )
      .run(
        doc.id,
        doc.name,
        doc.kind ?? "resume",
        doc.templateId ?? "classic-ats",
        doc.tex ?? "",
        doc.content ? JSON.stringify(doc.content) : null,
        doc.source ?? "scratch",
        doc.sourceDocId ?? null,
        doc.targetJobId ?? null,
        doc.autoCompile ? 1 : 0,
        doc.createdAt ?? new Date().toISOString(),
        doc.updatedAt ?? new Date().toISOString()
      );
    return doc;
  },
  remove(id: string) {
    getDb().prepare("DELETE FROM resume_docs WHERE id = ?").run(id);
  },
  removeAll() {
    getDb().prepare("DELETE FROM resume_docs").run();
  },
  count(): number {
    const row = getDb().prepare("SELECT COUNT(*) AS n FROM resume_docs").get();
    return Number((row as Record<string, unknown>).n);
  },
};

function rowToResumeVariant(r: Record<string, unknown>): ResumeVariant {
  let content: ResumeContent;
  try {
    content = typeof r.content === "string" ? JSON.parse(r.content) : (r.content as ResumeContent);
  } catch {
    content = { header: { name: "", title: "", email: "", phone: "", location: "", linkedin: "", github: "", portfolio: "" } };
  }
  return {
    id: String(r.id),
    name: String(r.name),
    archetype: String(r.archetype),
    tag: String(r.tag),
    templateId: String(r.template_id || "classic-ats"),
    content,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export interface QuestionnaireItem {
  id: string;
  key: string;
  question: string;
  answer: string;
  category: string;
  updatedAt: string;
}

export const resumeVariantsRepo = {
  list(): ResumeVariant[] {
    const rows = getDb().prepare("SELECT * FROM resume_variants ORDER BY updated_at DESC").all();
    return rows.map((r) => rowToResumeVariant(r as Record<string, unknown>));
  },
  get(id: string): ResumeVariant | null {
    const row = getDb().prepare("SELECT * FROM resume_variants WHERE id = ?").get(id);
    return row ? rowToResumeVariant(row as Record<string, unknown>) : null;
  },
  getByTag(tag: string): ResumeVariant | null {
    const row = getDb().prepare("SELECT * FROM resume_variants WHERE tag = ?").get(tag);
    return row ? rowToResumeVariant(row as Record<string, unknown>) : null;
  },
  upsert(variant: ResumeVariant) {
    getDb()
      .prepare(
        `INSERT INTO resume_variants (id, name, archetype, tag, template_id, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           archetype = excluded.archetype,
           tag = excluded.tag,
           template_id = excluded.template_id,
           content = excluded.content,
           updated_at = excluded.updated_at`
      )
      .run(
        variant.id,
        variant.name,
        variant.archetype,
        variant.tag,
        variant.templateId || "classic-ats",
        JSON.stringify(variant.content),
        variant.createdAt || new Date().toISOString(),
        variant.updatedAt || new Date().toISOString()
      );
    return variant;
  },
  remove(id: string) {
    getDb().prepare("DELETE FROM resume_variants WHERE id = ?").run(id);
  },
  seedDefaults() {
    if (this.list().length > 0) return;
    const defaults: ResumeVariant[] = [
      {
        id: "var-staff-frontend",
        name: "Staff Frontend Architect",
        archetype: "Staff Frontend",
        tag: "staff-frontend",
        templateId: "modern-tech",
        content: {
          header: { name: "Alex Johnson", title: "Staff Frontend Architect", email: "alex@example.com", phone: "+1 555-0199", location: "San Francisco, CA", linkedin: "linkedin.com/in/alex", github: "github.com/alex", portfolio: "alex.dev" },
          summary: "Frontend Systems Leader with 7+ years architecting web applications, design systems, and WebAssembly tooling.",
          skills: ["TypeScript", "Next.js", "React 19", "WebAssembly", "Tailwind CSS", "Architecture"],
          experience: [{ role: "Staff Frontend Architect", company: "Vercel Ecosystem", duration: "2022 - Present", bullets: ["Cut core web vital p99 latency by 45%.", "Led organization-wide design system migration."] }],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "var-systems-go",
        name: "Distributed Systems & Cloud Engineer",
        archetype: "Distributed Systems Go",
        tag: "systems-go",
        templateId: "technical-modern",
        content: {
          header: { name: "Alex Johnson", title: "Principal Distributed Systems Engineer", email: "alex@example.com", phone: "+1 555-0199", location: "San Francisco, CA", linkedin: "linkedin.com/in/alex", github: "github.com/alex", portfolio: "alex.dev" },
          summary: "Low-latency systems and distributed storage engineer specializing in Go, Rust, and high-throughput stream processing.",
          skills: ["Go", "Rust", "gRPC", "Kafka", "Kubernetes", "PostgreSQL", "Distributed Systems"],
          experience: [{ role: "Lead Systems Engineer", company: "CloudScale", duration: "2021 - Present", bullets: ["Engineered raft-replicated storage engine handling 25M ops/sec.", "Reduced cloud compute spend by $240k/yr."] }],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    for (const d of defaults) this.upsert(d);
  },
};

export const questionnaireRepo = {
  list(): QuestionnaireItem[] {
    const rows = getDb().prepare("SELECT * FROM questionnaires ORDER BY category, key").all();
    return rows.map((r) => ({
      id: String((r as Record<string, unknown>).id),
      key: String((r as Record<string, unknown>).key),
      question: String((r as Record<string, unknown>).question),
      answer: String((r as Record<string, unknown>).answer),
      category: String((r as Record<string, unknown>).category || "general"),
      updatedAt: String((r as Record<string, unknown>).updated_at),
    }));
  },
  get(key: string): QuestionnaireItem | null {
    const row = getDb().prepare("SELECT * FROM questionnaires WHERE key = ?").get(key);
    if (!row) return null;
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      key: String(r.key),
      question: String(r.question),
      answer: String(r.answer),
      category: String(r.category || "general"),
      updatedAt: String(r.updated_at),
    };
  },
  upsert(item: Omit<QuestionnaireItem, "updatedAt">) {
    getDb()
      .prepare(
        `INSERT INTO questionnaires (id, key, question, answer, category, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           question = excluded.question,
           answer = excluded.answer,
           category = excluded.category,
           updated_at = excluded.updated_at`
      )
      .run(
        item.id || `q-${item.key}`,
        item.key,
        item.question,
        item.answer,
        item.category || "general",
        new Date().toISOString()
      );
    return item;
  },
  remove(key: string) {
    getDb().prepare("DELETE FROM questionnaires WHERE key = ?").run(key);
  },
  seedDefaults() {
    if (this.list().length > 0) return;
    const defaults = [
      { id: "q-notice", key: "notice_period", question: "What is your notice period or earliest start date?", answer: "2 weeks notice period (immediate start negotiable)", category: "availability" },
      { id: "q-visa", key: "sponsorship_required", question: "Will you now or in the future require visa sponsorship?", answer: "Eligible for EU Blue Card in Germany/EU, UK Skilled Worker, or US O-1/TN visa.", category: "legal" },
      { id: "q-salary", key: "target_salary", question: "What is your target annual salary compensation?", answer: "$140,000 - $180,000 USD (or local market equivalent)", category: "compensation" },
      { id: "q-noncompete", key: "non_compete", question: "Are you subject to any non-compete or non-solicitation restrictions?", answer: "No active non-compete agreements.", category: "legal" },
    ];
    for (const d of defaults) this.upsert(d);
  },
};

export const usageRepo = {
  log(entry: UsageEntry) {
    getDb()
      .prepare(
        `INSERT INTO usage_log (agent, kind, provider, model, status, prompt_tokens, completion_tokens, latency_ms, cost_est, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.agent,
        entry.kind,
        entry.provider ?? null,
        entry.model ?? null,
        entry.status,
        entry.promptTokens,
        entry.completionTokens,
        entry.latencyMs,
        entry.costEst,
        entry.error ?? null
      );
  },
  all(limit = 10000): UsageEntry[] {
    const rows = getDb().prepare("SELECT * FROM usage_log ORDER BY id ASC LIMIT ?").all(limit);
    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: Number(row.id),
        agent: String(row.agent),
        kind: String(row.kind) as UsageEntry["kind"],
        provider: row.provider ? String(row.provider) : undefined,
        model: row.model ? String(row.model) : undefined,
        status: String(row.status) as UsageEntry["status"],
        promptTokens: Number(row.prompt_tokens),
        completionTokens: Number(row.completion_tokens),
        latencyMs: Number(row.latency_ms),
        costEst: Number(row.cost_est),
        error: row.error ? String(row.error) : undefined,
      };
    });
  },
  wipe() {
    getDb().prepare("DELETE FROM usage_log").run();
  },
  recent(limit = 100): UsageEntry[] {
    const rows = getDb()
      .prepare("SELECT * FROM usage_log ORDER BY id DESC LIMIT ?")
      .all(limit);
    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: Number(row.id),
        agent: String(row.agent),
        kind: String(row.kind) as UsageEntry["kind"],
        provider: row.provider ? String(row.provider) : undefined,
        model: row.model ? String(row.model) : undefined,
        status: String(row.status) as UsageEntry["status"],
        promptTokens: Number(row.prompt_tokens),
        completionTokens: Number(row.completion_tokens),
        latencyMs: Number(row.latency_ms),
        costEst: Number(row.cost_est),
        error: row.error ? String(row.error) : undefined,
      };
    });
  },
  totals(): { calls: number; tokens: number; errors: number; avgLatencyMs: number } {
    const r = getDb()
      .prepare(
        "SELECT COUNT(*) AS calls, COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS tokens, SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS errors, COALESCE(AVG(latency_ms), 0) AS avg FROM usage_log"
      )
      .get() as Record<string, unknown>;
    return {
      calls: Number(r.calls),
      tokens: Number(r.tokens),
      errors: Number(r.errors),
      avgLatencyMs: Math.round(Number(r.avg)),
    };
  },
};

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface AnalyticsStats {
  funnel: { status: string; count: number }[];
  weekly: { week: string; applied: number; interviews: number }[];
  responseRate: { replied: number; sent: number; rate: number };
  overdueFollowUps: number;
  upcomingInterviews: number;
  topCompanies: { company: string; count: number }[];
  contactCount: number;
  openPositions: number;
}

export function computeStats(): AnalyticsStats {
  const database = getDb();
  const funnel = database
    .prepare("SELECT status, COUNT(*) AS count FROM jobs GROUP BY status")
    .all()
    .map((r) => {
      const row = r as Record<string, unknown>;
      return { status: String(row.status), count: Number(row.count) };
    });

  const weekly: { week: string; applied: number; interviews: number }[] = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const applied = Number(
      (
        database
          .prepare(
            "SELECT COUNT(*) AS n FROM jobs WHERE applied_date >= ? AND applied_date < ?"
          )
          .get(weekStart.toISOString().slice(0, 10), weekEnd.toISOString().slice(0, 10)) as Record<string, unknown>
      ).n
    );
    const interviews = Number(
      (
        database
          .prepare(
            "SELECT COUNT(*) AS n FROM interviews WHERE scheduled_at >= ? AND scheduled_at < ?"
          )
          .get(weekStart.toISOString(), weekEnd.toISOString()) as Record<string, unknown>
      ).n
    );
    weekly.push({
      week: weekStart.toISOString().slice(0, 10),
      applied,
      interviews,
    });
  }

  const sent = Number(
    (
      database.prepare("SELECT COUNT(*) AS n FROM emails WHERE direction = 'sent'").get() as Record<string, unknown>
    ).n
  );
  const replied = Number(
    (
      database.prepare("SELECT COUNT(*) AS n FROM emails WHERE status = 'replied'").get() as Record<string, unknown>
    ).n
  );

  const overdueFollowUps = Number(
    (
      database
        .prepare(
          "SELECT COUNT(*) AS n FROM jobs WHERE follow_up_due IS NOT NULL AND follow_up_due < ? AND status NOT IN ('offer', 'rejected')"
        )
        .get(new Date().toISOString().slice(0, 10)) as Record<string, unknown>
    ).n
  );

  const upcomingInterviews = Number(
    (
      database
        .prepare(
          "SELECT COUNT(*) AS n FROM interviews WHERE status = 'scheduled' AND scheduled_at >= ?"
        )
        .get(new Date().toISOString()) as Record<string, unknown>
    ).n
  );

  const topCompanies = database
    .prepare("SELECT company, COUNT(*) AS count FROM jobs GROUP BY company ORDER BY count DESC LIMIT 5")
    .all()
    .map((r) => {
      const row = r as Record<string, unknown>;
      return { company: String(row.company), count: Number(row.count) };
    });

  const contactCount = Number(
    (database.prepare("SELECT COUNT(*) AS n FROM contacts").get() as Record<string, unknown>).n
  );
  const openPositions = Number(
    (
      database
        .prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('wishlist', 'applied', 'interviewing')")
        .get() as Record<string, unknown>
    ).n
  );

  return {
    funnel,
    weekly,
    responseRate: { replied, sent, rate: sent > 0 ? Math.round((replied / sent) * 100) : 0 },
    overdueFollowUps,
    upcomingInterviews,
    topCompanies,
    contactCount,
    openPositions,
  };
}

// ---------------------------------------------------------------------------
// Seed bootstrap
// ---------------------------------------------------------------------------

export const ALL_TABLES_IN_DELETION_ORDER = [
  "job_source_edges",
  "crawler_jobs_staging",
  "crawler_source_state",
  "crawler_sources",
  "crawler_runs",
  "saved_searches",
  "enrichment_items",
  "enrichment_sources",
  "reminders",
  "interviews",
  "emails",
  "contacts",
  "resume_docs",
  "agent_checkpoint_writes",
  "agent_checkpoints",
  "agent_run_history",
  "memory_embeddings",
  "memory",
  "vault_chunks",
  "vault_docs",
  "jobs",
  "agent_state",
  "usage_log",
  "notifications",
  "settings",
  "meta",
] as const;

export function resetDatabase() {
  const database = getDb();
  migrate(database);
  try {
    database.exec("BEGIN");
    for (const table of ALL_TABLES_IN_DELETION_ORDER) {
      database.exec(`DELETE FROM ${table};`);
    }
    database.exec("COMMIT");
  } catch (err) {
    try {
      database.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  }
  metaRepo.set("seed_version", "");
  bootstrapSeed();
}

export function bootstrapSeed() {
  const database = getDb();
  if (metaRepo.get("seed_version") === "1") return;
  const count = Number((database.prepare("SELECT COUNT(*) AS n FROM jobs").get() as Record<string, unknown>).n);
  if (count === 0) {
    const insert = database.prepare(
      `INSERT OR REPLACE INTO jobs (id, title, company, location, salary, url, status,
         applied_date, deadline, follow_up_due, priority, job_description, notes,
         match_score, auto_apply_status, auto_apply_logs, created_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'idle', '[]', ?)`
    );
    for (const job of seedJobs) {
      insert.run(
        job.id, job.title, job.company, job.location ?? "", job.salary ?? null,
        job.url ?? null, job.status, job.appliedDate ?? null, job.deadline ?? null,
        job.followUpDue ?? null, job.priority ?? null, job.jobDescription ?? "",
        job.notes ?? null, job.matchScore ?? null, job.createdDate
      );
    }
  }
  if (!settingsRepo.get("profile")) {
    settingsRepo.set("profile", JSON.stringify(initialProfile));
  }
  markSeeded();
}

export function isSeeded(): boolean {
  return metaRepo.get("seed_version") === "1";
}

export function markSeeded() {
  metaRepo.set("seed_version", "1");
}

// ---------------------------------------------------------------------------
// Backup / restore
// ---------------------------------------------------------------------------

export interface BackupData {
  jobs: JobApplication[];
  contacts: Contact[];
  emails: EmailMessage[];
  interviews: InterviewEvent[];
  reminders: Reminder[];
  memories: MemoryEntry[];
  vault: { docs: VaultDoc[]; chunks: VaultChunk[] };
  settings: Record<string, string>;
  usage: UsageEntry[];
  resumeDocs?: ResumeDoc[];
  notifications?: NotificationItem[];
  agentRunHistory?: AgentRunHistoryEntry[];
  memoryEmbeddings?: MemoryEmbedding[];
  crawlerSources?: Array<{ id: string; definition: SourceDefinition; origin: string; enabled: boolean }>;
  crawlerSourceState?: SourceSyncState[];
  crawlerRuns?: CrawlerRunSummary[];
  savedSearches?: SavedSearchRecord[];
  enrichmentSources?: EnrichmentSourceRecord[];
  enrichmentItems?: EnrichmentItemRecord[];
  jobSourceEdges?: JobSourceEdge[];
}

export function exportAllData(): BackupData {
  return {
    jobs: jobsRepo.list(),
    contacts: contactsRepo.list(),
    emails: emailsRepo.list(),
    interviews: interviewsRepo.list(),
    reminders: remindersRepo.list(),
    memories: memoryRepo.list({ limit: 100000 }),
    vault: { docs: vaultRepo.listDocs(), chunks: vaultRepo.allChunks(100000) },
    settings: settingsRepo.all(),
    usage: usageRepo.all(100000),
    resumeDocs: resumeRepo.list(),
    notifications: notificationsRepo.list(100000),
    agentRunHistory: agentRunHistoryRepo.listRecent(100000),
    memoryEmbeddings: memoryEmbeddingsRepo.list(100000),
    crawlerSources: crawlerSourcesRepo.list().map((s) => ({ id: s.id, definition: s.definition, origin: s.origin, enabled: s.enabled })),
    crawlerSourceState: crawlerSourceStateRepo.list(),
    crawlerRuns: crawlerRunsRepo.listRecent(100000),
    savedSearches: savedSearchesRepo.list(),
    enrichmentSources: enrichmentSourcesRepo.list(),
    enrichmentItems: enrichmentItemsRepo.listAll(100000),
    jobSourceEdges: jobSourceEdgesRepo.listAll(100000),
  };
}

/** Wipe every collection and restore the snapshot inside a single transaction. */
export function importAllData(data: BackupData): { counts: Record<string, number> } {
  const db = getDb();

  try {
    db.exec("BEGIN");
    for (const table of ALL_TABLES_IN_DELETION_ORDER) {
      db.exec(`DELETE FROM ${table};`);
    }

    for (const job of data.jobs ?? []) jobsRepo.upsert(job);
    for (const contact of data.contacts ?? []) contactsRepo.upsert(contact);
    for (const email of data.emails ?? []) emailsRepo.upsert(email);
    for (const interview of data.interviews ?? []) interviewsRepo.upsert(interview);
    for (const reminder of data.reminders ?? []) remindersRepo.upsert(reminder);
    for (const memory of data.memories ?? []) insertMemoryWithId(memory);
    for (const emb of data.memoryEmbeddings ?? []) {
      const dbEmb = emb as MemoryEmbedding;
      db.prepare("INSERT INTO memory_embeddings (id, memory_id, embedding, model, created_at) VALUES (?, ?, ?, ?, ?)").run(
        dbEmb.id ?? null,
        dbEmb.memoryId,
        JSON.stringify(dbEmb.embedding),
        dbEmb.model ?? "local",
        dbEmb.createdAt ?? new Date().toISOString()
      );
    }
    for (const doc of data.vault?.docs ?? []) vaultRepo.upsertDoc(doc);
    for (const chunk of data.vault?.chunks ?? []) {
      vaultRepo.insertChunk({
        docId: chunk.docId,
        idx: chunk.idx,
        content: chunk.content,
        tokens: chunk.tokens,
        embedding: chunk.embedding,
      });
    }
    for (const r of data.resumeDocs ?? []) resumeRepo.upsert(r);

    const notifStmt = db.prepare(
      `INSERT INTO notifications (id, title, message, kind, link, read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const n of data.notifications ?? []) {
      notifStmt.run(
        n.id,
        n.title,
        n.message,
        n.kind ?? "info",
        n.link ?? null,
        n.read ? 1 : 0,
        n.createdAt ?? new Date().toISOString()
      );
    }

    const runStmt = db.prepare(
      `INSERT INTO agent_run_history (thread_id, job_id, agent_name, status, region, ats_score, reasoning, findings, logs, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const run of data.agentRunHistory ?? []) {
      runStmt.run(
        run.threadId,
        run.jobId ?? null,
        run.agentName,
        run.status,
        run.region ?? null,
        run.atsScore ?? null,
        run.reasoning ?? null,
        run.findings ?? null,
        run.logs ?? null,
        run.createdAt ?? new Date().toISOString()
      );
    }

    for (const [key, value] of Object.entries(data.settings ?? {})) settingsRepo.set(key, value);
    for (const entry of data.usage ?? []) usageRepo.log(entry);
    for (const cs of data.crawlerSources ?? []) crawlerSourcesRepo.upsert(cs.id, cs.definition, cs.origin, cs.enabled);
    for (const css of data.crawlerSourceState ?? []) crawlerSourceStateRepo.upsert(css);
    for (const cr of data.crawlerRuns ?? []) crawlerRunsRepo.create({ id: cr.runId, channel: cr.channel, status: cr.status });
    for (const ss of data.savedSearches ?? []) savedSearchesRepo.create(ss);
    for (const es of data.enrichmentSources ?? []) enrichmentSourcesRepo.upsert(es);
    for (const ei of data.enrichmentItems ?? []) {
      const payload = ei.payloadJson ? JSON.parse(ei.payloadJson) : {};
      enrichmentItemsRepo.upsert({ sourceId: ei.sourceId, itemKey: ei.itemKey, payload, provenance: ei.provenance });
    }
    for (const jse of data.jobSourceEdges ?? []) jobSourceEdgesRepo.upsertEdge({ ...jse, jobId: jse.jobId! });
    markSeeded();
    db.exec("COMMIT");
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch { /* already rolled back */ }
    throw e;
  }

  return {
    counts: {
      jobs: data.jobs?.length ?? 0,
      contacts: data.contacts?.length ?? 0,
      emails: data.emails?.length ?? 0,
      interviews: data.interviews?.length ?? 0,
      reminders: data.reminders?.length ?? 0,
      memories: data.memories?.length ?? 0,
      vaultDocs: data.vault?.docs?.length ?? 0,
      vaultChunks: data.vault?.chunks?.length ?? 0,
      usage: data.usage?.length ?? 0,
      resumeDocs: data.resumeDocs?.length ?? 0,
      notifications: data.notifications?.length ?? 0,
      agentRunHistory: data.agentRunHistory?.length ?? 0,
      memoryEmbeddings: data.memoryEmbeddings?.length ?? 0,
    },
  };
}

function insertMemoryWithId(memory: MemoryEntry) {
  const db = getDb();
  if (memory.id != null) {
    db.prepare(
      `INSERT INTO memory (id, kind, content, job_id, source, importance, expires_at, run_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      memory.id,
      memory.kind,
      memory.content,
      memory.jobId ?? null,
      memory.source,
      memory.importance,
      memory.expiresAt ?? null,
      memory.runId ?? null,
      memory.createdAt ?? new Date().toISOString()
    );
  } else {
    db.prepare(
      `INSERT INTO memory (kind, content, job_id, source, importance, expires_at, run_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      memory.kind,
      memory.content,
      memory.jobId ?? null,
      memory.source,
      memory.importance,
      memory.expiresAt ?? null,
      memory.runId ?? null,
      memory.createdAt ?? new Date().toISOString()
    );
  }
}

export interface AgentRunHistoryEntry {
  id?: number;
  threadId: string;
  jobId?: string;
  agentName: string;
  status: string;
  region?: string;
  atsScore?: number;
  reasoning?: string;
  findings?: string;
  logs?: string;
  createdAt?: string;
}

export const agentRunHistoryRepo = {
  log(entry: AgentRunHistoryEntry) {
    const db = getDb();
    db.prepare(
      `INSERT INTO agent_run_history (thread_id, job_id, agent_name, status, region, ats_score, reasoning, findings, logs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entry.threadId,
      entry.jobId ?? null,
      entry.agentName,
      entry.status,
      entry.region ?? null,
      entry.atsScore ?? null,
      entry.reasoning ?? null,
      entry.findings ?? null,
      entry.logs ?? null
    );
  },

  listByThread(threadId: string): AgentRunHistoryEntry[] {
    const db = getDb();
    const rows = db
      .prepare(`SELECT * FROM agent_run_history WHERE thread_id = ? ORDER BY created_at ASC`)
      .all(threadId) as Record<string, unknown>[];

    return rows.map((r) => ({
      id: Number(r.id),
      threadId: String(r.thread_id),
      jobId: r.job_id ? String(r.job_id) : undefined,
      agentName: String(r.agent_name),
      status: String(r.status),
      region: r.region ? String(r.region) : undefined,
      atsScore: r.ats_score ? Number(r.ats_score) : undefined,
      reasoning: r.reasoning ? String(r.reasoning) : undefined,
      findings: r.findings ? String(r.findings) : undefined,
      logs: r.logs ? String(r.logs) : undefined,
      createdAt: String(r.created_at),
    }));
  },

  listRecent(limit = 20): AgentRunHistoryEntry[] {
    const db = getDb();
    const rows = db
      .prepare(`SELECT * FROM agent_run_history ORDER BY id DESC LIMIT ?`)
      .all(limit) as Record<string, unknown>[];

    return rows.map((r) => ({
      id: Number(r.id),
      threadId: String(r.thread_id),
      jobId: r.job_id ? String(r.job_id) : undefined,
      agentName: String(r.agent_name),
      status: String(r.status),
      region: r.region ? String(r.region) : undefined,
      atsScore: r.ats_score ? Number(r.ats_score) : undefined,
      reasoning: r.reasoning ? String(r.reasoning) : undefined,
      findings: r.findings ? String(r.findings) : undefined,
      logs: r.logs ? String(r.logs) : undefined,
      createdAt: String(r.created_at),
    }));
  },

  prune(keepLast = 100): number {
    const db = getDb();
    const keep = Math.max(0, keepLast);
    if (keep === 0) {
      const res = db.prepare(`DELETE FROM agent_run_history`).run();
      return Number((res as unknown as { changes: number }).changes ?? 0);
    }
    const keepRows = db
      .prepare(`SELECT id FROM agent_run_history ORDER BY id DESC LIMIT ?`)
      .all(keep) as Record<string, unknown>[];
    if (keepRows.length === 0) return 0;
    const total = Number((db.prepare(`SELECT COUNT(*) as n FROM agent_run_history`).get() as Record<string, unknown>).n);
    if (total <= keep) return 0;
    const keepIds = keepRows.map((r) => Number(r.id));
    const placeholders = keepIds.map(() => "?").join(", ");
    const res = db.prepare(`DELETE FROM agent_run_history WHERE id NOT IN (${placeholders})`).run(...keepIds);
    return Number((res as unknown as { changes: number }).changes ?? 0);
  },

  pruneThread(threadId: string, keepLast = 10): number {
    const db = getDb();
    const keep = Math.max(0, keepLast);
    if (keep === 0) {
      const res = db.prepare(`DELETE FROM agent_run_history WHERE thread_id = ?`).run(threadId);
      return Number((res as unknown as { changes: number }).changes ?? 0);
    }
    const keepRows = db
      .prepare(`SELECT id FROM agent_run_history WHERE thread_id = ? ORDER BY id DESC LIMIT ?`)
      .all(threadId, keep) as Record<string, unknown>[];
    if (keepRows.length === 0) return 0;
    const total = Number(
      (db.prepare(`SELECT COUNT(*) as n FROM agent_run_history WHERE thread_id = ?`).get(threadId) as Record<string, unknown>).n
    );
    if (total <= keep) return 0;
    const keepIds = keepRows.map((r) => Number(r.id));
    const placeholders = keepIds.map(() => "?").join(", ");
    const res = db
      .prepare(`DELETE FROM agent_run_history WHERE thread_id = ? AND id NOT IN (${placeholders})`)
      .run(threadId, ...keepIds);
    return Number((res as unknown as { changes: number }).changes ?? 0);
  },
};

export const notificationsRepo = {
  list(limit = 50): NotificationItem[] {
    const db = getDb();
    const rows = db
      .prepare(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as Record<string, unknown>[];

    return rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      message: String(r.message),
      kind: (r.kind || "info") as NotificationItem["kind"],
      link: r.link ? String(r.link) : undefined,
      read: Boolean(r.read),
      createdAt: String(r.created_at),
    }));
  },

  add(item: { title: string; message: string; kind?: NotificationItem["kind"]; link?: string }): NotificationItem {
    const db = getDb();
    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const kind = item.kind || "info";
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO notifications (id, title, message, kind, link, read, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    ).run(id, item.title, item.message, kind, item.link ?? null, now);

    return {
      id,
      title: item.title,
      message: item.message,
      kind,
      link: item.link,
      read: false,
      createdAt: now,
    };
  },

  markRead(id: string) {
    const db = getDb();
    db.prepare(`UPDATE notifications SET read = 1 WHERE id = ?`).run(id);
  },

  markAllRead() {
    const db = getDb();
    db.prepare(`UPDATE notifications SET read = 1 WHERE read = 0`).run();
  },

  delete(id: string) {
    const db = getDb();
    db.prepare(`DELETE FROM notifications WHERE id = ?`).run(id);
  },

  clear() {
    const db = getDb();
    db.prepare(`DELETE FROM notifications`).run();
  },
};

export type { ResumeVariant, EmailMessage } from "@/types";
