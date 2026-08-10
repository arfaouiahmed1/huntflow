import { NextResponse } from "next/server";
import { getDb, migrate, bootstrapSeed, metaRepo } from "@/lib/db";
import { toErrorMessage } from "@/lib/errors";

export async function POST() {
  try {
    const database = getDb();
    migrate(database);
    for (const table of ["reminders", "interviews", "emails", "contacts", "jobs", "memory", "agent_state", "vault_chunks", "vault_docs"]) {
      database.exec(`DELETE FROM ${table};`);
    }
    metaRepo.set("seed_version", "");
    bootstrapSeed();
    return NextResponse.json({ ok: true, message: "Database wiped and re-seeded with your application register." });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
