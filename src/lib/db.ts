import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import {
  Contact,
  EmailMessage,
  InterviewEvent,
  JobApplication,
  Reminder,
  ResumeContent,
  ResumeDoc,
} from "@/types";
import { seedJobs } from "./seedData";

const DATA_DIR = process.env.HUNTFLOW_DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = process.env.HUNTFLOW_DB_PATH || path.join(DATA_DIR, "huntflow.db");

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
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

export function migrate(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
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
    CREATE INDEX IF NOT EXISTS idx_agent_run_history_thread ON agent_run_history(thread_id);
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
         updated_at=excluded.updated_at`
    );
    stmt.run(...(keys.map((k) => row[k]) as never[]));
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
};

export const contactsRepo = {
  list(): Contact[] {
    const stmt = getDb().prepare("SELECT * FROM contacts ORDER BY created_at DESC");
    return stmt.all().map((r) => rowToContact(r as Record<string, unknown>));
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
  createdAt?: string;
}

export const memoryRepo = {
  add(entry: Omit<MemoryEntry, "id" | "createdAt">): MemoryEntry {
    const db = getDb();
    const res = db
      .prepare(
        `INSERT INTO memory (kind, content, job_id, source, importance)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(entry.kind, entry.content, entry.jobId ?? null, entry.source, entry.importance);
    return { id: Number(res.lastInsertRowid), ...entry, createdAt: new Date().toISOString() };
  },
  list(opts: { kind?: string; jobId?: string; source?: string; limit?: number } = {}): MemoryEntry[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (opts.kind) { where.push("kind = ?"); args.push(opts.kind); }
    if (opts.jobId) { where.push("job_id = ?"); args.push(opts.jobId); }
    if (opts.source) { where.push("source = ?"); args.push(opts.source); }
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
          createdAt: String(row.created_at),
        };
      });
  },
  delete(id: number) {
    getDb().prepare("DELETE FROM memory WHERE id = ?").run(id);
  },
  prune(max = 500) {
    getDb()
      .prepare("DELETE FROM memory WHERE id NOT IN (SELECT id FROM memory ORDER BY id DESC LIMIT ?)")
      .run(max);
  },
  wipe() {
    getDb().prepare("DELETE FROM memory").run();
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
        doc.kind,
        doc.templateId,
        doc.tex,
        doc.content ? JSON.stringify(doc.content) : null,
        doc.source,
        doc.sourceDocId ?? null,
        doc.targetJobId ?? null,
        doc.autoCompile ? 1 : 0,
        doc.createdAt,
        doc.updatedAt
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

export function bootstrapSeed() {
  const database = getDb();
  if (metaRepo.get("seed_version") === "1") return;
  const count = Number((database.prepare("SELECT COUNT(*) AS n FROM jobs").get() as Record<string, unknown>).n);
  if (count > 0) {
    markSeeded();
    return;
  }
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
    usage: usageRepo.all(),
  };
}

/** Wipe every collection and restore the snapshot inside a single transaction. */
export function importAllData(data: BackupData): { counts: Record<string, number> } {
  const db = getDb();

  try {
    db.exec("BEGIN");
    jobsRepo.removeAll(true);
    contactsRepo.removeAll();
    emailsRepo.removeAll();
    interviewsRepo.removeAll();
    remindersRepo.removeAll();
    memoryRepo.wipe();
    vaultRepo.wipe(true);
    usageRepo.wipe();
    settingsRepo.wipe();

    for (const job of data.jobs ?? []) jobsRepo.upsert(job);
    for (const contact of data.contacts ?? []) contactsRepo.upsert(contact);
    for (const email of data.emails ?? []) emailsRepo.upsert(email);
    for (const interview of data.interviews ?? []) interviewsRepo.upsert(interview);
    for (const reminder of data.reminders ?? []) remindersRepo.upsert(reminder);
    for (const memory of data.memories ?? []) insertMemoryWithId(memory);
    for (const doc of data.vault?.docs ?? []) vaultRepo.upsertDoc(doc);
    for (const chunk of data.vault?.chunks ?? []) vaultRepo.insertChunk({ docId: chunk.docId, idx: chunk.idx, content: chunk.content, tokens: chunk.tokens, embedding: chunk.embedding });
    for (const [key, value] of Object.entries(data.settings ?? {})) settingsRepo.set(key, value);
    for (const entry of data.usage ?? []) usageRepo.log(entry);

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
    },
  };
}

function insertMemoryWithId(memory: MemoryEntry) {
  getDb()
    .prepare(
      `INSERT INTO memory (kind, content, job_id, source, importance, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(memory.kind, memory.content, memory.jobId ?? null, memory.source, memory.importance, memory.createdAt ?? new Date().toISOString());
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
};
