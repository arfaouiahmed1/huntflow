import { NextRequest, NextResponse } from "next/server";
import {
  jobsRepo,
  contactsRepo,
  emailsRepo,
  interviewsRepo,
  remindersRepo,
  settingsRepo,
} from "@/lib/db";
import { LLMProvider } from "@/lib/llm/providers";
import { isMasked } from "@/lib/masking";
import { toErrorMessage } from "@/lib/errors";

const REPOS: Record<string, { upsert: (entity: unknown) => unknown; list: () => unknown[] }> = {
  jobs: jobsRepo as never,
  contacts: contactsRepo as never,
  emails: emailsRepo as never,
  interviews: interviewsRepo as never,
  reminders: remindersRepo as never,
};

function restoreProviderKeys(incoming: string): string {
  let stored: LLMProvider[] = [];
  try {
    stored = JSON.parse(settingsRepo.get("llm_providers") ?? "[]");
  } catch {
    /* no stored chain */
  }
  const storedKeys = new Map(stored.map((p) => [p.id, p.apiKey]));
  try {
    const chain = JSON.parse(incoming) as LLMProvider[];
    return JSON.stringify(
      chain.map((p) => (isMasked(p.apiKey) ? { ...p, apiKey: storedKeys.get(p.id) ?? "" } : p))
    );
  } catch {
    return incoming;
  }
}

function restoreMailSecrets(incoming: string): string {
  let stored: { imapPass?: string; smtpPass?: string } = {};
  try {
    stored = JSON.parse(settingsRepo.get("mail_settings") ?? "{}");
  } catch {
    /* no stored settings */
  }
  try {
    const ms = JSON.parse(incoming) as { imapPass?: string; smtpPass?: string };
    return JSON.stringify({
      ...ms,
      imapPass: isMasked(ms.imapPass) ? stored.imapPass ?? "" : ms.imapPass,
      smtpPass: isMasked(ms.smtpPass) ? stored.smtpPass ?? "" : ms.smtpPass,
    });
  } catch {
    return incoming;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params;
  if (collection === "settings") {
    try {
      const kv = (await req.json()) as Record<string, string>;
      for (const [key, value] of Object.entries(kv)) {
        if (key === "llm_providers") {
          settingsRepo.set(key, restoreProviderKeys(String(value)));
        } else if (key === "mail_settings") {
          settingsRepo.set(key, restoreMailSecrets(String(value)));
        } else {
          settingsRepo.set(key, String(value));
        }
      }
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
    }
  }
  const repo = REPOS[collection];
  if (!repo) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
  try {
    const entity = await req.json();
    repo.upsert(entity);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
