'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import {
  JobApplication,
  UserProfile,
  STARCard,
  SkillsGapAnalysis,
  TailoredDocuments,
  InterviewQuestion,
  JobBrief,
  SalaryIntel,
  GlobalInsights,
  AutoApplyLog,
  LinkedInJob,
  LinkedInProfileData,
  Contact,
  EmailMessage,
  InterviewEvent,
  Reminder,
  MailSettings,
} from '../types';
import { initialProfile, initialJobs } from '../lib/initialData';
import { LLMSettings, LLMProvider, DEFAULT_LLM_SETTINGS, PROVIDER_STORAGE_KEY, llmSettingsFrom } from '../lib/llm/providers';
import { toErrorMessage } from '../lib/errors';

export interface AnalyticsStats {
  funnel: { status: string; count: number }[];
  weekly: { week: string; applied: number; interviews: number }[];
  responseRate: { replied: number; sent: number; rate: number };
  overdueFollowUps: number;
  upcomingInterviews: number;
  topCompanies: { company: string; count: number }[];
  contactCount: number;
  openPositions: number;
}

export type { MailSettings };

export const EMPTY_MAIL_SETTINGS: MailSettings = {
  imapHost: 'imap.gmail.com',
  imapPort: 993,
  imapUser: '',
  imapPass: '',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  fromName: '',
  fromEmail: '',
};

interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
}

interface GeneratePayload {
  type: string;
  job: Partial<JobApplication>;
  profile: UserProfile;
  options?: { tone?: string; focusSkills?: string[] };
  trackedJobs?: JobApplication[];
  gaps?: string[];
  llmSettings: LLMSettings;
}

export interface LinkedInLoginResult {
  authenticated: boolean;
  profile?: LinkedInProfileData;
  checkpoint?: boolean;
}

