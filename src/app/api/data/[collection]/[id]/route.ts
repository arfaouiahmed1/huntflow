import { NextRequest, NextResponse } from "next/server";
import {
  jobsRepo,
  contactsRepo,
  emailsRepo,
  interviewsRepo,
  remindersRepo,
} from "@/lib/db";
import { toErrorMessage } from "@/lib/errors";

const REPOS: Record<string, { upsert: (entity: unknown) => unknown; remove: (id: string) => void }> = {
  jobs: jobsRepo as never,
  contacts: contactsRepo as never,
  emails: emailsRepo as never,
  interviews: interviewsRepo as never,
  reminders: remindersRepo as never,
};

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ collection: string; id: string }> }) {
  const { collection, id } = await params;
  const repo = REPOS[collection];
  if (!repo) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
  try {
    repo.remove(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
