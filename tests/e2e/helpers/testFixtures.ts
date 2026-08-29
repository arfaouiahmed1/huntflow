import {
  JobApplication,
  UserProfile,
  Contact,
  EmailMessage,
  InterviewEvent,
  Reminder,
  ResumeDoc,
  NotificationItem,
} from "@/types";

export const mockUserProfile: UserProfile = {
  name: "Alex Johnson",
  email: "alex.johnson@example.com",
  phone: "+1 (555) 234-5678",
  location: "San Francisco, CA",
  targetTitle: "Senior Full-Stack Engineer",
  summary:
    "Experienced software engineer with 7+ years developing scalable distributed systems, modern React frontends, and robust TypeScript backends.",
  skills: [
    "TypeScript",
    "React",
    "Node.js",
    "Next.js",
    "GraphQL",
    "PostgreSQL",
    "SQLite",
    "Tailwind CSS",
    "Docker",
    "AWS",
    "CI/CD",
  ],
  experience: [
    {
      id: "exp-1",
      company: "TechNova Inc.",
      role: "Senior Full-Stack Engineer",
      duration: "2021 — Present",
      bulletPoints: [
        "Architected and deployed high-throughput Next.js 16 web applications serving 2M+ monthly active users.",
        "Reduced p99 API latency by 45% through optimized SQLite/PostgreSQL caching and indexing strategies.",
        "Led a distributed team of 6 engineers across frontend and backend microservices.",
      ],
    },
    {
      id: "exp-2",
      company: "CodeCraft Studios",
      role: "Software Engineer",
      duration: "2018 — 2021",
      bulletPoints: [
        "Developed full-stack features using React, TypeScript, and Express.",
        "Automated CI/CD deployment pipelines using GitHub Actions and Docker containers.",
      ],
    },
  ],
  education: [
    {
      id: "edu-1",
      degree: "B.S. in Computer Science",
      school: "University of California, Berkeley",
      year: "2018",
    },
  ],
  portfolio: "https://alexjohnson.dev",
  github: "https://github.com/alexjohnson",
  linkedin: "https://linkedin.com/in/alexjohnson",
};

export const mockUserProfileWithGaps: UserProfile = {
  name: "Taylor Reed",
  email: "taylor.reed@example.com",
  phone: "+1 (555) 987-6543",
  location: "Austin, TX",
  targetTitle: "Junior Frontend Developer",
  summary: "Enthusiastic web developer with 1 year experience building UI prototypes in HTML and basic React.",
  skills: ["HTML", "CSS", "JavaScript", "React"],
  experience: [
    {
      id: "exp-gap-1",
      company: "StartupLab",
      role: "Junior Web Developer",
      duration: "2023 — Present",
      bulletPoints: ["Maintained landing pages and fixed CSS styling bugs."],
    },
  ],
  education: [
    {
      id: "edu-gap-1",
      degree: "Coding Bootcamp Certificate",
      school: "Austin Code Academy",
      year: "2023",
    },
  ],
};

export const sampleJobDescription = `Senior Full-Stack Engineer — Acme Corp
Location: Remote (US)
Salary: $150,000 - $185,000

We are looking for a Senior Full-Stack Engineer to build mission-critical features on our modern web platform.
Requirements:
- 5+ years of experience with React, TypeScript, and Node.js.
- Strong knowledge of Next.js App Router, SQLite or PostgreSQL, and GraphQL.
- Experience with Docker containerization and AWS cloud infrastructure.
- Track record of delivering reliable, maintainable distributed systems.
`;

export const mockJobApplication1: JobApplication = {
  id: "job-e2e-001",
  title: "Senior Full-Stack Engineer",
  company: "Acme Corp",
  location: "Remote (US)",
  salary: "$150,000 - $185,000",
  url: "https://acme.example.com/careers/senior-full-stack",
  status: "wishlist",
  appliedDate: undefined,
  deadline: "2026-09-30",
  followUpDue: "2026-08-25",
  priority: "high",
  jobDescription: sampleJobDescription,
  notes: "Referral from Alex Rivera; team is scaling rapidly.",
  matchScore: 88,
  createdDate: "2026-08-18",
  companyLogo: "https://logo.clearbit.com/acme.com",
  source: "Crawler Discovery",
  hiringPost: false,
  screenshotUrl: "proof-acme-001.png",
  cloudinaryUrl: "https://res.cloudinary.com/huntflow/image/upload/v1234/acme-shot.png",
  skipReason: undefined,
};

