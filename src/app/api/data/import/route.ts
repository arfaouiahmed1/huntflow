import { NextRequest, NextResponse } from "next/server";
import { toErrorMessage, AppError } from "@/lib/errors";
import { importAllData, BackupData } from "@/lib/db";
import { settingsRepo } from "@/lib/db";
import { isMasked } from "@/lib/masking";

function restoreMaskedSecrets(settings: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  let storedProviders: { id: string; apiKey?: string }[] = [];
  let storedMail: { imapPass?: string; smtpPass?: string } = {};
  try {
    storedProviders = JSON.parse(settingsRepo.get("llm_providers") ?? "[]");
  } catch { /* no stored chain */ }
  try {
    storedMail = JSON.parse(settingsRepo.get("mail_settings") ?? "{}");
  } catch { /* no stored settings */ }
  const keyById = new Map(storedProviders.map((p) => [p.id, p.apiKey ?? ""]));

  for (const [key, value] of Object.entries(settings)) {
    if (key === "llm_providers") {
      try {
        const chain = JSON.parse(value) as { id: string; apiKey?: string }[];
        out[key] = JSON.stringify(
          chain.map((p) => (isMasked(p.apiKey) ? { ...p, apiKey: keyById.get(p.id) ?? "" } : p))
        );
      } catch {
        out[key] = value;
      }
    } else if (key === "mail_settings") {
      try {
        const ms = JSON.parse(value) as { imapPass?: string; smtpPass?: string };
        out[key] = JSON.stringify({
          ...ms,
          imapPass: isMasked(ms.imapPass) ? storedMail.imapPass ?? "" : ms.imapPass,
          smtpPass: isMasked(ms.smtpPass) ? storedMail.smtpPass ?? "" : ms.smtpPass,
        });
      } catch {
        out[key] = value;
      }
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const raw = (await req.json()) as { app?: string; format?: number; data?: Partial<BackupData> };
    if (!raw || raw.app !== "huntflow" || typeof raw.data !== "object" || raw.data === null) {
      throw new AppError("Not a HUNTFLOW backup file.", "BAD_BODY", 400);
    }
    const data = raw.data as BackupData;
    const maxChunks = 100000;
    if ((data.vault?.chunks?.length ?? 0) > maxChunks) {
      throw new AppError(`Backup too large (over ${maxChunks} vault chunks).`, "BAD_BODY", 413);
    }

    const settings = restoreMaskedSecrets(data.settings ?? {});
    const result = importAllData({ ...data, settings });

    return NextResponse.json({ ok: true, counts: result.counts });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
