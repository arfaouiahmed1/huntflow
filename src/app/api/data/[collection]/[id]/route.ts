import { NextRequest, NextResponse } from "next/server";
import {
  jobsRepo,
  contactsRepo,
  emailsRepo,
  interviewsRepo,
  remindersRepo,
  settingsRepo,
} from "@/lib/db";
import { toErrorMessage, readBody } from "@/lib/errors";
import { redactSettings } from "@/lib/masking";

const REPOS: Record<
  string,
  {
    get: (id: string) => unknown | null;
    upsert: (entity: unknown) => unknown;
    remove: (id: string) => void;
  }
> = {
  jobs: jobsRepo as never,
  contacts: contactsRepo as never,
  emails: emailsRepo as never,
  interviews: interviewsRepo as never,
  reminders: remindersRepo as never,
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ collection: string; id: string }> }) {
  const { collection, id } = await params;
  if (collection === "settings") {
    const val = settingsRepo.get(id);
    if (val === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const redacted = redactSettings({ [id]: val })[id];
    return NextResponse.json({ key: id, value: redacted });
  }
  const repo = REPOS[collection];
  if (!repo) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
  try {
    const item = repo.get(id);
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ collection: string; id: string }> }) {
  const { collection, id } = await params;
  if (collection === "settings") {
    try {
      const body = (await readBody(req)) as { value?: string } | string;
      const value = typeof body === "object" && body !== null && "value" in body ? String(body.value) : String(body);
      settingsRepo.set(id, value);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
    }
  }
  const repo = REPOS[collection];
  if (!repo) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
  try {
    const entity = (await readBody(req)) as Record<string, unknown>;
    entity.id = id;
    repo.upsert(entity);
    return NextResponse.json({ ok: true, item: entity });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ collection: string; id: string }> }) {
  const { collection, id } = await params;
  if (collection === "settings") {
    return PUT(req, { params });
  }
  const repo = REPOS[collection];
  if (!repo) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
  try {
    const existing = repo.get(id) as Record<string, unknown> | null;
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const patch = (await readBody(req)) as Record<string, unknown>;
    const merged = { ...existing, ...patch, id };
    repo.upsert(merged);
    return NextResponse.json({ ok: true, item: merged });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ collection: string; id: string }> }) {
  const { collection, id } = await params;
  if (collection === "settings") {
    try {
      settingsRepo.remove(id);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
    }
  }
  const repo = REPOS[collection];
  if (!repo) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
  try {
    repo.remove(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
