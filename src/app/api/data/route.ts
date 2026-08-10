import { NextResponse } from "next/server";
import { toErrorMessage } from "@/lib/errors";
import {
  jobsRepo,
  contactsRepo,
  emailsRepo,
  interviewsRepo,
  remindersRepo,
  settingsRepo,
  bootstrapSeed,
} from "@/lib/db";
import { LLMProvider } from "@/lib/llm/providers";
import { maskSecret } from "@/lib/masking";

function redactSettings(all: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(all)) {
    if (k === "llm_providers") {
      try {
        const chain = JSON.parse(v) as LLMProvider[];
        out[k] = JSON.stringify(chain.map((p) => ({ ...p, apiKey: p.apiKey ? maskSecret(p.apiKey) : "" })));
      } catch {
        out[k] = v;
      }
    } else if (k === "mail_settings") {
      try {
        const ms = JSON.parse(v) as { imapPass?: string; smtpPass?: string };
        out[k] = JSON.stringify({
          ...ms,
          imapPass: ms.imapPass ? maskSecret(ms.imapPass) : "",
          smtpPass: ms.smtpPass ? maskSecret(ms.smtpPass) : "",
        });
      } catch {
        out[k] = v;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function GET() {
  try {
    bootstrapSeed();
    return NextResponse.json({
      jobs: jobsRepo.list(),
      contacts: contactsRepo.list(),
      emails: emailsRepo.list(),
      interviews: interviewsRepo.list(),
      reminders: remindersRepo.list(),
      settings: redactSettings(settingsRepo.all()),
    });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
