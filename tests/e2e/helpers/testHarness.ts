import { NextRequest } from "next/server";
import {
  getDb,
  migrate,
  bootstrapSeed,
  isSeeded,
  markSeeded,
  resetDatabase,
  exportAllData,
  importAllData,
  jobsRepo,
  contactsRepo,
  emailsRepo,
  interviewsRepo,
  remindersRepo,
  settingsRepo,
  metaRepo,
  memoryRepo,
  agentStateRepo,
  vaultRepo,
  resumeRepo,
  usageRepo,
  notificationsRepo,
  agentRunHistoryRepo,
  BackupData,
} from "@/lib/db";

/**
 * Creates a standard NextRequest with JSON payload.
 */
export function createJsonRequest(
  url: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
}

/**
 * Creates a standard NextRequest for multipart/form-data.
 */
export function createFormDataRequest(
  url: string,
  formData: FormData,
  method = "POST",
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(url, {
    method,
    body: formData,
    headers,
  });
}

/**
 * Creates a standard NextRequest with raw text/empty body for GET/DELETE/etc.
 */
export function createUrlRequest(
  url: string,
  method = "GET",
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(url, {
    method,
    headers,
  });
}

/**
 * Helper to construct the dynamic route context `{ params: Promise.resolve(...) }`
 * for Next.js App Router dynamic route handlers.
 */
export function createRouteContext<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return {
    params: Promise.resolve(params),
  };
}

/**
 * Helper to extract and safely parse JSON from a Response or NextResponse.
 */
export async function parseResponse<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return { raw: text } as unknown as T;
  }
}

/**
 * Resets the entire test database: clears all tables, triggers migration, and re-seeds.
 */
export function resetTestDb(): void {
  resetDatabase();
}

/**
 * Completely wipes all database tables without re-seeding (empty state).
 */
export function wipeAllTables(): void {
  const db = getDb();
  migrate(db);
  const tables = [
    "agent_checkpoint_writes",
    "agent_checkpoints",
    "agent_run_history",
    "agent_state",
    "usage_log",
    "vault_chunks",
    "vault_docs",
    "resume_docs",
    "memory",
    "reminders",
    "interviews",
    "emails",
    "contacts",
    "jobs",
    "notifications",
    "settings",
    "meta",
  ];
  db.exec("BEGIN;");
  for (const t of tables) {
    db.exec(`DELETE FROM ${t};`);
  }
  db.exec("COMMIT;");
}

export {
  getDb,
  migrate,
  bootstrapSeed,
  isSeeded,
  markSeeded,
  resetDatabase,
  exportAllData,
  importAllData,
  jobsRepo,
  contactsRepo,
  emailsRepo,
  interviewsRepo,
  remindersRepo,
  settingsRepo,
  metaRepo,
  memoryRepo,
  agentStateRepo,
  vaultRepo,
  resumeRepo,
  usageRepo,
  notificationsRepo,
  agentRunHistoryRepo,
};
export type { BackupData };
