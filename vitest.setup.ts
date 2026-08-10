import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/* Every test worker gets an isolated throwaway SQLite database —
   the real data/huntflow.db is never touched. */
const testDb = path.join(os.tmpdir(), `huntflow-test-${process.pid}-${Date.now()}.db`);
for (const f of [testDb, `${testDb}-wal`, `${testDb}-shm`]) {
  try {
    fs.unlinkSync(f);
  } catch {
    /* not present */
  }
}
process.env.HUNTFLOW_DB_PATH = testDb;
