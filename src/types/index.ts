export type ApplicationStatus = 'wishlist' | 'applied' | 'interviewing' | 'offer' | 'rejected';

export interface STARCard {
  id: string;
  question: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  status?: 'unstudied' | 'learning' | 'mastered';
}

export type AISourceType = "live_llm" | "heuristic_fallback";

export interface AIMetadata {
  source: AISourceType;
  provider?: string;
  model?: string;
  generatedAt?: string;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface SkillsGapAnalysis {
  matchScore: number; // 0 - 100
  matchingSkills: string[];
  missingSkills: string[];
  strengths: string[];
  recommendations: string[];
  keyTermFrequency: { term: string; count: number; inResume: boolean }[];
  /** Strict profile-fit rating from the deterministic fit engine (see scoreFit). */
  fit?: "high" | "medium" | "low" | "skip";
  /** Concrete reasons this role should be skipped (visa, clearance, on-site-only, salary floor). */
  dealbreakers?: string[];
  /** AI source & generation metadata */
  source?: AISourceType;
  provider?: string;
  model?: string;
  analyzedAt?: string;
}

export interface TailoredDocuments {
  tailoredResume?: string;
  coverLetter?: string;
  motivationLetter?: string;
  followUpEmail?: string;
  customNotes?: string;
  /** AI source & generation metadata */
  source?: AISourceType;
  provider?: string;
  model?: string;
  generatedAt?: string;
}

export interface InterviewQuestion {
  id: string;
  question: string;
  category: "technical" | "behavioral" | "culture";
  difficulty: "easy" | "medium" | "hard";
  hint: string;
  idealAnswer: string;
}

export interface JobBrief {
  summary: string;
  techStack: string[];
  topRequirements: string[];
  redFlags: string[];
  questionsToAsk: string[];
  cultureSignals: string[];
}

export interface SalaryIntel {
  estimateLow: number;
  estimateHigh: number;
  basis: "posting" | "market" | "hybrid";
  disclosedRange: string | null;
  factors: string[];
  negotiationTips: string[];
}

export interface SkillRoadmapItem {
  skill: string;
  priority: "high" | "medium" | "low";
  why: string;
  resources: string[];
}

export interface RecommendationItem {
  title: string;
  companyArchetype: string;
  why: string;
  matchProbability: number;
}

export interface PipelineReport {
  headline: string;
  highlights: string[];
  risks: string[];
  actions: string[];
}

export interface GlobalInsights {
  recommendations: RecommendationItem[];
  roadmap: SkillRoadmapItem[];
  report: PipelineReport;
  generatedAt: string;
}

export interface AutoApplyLog {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'reasoning';
}

export interface CompanyResearchSource {
  id: string;
  kind: "wikidata" | "wikipedia" | "news" | "job_posting";
  title: string;
  url: string;
  publisher: string;
  publishedAt?: string;
  retrievedAt: string;
}

export interface CompanyResearchFact {
  label: string;
  value: string;
  sourceIds: string[];
  confidence: "verified" | "posting_signal";
}

export interface CompanyResearchNewsItem {
  title: string;
  url: string;
  publisher: string;
  publishedAt?: string;
  sourceId: string;
}

/** Source-backed company context. Empty fields are intentionally not guessed. */
export interface CompanyResearch {
  company: string;
  status: "verified" | "partial" | "unavailable";
  entityId?: string;
  summary?: string;
  officialWebsite?: string;
  facts: CompanyResearchFact[];
  news: CompanyResearchNewsItem[];
  sources: CompanyResearchSource[];
  warnings: string[];
  researchedAt: string;
}

export interface EmployerReview {
  acceptanceProbability: number; // 0 - 100
  atsPassScore: number; // 0 - 100
  verdict: "interview_likely" | "possible_callback" | "likely_reject";
  strengths: string[];
  riskFactors: string[];
  actionableFixes: string[];
  reviewedAt: string;
  companyIntel?: {
    history?: string;
    headquarters?: string;
    foundingYear?: string;
    stage?: string;
    products?: string[];
    techStack?: string[];
    cultureSignals?: string[];
    research?: CompanyResearch;
  };
}

export interface JobApplication {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  url?: string;
  status: ApplicationStatus;
  appliedDate?: string;
  deadline?: string;
  followUpDue?: string;
  priority?: 'high' | 'medium' | 'low';
  jobDescription: string;
  notes?: string;
  matchScore?: number;
  fitCategory?: 'direct_fit' | 'tailored_fit';
  employerReview?: EmployerReview;
  skillsGap?: SkillsGapAnalysis;
  documents?: TailoredDocuments;
  starFlashcards?: STARCard[];
  interviewQuestions?: InterviewQuestion[];
  jobBrief?: JobBrief;
  salaryIntel?: SalaryIntel;
  autoApplyStatus?: 'idle' | 'queued' | 'processing' | 'applied' | 'failed' | 'manual_required';
  autoApplyLogs?: AutoApplyLog[];
  multiAgentOutputs?: {
    atsScore?: number;
    recommendedTemplate?: string;
    matchingSkills?: string[];
    missingSkills?: string[];
    salaryEstimate?: string;
    outreachSubject?: string;
    interviewPrepTopics?: string[];
    companyResearch?: CompanyResearch;
  };
  createdDate: string;
  companyLogo?: string;
  /** Board/feed the job was crawled from (e.g. "HN Who is Hiring", "RemoteOK"). */
  source?: string;
  /** Marks low-confidence hiring-post extractions (HN Who-is-Hiring style). */
  hiringPost?: boolean;
  /** Live screenshot URL of the job page or crawl proof */
  screenshotUrl?: string;
  /** Direct Cloudinary CDN image URL if uploaded */
  cloudinaryUrl?: string;
  /** Feedback reason when a candidate skips or rejects a job in HITL deck */
  skipReason?: string;
}

export interface CloudinarySettings {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  concurrency?: number;
}

export interface Contact {
  id: string;
  name: string;
  role: string;
  company: string;
  email: string;
  phone: string;
  linkedin: string;
  source: 'linkedin' | 'email' | 'event' | 'referral' | 'other';
  relationship: 'recruiter' | 'hiring_manager' | 'referral' | 'talent_lead' | 'alumni' | 'other';
  notes: string;
  priority: 'high' | 'medium' | 'low';
  lastContacted?: string;
  companyIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EmailMessage {
  id: string;
  contactId?: string;
  jobId?: string;
  direction: 'sent' | 'received';
  subject: string;
  body: string;
  sentAt: string;
  threadId: string;
  status: 'draft' | 'sent' | 'failed' | 'replied';
  read: boolean;
}

export interface InterviewEvent {
  id: string;
  jobId?: string;
  title: string;
  type: 'phone' | 'video' | 'onsite' | 'technical' | 'system_design' | 'behavioral' | 'take_home' | 'other';
  scheduledAt: string;
  durationMin: number;
  location: string;
  notes: string;
  status: 'scheduled' | 'done' | 'cancelled';
  rating?: number;
  review?: string;
  prep?: string[];
  createdAt: string;
}

export interface Reminder {
  id: string;
  kind: 'follow_up' | 'deadline' | 'interview' | 'custom';
  refId?: string;
  dueAt: string;
  done: boolean;
  note: string;
  createdAt: string;
}

export interface MailSettings {
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromName: string;
  fromEmail: string;
}



export interface LinkedInJob {
  title: string;
  company: string;
  location: string;
  url: string;
}

export interface LinkedInExperience {
  role: string;
  company: string;
  duration: string;
  details: string[];
}

export interface LinkedInEducation {
  degree: string;
  school: string;
}

export interface LinkedInProfileData {
  name: string;
  headline: string;
  location: string;
  about: string;
  experience: LinkedInExperience[];
  education: LinkedInEducation[];
  skills: string[];
}

export interface WorkExperience {
  id: string;
  company: string;
  role: string;
  duration: string;
  bulletPoints: string[];
}

export interface Education {
  id: string;
  degree: string;
  school: string;
  year: string;
}

export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  location: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  summary: string;
  headline?: string;
  targetTitle: string;
  skills: string[];
  experience: WorkExperience[];
  education: Education[];
  linkedin?: string;
  github?: string;
  portfolio?: string;
  twitter?: string;
  citizenship?: string;
  workPermitStatus?: "authorized" | "sponsorship_required" | "green_card" | "citizen" | "eu_passport" | "other";
  desiredSalary?: string;
  noticePeriod?: string;
  yearsOfExperience?: number;
  willingnessToRelocate?: "yes" | "no" | "remote_only";
  preferredWorkMode?: "remote" | "hybrid" | "onsite";
  genderDiversity?: string;
  veteranStatus?: string;
  dateOfBirth?: string;
  nationality?: string;
  visaStatus?: string;
  gender?: string;
  disabilityStatus?: string;
  salaryExpectations?: string;
  availability?: string;
  references?: string;
  geminiApiKey?: string;
  clearanceLevel?: string;
  driversLicense?: string;
  languagesSpoken?: string;
  maritalStatus?: string;
}

/* ------------------------------------------------------------------ *
 * Resume Builder
 * ------------------------------------------------------------------ */

export type ResumeDocKind = "resume" | "cv" | "cover_letter" | "motivation_letter";
export type ResumeDocSource = "scratch" | "pdf_import" | "linkedin";

export interface ResumeExperienceItem {
  role: string;
  company: string;
  duration: string;
  bullets: string[];
}

export interface ResumeEducationItem {
  degree: string;
  school: string;
  year: string;
}

export interface ResumeProjectItem {
  name: string;
  tech: string;
  link?: string;
  bullets: string[];
}

export interface ResumeCertificationItem {
  name: string;
  issuer: string;
  year: string;
}

export interface ResumeLanguageItem {
  name: string;
  level: string;
}

/** Structured content the resume agent produces; templates render it to LaTeX. */
export interface ResumeContent {
  header: {
    name: string;
    title: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
    github: string;
    portfolio: string;
  };
  summary?: string;
  skills?: string[];
  experience?: ResumeExperienceItem[];
  education?: ResumeEducationItem[];
  projects?: ResumeProjectItem[];
  certifications?: ResumeCertificationItem[];
  languages?: ResumeLanguageItem[];
  /** Letters only: body paragraphs + optional recipient block. */
  paragraphs?: string[];
  recipient?: string;
}

export interface ResumeDoc {
  id: string;
  name: string;
  kind: ResumeDocKind;
  templateId: string;
  /** Full LaTeX source — this is the document (directly editable). */
  tex: string;
  /** Structured content snapshot (for re-rendering after agent runs). */
  content?: ResumeContent;
  source: ResumeDocSource;
  sourceDocId?: string;
  targetJobId?: string;
  autoCompile: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  kind: "info" | "success" | "warning" | "error" | "review";
  link?: string;
  read: boolean;
  createdAt: string;
}

/** UI-facing Source Type classification from the sidecar source contract. */
export type CrawlerSourceType = "general" | "remote_board" | "community";

/** Market tags describing the regions a crawler board serves. */
export type CrawlerMarket = "global" | "europe" | "mena" | "americas" | "apac";

/**
 * One crawler board as returned by `/api/agent/sources` (the sidecar `/sources`
 * whitelist). The top-level `category` is storage organization only — Source
 * Type and Market are the explicit, independent filter dimensions.
 */
export interface CrawlerSource {
  id: string;
  name: string;
  category: string;
  type: "static" | "stealth" | "posts";
  url: string;
  sourceType: CrawlerSourceType;
  markets: CrawlerMarket[];
  experience: "entry" | "mid" | "senior" | "all";
  workMode: "remote" | "hybrid" | "onsite" | "all";
  enabledByDefault: boolean;
  note?: string;
}

export type { VaultDoc, VaultChunk, MemoryEntry } from "@/lib/db";
