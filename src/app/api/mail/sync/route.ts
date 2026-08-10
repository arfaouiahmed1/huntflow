import { NextResponse } from "next/server";
import { settingsRepo, emailsRepo, jobsRepo } from "@/lib/db";
import { MailSettings, EmailMessage } from "@/types";
import { toErrorMessage } from "@/lib/errors";

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

function domainOf(email: string): string {
  const m = email.match(/@([^@\s>]+)/);
  return m ? m[1].toLowerCase().replace(/^www\./, "") : "";
}

/**
 * Sync the inbox: fetch recent unseen messages, match them to tracked
 * applications/contacts by domain, and store them as reply records.
 */
export async function POST() {
  const settings = loadMailSettings();
  if (!settings.imapHost || !settings.imapUser || !settings.imapPass) {
    return NextResponse.json({ error: "IMAP is not configured — check Settings → Email." }, { status: 400 });
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
    const lock = await client.getMailboxLock("INBOX");
    const jobs = jobsRepo.list();
    const domains = new Map<string, string[]>();
    for (const j of jobs) {
      const key = j.company.toLowerCase().replace(/[^a-z]/g, "");
      domains.set(key, [...(domains.get(key) ?? []), j.id]);
    }

    let synced = 0;
    const newMessages: EmailMessage[] = [];
    try {
      const unseen = await client.search({ seen: false, deleted: false }, { uid: true });
      const sample = (Array.isArray(unseen) ? unseen : []).slice(-30);
      for (const uid of sample) {
        const msg = await client.fetchOne(uid, {
          envelope: true,
          source: true,
          uid: true,
        });
        if (!msg || !msg.envelope) continue;
        const from = msg.envelope.from?.[0];
        const subject = msg.envelope.subject ?? "(no subject)";
        const text = msg.source
          ? Buffer.from(msg.source).toString("utf8", 0, Math.min(msg.source.length, 60000))
          : "";
        const fromEmail = from?.address ?? "";
        const fromDomain = domainOf(fromEmail);

        let matchedJobId: string | undefined;
        for (const [key, ids] of domains) {
          const k = fromDomain.replace(/[^a-z]/g, "");
          if (k === key || k.endsWith(key) || key.endsWith(k)) {
            matchedJobId = ids[0];
            break;
          }
        }

        const body = text.slice(0, 2000);
        const reply: EmailMessage = {
          id: `imap:${uid}`,
          contactId: undefined,
          jobId: matchedJobId,
          direction: "received",
          subject,
          body,
          sentAt: new Date().toISOString(),
          threadId: `imap-${uid}`,
          status: "replied",
          read: false,
        };
        emailsRepo.upsert(reply);
        newMessages.push(reply);
        await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });

        if (matchedJobId) {
          const job = jobs.find((j) => j.id === matchedJobId);
          if (job && job.status === "applied" && !(job.notes ?? "").includes(subject)) {
            jobsRepo.upsert({
              ...job,
              status: "interviewing",
              notes: `📥 Reply received: "${subject}" (${new Date().toLocaleDateString()})` + (job.notes ? `\n${job.notes}` : ""),
            });
          }
        }
        synced++;
      }
    } finally {
      await lock.release();
      await client.logout();
    }

    return NextResponse.json({ ok: true, synced, messages: newMessages });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
