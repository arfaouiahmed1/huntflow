/**
 * Ephemeral Copilot attachment store (server-only).
 *
 * Uploaded bytes live here — never in UI state, logs, or the database.
 * Entries expire after 10 minutes and are consumed (take = get + delete)
 * by the streaming turn that references their ids, so bytes cannot
 * accumulate or be re-read by later turns.
 */

import { randomUUID } from "node:crypto";

export type AttachmentKind = "pdf" | "image";

export interface StoredAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
  /** Extracted PDF text (bounded at upload). Never set for images. */
  text?: string;
  truncated?: boolean;
  /** Raw image bytes for vision providers. Never set for PDFs. */
  base64?: string;
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000;
const store = new Map<string, StoredAttachment>();
let sweepTimer: ReturnType<typeof setTimeout> | null = null;

function sweep() {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (entry.expiresAt <= now) store.delete(id);
  }
  sweepTimer = store.size > 0 ? setTimeout(sweep, TTL_MS) : null;
  if (sweepTimer && typeof sweepTimer.unref === "function") sweepTimer.unref();
}

export function storeAttachment(entry: Omit<StoredAttachment, "id" | "expiresAt">): string {
  const id = `att_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  store.set(id, { ...entry, id, expiresAt: Date.now() + TTL_MS });
  if (!sweepTimer) {
    sweepTimer = setTimeout(sweep, TTL_MS);
    if (typeof sweepTimer.unref === "function") sweepTimer.unref();
  }
  return id;
}

/** Consume attachments by id (missing/expired ids are skipped). */
export function takeAttachments(ids: string[]): StoredAttachment[] {
  const out: StoredAttachment[] = [];
  for (const id of ids) {
    const entry = store.get(id);
    if (!entry) continue;
    store.delete(id);
    if (entry.expiresAt > Date.now()) out.push(entry);
  }
  return out;
}

/** Exposed for tests. */
export function _attachmentStoreSize(): number {
  return store.size;
}
