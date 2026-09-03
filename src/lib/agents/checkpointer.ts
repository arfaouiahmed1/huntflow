import {
  BaseCheckpointSaver,
  Checkpoint,
  CheckpointMetadata,
  CheckpointTuple,
} from "@langchain/langgraph";
import type { CheckpointPendingWrite, PendingWrite } from "@langchain/langgraph-checkpoint";
import { getDb } from "@/lib/db";

export class SqliteCheckpointSaver extends BaseCheckpointSaver {
  constructor(serde?: ConstructorParameters<typeof BaseCheckpointSaver>[0]) {
    super(serde);
  }

  async deleteThread(threadId: string): Promise<void> {
    const db = getDb();
    db.prepare(`DELETE FROM agent_checkpoints WHERE thread_id = ?`).run(threadId);
    db.prepare(`DELETE FROM agent_checkpoint_writes WHERE thread_id = ?`).run(threadId);
  }

  /**
   * Keep only the N most recent checkpoints (and their writes) for a thread.
   * Deletes older rows so long-running threads don't bloat SQLite.
   */
  async pruneThread(threadId: string, keepLast = 10): Promise<number> {
    const db = getDb();
    const keep = Math.max(0, keepLast);
    if (keep === 0) {
      db.exec("BEGIN");
      try {
        db.prepare(`DELETE FROM agent_checkpoint_writes WHERE thread_id = ?`).run(threadId);
        const res = db.prepare(`DELETE FROM agent_checkpoints WHERE thread_id = ?`).run(threadId);
        db.exec("COMMIT");
        return Number((res as unknown as { changes: number }).changes ?? 0);
      } catch (e) {
        try {
          db.exec("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw e;
      }
    }

    const keepRows = db
      .prepare(
        `SELECT checkpoint_id FROM agent_checkpoints WHERE thread_id = ? ORDER BY created_at DESC, checkpoint_id DESC LIMIT ?`
      )
      .all(threadId, keep) as { checkpoint_id: string }[];

    if (keepRows.length === 0) return 0;

    const total = Number(
      (db.prepare(`SELECT COUNT(*) as n FROM agent_checkpoints WHERE thread_id = ?`).get(threadId) as Record<string, unknown>).n
    );
    if (total <= keep) return 0;

    const keepIds = keepRows.map((r) => r.checkpoint_id);
    const placeholders = keepIds.map(() => "?").join(", ");

    db.exec("BEGIN");
    try {
      db.prepare(
        `DELETE FROM agent_checkpoint_writes WHERE thread_id = ? AND checkpoint_id NOT IN (${placeholders})`
      ).run(threadId, ...keepIds);
      const res = db.prepare(
        `DELETE FROM agent_checkpoints WHERE thread_id = ? AND checkpoint_id NOT IN (${placeholders})`
      ).run(threadId, ...keepIds);
      db.exec("COMMIT");
      return Number((res as unknown as { changes: number }).changes ?? 0);
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw e;
    }
  }

  /**
   * Create a summarized checkpoint that compresses prior state.
   * Puts a new checkpoint whose channel_values.summary holds the provided summary.
   * Keeps resume/interrupt contract intact by chaining via parent_checkpoint_id.
   */
  async summarizeCheckpoint(
    threadIdOrConfig: string | { configurable?: { thread_id?: string; checkpoint_ns?: string; checkpoint_id?: string } },
    summary: string | Record<string, unknown>,
    checkpointNs = ""
  ): Promise<Record<string, unknown>> {
    let thread_id: string | undefined;
    let checkpoint_ns = checkpointNs;
    let parent_checkpoint_id: string | null | undefined;

    if (typeof threadIdOrConfig === "string") {
      thread_id = threadIdOrConfig;
    } else {
      thread_id = threadIdOrConfig.configurable?.thread_id;
      checkpoint_ns = threadIdOrConfig.configurable?.checkpoint_ns ?? checkpointNs;
      parent_checkpoint_id = threadIdOrConfig.configurable?.checkpoint_id;
    }

    if (!thread_id) throw new Error("Missing thread_id in summarizeCheckpoint");

    let latest: CheckpointTuple | undefined;
    if (!parent_checkpoint_id) {
      latest = await this.getTuple({ configurable: { thread_id, checkpoint_ns } });
      parent_checkpoint_id = latest?.checkpoint.id ?? null;
    } else {
      latest = await this.getTuple({ configurable: { thread_id, checkpoint_ns, checkpoint_id: parent_checkpoint_id } });
    }

    const summaryText = typeof summary === "string" ? summary : JSON.stringify(summary);
    const checkpointId = `summary_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const baseChannelValues =
      (latest?.checkpoint as unknown as { channel_values?: Record<string, unknown> } | undefined)?.channel_values ?? {};

    const compactValues: Record<string, unknown> = {
      summary: summaryText,
      _summarized_from: parent_checkpoint_id ?? null,
      _summarized_at: new Date().toISOString(),
    };

    const mergedValues: Record<string, unknown> = { ...baseChannelValues, ...compactValues };
    for (const [k, v] of Object.entries(mergedValues)) {
      if (typeof v === "string" && v.length > 4000) {
        mergedValues[k] = v.slice(0, 2000) + "\n...[truncated]...\n" + v.slice(-1500);
      }
    }

    const checkpoint = {
      v: (latest?.checkpoint as unknown as { v?: number } | undefined)?.v ?? 1,
      id: checkpointId,
      ts: new Date().toISOString(),
      channel_values: mergedValues,
      channel_versions: (latest?.checkpoint as unknown as { channel_versions?: Record<string, unknown> } | undefined)?.channel_versions ?? {},
      versions_seen: (latest?.checkpoint as unknown as { versions_seen?: Record<string, unknown> } | undefined)?.versions_seen ?? {},
      pending_sends: [],
    } as unknown as Checkpoint;

    const metadata = {
      source: "summarize",
      step: ((latest?.metadata as unknown as { step?: number } | undefined)?.step ?? 0) + 1,
      parents: parent_checkpoint_id ? { "": parent_checkpoint_id } : {},
      summary: summaryText,
    } as unknown as CheckpointMetadata;

    return this.put(
      { configurable: { thread_id, checkpoint_ns, checkpoint_id: parent_checkpoint_id ?? undefined } },
      checkpoint,
      metadata
    );
  }

  /**
   * Alias for resuming a thread — mirrors the LangGraph `getTuple` continuation path.
   * Accepts either a threadId string (with optional ns) or a full config object.
   */
  async continueFrom(
    threadIdOrConfig: string | { configurable?: { thread_id?: string; checkpoint_ns?: string; checkpoint_id?: string } },
    checkpointNs = ""
  ): Promise<CheckpointTuple | undefined> {
    if (typeof threadIdOrConfig === "string") {
      return this.getTuple({ configurable: { thread_id: threadIdOrConfig, checkpoint_ns: checkpointNs } });
    }
    return this.getTuple(threadIdOrConfig);
  }

  async getTuple(config: {
    configurable?: { thread_id?: string; checkpoint_ns?: string; checkpoint_id?: string };
  }): Promise<CheckpointTuple | undefined> {
    const thread_id = config.configurable?.thread_id;
    const checkpoint_ns = config.configurable?.checkpoint_ns ?? "";
    if (!thread_id) return undefined;

    const db = getDb();
    let row: {
      thread_id: string;
      checkpoint_ns: string;
      checkpoint_id: string;
      parent_checkpoint_id: string | null;
      type: string | null;
      checkpoint: Buffer | string;
      metadata: Buffer | string | null;
    } | undefined;

    if (config.configurable?.checkpoint_id) {
      row = db
        .prepare(
          `SELECT * FROM agent_checkpoints 
           WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?`
        )
        .get(thread_id, checkpoint_ns, config.configurable.checkpoint_id) as typeof row;
    } else {
      row = db
        .prepare(
          `SELECT * FROM agent_checkpoints 
           WHERE thread_id = ? AND checkpoint_ns = ? 
           ORDER BY created_at DESC, checkpoint_id DESC LIMIT 1`
        )
        .get(thread_id, checkpoint_ns) as typeof row;
    }

    if (!row) return undefined;

    const checkpointStr =
      typeof row.checkpoint === "string"
        ? row.checkpoint
        : Buffer.from(row.checkpoint).toString("utf-8");

    const checkpoint = JSON.parse(checkpointStr) as Checkpoint;
    const metadata = row.metadata
      ? (JSON.parse(
          typeof row.metadata === "string"
            ? row.metadata
            : Buffer.from(row.metadata).toString("utf-8")
        ) as CheckpointMetadata)
      : undefined;

    // Retrieve pending writes if any for this checkpoint
    const writesRows = db
      .prepare(
        `SELECT task_id, channel, value FROM agent_checkpoint_writes
         WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
         ORDER BY idx ASC`
      )
      .all(thread_id, checkpoint_ns, row.checkpoint_id) as {
        task_id: string;
        channel: string;
        value: Buffer | string;
      }[];

    const pendingWrites: CheckpointPendingWrite[] = writesRows.map((w) => {
      const valStr =
        typeof w.value === "string" ? w.value : Buffer.from(w.value).toString("utf-8");
      let parsedVal: unknown;
      try {
        parsedVal = JSON.parse(valStr);
      } catch {
        parsedVal = valStr;
      }
      return [w.task_id, w.channel, parsedVal] as CheckpointPendingWrite;
    });

    return {
      config: {
        configurable: {
          thread_id: row.thread_id,
          checkpoint_ns: row.checkpoint_ns,
          checkpoint_id: row.checkpoint_id,
        },
      },
      checkpoint,
      metadata,
      parentConfig: row.parent_checkpoint_id
        ? {
            configurable: {
              thread_id: row.thread_id,
              checkpoint_ns: row.checkpoint_ns,
              checkpoint_id: row.parent_checkpoint_id,
            },
          }
        : undefined,
      pendingWrites: pendingWrites.length > 0 ? pendingWrites : undefined,
    };
  }

  async *list(
    config: { configurable?: { thread_id?: string; checkpoint_ns?: string } }
  ): AsyncGenerator<CheckpointTuple> {
    const thread_id = config.configurable?.thread_id;
    const checkpoint_ns = config.configurable?.checkpoint_ns ?? "";
    if (!thread_id) return;

    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM agent_checkpoints 
         WHERE thread_id = ? AND checkpoint_ns = ? 
         ORDER BY created_at DESC`
      )
      .all(thread_id, checkpoint_ns) as {
      thread_id: string;
      checkpoint_ns: string;
      checkpoint_id: string;
      parent_checkpoint_id: string | null;
      type: string | null;
      checkpoint: Buffer | string;
      metadata: Buffer | string | null;
    }[];

    for (const row of rows) {
      const checkpointStr =
        typeof row.checkpoint === "string"
          ? row.checkpoint
          : Buffer.from(row.checkpoint).toString("utf-8");

      const checkpoint = JSON.parse(checkpointStr) as Checkpoint;
      const metadata = row.metadata
        ? (JSON.parse(
            typeof row.metadata === "string"
              ? row.metadata
              : Buffer.from(row.metadata).toString("utf-8")
          ) as CheckpointMetadata)
        : undefined;

      const writesRows = db
        .prepare(
          `SELECT task_id, channel, value FROM agent_checkpoint_writes
           WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
           ORDER BY idx ASC`
        )
        .all(thread_id, checkpoint_ns, row.checkpoint_id) as {
          task_id: string;
          channel: string;
          value: Buffer | string;
        }[];

      const pendingWrites: CheckpointPendingWrite[] = writesRows.map((w) => {
        const valStr =
          typeof w.value === "string" ? w.value : Buffer.from(w.value).toString("utf-8");
        let parsedVal: unknown;
        try {
          parsedVal = JSON.parse(valStr);
        } catch {
          parsedVal = valStr;
        }
        return [w.task_id, w.channel, parsedVal] as CheckpointPendingWrite;
      });

      yield {
        config: {
          configurable: {
            thread_id: row.thread_id,
            checkpoint_ns: row.checkpoint_ns,
            checkpoint_id: row.checkpoint_id,
          },
        },
        checkpoint,
        metadata,
        parentConfig: row.parent_checkpoint_id
          ? {
              configurable: {
                thread_id: row.thread_id,
                checkpoint_ns: row.checkpoint_ns,
                checkpoint_id: row.parent_checkpoint_id,
              },
            }
          : undefined,
        pendingWrites: pendingWrites.length > 0 ? pendingWrites : undefined,
      };
    }
  }

  async put(
    config: { configurable?: { thread_id?: string; checkpoint_ns?: string; checkpoint_id?: string } },
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<Record<string, unknown>> {
    const thread_id = config.configurable?.thread_id;
    const checkpoint_ns = config.configurable?.checkpoint_ns ?? "";
    if (!thread_id) throw new Error("Missing thread_id in checkpointer put");

    const checkpoint_id = checkpoint.id;
    const parent_checkpoint_id = config.configurable?.checkpoint_id ?? null;

    const checkpointStr = JSON.stringify(checkpoint);
    const metadataStr = JSON.stringify(metadata);

    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO agent_checkpoints 
       (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, checkpoint, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      thread_id,
      checkpoint_ns,
      checkpoint_id,
      parent_checkpoint_id,
      checkpointStr,
      metadataStr
    );

    return {
      configurable: {
        thread_id,
        checkpoint_ns,
        checkpoint_id,
      },
    };
  }

  async putWrites(
    config: { configurable?: { thread_id?: string; checkpoint_ns?: string; checkpoint_id?: string } },
    writes: PendingWrite[],
    taskId: string
  ): Promise<void> {
    const thread_id = config.configurable?.thread_id;
    const checkpoint_ns = config.configurable?.checkpoint_ns ?? "";
    const checkpoint_id = config.configurable?.checkpoint_id;
    if (!thread_id || !checkpoint_id) return;

    const db = getDb();
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO agent_checkpoint_writes
       (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (let i = 0; i < writes.length; i++) {
      const [channel, value] = writes[i];
      const valStr = JSON.stringify(value);
      stmt.run(thread_id, checkpoint_ns, checkpoint_id, taskId, i, channel, typeof value, valStr);
    }
  }
}
