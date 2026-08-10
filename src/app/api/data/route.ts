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
import { redactSettings } from "@/lib/masking";

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
