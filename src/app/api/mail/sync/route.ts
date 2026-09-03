import { NextRequest, NextResponse } from "next/server";
import { classifyRecruiterEmail } from "@/lib/mail/imapClassifier";
import { scanGhostingRadar } from "@/lib/mail/ghostingRadar";
import { syncImapInbox } from "@/lib/mail/imapSync";
import { jobsRepo, emailsRepo } from "@/lib/db";

export async function GET() {
  try {
    const jobs = jobsRepo.list();
    const emails = emailsRepo.list();
    const ghostingReport = scanGhostingRadar(jobs, 14, "Candidate", emails);

    return NextResponse.json({
      success: true,
      ghostingReport,
      totalSavedEmails: emails.length,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Sync status failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: {
      mode?: "imap" | "classify_single";
      limit?: number;
      autoUpdateJobStatus?: boolean;
      subject?: string;
      body?: string;
      sender?: string;
    } = {};

    // Safely parse optional request body (callers like outreach/page.tsx and AppContext.tsx POST with empty body)
    try {
      const text = await req.text();
      if (text && text.trim().length > 0) {
        body = JSON.parse(text);
      }
    } catch {
      body = {};
    }

    // If caller requests a single classification check
    if (body.mode === "classify_single" || (body.subject && body.body)) {
      if (!body.subject || !body.body) {
        return NextResponse.json(
          { success: false, error: "Missing required email fields (subject, body)" },
          { status: 400 }
        );
      }
      const classification = classifyRecruiterEmail(body.subject, body.body, body.sender);
      return NextResponse.json({
        success: true,
        mode: "classify_single",
        classification,
      });
    }

    // Default mode: Real server-side IMAP sync via imapflow
    const syncResult = await syncImapInbox({
      limit: body.limit || 20,
      autoUpdateJobStatus: body.autoUpdateJobStatus ?? true,
    });

    return NextResponse.json({
      mode: "imap_sync",
      ...syncResult,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "IMAP sync failed" },
      { status: 500 }
    );
  }
}
