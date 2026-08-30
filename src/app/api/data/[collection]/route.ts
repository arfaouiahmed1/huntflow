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
import { isMasked, redactSettings } from "@/lib/masking";
import { toErrorMessage, readBody } from "@/lib/errors";
import { invalidateLLMRouterCache } from "@/lib/llm/router";

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
      imapPass: isMasked(ms.imapPass) ? storedMailPass(stored.imapPass) : ms.imapPass,
      smtpPass: isMasked(ms.smtpPass) ? storedMailPass(stored.smtpPass) : ms.smtpPass,
    });
  } catch {
    return incoming;
  }
}

function storedMailPass(val?: string): string {
  return val ?? "";
}

import { AGENT_BASE_URL, agentHeaders } from "@/lib/agentClient";
import { withEnvFallback } from "@/lib/cloudinaryConfig";

function restoreCloudinarySecrets(incoming: string): string {
  let stored: { cloudName?: string; apiKey?: string; apiSecret?: string; concurrency?: number } = {};
  try {
    stored = JSON.parse(settingsRepo.get("cloudinary_settings") ?? "{}");
  } catch {
    /* no stored settings */
  }
  try {
    const cs = JSON.parse(incoming) as { cloudName?: string; apiKey?: string; apiSecret?: string; concurrency?: number };
    const restored = {
      ...cs,
      apiKey: isMasked(cs.apiKey) ? stored.apiKey ?? "" : cs.apiKey,
      apiSecret: isMasked(cs.apiSecret) ? stored.apiSecret ?? "" : cs.apiSecret,
    };

    // Asynchronously notify Python sidecar of the effective Cloudinary config:
    // Settings-page values win, blanks fall back to CLOUDINARY_* env vars.
    const effective = withEnvFallback(restored);
    if (effective.cloudName || effective.apiKey || effective.apiSecret || effective.concurrency) {
      void fetch(`${AGENT_BASE_URL}/config`, {
        method: "POST",
        headers: agentHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          cloudinary_cloud_name: effective.cloudName,
          cloudinary_api_key: effective.apiKey,
          cloudinary_api_secret: effective.apiSecret,
          max_concurrency: effective.concurrency || undefined,
        }),
      }).catch(() => {
        /* sidecar offline is non-fatal */
      });
    }

    return JSON.stringify(restored);
  } catch {
    return incoming;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params;
  if (collection === "settings") {
    try {
      return NextResponse.json({ settings: redactSettings(settingsRepo.all()) });
    } catch (e) {
      return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
    }
  }
  if (collection === "emails") {
    try {
      const jobId = req.nextUrl.searchParams.get("jobId");
      const emails = jobId ? emailsRepo.listForJob(jobId) : emailsRepo.list();
      return NextResponse.json({ emails });
    } catch (e) {
      return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
    }
  }
  const repo = REPOS[collection];
  if (!repo) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
  try {
    const items = repo.list();
    return NextResponse.json({ [collection]: items });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params;
  if (collection === "settings") {
    try {
      const kv = (await readBody(req)) as Record<string, string>;
      for (const [key, value] of Object.entries(kv)) {
        if (key === "llm_providers") {
          settingsRepo.set(key, restoreProviderKeys(String(value)));
          invalidateLLMRouterCache();
        } else if (key === "llm_agent_routes") {
          settingsRepo.set(key, String(value));
          invalidateLLMRouterCache();
        } else if (key === "mail_settings") {
          settingsRepo.set(key, restoreMailSecrets(String(value)));
        } else if (key === "cloudinary_settings") {
          settingsRepo.set(key, restoreCloudinarySecrets(String(value)));
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
    const entity = await readBody(req);
    repo.upsert(entity);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
