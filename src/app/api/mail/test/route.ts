import { NextResponse } from "next/server";
import { settingsRepo } from "@/lib/db";
import { MailSettings } from "@/types";

function loadMailSettings(): MailSettings {
  const raw = settingsRepo.get("mail_settings");
  const parsed = raw ? (JSON.parse(raw) as Partial<MailSettings>) : {};
  return {
    imapHost: parsed.imapHost ?? "",
    imapPort: parsed.imapPort ?? 993,
    imapUser: parsed.imapUser ?? "",
    imapPass: parsed.imapPass ?? "",
    smtpHost: parsed.smtpHost ?? "",
    smtpPort: parsed.smtpPort ?? 587,
    smtpUser: parsed.smtpUser ?? "",
    smtpPass: parsed.smtpPass ?? "",
    fromName: parsed.fromName ?? "",
    fromEmail: parsed.fromEmail ?? "",
  };
}

export async function POST() {
  const settings = loadMailSettings();
  const result: { imap: boolean; smtp: boolean; error?: string } = { imap: false, smtp: false };

  if (!settings.imapHost || !settings.imapUser || !settings.imapPass || !settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
    return NextResponse.json({ ...result, error: "Fill in all IMAP and SMTP fields first." }, { status: 400 });
  }

  try {
    const { ImapFlow } = await import("imapflow");
    const client = new ImapFlow({
      host: settings.imapHost,
      port: settings.imapPort,
      secure: settings.imapPort === 993,
      auth: { user: settings.imapUser, pass: settings.imapPass },
      logger: false,
    });
    await client.connect();
    await client.logout();
    result.imap = true;
  } catch (e) {
    return NextResponse.json({ ...result, error: `IMAP failed: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }

  try {
    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpPort === 465,
      auth: { user: settings.smtpUser, pass: settings.smtpPass },
    });
    await transporter.verify();
    result.smtp = true;
  } catch (e) {
    return NextResponse.json({ ...result, error: `SMTP failed: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }

  return NextResponse.json(result);
}
