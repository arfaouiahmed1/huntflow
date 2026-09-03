import { NextRequest, NextResponse } from "next/server";
import { generateOutreachSequence } from "@/lib/mail/outreachSequence";
import { settingsRepo } from "@/lib/db";
import { UserProfile, JobApplication } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      job?: Partial<JobApplication>;
      profile?: UserProfile;
      newsSnippet?: string;
    };

    if (!body.job || !body.job.company || !body.job.title) {
      return NextResponse.json(
        { success: false, error: "Missing required job fields (company, title)" },
        { status: 400 }
      );
    }

    let candidateProfile: UserProfile = body.profile ?? ({} as UserProfile);
    if (!candidateProfile.name) {
      try {
        const raw = settingsRepo.get("profile");
        if (raw) candidateProfile = JSON.parse(raw) as UserProfile;
      } catch {}
    }

    const candidate = {
      name: candidateProfile.name || "Candidate",
      summary: candidateProfile.summary,
      topSkills: candidateProfile.skills || ["Software Engineering", "System Architecture"],
    };

    const plan = generateOutreachSequence(
      {
        company: body.job.company,
        title: body.job.title,
        url: body.job.url,
        jobDescription: body.job.jobDescription || "",
      },
      candidate,
      body.newsSnippet
    );

    return NextResponse.json({
      success: true,
      plan,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Outreach sequence generation failed" },
      { status: 500 }
    );
  }
}
