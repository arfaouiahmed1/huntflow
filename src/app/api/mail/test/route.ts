import { NextResponse } from "next/server";
import { settingsRepo } from "@/lib/db";
import { MailSettings } from "@/types";
import { resolveMailAuth } from "@/lib/gmailAuth";

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
  // Gmail OAuth (XOAUTH2) takes precedence; app-password IMAP/SMTP is the fallback.
  const gmail = await resolveMailAuth();
  const result: { imap: boolean; smtp: boolean; oauth: boolean; error?: string } = {
    imap: false,
    smtp: false,
    oauth: Boolean(gmail),
  };

  const hasImap = Boolean(gmail?.imap || (settings.imapHost && settings.imapUser && settings.imapPass));
  const hasSmtp = Boolean(gmail?.smtp || (settings.smtpHost && settings.smtpUser && settings.smtpPass));
  if (!hasImap && !hasSmtp) {
    return NextResponse.json(
      { ...result, error: "Fill in IMAP/SMTP fields, or connect Gmail first." },
      { status: 400 }
    );
  }

  if (hasImap) {
    try {
      const { ImapFlow } = await import("imapflow");
      const client = new ImapFlow({
        host: gmail?.imap?.host ?? settings.imapHost,
        port: gmail?.imap?.port ?? settings.imapPort,
        secure: gmail?.imap ? true : settings.imapPort === 993,
        auth: gmail?.imap?.auth ?? { user: settings.imapUser, pass: settings.imapPass },
        logger: false,
      });
      await client.connect();
      await client.logout();
      result.imap = true;
    } catch (e) {
      return NextResponse.json({ ...result, error: `IMAP failed: ${e instanceof Error ? e.message : e}` }, { status: 500 });
    }
  }

  if (hasSmtp) {
    try {
      const nodemailer = (await import("nodemailer")).default;
      const transporter = gmail?.smtp
        ? nodemailer.createTransport({
            host: gmail.smtp.host,
            port: gmail.smtp.port,
            secure: gmail.smtp.secure,
            auth: gmail.smtp.auth,
          })
        : nodemailer.createTransport({
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
  }

  return NextResponse.json(result);
}
