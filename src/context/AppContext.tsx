'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
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
  CloudinarySettings,
} from '../types';
import { initialProfile, initialJobs } from '../lib/initialData';
import {
  LLMSettings,
  LLMProvider,
  AgentModelRoute,
  DEFAULT_LLM_SETTINGS,
  PROVIDER_STORAGE_KEY,
  AGENT_ROUTING_STORAGE_KEY,
  llmSettingsFrom,
} from '../lib/llm/providers';
import { toErrorMessage } from '../lib/errors';
import { useToast } from '@/components/ui/Toaster';
import { fetchStats } from '@/lib/api/stats';

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

export type { MailSettings, CloudinarySettings };

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

export const EMPTY_CLOUDINARY_SETTINGS: CloudinarySettings = {
  cloudName: '',
  apiKey: '',
  apiSecret: '',
  concurrency: 1,
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
  options?: {
    tone?: string;
    focusSkills?: string[];
    docType?: "tailoredResume" | "coverLetter" | "motivationLetter" | "followUpEmail";
  };
  trackedJobs?: JobApplication[];
  gaps?: string[];
  llmSettings: LLMSettings;
}

export interface LinkedInLoginResult {
  authenticated: boolean;
  profile?: LinkedInProfileData;
  checkpoint?: boolean;
  state?: "signed_in" | "signed_out" | "authwall" | "checkpoint" | "window_closed" | "login_in_progress" | "session_locked" | "error";
  reason?: string;
  recovery?: string;
  method?: "visible_browser" | "session_cookie" | "session_check";
  checkedAt?: string;
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
  agentModelRoutes: AgentModelRoute[];
  updateAgentModelRoutes: (routes: AgentModelRoute[]) => void;
  dataReady: boolean;
  contacts: Contact[];
  emails: EmailMessage[];
  interviews: InterviewEvent[];
  reminders: Reminder[];
  stats: AnalyticsStats | null;
  refreshStats: () => Promise<void>;
  refreshData: () => Promise<void>;
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
  cloudinarySettings: CloudinarySettings;
  saveCloudinarySettings: (s: CloudinarySettings) => Promise<void>;
  scrapeJobOffer: (url: string) => Promise<ScrapedJob>;
  generateDocuments: (jobId: string, options?: { tone?: string; focusSkills?: string[] }) => Promise<TailoredDocuments>;
  generateDocument: (
    jobId: string,
    docType: "tailoredResume" | "coverLetter" | "motivationLetter" | "followUpEmail",
    options?: { tone?: string; focusSkills?: string[] }
  ) => Promise<TailoredDocuments>;
  generateMatchAnalysis: (jobId: string) => Promise<SkillsGapAnalysis>;
  generateSTARCards: (jobId: string) => Promise<STARCard[]>;
  generateInterviewQuestions: (jobId: string) => Promise<InterviewQuestion[]>;
  generateJobBrief: (jobId: string) => Promise<JobBrief>;
  generateSalaryIntel: (jobId: string) => Promise<SalaryIntel>;
  generateGlobalInsights: () => Promise<GlobalInsights>;
  triggerAutoApply: (jobId: string, opts?: { submit?: boolean }) => Promise<{
    status: "applied" | "manual_required" | "failed" | "skipped";
    matchScore?: number | null;
    logs?: AutoApplyLog[];
  }>;
  triggerAutoApplyBatch: (
    jobIds: string[],
    opts?: { submit?: boolean; concurrency?: number }
  ) => Promise<{ completed: number; failed: number }>;
  triggerMatchBatch: (jobIds: string[], concurrency?: number) => Promise<void>;
  updateCardStatus: (jobId: string, cardId: string, status: 'unstudied' | 'learning' | 'mastered') => void;
  checkLinkedInSession: () => Promise<LinkedInLoginResult>;
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

const extractErrorMessage = async (res: Response): Promise<string> => {
  try {
    const data = await res.json();
    if (typeof data?.error === 'string') return data.error;
    if (typeof data?.error?.message === 'string') return data.error.message;
    if (typeof data?.message === 'string') return data.message;
  } catch {
    /* non-JSON response */
  }
  return `Server returned status ${res.status}`;
};

/**
 * Restores a deleted entity to its exact original position within the current collection,
 * even when multiple concurrent deletions have occurred in arbitrary order.
 */
function restoreEntityAtOriginalIndex<T extends { id: string }>(
  curr: T[],
  item: T,
  prevSnapshot: T[],
  fallbackIndex: number
): T[] {
  if (curr.some((e) => e.id === item.id)) return curr;
  if (curr.length === 0) return [item];

  const targetIndex = prevSnapshot.findIndex((e) => e.id === item.id);
  const effectiveIndex = targetIndex !== -1 ? targetIndex : fallbackIndex;

  // 1. Look for the first successor from the snapshot that currently exists in curr
  const successorIds = new Set(prevSnapshot.slice(effectiveIndex + 1).map((e) => e.id));
  const insertBeforeIndex = curr.findIndex((e) => successorIds.has(e.id));
  if (insertBeforeIndex !== -1) {
    const copy = [...curr];
    copy.splice(insertBeforeIndex, 0, item);
    return copy;
  }

  // 2. Look for the last predecessor from the snapshot that currently exists in curr
  const predecessorIds = new Set(prevSnapshot.slice(0, effectiveIndex).map((e) => e.id));
  let insertAfterIndex = -1;
  for (let i = curr.length - 1; i >= 0; i--) {
    if (predecessorIds.has(curr[i].id)) {
      insertAfterIndex = i;
      break;
    }
  }
  if (insertAfterIndex !== -1) {
    const copy = [...curr];
    copy.splice(insertAfterIndex + 1, 0, item);
    return copy;
  }

  // 3. Fallback: insert at clamped fallbackIndex
  const copy = [...curr];
  copy.splice(Math.min(effectiveIndex, copy.length), 0, item);
  return copy;
}

export const AppProvider = ({ children }: { children: ReactNode }) => {
  // Keep the first server and browser render identical. Browser-only storage
  // is restored in the mount effect below, then reconciled with SQLite.
  const [applications, setApplications] = useState<JobApplication[]>(initialJobs);
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [insights, setInsights] = useState<GlobalInsights | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [llmSettings, setLLMSettings] = useState<LLMSettings>(DEFAULT_LLM_SETTINGS);
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [agentModelRoutes, setAgentModelRoutes] = useState<AgentModelRoute[]>([]);
  const [dataReady, setDataReady] = useState(false);

  /* ------------------------- DB collections ------------------------- */

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [interviews, setInterviews] = useState<InterviewEvent[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [mailSettings, setMailSettings] = useState<MailSettings>(EMPTY_MAIL_SETTINGS);
  const [cloudinarySettings, setCloudinarySettings] = useState<CloudinarySettings>(EMPTY_CLOUDINARY_SETTINGS);

  /* ------------------------- Toast notification & throttling ------------------------- */

  const toast = useToast();
  const lastToastRef = useRef<{ message: string; timestamp: number }>({ message: '', timestamp: 0 });

  const showToastError = useCallback(
    (message: string) => {
      const now = Date.now();
      if (lastToastRef.current.message === message && now - lastToastRef.current.timestamp < 1500) {
        return;
      }
      lastToastRef.current = { message, timestamp: now };
      toast.error(message);
    },
    [toast]
  );

  const refreshStats = useCallback(async () => {
    try {
      const data = await fetchStats();
      setStats(data);
    } catch (err) {
      showToastError(`Stats unavailable: ${toErrorMessage(err)}`);
    }
  }, [showToastError]);

  /* ------------------------- Resilient Persistence Helpers ------------------------- */

  const persistEntityWithRollback = useCallback(
    async <T extends { id: string }>(
      collection: string,
      entity: T,
      rollback: () => void,
      actionLabel: string,
      entityLabel?: string
    ): Promise<boolean> => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const res = await fetch(`/api/data/${collection}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entity),
        });
        if (!res.ok) {
          const errMsg = await extractErrorMessage(res);
          throw new Error(errMsg);
        }
        return true;
      } catch (err) {
        rollback();
        const errorDetail = toErrorMessage(err);
        const label = entityLabel ? ` "${entityLabel}"` : '';
        showToastError(`Failed to ${actionLabel}${label}: ${errorDetail}. Changes rolled back.`);
        return false;
      }
    },
    [showToastError]
  );

  const deleteEntityWithRollback = useCallback(
    async (
      collection: string,
      id: string,
      rollback: () => void,
      actionLabel: string,
      entityLabel?: string
    ): Promise<boolean> => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const res = await fetch(`/api/data/${collection}/${id}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const errMsg = await extractErrorMessage(res);
          throw new Error(errMsg);
        }
        return true;
      } catch (err) {
        rollback();
        const errorDetail = toErrorMessage(err);
        const label = entityLabel ? ` "${entityLabel}"` : '';
        showToastError(`Failed to delete ${actionLabel}${label}: ${errorDetail}. Restored.`);
        return false;
      }
    },
    [showToastError]
  );