export const mockJobApplication2: JobApplication = {
  id: "job-e2e-002",
  title: "Staff Frontend Architect",
  company: "CloudScale Systems",
  location: "San Francisco, CA (Hybrid)",
  salary: "$190,000 - $220,000",
  url: "https://cloudscale.example.com/jobs/staff-frontend",
  status: "applied",
  appliedDate: "2026-08-15",
  deadline: "2026-09-15",
  followUpDue: "2026-08-22",
  priority: "high",
  jobDescription: "Staff Frontend Architect needed for core web platform redesign using Next.js and Tailwind.",
  notes: "Submitted via direct recruiter outreach.",
  matchScore: 92,
  createdDate: "2026-08-15",
  source: "LinkedIn",
  hiringPost: false,
  screenshotUrl: "proof-cloudscale.png",
  cloudinaryUrl: "https://res.cloudinary.com/huntflow/image/upload/v1234/cloudscale.png",
};

export const mockJobApplication3: JobApplication = {
  id: "job-e2e-003",
  title: "Lead Backend Engineer",
  company: "Apex Data Works",
  location: "New York, NY",
  salary: "$175,000 - $200,000",
  url: "https://apexdata.example.com/jobs/lead-backend",
  status: "interviewing",
  appliedDate: "2026-08-01",
  deadline: "2026-08-30",
  priority: "medium",
  jobDescription: "High-scale SQLite and Node.js backend infrastructure engineering role.",
  matchScore: 84,
  createdDate: "2026-08-01",
};

export const mockJobApplication4: JobApplication = {
  id: "job-e2e-004",
  title: "Principal Platform Engineer",
  company: "Nova AI Labs",
  location: "Remote",
  salary: "$210,000 - $240,000",
  status: "offer",
  appliedDate: "2026-07-20",
  priority: "high",
  jobDescription: "Lead developer experience and agent deployment pipelines.",
  matchScore: 95,
  createdDate: "2026-07-20",
};

export const mockJobApplication5: JobApplication = {
  id: "job-e2e-005",
  title: "Site Reliability Specialist",
  company: "Legacy Corp",
  location: "Chicago, IL",
  salary: "$120,000",
  status: "rejected",
  appliedDate: "2026-06-10",
  priority: "low",
  jobDescription: "On-premise server maintenance and legacy system scripting.",
  matchScore: 45,
  createdDate: "2026-06-10",
  skipReason: "Requires 100% on-site presence and outdated tech stack.",
};

export const mockContact: Contact = {
  id: "contact-e2e-001",
  name: "Alex Rivera",
  role: "VP of Engineering",
  company: "Acme Corp",
  email: "alex.rivera@acme.example.com",
  phone: "+1 (555) 432-1098",
  linkedin: "https://linkedin.com/in/alexrivera-vp",
  source: "referral",
  relationship: "referral",
  notes: "Former colleague at TechNova. Offered to refer directly for the Senior Full-Stack role.",
  priority: "high",
  lastContacted: "2026-08-17",
  companyIds: ["job-e2e-001"],
  createdAt: "2026-08-17T10:00:00Z",
  updatedAt: "2026-08-17T10:00:00Z",
};

export const mockEmail: EmailMessage = {
  id: "email-e2e-001",
  contactId: "contact-e2e-001",
  jobId: "job-e2e-001",
  direction: "sent",
  subject: "Application & Follow-up — Senior Full-Stack Engineer (Alex Johnson)",
  body: "Hi Alex,\n\nGreat connecting yesterday! I submitted my application for the Senior Full-Stack Engineer role. Looking forward to discussing further.\n\nBest,\nAlex",
  sentAt: "2026-08-18T14:30:00Z",
  threadId: "thread-acme-001",
  status: "sent",
  read: true,
};

