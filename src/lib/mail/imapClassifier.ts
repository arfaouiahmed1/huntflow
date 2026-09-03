/**
 * Inbound IMAP Recruiter Email Classifier — Huntflow Agent Hardening (Phase 3)
 *
 * Classifies inbound communications into rejections, interview invites,
 * and technical assessments, extracting scheduling links and action items.
 */

export type EmailCategory = "rejection" | "interview_invite" | "assessment" | "general_update";

export interface EmailClassificationResult {
  category: EmailCategory;
  confidence: number;
  extractedLinks: string[];
  suggestedStatusUpdate?: "rejected" | "interviewing";
  actionSummary: string;
  rejectionReason?: string;
  interviewMeetingLink?: string;
}

const LINK_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

export function classifyRecruiterEmail(
  subject: string,
  body: string,
  sender?: string
): EmailClassificationResult {
  const combined = `${subject}\n${body}`.toLowerCase();
  const rawLinks = `${body} ${sender || ""}`.match(LINK_REGEX) || [];
  const extractedLinks = [...new Set(rawLinks)];

  const meetingLink = extractedLinks.find((l) =>
    /calendly\.com|zoom\.us|meet\.google\.com|chilipiper\.com|hubspot\.com\/meetings|goodtime\.io/i.test(l)
  );

  // 1. Rejection Detection
  if (
    /unfortunately|not\s+moving\s+forward|decided\s+to\s+pursue\s+(other|another)|other\s+candidates\s+whose|impressed\s+with\s+your\s+background,\s+but|after\s+careful\s+consideration|not\s+be\s+proceeding/i.test(
      combined
    )
  ) {
    let reason = "Standard candidate selection decision";
    if (/volume\s+of\s+applicants/i.test(combined)) reason = "High applicant volume";
    if (/more\s+closely\s+align/i.test(combined)) reason = "Profile alignment with specific seniority requirements";

    return {
      category: "rejection",
      confidence: 0.95,
      extractedLinks,
      suggestedStatusUpdate: "rejected",
      actionSummary: "Candidate rejection notice detected — auto-move role to Rejected.",
      rejectionReason: reason,
    };
  }

  // 2. Interview Invitation Detection
  if (
    meetingLink ||
    /schedule\s+(a\s+)?(call|chat|interview|conversation)|like\s+to\s+invite\s+you\s+to|next\s+steps\s+in\s+our\s+hiring|phone\s+screen|technical\s+round|interview\s+with/i.test(
      combined
    )
  ) {
    return {
      category: "interview_invite",
      confidence: meetingLink ? 0.98 : 0.85,
      extractedLinks,
      suggestedStatusUpdate: "interviewing",
      actionSummary: "Interview invitation detected — scheduling link found.",
      interviewMeetingLink: meetingLink,
    };
  }

  // 3. Technical Assessment Detection
  if (
    /take-?home\s+(test|assignment|project)|hackerrank|codesignal|codility|online\s+assessment|technical\s+evaluation/i.test(
      combined
    )
  ) {
    return {
      category: "assessment",
      confidence: 0.9,
      extractedLinks,
      actionSummary: "Technical assessment / coding challenge received — deadline tracking required.",
    };
  }

  return {
    category: "general_update",
    confidence: 0.5,
    extractedLinks,
    actionSummary: "General communication update from recruiter.",
  };
}
