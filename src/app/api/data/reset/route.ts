import { NextResponse } from "next/server";
import { resetDatabase } from "@/lib/db";
import { toErrorMessage } from "@/lib/errors";

export async function POST() {
  try {
    resetDatabase();
    return NextResponse.json({ ok: true, message: "Database wiped and re-seeded with your application register." });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