interface AppContextType {
  applications: JobApplication[];
  profile: UserProfile;
  insights: GlobalInsights | null;
  loadingInsights: boolean;
  llmSettings: LLMSettings;
  setLLMSettings: (s: LLMSettings) => void;
  providers: LLMProvider[];
  updateProviders: (chain: LLMProvider[]) => void;
  activeJobId: string | null;
  setActiveJobId: (id: string | null) => void;
  dataReady: boolean;
  contacts: Contact[];
  emails: EmailMessage[];
  interviews: InterviewEvent[];
  reminders: Reminder[];
  stats: AnalyticsStats | null;
  refreshStats: () => Promise<void>;
  addApplication: (job: Omit<JobApplication, 'id' | 'createdDate'>) => JobApplication;
  updateApplication: (id: string, partial: Partial<JobApplication>) => void;
  deleteApplication: (id: string) => void;
  updateProfile: (newProfile: UserProfile) => void;
  addContact: (contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => Contact;
  updateContact: (id: string, partial: Partial<Contact>) => void;
  deleteContact: (id: string) => void;
  addEmail: (email: Omit<EmailMessage, 'id' | 'sentAt'>) => EmailMessage;
  updateEmail: (id: string, partial: Partial<EmailMessage>) => void;
  deleteEmail: (id: string) => void;
  addInterview: (interview: Omit<InterviewEvent, 'id' | 'createdAt'>) => InterviewEvent;
  updateInterview: (id: string, partial: Partial<InterviewEvent>) => void;
  deleteInterview: (id: string) => void;
  addReminder: (reminder: Omit<Reminder, 'id' | 'createdAt'>) => Reminder;
  toggleReminder: (id: string) => void;
  deleteReminder: (id: string) => void;
  mailSettings: MailSettings;
  saveMailSettings: (s: MailSettings) => void;
  scrapeJobOffer: (url: string) => Promise<ScrapedJob>;
  generateDocuments: (jobId: string, options?: { tone?: string; focusSkills?: string[] }) => Promise<TailoredDocuments>;
  generateMatchAnalysis: (jobId: string) => Promise<SkillsGapAnalysis>;
  generateSTARCards: (jobId: string) => Promise<STARCard[]>;
  generateInterviewQuestions: (jobId: string) => Promise<InterviewQuestion[]>;
  generateJobBrief: (jobId: string) => Promise<JobBrief>;
  generateSalaryIntel: (jobId: string) => Promise<SalaryIntel>;
  generateGlobalInsights: () => Promise<GlobalInsights>;
  triggerAutoApply: (jobId: string, opts?: { submit?: boolean; minMatch?: number }) => Promise<{
    status: "applied" | "manual_required" | "failed" | "skipped";
    matchScore?: number | null;
    logs?: AutoApplyLog[];
  }>;
  updateCardStatus: (jobId: string, cardId: string, status: 'unstudied' | 'learning' | 'mastered') => void;
  checkLinkedInSession: () => Promise<boolean>;
  openLinkedInLogin: () => Promise<LinkedInLoginResult>;
  logoutLinkedIn: () => Promise<void>;
  importLinkedInProfile: (handle: string) => Promise<LinkedInProfileData>;
  searchLinkedInJobs: (searchUrl: string) => Promise<LinkedInJob[]>;
  saveLinkedInJob: (job: LinkedInJob) => JobApplication;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

/* ------------------------------------------------------------------ *
 * Storage versioning — bump STORAGE_VERSION to wipe stale seed data.
 * Only job data/profile/insights are reset; LLM settings (API keys)
 * are never touched.
 * ------------------------------------------------------------------ */
const STORAGE_VERSION_KEY = "huntflow_storage_version";
const STORAGE_VERSION = "v3";

function storageResetIfStale(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(STORAGE_VERSION_KEY) === STORAGE_VERSION) return false;
    localStorage.removeItem("job_finder_apps");
    localStorage.removeItem("job_finder_profile");
    localStorage.removeItem("huntflow_insights");
    localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
    return true;
  } catch {
    return false;
  }
}

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [applications, setApplications] = useState<JobApplication[]>(() =>
    storageResetIfStale() ? initialJobs : readStorage('job_finder_apps', initialJobs)
  );
  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = storageResetIfStale() ? null : readStorage<UserProfile>('job_finder_profile', initialProfile);
    if (saved && (saved.name === 'Alex Rivera' || saved.email === 'alex.rivera@example.com')) {
      return { ...saved, ...initialProfile };
    }
    return saved ?? initialProfile;
  });
  const [insights, setInsights] = useState<GlobalInsights | null>(() =>
    storageResetIfStale() ? null : readStorage('huntflow_insights', null)
  );
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [llmSettings, setLLMSettings] = useState<LLMSettings>(() =>
    readStorage(PROVIDER_STORAGE_KEY, DEFAULT_LLM_SETTINGS)
  );
  const [providers, setProviders] = useState<LLMProvider[]>([]);

  const updateProviders = (chain: LLMProvider[]) => {
    setProviders(chain);
    fetch('/api/data/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ llm_providers: JSON.stringify(chain) }),
    }).catch(() => undefined);
    localStorage.setItem('huntflow_provider_chain', JSON.stringify(chain));
    const first = chain.find((p) => p.enabled);
    if (first) setLLMSettings(llmSettingsFrom(first));
  };
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [dataReady, setDataReady] = useState(false);

  /* ------------------------- DB collections ------------------------- */

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [interviews, setInterviews] = useState<InterviewEvent[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [mailSettings, setMailSettings] = useState<MailSettings>(EMPTY_MAIL_SETTINGS);

  const refreshStats = async () => {
    try {
      const res = await fetch('/api/data/stats', { cache: 'no-store' });
      if (res.ok) setStats(await res.json());
    } catch {
      /* stats are optional */
    }
  };

  /* Hydrate from the DB once on mount; localStorage is the offline fallback. */
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const res = await fetch('/api/data', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.jobs?.length) {
          setApplications(data.jobs);
          localStorage.setItem('job_finder_apps', JSON.stringify(data.jobs));
        }
        setContacts(data.contacts ?? []);
        setEmails(data.emails ?? []);
        setInterviews(data.interviews ?? []);
        setReminders(data.reminders ?? []);
        if (data.settings) {
          if (data.settings.profile) {
            try {
              const dbProfile = JSON.parse(data.settings.profile);
              setProfile((prev) => ({ ...prev, ...dbProfile }));
              localStorage.setItem('job_finder_profile', JSON.stringify({ ...profile, ...dbProfile }));
            } catch {
              /* corrupt profile — keep local */
            }
          }
          if (data.settings.insights) {
            try {
              setInsights(JSON.parse(data.settings.insights));
            } catch {
              /* corrupt insights — keep defaults */
            }
          }
          if (data.settings.mail_settings) {
            try {
              setMailSettings({ ...EMPTY_MAIL_SETTINGS, ...JSON.parse(data.settings.mail_settings) });
            } catch {
              /* corrupt mail settings — keep defaults */
            }
          }
          if (data.settings.llm_providers) {
            try {
              const parsed = JSON.parse(data.settings.llm_providers) as LLMProvider[];
              if (Array.isArray(parsed) && parsed.length) {
                setProviders(parsed);
                const first = parsed.find((p) => p.enabled);
                if (first) setLLMSettings(llmSettingsFrom(first));
              }
            } catch {
              /* corrupt chain — keep defaults */
            }
          }
        }
        setDataReady(true);
      } catch {
        /* API down — keep localStorage seed */
        if (!cancelled) setDataReady(true);
      }
    };
    hydrate();
    fetch("/api/data/stats", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setStats(d);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------- Write-through helpers ------------------------- */

  const persist = async (collection: string, entity: unknown) => {
    try {
      await fetch(`/api/data/${collection}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entity),
      });
    } catch {
      /* offline — local state still updates */
    }
  };

  const persistSettings = (key: string, value: string) => {
    fetch('/api/data/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => undefined);
  };

  /* Profile + insights land in the DB so they survive any browser. */
  useEffect(() => {
    if (!dataReady) return;
    persistSettings('profile', JSON.stringify(profile));
  }, [profile, dataReady]);

  useEffect(() => {
    if (!dataReady) return;
    if (insights) persistSettings('insights', JSON.stringify(insights));
  }, [insights, dataReady]);

  useEffect(() => {
    if (!dataReady) return;
    persistSettings('mail_settings', JSON.stringify(mailSettings));
  }, [mailSettings, dataReady]);

  /* localStorage mirrors stay for offline fallback */
  useEffect(() => {
    localStorage.setItem('job_finder_apps', JSON.stringify(applications));
  }, [applications]);

  useEffect(() => {
    localStorage.setItem('job_finder_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(llmSettings));
  }, [llmSettings]);

  useEffect(() => {
    if (insights) localStorage.setItem('huntflow_insights', JSON.stringify(insights));
    else localStorage.removeItem('huntflow_insights');
  }, [insights]);

  /* ------------------------- CRUD ------------------------- */

  const addApplication = (data: Omit<JobApplication, 'id' | 'createdDate'>): JobApplication => {
    const newApp: JobApplication = {
      ...data,
      id: 'job-' + Date.now(),
      createdDate: new Date().toISOString().split('T')[0],
      autoApplyStatus: data.autoApplyStatus || 'idle',
      autoApplyLogs: data.autoApplyLogs || [],
    };
    setApplications(prev => [newApp, ...prev]);
    setActiveJobId(newApp.id);
    persist('jobs', newApp);
    return newApp;
  };

  const updateApplication = (id: string, partial: Partial<JobApplication>) => {
    const target = applications.find((a) => a.id === id);
    if (!target) return;
    const justApplied = partial.status === "applied" && target.status !== "applied";
    const updated = { ...target, ...partial };
    setApplications(prev => prev.map(app => (app.id === id ? updated : app)));
    persist('jobs', updated);
    refreshStats();
    if (justApplied) syncInboxAfterApply();
  };

  /* After marking a job as applied, scan the inbox for any mail from that
     company (replies, rejection/offer notices) and fold them into the app. */
  const syncInboxAfterApply = async () => {
    try {
      const res = await fetch('/api/mail/sync', { method: 'POST', cache: 'no-store' });
      if (!res.ok) return;
      const full = await fetch('/api/data', { cache: 'no-store' });
      if (full.ok) {
        const d = await full.json();
        if (d.jobs) setApplications(d.jobs);
        setEmails(d.emails ?? []);
        setContacts(d.contacts ?? []);
        setInterviews(d.interviews ?? []);
        setReminders(d.reminders ?? []);
      }
      refreshStats();
    } catch {
      /* IMAP not configured — skip silently */
    }
  };

  const deleteApplication = (id: string) => {
    setApplications(prev => prev.filter(app => app.id !== id));
    if (activeJobId === id) {
      const remaining = applications.filter(app => app.id !== id);
      setActiveJobId(remaining.length > 0 ? remaining[0].id : null);
    }
    fetch(`/api/data/jobs/${id}`, { method: 'DELETE' }).catch(() => undefined);
    refreshStats();
  };

  const updateProfile = (newProfile: UserProfile) => setProfile(newProfile);

  /* ------------------------- Contacts ------------------------- */

  const addContact = (data: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>): Contact => {
    const now = new Date().toISOString();
    const contact: Contact = { ...data, id: 'c-' + Date.now(), createdAt: now, updatedAt: now };
    setContacts(prev => [contact, ...prev]);
    persist('contacts', contact);
    refreshStats();
    return contact;
  };

  const updateContact = (id: string, partial: Partial<Contact>) => {
    setContacts(prev =>
      prev.map(c => {
        if (c.id !== id) return c;
        const updated = { ...c, ...partial, updatedAt: new Date().toISOString() };
        persist('contacts', updated);
        return updated;
      })
    );
  };

  const deleteContact = (id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
    fetch(`/api/data/contacts/${id}`, { method: 'DELETE' }).catch(() => undefined);
    refreshStats();
  };

  /* ------------------------- Emails ------------------------- */

  const addEmail = (data: Omit<EmailMessage, 'id' | 'sentAt'>): EmailMessage => {
    const email: EmailMessage = { ...data, id: 'e-' + Date.now(), sentAt: new Date().toISOString() };
    setEmails(prev => [email, ...prev]);
    persist('emails', email);
    return email;
  };

  const updateEmail = (id: string, partial: Partial<EmailMessage>) => {
    setEmails(prev =>
      prev.map(e => {
        if (e.id !== id) return e;
        const updated = { ...e, ...partial };
        persist('emails', updated);
        return updated;
      })
    );
  };

  const deleteEmail = (id: string) => {
    setEmails(prev => prev.filter(e => e.id !== id));
    fetch(`/api/data/emails/${id}`, { method: 'DELETE' }).catch(() => undefined);
  };

  /* ------------------------- Interviews ------------------------- */

  const addInterview = (data: Omit<InterviewEvent, 'id' | 'createdAt'>): InterviewEvent => {
    const interview: InterviewEvent = { ...data, id: 'i-' + Date.now(), createdAt: new Date().toISOString() };
    setInterviews(prev => [...prev, interview]);
    persist('interviews', interview);
    refreshStats();
    return interview;
  };

  const updateInterview = (id: string, partial: Partial<InterviewEvent>) => {
    setInterviews(prev =>
      prev.map(it => {
        if (it.id !== id) return it;
        const updated = { ...it, ...partial };
        persist('interviews', updated);
        return updated;
      })
    );
    refreshStats();
  };

  const deleteInterview = (id: string) => {
    setInterviews(prev => prev.filter(it => it.id !== id));
    fetch(`/api/data/interviews/${id}`, { method: 'DELETE' }).catch(() => undefined);
    refreshStats();
  };

  /* ------------------------- Reminders ------------------------- */

  const addReminder = (data: Omit<Reminder, 'id' | 'createdAt'>): Reminder => {
    const reminder: Reminder = { ...data, id: 'r-' + Date.now(), createdAt: new Date().toISOString() };
    setReminders(prev => [...prev, reminder]);
    persist('reminders', reminder);
    refreshStats();
    return reminder;
  };

  const toggleReminder = (id: string) => {
    setReminders(prev =>
      prev.map(r => {
        if (r.id !== id) return r;
        const updated = { ...r, done: !r.done };
        persist('reminders', updated);
        return updated;
      })
    );
  };

  const deleteReminder = (id: string) => {
    setReminders(prev => prev.filter(r => r.id !== id));
    fetch(`/api/data/reminders/${id}`, { method: 'DELETE' }).catch(() => undefined);
    refreshStats();
  };

  const saveMailSettings = (s: MailSettings) => setMailSettings(s);

  /* ------------------------- Scrape ------------------------- */

  const scrapeJobOffer = async (url: string): Promise<ScrapedJob> => {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Failed to scrape job offer.');
    return data;
  };

  /* ------------------------- AI generation ------------------------- */

  const callGenerate = async (payload: GeneratePayload) => {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || data?.error || 'AI generation failed.');
    return data;
  };

  const jobPayload = (job: JobApplication) => ({
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    salary: job.salary,
    url: job.url,
    jobDescription: job.jobDescription,
    matchScore: job.matchScore,
    status: job.status,
  });

  const generateDocuments = async (jobId: string, options?: { tone?: string; focusSkills?: string[] }): Promise<TailoredDocuments> => {
    const job = applications.find(a => a.id === jobId);
    if (!job) throw new Error('Job not found.');
    const data = await callGenerate({
      type: 'documents',
      job: jobPayload(job),
      profile,
      options,
      llmSettings,
    });
    const docs: TailoredDocuments = data.documents || {};
    updateApplication(jobId, { documents: { ...job.documents, ...docs } });
    return docs;
  };

  const generateMatchAnalysis = async (jobId: string): Promise<SkillsGapAnalysis> => {
    const job = applications.find(a => a.id === jobId);
    if (!job) throw new Error('Job not found.');
    const data = await callGenerate({
      type: 'match_analysis',
      job: jobPayload(job),
      profile,
      llmSettings,
    });
    const analysis: SkillsGapAnalysis = data.analysis;
    updateApplication(jobId, { matchScore: analysis.matchScore, skillsGap: analysis });
    return analysis;
  };

  const generateSTARCards = async (jobId: string): Promise<STARCard[]> => {
    const job = applications.find(a => a.id === jobId);
    if (!job) throw new Error('Job not found.');
    const data = await callGenerate({
      type: 'star_flashcards',
      job: jobPayload(job),
      profile,
      llmSettings,
    });
    const cards: STARCard[] = data.cards || [];
    updateApplication(jobId, { starFlashcards: cards });
    return cards;
  };

  const generateInterviewQuestions = async (jobId: string): Promise<InterviewQuestion[]> => {
    const job = applications.find(a => a.id === jobId);
    if (!job) throw new Error('Job not found.');
    const data = await callGenerate({
      type: 'interview_questions',
      job: jobPayload(job),
      profile,
      llmSettings,
    });
    const questions: InterviewQuestion[] = data.questions || [];
    updateApplication(jobId, { interviewQuestions: questions });
    return questions;
  };

  const generateJobBrief = async (jobId: string): Promise<JobBrief> => {
    const job = applications.find(a => a.id === jobId);
    if (!job) throw new Error('Job not found.');
    const data = await callGenerate({
      type: 'job_brief',
      job: jobPayload(job),
      profile,
      llmSettings,
    });
    const brief: JobBrief = data.brief;
    updateApplication(jobId, { jobBrief: brief });
    return brief;
  };

  const generateSalaryIntel = async (jobId: string): Promise<SalaryIntel> => {
    const job = applications.find(a => a.id === jobId);
    if (!job) throw new Error('Job not found.');
    const data = await callGenerate({
      type: 'salary_intel',
      job: jobPayload(job),
      profile,
      llmSettings,
    });
    const salary: SalaryIntel = data.salary;
    updateApplication(jobId, { salaryIntel: salary });
    return salary;
  };

  const generateGlobalInsights = async (): Promise<GlobalInsights> => {
    setLoadingInsights(true);
    const gaps = Array.from(
      new Set(applications.flatMap(a => a.skillsGap?.missingSkills ?? []))
    ).slice(0, 12);

    try {
      const [recsData, roadmapData, reportData] = await Promise.all([
      callGenerate({
        type: 'recommendations',
        job: { title: profile.targetTitle, company: '', jobDescription: '', location: '' },
        profile,
        trackedJobs: applications,
        llmSettings,
      }),
      callGenerate({
        type: 'skill_roadmap',
        job: { title: profile.targetTitle, company: '', jobDescription: '', location: '' },
        profile,
        gaps,
        llmSettings,
      }),
      callGenerate({
        type: 'pipeline_report',
        job: { title: profile.targetTitle, company: '', jobDescription: '', location: '' },
        profile,
        trackedJobs: applications,
        llmSettings,
      }),
    ]);

    const next: GlobalInsights = {
      recommendations: recsData.recommendations || [],
      roadmap: roadmapData.roadmap || [],
      report: reportData.report,
      generatedAt: new Date().toISOString(),
    };
    setInsights(next);
    return next;
    } finally {
      setLoadingInsights(false);
    }
  };

  /* ------------------------- Auto-apply agent ------------------------- */

  const triggerAutoApply = async (jobId: string, opts?: { submit?: boolean; minMatch?: number }) => {
    const job = applications.find(a => a.id === jobId);
    if (!job) return { status: 'failed' as const, matchScore: null };

    const submit = opts?.submit ?? false;
    const minMatch = opts?.minMatch ?? 0;

    updateApplication(jobId, {
      autoApplyStatus: 'queued',
      autoApplyLogs: [
        { timestamp: new Date().toLocaleTimeString(), message: `LangGraph agent queued for ${job.company}`, type: 'info' },
      ],
    });

    try {
      const res = await fetch('/api/apply-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: jobPayload(job),
          profile,
          documents: job.documents ?? {},
          submit,
          minMatch,
          llmSettings,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Agent execution failed.');

      const finalStatus: "applied" | "manual_required" | "failed" | "skipped" =
        data.status === 'applied' ? 'applied'
        : data.status === 'skipped' ? 'skipped'
        : data.status === 'manual_required' ? 'manual_required'
        : 'failed';

      updateApplication(jobId, {
        autoApplyStatus: finalStatus === 'skipped' ? 'idle' : finalStatus,
        autoApplyLogs: data.logs || [],
        status: data.status === 'applied' ? 'applied' : job.status,
        appliedDate: data.status === 'applied' ? new Date().toISOString().split('T')[0] : job.appliedDate,
        ...(typeof data.matchScore === 'number' && !job.matchScore ? { matchScore: data.matchScore } : {}),
      });

      return { status: finalStatus, matchScore: data.matchScore ?? null, logs: data.logs || [] };
    } catch (err) {
      const message = toErrorMessage(err);
      updateApplication(jobId, {
        autoApplyStatus: 'failed',
        autoApplyLogs: [
          ...(job.autoApplyLogs || []),
          { timestamp: new Date().toLocaleTimeString(), message: `Agent failed: ${message}`, type: 'error' },
        ],
      });
      throw err;
    }
  };

  /* ------------------------- Flashcards ------------------------- */

  const updateCardStatus = (jobId: string, cardId: string, status: 'unstudied' | 'learning' | 'mastered') => {
    const job = applications.find(a => a.id === jobId);
    if (!job || !job.starFlashcards) return;
    const updatedCards = job.starFlashcards.map(card => (card.id === cardId ? { ...card, status } : card));
    updateApplication(jobId, { starFlashcards: updatedCards });
  };

  /* ------------------------- LinkedIn ------------------------- */

  const checkLinkedInSession = async (): Promise<boolean> => {
    const res = await fetch('/api/linkedin/session', { cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.authenticated);
  };

  const openLinkedInLogin = async (): Promise<LinkedInLoginResult> => {
    const res = await fetch('/api/linkedin/login', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'LinkedIn login window failed.');
    return {
      authenticated: Boolean(data?.authenticated),
      profile: data?.profile as LinkedInProfileData | undefined,
      checkpoint: Boolean(data?.checkpoint),
    };
  };

  const logoutLinkedIn = async (): Promise<void> => {
    await fetch('/api/linkedin/logout', { method: 'POST' });
  };

  const importLinkedInProfile = async (handle: string): Promise<LinkedInProfileData> => {
    const res = await fetch('/api/linkedin/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: handle }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Profile import failed.');
    if (!data?.authenticated) throw new Error('LinkedIn session required — sign in first in Settings → LinkedIn.');
    const li = data.profile as LinkedInProfileData;

    const next: UserProfile = {
      ...profile,
      name: li.name || profile.name,
      headline: li.headline || '',
      location: li.location || profile.location,
      summary: li.about || profile.summary,
      skills: li.skills?.length ? li.skills : profile.skills,
      experience: li.experience?.map((exp, i) => ({
        id: 'exp-' + Date.now() + '-' + i,
        company: exp.company || '',
        role: exp.role || '',
        duration: exp.duration || '',
        bulletPoints: exp.details || [],
      })) || profile.experience,
      education: li.education?.map((edu, i) => ({
        id: 'edu-' + Date.now() + '-' + i,
        degree: edu.degree || '',
        school: edu.school || '',
        year: '',
      })) || profile.education,
      linkedin: `linkedin.com/in/${handle.split('/in/')[1]?.replace(/[^a-zA-Z0-9-]/g, '') || handle}`,
    };
    setProfile(next);
    return li;
  };

  const searchLinkedInJobs = async (searchUrl: string): Promise<LinkedInJob[]> => {
    const res = await fetch('/api/linkedin/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: searchUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Job search failed.');
    if (!data?.authenticated) throw new Error('LinkedIn session required — sign in first in Settings → LinkedIn.');
    return data.jobs || [];
  };

  const saveLinkedInJob = (job: LinkedInJob): JobApplication =>
    addApplication({
      title: job.title,
      company: job.company,
      location: job.location,
      salary: '',
      url: job.url,
      status: 'wishlist',
      jobDescription: `LinkedIn posting: ${job.title} at ${job.company}. Open the link in your browser to review the full description.`,
      notes: 'Imported from LinkedIn Jobs search.',
      companyLogo: '',
      autoApplyStatus: 'idle',
      autoApplyLogs: [],
    });

  const value = useMemo(
    () => ({
      applications,
      profile,
      insights,
      loadingInsights,
      llmSettings,
      setLLMSettings,
      providers,
      updateProviders,
      activeJobId,
      setActiveJobId,
      dataReady,
      contacts,
      emails,
      interviews,
      reminders,
      stats,
      refreshStats,
      addApplication,
      updateApplication,
      deleteApplication,
      updateProfile,
      addContact,
      updateContact,
      deleteContact,
      addEmail,
      updateEmail,
      deleteEmail,
      addInterview,
      updateInterview,
      deleteInterview,
      addReminder,
      toggleReminder,
      deleteReminder,
      mailSettings,
      saveMailSettings,
      scrapeJobOffer,
      generateDocuments,
      generateMatchAnalysis,
      generateSTARCards,
      generateInterviewQuestions,
      generateJobBrief,
      generateSalaryIntel,
      generateGlobalInsights,
      triggerAutoApply,
      updateCardStatus,
      checkLinkedInSession,
      openLinkedInLogin,
      logoutLinkedIn,
      importLinkedInProfile,
      searchLinkedInJobs,
      saveLinkedInJob,
    }),
    [
      applications,
      profile,
      insights,
      loadingInsights,
      llmSettings,
      providers,
      activeJobId,
      dataReady,
      contacts,
      emails,
      interviews,
      reminders,
      stats,
      mailSettings,
      setLLMSettings,
      setActiveJobId,
      updateProviders,
      refreshStats,
      addApplication,
      updateApplication,
      deleteApplication,
      updateProfile,
      addContact,
      updateContact,
      deleteContact,
      addEmail,
      updateEmail,
      deleteEmail,
      addInterview,
      updateInterview,
      deleteInterview,
      addReminder,
      toggleReminder,
      deleteReminder,
      saveMailSettings,
      scrapeJobOffer,
      generateDocuments,
      generateMatchAnalysis,
      generateSTARCards,
      generateInterviewQuestions,
      generateJobBrief,
      generateSalaryIntel,
      generateGlobalInsights,
      triggerAutoApply,
      updateCardStatus,
      checkLinkedInSession,
      openLinkedInLogin,
      logoutLinkedIn,
      importLinkedInProfile,
      searchLinkedInJobs,
      saveLinkedInJob,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
