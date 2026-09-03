import { describe, it, expect } from "vitest";
import { classifyRecruiterEmail } from "../imapClassifier";
import { scanGhostingRadar } from "../ghostingRadar";
import { JobApplication } from "@/types";

describe("Inbound IMAP Classifier & Ghosting Radar", () => {
  it("classifies rejection emails and extracts reasons", () => {
    const res = classifyRecruiterEmail(
      "Update regarding your application at Stripe",
      "Thank you for taking the time to speak with us. Unfortunately, after careful consideration, we have decided to pursue other candidates whose backgrounds more closely align with our current needs."
    );

    expect(res.category).toBe("rejection");
    expect(res.suggestedStatusUpdate).toBe("rejected");
    expect(res.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("classifies interview invitations and extracts Calendly/Zoom links", () => {
    const res = classifyRecruiterEmail(
      "Next steps: Senior Engineer at Vercel",
      "We were impressed with your background and would like to invite you to a technical interview. Please schedule a time here: https://calendly.com/recruiter/30min"
    );

    expect(res.category).toBe("interview_invite");
    expect(res.suggestedStatusUpdate).toBe("interviewing");
    expect(res.interviewMeetingLink).toContain("calendly.com");
  });

  it("detects ghosted applications (>14 days silent)", () => {
    const oldDate = new Date(Date.now() - 20 * 86400000).toISOString();
    const freshDate = new Date(Date.now() - 3 * 86400000).toISOString();

    const jobs: JobApplication[] = [
      {
        id: "job-1",
        title: "Staff Engineer",
        company: "Datadog",
        location: "Remote",
        status: "applied",
        appliedDate: oldDate,
        createdDate: oldDate,
        jobDescription: "Staff systems engineer",
      },
      {
        id: "job-2",
        title: "Backend Engineer",
        company: "Linear",
        location: "Remote",
        status: "applied",
        appliedDate: freshDate,
        createdDate: freshDate,
        jobDescription: "Backend engineer",
      },
    ];

    const radar = scanGhostingRadar(jobs);

    expect(radar.ghostedCount).toBe(1);
    expect(radar.alerts[0].company).toBe("Datadog");
    expect(radar.alerts[0].daysSilent).toBeGreaterThanOrEqual(19);
    expect(radar.alerts[0].recommendedNudgeAction).toContain("Day 14 Value Nudge");
  });
});
