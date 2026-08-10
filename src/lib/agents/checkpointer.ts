import {
  BaseCheckpointSaver,
  Checkpoint,
  CheckpointMetadata,
  CheckpointTuple,
} from "@langchain/langgraph";
import { getDb } from "@/lib/db";

export class SqliteCheckpointSaver extends BaseCheckpointSaver {
  constructor(serde?: any) {
    super(serde);
  }

  async deleteThread(threadId: string): Promise<void> {
    const db = getDb();
    db.prepare(`DELETE FROM agent_checkpoints WHERE thread_id = ?`).run(threadId);
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
    };
  }

  async *list(
    config: { configurable?: { thread_id?: string; checkpoint_ns?: string } },
    _filter?: Record<string, unknown>
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

  async putWrites(): Promise<void> {
    // Optional write-stream buffering if needed
  }
}