export const mockInterview: InterviewEvent = {
  id: "interview-e2e-001",
  jobId: "job-e2e-003",
  title: "System Design & Architecture Round",
  type: "video",
  scheduledAt: "2026-08-25T15:00:00Z",
  durationMin: 60,
  location: "https://meet.google.com/abc-defg-hij",
  notes: "Focus on database scaling, SQLite WAL concurrency, and caching layers.",
  status: "scheduled",
  rating: undefined,
  review: undefined,
  prep: ["Review distributed consensus and rate-limiting algorithms."],
  createdAt: "2026-08-18T09:00:00Z",
};

export const mockReminder: Reminder = {
  id: "reminder-e2e-001",
  kind: "follow_up",
  refId: "job-e2e-001",
  dueAt: "2026-08-25T09:00:00Z",
  done: false,
  note: "Send follow-up email to Alex Rivera regarding application status.",
  createdAt: "2026-08-18T10:00:00Z",
};

export const sampleLatexResume = `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{hyperref}
\\begin{document}
\\begin{center}
{\\huge \\textbf{Alex Johnson}} \\\\
San Francisco, CA | alex.johnson@example.com | +1 (555) 234-5678 \\\\
\\href{https://alexjohnson.dev}{alexjohnson.dev} | \\href{https://github.com/alexjohnson}{github.com/alexjohnson}
\\end{center}

\\section*{Professional Summary}
Senior Full-Stack Engineer with 7+ years building high-throughput React, TypeScript, Next.js, and SQLite/Node.js distributed systems.

\\section*{Technical Skills}
\\textbf{Languages}: TypeScript, JavaScript, Python, SQL \\\\
\\textbf{Frameworks}: React 19, Next.js 16, Node.js, GraphQL, Tailwind CSS \\\\
\\textbf{Infrastructure}: Docker, AWS, SQLite, PostgreSQL, CI/CD

\\section*{Experience}
\\textbf{TechNova Inc.} -- Senior Full-Stack Engineer \\hfill 2021 -- Present
\\begin{itemize}
  \\item Architected and deployed Next.js web applications serving 2M+ monthly active users.
  \\item Optimized database query throughput by 45\\% using SQLite WAL indexing.
\\end{itemize}

\\section*{Education}
\\textbf{University of California, Berkeley} -- B.S. in Computer Science \\hfill 2018
\\end{document}
`;

export const mockResumeDoc: ResumeDoc = {
  id: "resume-e2e-master",
  name: "Master ATS Resume (Full-Stack)",
  kind: "resume",
  templateId: "classic-ats",
  tex: sampleLatexResume,
  content: undefined,
  source: "scratch",
  autoCompile: true,
  createdAt: "2026-08-18T12:00:00Z",
  updatedAt: "2026-08-18T12:00:00Z",
};

export const mockResumeDocJson: ResumeDoc = {
  id: "resume-e2e-json",
  name: "Structured Profile Resume",
  kind: "resume",
  templateId: "modern-clean",
  tex: "",
  content: {
    header: {
      name: "Alex Johnson",
      email: "alex.johnson@example.com",
      phone: "+1 (555) 234-5678",
      location: "San Francisco, CA",
      title: "Lead Full-Stack Architect",
      linkedin: "",
      github: "",
      portfolio: "",
    },
    summary: "Full-Stack architect specialized in React, TypeScript, and modern distributed systems.",
    skills: ["React", "TypeScript", "Node.js", "Next.js", "Docker"],
    experience: [
      {
        company: "TechNova Inc.",
        role: "Senior Full-Stack Engineer",
        duration: "2021 — Present",
        bullets: ["Architected micro-frontend systems", "Managed distributed infrastructure"],
      },
    ],
    education: [
      {
        school: "UC Berkeley",
        degree: "B.S. in Computer Science",
        year: "2018",
      },
    ],
  },
  source: "scratch",
  autoCompile: true,
  createdAt: "2026-08-18T12:00:00Z",
  updatedAt: "2026-08-18T12:00:00Z",
};

export const mockNotification: NotificationItem = {
  id: "notif-e2e-001",
  title: "Application Submitted",
  message: "Your application for Senior Full-Stack Engineer at Acme Corp was logged successfully.",
  kind: "success",
  link: "/jobs/job-e2e-001",
  read: false,
  createdAt: "2026-08-18T14:35:00Z",
};