  const persistSettingsWithRollback = useCallback(
    async (
      key: string,
      value: string,
      rollback: () => void,
      actionLabel: string
    ): Promise<boolean> => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const res = await fetch('/api/data/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: value }),
        });
        if (!res.ok) {
          const errMsg = await extractErrorMessage(res);
          throw new Error(errMsg);
        }
        return true;
      } catch (err) {
        rollback();
        const errorDetail = toErrorMessage(err);
        showToastError(`Failed to ${actionLabel}: ${errorDetail}. Changes rolled back.`);
        return false;
      }
    },
    [showToastError]
  );

  const applyDataPayload = useCallback(
    (data: {
      jobs?: JobApplication[];
      contacts?: Contact[];
      emails?: EmailMessage[];
      interviews?: InterviewEvent[];
      reminders?: Reminder[];
      settings?: Record<string, string>;
    }, offlineProfileBase?: UserProfile | null) => {
      if (Array.isArray(data.jobs)) {
        setApplications(data.jobs);
        try { localStorage.setItem('job_finder_apps', JSON.stringify(data.jobs)); } catch { /* quota — SQLite remains source of truth */ }
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
            const base = offlineProfileBase ?? readStorage<UserProfile | null>('job_finder_profile', null) ?? initialProfile;
            try { localStorage.setItem('job_finder_profile', JSON.stringify({ ...base, ...dbProfile })); } catch { /* quota — SQLite remains source of truth */ }
          } catch {
            /* corrupt profile — keep local */
          }
        }
        if (data.settings.insights) {
          try { setInsights(JSON.parse(data.settings.insights)); } catch { /* corrupt insights */ }
        }
        if (data.settings.mail_settings) {
          try { setMailSettings({ ...EMPTY_MAIL_SETTINGS, ...JSON.parse(data.settings.mail_settings) }); } catch { /* corrupt */ }
        }
        if (data.settings.cloudinary_settings) {
          try { setCloudinarySettings({ ...EMPTY_CLOUDINARY_SETTINGS, ...JSON.parse(data.settings.cloudinary_settings) }); } catch { /* corrupt */ }
        }
        if (data.settings.llm_agent_routes) {
          try {
            const parsed = JSON.parse(data.settings.llm_agent_routes) as AgentModelRoute[];
            if (Array.isArray(parsed)) setAgentModelRoutes(parsed);
          } catch { /* corrupt per-agent model routes */ }
        }
        if (data.settings.llm_providers) {
          try {
            const parsed = JSON.parse(data.settings.llm_providers) as LLMProvider[];
            if (Array.isArray(parsed) && parsed.length) {
              setProviders(parsed);
              const first = parsed.find((p) => p.enabled);
              if (first) setLLMSettings(llmSettingsFrom(first));
            }
          } catch { /* corrupt chain */ }
        }
      }
    },
    []
  );

  const refreshData = useCallback(async () => {
    const results = await Promise.allSettled([
      fetch('/api/data', { cache: 'no-store' }),
      fetch('/api/vault', { cache: 'no-store' }),
    ]);
    const dataResult = results[0];
    const vaultResult = results[1];

    if (dataResult.status === 'fulfilled' && dataResult.value.ok) {
      try {
        const data = await dataResult.value.json();
        applyDataPayload(data);
      } catch (err) {
        showToastError(`Data refresh failed: ${toErrorMessage(err)}`);
      }
    } else if (dataResult.status === 'fulfilled' && !dataResult.value.ok) {
      showToastError(`Data refresh failed: ${dataResult.value.status}`);
    } else if (dataResult.status === 'rejected') {
      showToastError(`Data refresh failed: ${toErrorMessage(dataResult.reason)}`);
    }

    if (vaultResult.status === 'fulfilled' && vaultResult.value.ok) {
      try {
        const v = await vaultResult.value.json();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('huntflow:vault-refreshed', { detail: v }));
        }
      } catch (err) {
        showToastError(`Vault refresh failed: ${toErrorMessage(err)}`);
      }
    } else if (vaultResult.status === 'rejected') {
      showToastError(`Vault refresh failed: ${toErrorMessage(vaultResult.reason)}`);
    }

    try {
      const data = await fetchStats();
      setStats(data);
    } catch (err) {
      showToastError(`Stats unavailable: ${toErrorMessage(err)}`);
    }
    setDataReady(true);
  }, [applyDataPayload, showToastError]);

  /* Hydrate from the DB once on mount; localStorage is the offline fallback. */
  useEffect(() => {
    let cancelled = false;
    const storageWasReset = storageResetIfStale();
    const offlineApplications = storageWasReset
      ? initialJobs
      : readStorage<JobApplication[]>('job_finder_apps', initialJobs);
    const storedProfile = storageWasReset
      ? null
      : readStorage<UserProfile | null>('job_finder_profile', null);
    const offlineProfile = storedProfile &&
      (storedProfile.name === 'Alex Rivera' || storedProfile.email === 'alex.rivera@example.com')
      ? { ...storedProfile, ...initialProfile }
      : storedProfile ?? initialProfile;
    const offlineInsights = storageWasReset
      ? null
      : readStorage<GlobalInsights | null>('huntflow_insights', null);
    const offlineLLMSettings = readStorage(PROVIDER_STORAGE_KEY, DEFAULT_LLM_SETTINGS);
    const offlineAgentModelRoutes = storageWasReset
      ? []
      : readStorage<AgentModelRoute[]>(AGENT_ROUTING_STORAGE_KEY, []);

    const hydrate = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setApplications(offlineApplications);
      setProfile(offlineProfile);
      setInsights(offlineInsights);
      setLLMSettings(offlineLLMSettings);
      setAgentModelRoutes(offlineAgentModelRoutes);

      try {
        const res = await fetch('/api/data', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        applyDataPayload(data, offlineProfile);
        // Warm vault cache in parallel — hydration reflects imported docs without reload
        fetch('/api/vault', { cache: 'no-store' })
          .then(async (r) => {
            if (!r.ok || cancelled) return;
            try {
              const v = await r.json();
              window.dispatchEvent(new CustomEvent('huntflow:vault-refreshed', { detail: v }));
            } catch (err) {
              if (!cancelled) showToastError(`Vault warm failed: ${toErrorMessage(err)}`);
            }
          })
          .catch((err) => {
            if (!cancelled) showToastError(`Vault warm failed: ${toErrorMessage(err)}`);
          });
        if (!cancelled) setDataReady(true);
      } catch (err) {
        if (!cancelled) {
          showToastError(`Hydration failed: ${toErrorMessage(err)}`);
          setDataReady(true);
        }
      }
    };
    hydrate();
    fetchStats()
      .then((d) => {
        if (!cancelled && d) setStats(d);
      })
      .catch((err) => {
        if (!cancelled) showToastError(`Stats unavailable: ${toErrorMessage(err)}`);
      });
    return () => { cancelled = true; };
  }, [applyDataPayload, showToastError]);

  /* LocalStorage mirrors stay for offline fallback */
  useEffect(() => {
    if (dataReady) localStorage.setItem('job_finder_apps', JSON.stringify(applications));
  }, [applications, dataReady]);

  useEffect(() => {
    if (dataReady) localStorage.setItem('job_finder_profile', JSON.stringify(profile));
  }, [profile, dataReady]);

  useEffect(() => {
    if (dataReady) {
      localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify({
        providerId: llmSettings.providerId,
        apiKey: "",
        model: llmSettings.model,
        baseURL: llmSettings.baseURL,
        temperature: llmSettings.temperature,
      }));
    }
  }, [llmSettings, dataReady]);

  useEffect(() => {
    if (dataReady) localStorage.setItem(AGENT_ROUTING_STORAGE_KEY, JSON.stringify(agentModelRoutes));
  }, [agentModelRoutes, dataReady]);

  useEffect(() => {
    if (!dataReady) return;
    if (insights) localStorage.setItem('huntflow_insights', JSON.stringify(insights));
    else localStorage.removeItem('huntflow_insights');
  }, [insights, dataReady]);

  /* ------------------------- Settings & Providers ------------------------- */

  const updateProviders = useCallback(
    (chain: LLMProvider[]) => {
      setProviders((prev) => {
        const prevProviders = prev;
        const prevLLMSettings = llmSettings;
        localStorage.setItem('huntflow_provider_chain', JSON.stringify(chain));
        const first = chain.find((p) => p.enabled);
        if (first) setLLMSettings(llmSettingsFrom(first));

        void persistSettingsWithRollback(
          'llm_providers',
          JSON.stringify(chain),
          () => {
            setProviders(prevProviders);
            localStorage.setItem('huntflow_provider_chain', JSON.stringify(prevProviders));
            setLLMSettings(prevLLMSettings);
          },
          'update LLM provider chain'
        );
        return chain;
      });
    },
    [llmSettings, persistSettingsWithRollback]
  );

  const updateAgentModelRoutes = useCallback(
    (routes: AgentModelRoute[]) => {
      setAgentModelRoutes((previous) => {
        localStorage.setItem(AGENT_ROUTING_STORAGE_KEY, JSON.stringify(routes));
        void persistSettingsWithRollback(
          'llm_agent_routes',
          JSON.stringify(routes),
          () => {
            setAgentModelRoutes(previous);
            localStorage.setItem(AGENT_ROUTING_STORAGE_KEY, JSON.stringify(previous));
          },
          'update per-agent model routing'
        );
        return routes;
      });
    },
    [persistSettingsWithRollback]
  );

  const saveMailSettings = useCallback(
    (s: MailSettings) => {
      setMailSettings((prev) => {
        const prevMail = prev;
        void persistSettingsWithRollback(
          'mail_settings',
          JSON.stringify(s),
          () => setMailSettings(prevMail),
          'save mail settings'
        );
        return s;
      });
    },
    [persistSettingsWithRollback]
  );

  const saveCloudinarySettings = useCallback(
    async (s: CloudinarySettings) => {
      const prevCloudinary = cloudinarySettings;
      setCloudinarySettings(s);
      await persistSettingsWithRollback(
        'cloudinary_settings',
        JSON.stringify(s),
        () => setCloudinarySettings(prevCloudinary),
        'save Cloudinary settings'
      );
    },
    [cloudinarySettings, persistSettingsWithRollback]
  );

  const updateProfile = useCallback(
    (newProfile: UserProfile) => {
      setProfile((prev) => {
        const prevProfile = prev;
        localStorage.setItem('job_finder_profile', JSON.stringify(newProfile));
        void persistSettingsWithRollback(
          'profile',
          JSON.stringify(newProfile),
          () => {
            setProfile(prevProfile);
            localStorage.setItem('job_finder_profile', JSON.stringify(prevProfile));
          },
          'save profile'
        );
        return newProfile;
      });
    },
    [persistSettingsWithRollback]
  );

  /* After marking a job as applied, scan the inbox for any mail from that
     company (replies, rejection/offer notices) and fold them into the app. */
  const syncInboxAfterApply = useCallback(async () => {
    try {
      const res = await fetch('/api/mail/sync', { method: 'POST', cache: 'no-store' });
      if (!res.ok) return;
      const full = await fetch('/api/data', { cache: 'no-store' });
      if (full.ok) {
        const d = await full.json();
        if (Array.isArray(d?.emails)) {
          setEmails((prev) => {
            const existingIds = new Set(prev.map((e) => e.id));
            const additions = d.emails.filter((e: EmailMessage) => !existingIds.has(e.id));
            return additions.length > 0 ? [...prev, ...additions] : prev;
          });
        }
        if (Array.isArray(d?.interviews)) {
          setInterviews((prev) => {
            const existingIds = new Set(prev.map((i) => i.id));
            const additions = d.interviews.filter((i: InterviewEvent) => !existingIds.has(i.id));
            return additions.length > 0 ? [...prev, ...additions] : prev;
          });
        }
      }
      refreshStats();
    } catch (err) {
      showToastError(`Inbox sync failed: ${toErrorMessage(err)}`);
    }
  }, [refreshStats, showToastError]);

  /* ------------------------- Applications CRUD ------------------------- */

  const addApplication = useCallback(
    (data: Omit<JobApplication, 'id' | 'createdDate'>): JobApplication => {
      const newApp: JobApplication = {
        ...data,
        id: 'job-' + Date.now(),
        createdDate: new Date().toISOString().split('T')[0],
        autoApplyStatus: data.autoApplyStatus || 'idle',
        autoApplyLogs: data.autoApplyLogs || [],
      };
      setApplications((prev) => [newApp, ...prev]);
      refreshStats();

      void persistEntityWithRollback(
        'jobs',
        newApp,
        () => {
          setApplications((prev) => prev.filter((app) => app.id !== newApp.id));
          refreshStats();
        },
        'add application',
        newApp.title || 'Untitled'
      );
      return newApp;
    },
    [persistEntityWithRollback, refreshStats]
  );

  const updateApplication = useCallback(
    (id: string, partial: Partial<JobApplication>) => {
      setApplications((prev) => {
        const target = prev.find((a) => a.id === id);
        if (!target) return prev;
        const previous = target;
        const justApplied = partial.status === 'applied' && target.status !== 'applied';
        const updated = { ...target, ...partial };

        void (async () => {
          const ok = await persistEntityWithRollback(
            'jobs',
            updated,
            () => {
              setApplications((curr) => curr.map((app) => (app.id === id ? previous : app)));
              refreshStats();
            },
            'update application',
            target.title || 'Job'
          );
          if (ok && justApplied) {
            syncInboxAfterApply();
          }
        })();

        return prev.map((app) => (app.id === id ? updated : app));
      });
      refreshStats();
    },
    [persistEntityWithRollback, refreshStats, syncInboxAfterApply]
  );

  const deleteApplication = useCallback(
    (id: string) => {
      setApplications((prev) => {
        const targetIndex = prev.findIndex((a) => a.id === id);
        if (targetIndex === -1) return prev;
        const previous = prev[targetIndex];
        const snapshot = prev;

        void deleteEntityWithRollback(
          'jobs',
          id,
          () => {
            setApplications((curr) => restoreEntityAtOriginalIndex(curr, previous, snapshot, targetIndex));
            refreshStats();
          },
          'application',
          previous.title || 'Job'
        );

        return prev.filter((app) => app.id !== id);
      });
      refreshStats();
    },
    [deleteEntityWithRollback, refreshStats]
  );

  /* ------------------------- Contacts ------------------------- */

  const addContact = useCallback(
    (data: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>): Contact => {
      const now = new Date().toISOString();
      const contact: Contact = { ...data, id: 'c-' + Date.now(), createdAt: now, updatedAt: now };
      setContacts((prev) => [contact, ...prev]);
      refreshStats();

      void persistEntityWithRollback(
        'contacts',
        contact,
        () => {
          setContacts((prev) => prev.filter((c) => c.id !== contact.id));
          refreshStats();
        },
        'add contact',
        contact.name || 'Contact'
      );
      return contact;
    },
    [persistEntityWithRollback, refreshStats]
  );

  const updateContact = useCallback(
    (id: string, partial: Partial<Contact>) => {
      setContacts((prev) => {
        const target = prev.find((c) => c.id === id);
        if (!target) return prev;
        const previous = target;
        const updated = { ...target, ...partial, updatedAt: new Date().toISOString() };

        void persistEntityWithRollback(
          'contacts',
          updated,
          () => {
            setContacts((curr) => curr.map((c) => (c.id === id ? previous : c)));
            refreshStats();
          },
          'update contact',
          target.name || 'Contact'
        );

        return prev.map((c) => (c.id === id ? updated : c));
      });
      refreshStats();
    },
    [persistEntityWithRollback, refreshStats]
  );

  const deleteContact = useCallback(
    (id: string) => {
      setContacts((prev) => {
        const targetIndex = prev.findIndex((c) => c.id === id);
        if (targetIndex === -1) return prev;
        const previous = prev[targetIndex];
        const snapshot = prev;

        void deleteEntityWithRollback(
          'contacts',
          id,
          () => {
            setContacts((curr) => restoreEntityAtOriginalIndex(curr, previous, snapshot, targetIndex));
            refreshStats();
          },
          'contact',
          previous.name || 'Contact'
        );

        return prev.filter((c) => c.id !== id);
      });
      refreshStats();
    },
    [deleteEntityWithRollback, refreshStats]
  );

  /* ------------------------- Emails ------------------------- */

  const addEmail = useCallback(
    (data: Omit<EmailMessage, 'id' | 'sentAt'>): EmailMessage => {
      const email: EmailMessage = { ...data, id: 'e-' + Date.now(), sentAt: new Date().toISOString() };
      setEmails((prev) => [email, ...prev]);

      void persistEntityWithRollback(
        'emails',
        email,
        () => {
          setEmails((prev) => prev.filter((e) => e.id !== email.id));
        },
        'save email',
        email.subject || 'Email'
      );
      return email;
    },
    [persistEntityWithRollback]
  );

  const updateEmail = useCallback(
    (id: string, partial: Partial<EmailMessage>) => {
      setEmails((prev) => {
        const target = prev.find((e) => e.id === id);
        if (!target) return prev;
        const previous = target;
        const updated = { ...target, ...partial };

        void persistEntityWithRollback(
          'emails',
          updated,
          () => {
            setEmails((curr) => curr.map((e) => (e.id === id ? previous : e)));
          },
          'update email',
          target.subject || 'Email'
        );

        return prev.map((e) => (e.id === id ? updated : e));
      });
    },
    [persistEntityWithRollback]
  );

  const deleteEmail = useCallback(
    (id: string) => {
      setEmails((prev) => {
        const targetIndex = prev.findIndex((e) => e.id === id);
        if (targetIndex === -1) return prev;
        const previous = prev[targetIndex];
        const snapshot = prev;

        void deleteEntityWithRollback(
          'emails',
          id,
          () => {
            setEmails((curr) => restoreEntityAtOriginalIndex(curr, previous, snapshot, targetIndex));
          },
          'email',
          previous.subject || 'Email'
        );

        return prev.filter((e) => e.id !== id);
      });
    },
    [deleteEntityWithRollback]
  );

  /* ------------------------- Interviews ------------------------- */

  const addInterview = useCallback(
    (data: Omit<InterviewEvent, 'id' | 'createdAt'>): InterviewEvent => {
      const interview: InterviewEvent = { ...data, id: 'i-' + Date.now(), createdAt: new Date().toISOString() };
      setInterviews((prev) => [...prev, interview]);
      refreshStats();

      void persistEntityWithRollback(
        'interviews',
        interview,
        () => {
          setInterviews((prev) => prev.filter((it) => it.id !== interview.id));
          refreshStats();
        },
        'schedule interview',
        interview.title || 'Interview'
      );
      return interview;
    },
    [persistEntityWithRollback, refreshStats]
  );

  const updateInterview = useCallback(
    (id: string, partial: Partial<InterviewEvent>) => {
      setInterviews((prev) => {
        const target = prev.find((it) => it.id === id);
        if (!target) return prev;
        const previous = target;
        const updated = { ...target, ...partial };

        void persistEntityWithRollback(
          'interviews',
          updated,
          () => {
            setInterviews((curr) => curr.map((it) => (it.id === id ? previous : it)));
            refreshStats();
          },
          'update interview',
          target.title || 'Interview'
        );

        return prev.map((it) => (it.id === id ? updated : it));
      });
      refreshStats();
    },
    [persistEntityWithRollback, refreshStats]
  );

  const deleteInterview = useCallback(
    (id: string) => {
      setInterviews((prev) => {
        const targetIndex = prev.findIndex((it) => it.id === id);
        if (targetIndex === -1) return prev;
        const previous = prev[targetIndex];
        const snapshot = prev;

        void deleteEntityWithRollback(
          'interviews',
          id,
          () => {
            setInterviews((curr) => restoreEntityAtOriginalIndex(curr, previous, snapshot, targetIndex));
            refreshStats();
          },
          'interview',
          previous.title || 'Interview'
        );

        return prev.filter((it) => it.id !== id);
      });
      refreshStats();
    },
    [deleteEntityWithRollback, refreshStats]
  );

  /* ------------------------- Reminders ------------------------- */

  const addReminder = useCallback(
    (data: Omit<Reminder, 'id' | 'createdAt'>): Reminder => {
      const reminder: Reminder = { ...data, id: 'r-' + Date.now(), createdAt: new Date().toISOString() };
      setReminders((prev) => [...prev, reminder]);
      refreshStats();

      void persistEntityWithRollback(
        'reminders',
        reminder,
        () => {
          setReminders((prev) => prev.filter((r) => r.id !== reminder.id));
          refreshStats();
        },
        'create reminder',
        reminder.note || 'Reminder'
      );
      return reminder;
    },
    [persistEntityWithRollback, refreshStats]
  );

  const toggleReminder = useCallback(
    (id: string) => {
      setReminders((prev) => {
        const target = prev.find((r) => r.id === id);
        if (!target) return prev;
        const previous = target;
        const updated = { ...target, done: !target.done };

        void persistEntityWithRollback(
          'reminders',
          updated,
          () => {
            setReminders((curr) => curr.map((r) => (r.id === id ? previous : r)));
            refreshStats();
          },
          'toggle reminder',
          target.note || 'Reminder'
        );

        return prev.map((r) => (r.id === id ? updated : r));
      });
      refreshStats();
    },
    [persistEntityWithRollback, refreshStats]
  );

  const deleteReminder = useCallback(
    (id: string) => {
      setReminders((prev) => {
        const targetIndex = prev.findIndex((r) => r.id === id);
        if (targetIndex === -1) return prev;
        const previous = prev[targetIndex];
        const snapshot = prev;

        void deleteEntityWithRollback(
          'reminders',
          id,
          () => {
            setReminders((curr) => restoreEntityAtOriginalIndex(curr, previous, snapshot, targetIndex));
            refreshStats();
          },
          'reminder',
          previous.note || 'Reminder'
        );

        return prev.filter((r) => r.id !== id);
      });
      refreshStats();
    },
    [deleteEntityWithRollback, refreshStats]
  );

  /* ------------------------- Scrape ------------------------- */

  const scrapeJobOffer = useCallback(async (url: string): Promise<ScrapedJob> => {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Failed to scrape job offer.');
    return data;
  }, []);

  /* ------------------------- AI generation ------------------------- */

  const callGenerate = useCallback(async (payload: GeneratePayload) => {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || data?.error || 'AI generation failed.');
    return data;
  }, []);

  const jobPayload = useCallback(
    (job: JobApplication) => ({
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      salary: job.salary,
      url: job.url,
      jobDescription: job.jobDescription,
      matchScore: job.matchScore,
      status: job.status,
    }),
    []
  );

  const generateDocuments = useCallback(
    async (jobId: string, options?: { tone?: string; focusSkills?: string[] }): Promise<TailoredDocuments> => {
      const job = applications.find((a) => a.id === jobId);
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
    },
    [applications, callGenerate, jobPayload, llmSettings, profile, updateApplication]
  );

  const generateDocument = useCallback(
    async (
      jobId: string,
      docType: 'tailoredResume' | 'coverLetter' | 'motivationLetter' | 'followUpEmail',
      options?: { tone?: string; focusSkills?: string[] }
    ): Promise<TailoredDocuments> => {
      const job = applications.find((a) => a.id === jobId);
      if (!job) throw new Error('Job not found.');
      const data = await callGenerate({
        type: 'documents',
        job: jobPayload(job),
        profile,
        options: { ...options, docType },
        llmSettings,
      });
      const docs: TailoredDocuments = data.documents || {};
      updateApplication(jobId, { documents: { ...job.documents, ...docs } });
      return docs;
    },
    [applications, callGenerate, jobPayload, llmSettings, profile, updateApplication]
  );

  const generateMatchAnalysis = useCallback(
    async (jobId: string): Promise<SkillsGapAnalysis> => {
      const job = applications.find((a) => a.id === jobId);
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
    },
    [applications, callGenerate, jobPayload, llmSettings, profile, updateApplication]
  );

  const generateSTARCards = useCallback(
    async (jobId: string): Promise<STARCard[]> => {
      const job = applications.find((a) => a.id === jobId);
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
    },
    [applications, callGenerate, jobPayload, llmSettings, profile, updateApplication]
  );

  const generateInterviewQuestions = useCallback(
    async (jobId: string): Promise<InterviewQuestion[]> => {
      const job = applications.find((a) => a.id === jobId);
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
    },
    [applications, callGenerate, jobPayload, llmSettings, profile, updateApplication]
  );

  const generateJobBrief = useCallback(
    async (jobId: string): Promise<JobBrief> => {
      const job = applications.find((a) => a.id === jobId);
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
    },
    [applications, callGenerate, jobPayload, llmSettings, profile, updateApplication]
  );

  const generateSalaryIntel = useCallback(
    async (jobId: string): Promise<SalaryIntel> => {
      const job = applications.find((a) => a.id === jobId);
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
    },
    [applications, callGenerate, jobPayload, llmSettings, profile, updateApplication]
  );

  const generateGlobalInsights = useCallback(async (): Promise<GlobalInsights> => {
    setLoadingInsights(true);
    const gaps = Array.from(
      new Set(applications.flatMap((a) => a.skillsGap?.missingSkills ?? []))
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
      void persistSettingsWithRollback(
        'insights',
        JSON.stringify(next),
        () => setInsights(null),
        'save global insights'
      );
      return next;
    } finally {
      setLoadingInsights(false);
    }
  }, [applications, callGenerate, llmSettings, persistSettingsWithRollback, profile]);

  /* ------------------------- Auto-apply agent ------------------------- */

  const triggerAutoApply = useCallback(
    async (jobId: string, opts?: { submit?: boolean }) => {
      const job = applications.find((a) => a.id === jobId);
      if (!job) return { status: 'failed' as const, matchScore: null };

      const submit = opts?.submit ?? false;
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
            llmSettings,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Agent execution failed.');

        const finalStatus: 'applied' | 'manual_required' | 'failed' | 'skipped' =
          data.status === 'applied'
            ? 'applied'
            : data.status === 'skipped'
            ? 'skipped'
            : data.status === 'manual_required'
            ? 'manual_required'
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
    },
    [applications, jobPayload, llmSettings, profile, updateApplication]
  );

  const triggerAutoApplyBatch = useCallback(
    async (
      jobIds: string[],
      opts?: { submit?: boolean; concurrency?: number }
    ) => {
      const limitConcurrency = Math.max(1, Math.min(opts?.concurrency || cloudinarySettings.concurrency || 3, 8));
      let completed = 0;
      let failed = 0;

      const queue = [...jobIds];
      const workers = Array.from({ length: limitConcurrency }).map(async () => {
        while (queue.length > 0) {
          const id = queue.shift();
          if (!id) break;
          try {
            const res = await triggerAutoApply(id, opts);
            if (res.status === 'applied' || res.status === 'manual_required') {
              completed++;
            } else {
              failed++;
            }
          } catch {
            failed++;
          }
        }
      });

      await Promise.all(workers);
      return { completed, failed };
    },
    [cloudinarySettings.concurrency, triggerAutoApply]
  );

  const triggerMatchBatch = useCallback(
    async (jobIds: string[], concurrency = 4) => {
      const queue = [...jobIds];
      const workers = Array.from({ length: Math.max(1, Math.min(concurrency, 8)) }).map(async () => {
        while (queue.length > 0) {
          const id = queue.shift();
          if (!id) break;
          try {
            await generateMatchAnalysis(id);
          } catch {
            /* ignore failures in batch */
          }
        }
      });
      await Promise.all(workers);
    },
    [generateMatchAnalysis]
  );

  /* ------------------------- Flashcards ------------------------- */

  const updateCardStatus = useCallback(
    (jobId: string, cardId: string, status: 'unstudied' | 'learning' | 'mastered') => {
      const job = applications.find((a) => a.id === jobId);
      if (!job || !job.starFlashcards) return;
      const updatedCards = job.starFlashcards.map((card) => (card.id === cardId ? { ...card, status } : card));
      updateApplication(jobId, { starFlashcards: updatedCards });
    },
    [applications, updateApplication]
  );

  /* ------------------------- LinkedIn ------------------------- */

  const checkLinkedInSession = useCallback(async (): Promise<LinkedInLoginResult> => {
    const res = await fetch('/api/linkedin/session', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        authenticated: false,
        state: "error",
        reason: data?.error || "LinkedIn session check failed.",
        recovery: "Confirm the Scrapling agent is running, then retry.",
        method: "session_check",
      };
    }
    return data as LinkedInLoginResult;
  }, []);

  const openLinkedInLogin = useCallback(async (): Promise<LinkedInLoginResult> => {
    const res = await fetch('/api/linkedin/login', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'LinkedIn login window failed.');
    return {
      authenticated: Boolean(data?.authenticated),
      profile: data?.profile as LinkedInProfileData | undefined,
      checkpoint: Boolean(data?.checkpoint),
      state: data?.state,
      reason: data?.reason,
      recovery: data?.recovery,
      method: data?.method,
      checkedAt: data?.checkedAt,
    };
  }, []);

  const logoutLinkedIn = useCallback(async (): Promise<void> => {
    await fetch('/api/linkedin/logout', { method: 'POST' });
  }, []);

  const importLinkedInProfile = useCallback(async (handle: string): Promise<LinkedInProfileData> => {
    const res = await fetch('/api/linkedin/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: handle }),
    });
    const data = await res.json();
    if (!res.ok || !data.authenticated) {
      throw new Error(data?.error || 'LinkedIn session expired or unavailable.');
    }
    return data.profile;
  }, []);

  const searchLinkedInJobs = useCallback(async (searchUrl: string): Promise<LinkedInJob[]> => {
    const res = await fetch('/api/linkedin/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: searchUrl }),
    });
    const data = await res.json();
    if (!res.ok || !data.authenticated) {
      throw new Error(data?.error || 'LinkedIn session expired or search failed.');
    }
    return data.jobs || [];
  }, []);

  const saveLinkedInJob = useCallback(
    (job: LinkedInJob): JobApplication => {
      return addApplication({
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.url,
        status: 'wishlist',
        jobDescription: `${job.title} at ${job.company} (${job.location}). Imported from LinkedIn search.`,
        notes: 'Imported from LinkedIn Jobs search.',
      });
    },
    [addApplication]
  );

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
      agentModelRoutes,
      updateAgentModelRoutes,
      dataReady,
      contacts,
      emails,
      interviews,
      reminders,
      stats,
      refreshStats,
      refreshData,
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
      cloudinarySettings,
      saveCloudinarySettings,
      scrapeJobOffer,
      generateDocuments,
      generateDocument,
      generateMatchAnalysis,
      generateSTARCards,
      generateInterviewQuestions,
      generateJobBrief,
      generateSalaryIntel,
      generateGlobalInsights,
      triggerAutoApply,
      triggerAutoApplyBatch,
      triggerMatchBatch,
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
      agentModelRoutes,
      dataReady,
      contacts,
      emails,
      interviews,
      reminders,
      stats,
      mailSettings,
      cloudinarySettings,
      setLLMSettings,
      updateProviders,
      updateAgentModelRoutes,
      refreshStats,
      refreshData,
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
      saveCloudinarySettings,
      scrapeJobOffer,
      generateDocuments,
      generateDocument,
      generateMatchAnalysis,
      generateSTARCards,
      generateInterviewQuestions,
      generateJobBrief,
      generateSalaryIntel,
      generateGlobalInsights,
      triggerAutoApply,
      triggerAutoApplyBatch,
      triggerMatchBatch,
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
