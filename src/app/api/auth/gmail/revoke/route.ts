import { NextResponse } from "next/server";
import { revokeGmail } from "@/lib/gmailAuth";

export async function POST() {
  try {
    await revokeGmail();
  } catch {
    /* best-effort revoke — stored tokens are cleared regardless */
  }
  return NextResponse.json({ ok: true, connected: false });
}
