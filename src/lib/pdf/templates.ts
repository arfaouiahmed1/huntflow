import { UserProfile, JobApplication, TailoredDocuments } from "@/types";
import { mdToLatex, contactLine, escapeLatex } from "./sanitize";

export type DocType = keyof Pick<
  TailoredDocuments,
  "tailoredResume" | "coverLetter" | "motivationLetter" | "followUpEmail"
>;

export const DOC_TYPES: Record<DocType, { label: string; fileName: string }> = {
  tailoredResume: { label: "Tailored CV", fileName: "resume" },
  coverLetter: { label: "Cover Letter", fileName: "cover_letter" },
  motivationLetter: { label: "Motivation Letter", fileName: "motivation_letter" },
  followUpEmail: { label: "Follow-Up Email", fileName: "follow_up_email" },
};

/* ------------------------- shared preamble ------------------------- */

const PREAMBLE = String.raw`\documentclass[11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{geometry}
\geometry{margin=0.8in, top=0.7in, bottom=0.7in}
\usepackage{helvet}
\renewcommand{\familydefault}{\sfdefault}
\usepackage{enumitem}
\setlist{nosep, leftmargin=1.1em}
\usepackage{xcolor}
\usepackage{parskip}
\definecolor{accent}{HTML}{1F3A5F}
\usepackage{titlesec}
\titleformat{\section}{\Large\bfseries\color{accent}}{\thesection}{0.6em}{}[{\color{accent}\titlerule[0.6pt]}]
\titlespacing*{\section}{0pt}{0.9em}{0.4em}
\pagestyle{empty}
\newcommand{\contactline}[1]{\begin{center}#1\end{center}}`;

/* ------------------------- templates ------------------------- */

export function resumeTemplate(
  profile: UserProfile,
  job: JobApplication,
  content: string
): string {
  const contact = contactLine([
    profile.email,
    profile.phone,
    profile.location,
    profile.linkedin ? `linkedin.com/in/${profile.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "")}` : "",
    profile.github,
    profile.portfolio,
  ]);

  const body = content.trim() ? mdToLatex(content) : "";

  return String.raw`${PREAMBLE}
\begin{document}

{\LARGE\bfseries ${escapeLatex(profile.name || "Your Name)")}}\par
{\large\color{accent} ${escapeLatex(profile.targetTitle || job.title)}}\par
\vspace{0.2em}
\contactline{${contact}}
\vspace{0.5em}
${body}
\end{document}`;
}

export function letterTemplate(
  title: string,
  senderName: string,
  senderContact: string,
  job: JobApplication,
  content: string
): string {
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const body = content.trim() ? mdToLatex(content) : "";

  return String.raw`${PREAMBLE}
\begin{document}

{\LARGE\bfseries ${title}}\par
\vspace{0.3em}
{\small ${escapeLatex(senderName)} \\ ${senderContact}}\par
{\small ${date}}\par
{\small ${escapeLatex(job.company)} — ${escapeLatex(job.title)}}\par
\vspace{1em}
${body}
\vspace{1.5em}
{\normalsize Sincerely, \par \vspace{0.6em} ${escapeLatex(senderName)}}
\end{document}`;
}

export function buildDocumentTex(
  docType: DocType,
  profile: UserProfile,
  job: JobApplication,
  content: string
): string {
  const contact = contactLine([profile.email, profile.phone, profile.location]);

  switch (docType) {
    case "tailoredResume":
      return resumeTemplate(profile, job, content);
    case "coverLetter":
      return letterTemplate("Cover Letter", profile.name, contact, job, content);
    case "motivationLetter":
      return letterTemplate("Motivation Letter", profile.name, contact, job, content);
    case "followUpEmail":
      return letterTemplate("Follow-Up Email", profile.name, contact, job, content);
  }
}
