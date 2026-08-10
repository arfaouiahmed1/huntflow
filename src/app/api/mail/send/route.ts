import { NextResponse } from "next/server";
import { settingsRepo, emailsRepo, jobsRepo, contactsRepo } from "@/lib/db";
import { MailSettings, EmailMessage } from "@/types";
import { toErrorMessage } from "@/lib/errors";

interface MailSettingsRow {
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPass?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  fromName?: string;
  fromEmail?: string;
}

function loadMailSettings(): MailSettings {
  const raw = settingsRepo.get("mail_settings");
  const parsed = raw ? (JSON.parse(raw) as MailSettingsRow) : {};
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

function isConfigured(s: MailSettings): boolean {
  return Boolean(s.smtpHost && s.smtpUser && s.smtpPass);
}

function domainOf(email: string): string {
  const m = email.match(/@([^@\s>]+)/);
  return m ? m[1].toLowerCase().replace(/^www\./, "") : "";
}

function findContactAndJob(to: string) {
  const domain = domainOf(to);
  const allContacts = contactsRepo.list();
  const contact = allContacts.find((c) => {
    if (c.email && to.toLowerCase().includes(c.email.toLowerCase())) return true;
    const cDomain = domainOf(c.email);
    return Boolean(cDomain && domain && (domain === cDomain || domain.endsWith("." + cDomain) || cDomain.endsWith("." + domain)));
  });
  let job = null;
  if (contact && contact.companyIds?.length) {
    const jobId = contact.companyIds[0];
    job = jobsRepo.get(jobId);
  }
  if (!job && contact) {
    const byCompany = jobsRepo
      .list()
      .find((j) => j.company.toLowerCase().replace(/[^a-z0-9]/g, "") === contact.company.toLowerCase().replace(/[^a-z0-9]/g, ""));
    job = byCompany ?? null;
  }
  return { contact, job };
}

export async function POST(req: Request) {
  const settings = loadMailSettings();
  if (!isConfigured(settings)) {
    return NextResponse.json({ error: "Email is not connected — configure it in Settings → Email." }, { status: 400 });
  }
  try {
    const { to, subject, body, jobId } = await req.json();
    if (!to || !subject || !body) {
      return NextResponse.json({ error: "to, subject and body are required." }, { status: 400 });
    }

    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpPort === 465,
      auth: { user: settings.smtpUser, pass: settings.smtpPass },
    });

    await transporter.sendMail({
      from: `"${settings.fromName || settings.smtpUser}" <${settings.fromEmail || settings.smtpUser}>`,
      to,
      subject,
      text: body,
    });

    const { contact, job } = findContactAndJob(to);
    const email: EmailMessage = {
      id: "e-" + Date.now(),
      contactId: contact?.id,
      jobId: jobId ?? job?.id,
      direction: "sent",
      subject,
      body,
      sentAt: new Date().toISOString(),
      threadId: `thread-${Date.now()}`,
      status: "sent",
      read: true,
    };
    emailsRepo.upsert(email);

    if (contact) {
      contactsRepo.upsert({ ...contact, lastContacted: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }

    return NextResponse.json({ ok: true, email });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
