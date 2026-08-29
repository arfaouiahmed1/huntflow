import { describe, it, expect, beforeEach } from "vitest";
import { POST as POST_COLLECTION } from "@/app/api/data/[collection]/route";
import { GET as GET_STATS } from "@/app/api/data/stats/route";
import { GET as GET_EXPORT } from "@/app/api/data/export/route";
import { POST as POST_IMPORT } from "@/app/api/data/import/route";
import { POST as POST_RESET } from "@/app/api/data/reset/route";
import { POST as POST_CRAWL } from "@/app/api/crawl/route";
import { POST as POST_GENERATE } from "@/app/api/generate/route";
import { GET as GET_VAULT, POST as POST_VAULT } from "@/app/api/vault/route";
import { GET as GET_VAULT_SEARCH, POST as POST_VAULT_SEARCH } from "@/app/api/vault/search/route";
import { GET as GET_RESUME, POST as POST_RESUME, PUT as PUT_RESUME } from "@/app/api/resume/route";
import { POST as POST_COMPILE } from "@/app/api/resume/compile/route";
import { POST as POST_ATS } from "@/app/api/resume/ats/route";
import { POST as POST_FORWARD } from "@/app/api/resume/synctex/forward/route";
import { POST as POST_REVERSE } from "@/app/api/resume/synctex/reverse/route";
import { POST as POST_PARTIAL_PIPELINE } from "@/app/api/agent/partial-pipeline/route";
import { POST as POST_ASSISTANT } from "@/app/api/assistant/route";
import { GET as GET_MEMORY, POST as POST_MEMORY } from "@/app/api/memory/route";
import {
  createJsonRequest,
  createFormDataRequest,
  createUrlRequest,
  createRouteContext,
  parseResponse,
  resetTestDb,
  jobsRepo,
  contactsRepo,
  emailsRepo,
  interviewsRepo,
  remindersRepo,
  memoryRepo,
  resumeRepo,
  notificationsRepo,
  isSeeded,
} from "../helpers/testHarness";
import {
  mockUserProfile,
  mockJobApplication1,
  mockJobApplication2,
  mockJobApplication3,
  mockContact,
  mockEmail,
  mockInterview,
  mockReminder,
  mockResumeDoc,
  sampleJobDescription,
  sampleLatexResume,
} from "../helpers/testFixtures";
import { JobApplication, ResumeDoc, VaultDoc, MemoryEntry } from "@/types";

const POST_SETTINGS = POST_COLLECTION;

describe("Tier 4: Real-World Scenarios — Full-Lifecycle Candidate Career Automation", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("Journey 1: The Complete Candidate Job Application Lifecycle (Discovery -> Track -> Fit -> Prep -> Apply -> Stats)", async () => {
    // 1. Live Discovery Crawl
    const crawlReq = createJsonRequest("http://localhost/api/crawl", "POST", {
      category: "frontend",
      keyword: "TypeScript",
      limit: 10,
    });
    const crawlRes = await POST_CRAWL(crawlReq);
    expect(crawlRes.status).toBe(200);

    // 2. Track Opportunity with Screenshot proof
    const newJob: JobApplication = {
      ...mockJobApplication1,
      id: "journey1-job-apex",
      title: "Senior Full-Stack Architect",
      company: "Apex Innovations",
      status: "wishlist",
      screenshotUrl: "proof-apex-journey.png",
      cloudinaryUrl: "https://res.cloudinary.com/huntflow/apex-journey.png",
    };
    const trackReq = createJsonRequest("http://localhost/api/data/jobs", "POST", newJob);
    const trackRes = await POST_COLLECTION(trackReq, createRouteContext({ collection: "jobs" }));
    expect(trackRes.status).toBe(200);
    expect(jobsRepo.get("journey1-job-apex")?.screenshotUrl).toBe("proof-apex-journey.png");

    // 3. Deep Fit Scoring & Skills Gap Analysis
    const fitReq = createJsonRequest("http://localhost/api/generate", "POST", {
      type: "match_analysis",
      job: newJob,
      profile: mockUserProfile,
    });
    const fitRes = await POST_GENERATE(fitReq);
    expect(fitRes.status).toBe(200);
    const fitData = await parseResponse<{ analysis: { matchScore: number } }>(fitRes);
    expect(fitData.analysis.matchScore).toBeGreaterThan(0);

    // 4. Behavioral Interview Preparation Flashcards
    const starReq = createJsonRequest("http://localhost/api/generate", "POST", {
      type: "star_flashcards",
      job: newJob,
      profile: mockUserProfile,
    });
    const starRes = await POST_GENERATE(starReq);
    expect(starRes.status).toBe(200);
    const starData = await parseResponse<{ cards: unknown[] }>(starRes);
    expect(starData.cards.length).toBeGreaterThan(0);

    // 5. Tailored Resume Generation & ATS Scoring
    const atsReq = createJsonRequest("http://localhost/api/resume/ats", "POST", {
      tex: sampleLatexResume,
      jobDescription: sampleJobDescription,
    });
    const atsRes = await POST_ATS(atsReq);
    expect(atsRes.status).toBe(200);

    // 6. LaTeX Compilation
    const compileReq = createJsonRequest("http://localhost/api/resume/compile", "POST", {
      tex: sampleLatexResume,
    });
    const compileRes = await POST_COMPILE(compileReq);
    expect(compileRes.status).toBe(200);

    // 7. Multi-Agent Partial Pipeline Execution
    const agentReq = createJsonRequest("http://localhost/api/agent/partial-pipeline", "POST", {
      jobId: "journey1-job-apex",
      profile: mockUserProfile,
      targetRegion: "US",
      step: "audit",
    });
    const agentRes = await POST_PARTIAL_PIPELINE(agentReq);
    expect(agentRes.status).toBe(200);

    // 8. Outreach Email & Reminder Logging
    const emailReq = createJsonRequest("http://localhost/api/data/emails", "POST", {
      ...mockEmail,
      id: "email-journey1",
      jobId: "journey1-job-apex",
    });
    await POST_COLLECTION(emailReq, createRouteContext({ collection: "emails" }));

    const reminderReq = createJsonRequest("http://localhost/api/data/reminders", "POST", {
      ...mockReminder,
      id: "reminder-journey1",
      refId: "journey1-job-apex",
    });
    await POST_COLLECTION(reminderReq, createRouteContext({ collection: "reminders" }));

    // 9. Update Status to Applied
    const applyReq = createJsonRequest("http://localhost/api/data/jobs", "POST", {
      ...newJob,
      status: "applied",
      appliedDate: "2026-08-18",
    });
    await POST_COLLECTION(applyReq, createRouteContext({ collection: "jobs" }));

    // 10. Pipeline Funnel Stats
    const statsRes = await GET_STATS();
    const stats = await parseResponse<{ funnel: { status: string; count: number }[] }>(statsRes);
    const appliedCount = stats.funnel.find((f) => f.status === "applied")?.count ?? 0;
    expect(appliedCount).toBeGreaterThan(0);
  });

  it("Journey 2: Candidate Onboarding & Multi-Doc Vault Knowledge Base", async () => {
    // 1. Cold Boot Profile Initialized
    expect(isSeeded()).toBe(true);

    // 2. Candidate Profile Update
    const updatedProfile = {
      ...mockUserProfile,
      name: "Taylor Alexandra",
      targetTitle: "Principal Cloud Systems Architect",
    };
    const settingsReq = createJsonRequest("http://localhost/api/data/settings", "POST", {
      profile: JSON.stringify(updatedProfile),
    });
    const settingsRes = await POST_SETTINGS(settingsReq, createRouteContext({ collection: "settings" }));
    expect(settingsRes.status).toBe(200);

    // 3. Multi-Document Upload to Vault with Labels
    const doc1 = new File([new Blob(["Master Resume Content: React 19, TypeScript, Next.js 16, Distributed Systems"])], "master-resume.txt", { type: "text/plain" });
    const form1 = new FormData();
    form1.append("file", doc1);
    form1.append("label", "master_resume");
    const upload1 = await POST_VAULT(createFormDataRequest("http://localhost/api/vault", form1));
    expect(upload1.status).toBe(200);

    const doc2 = new File([new Blob(["Recommendation Letter: Taylor led the cloud migration reducing costs by 40%"])], "recommendation.txt", { type: "text/plain" });
    const form2 = new FormData();
    form2.append("file", doc2);
    form2.append("label", "recommendation");
    const upload2 = await POST_VAULT(createFormDataRequest("http://localhost/api/vault", form2));
    expect(upload2.status).toBe(200);

    // 4. Verify Document Inventory in Vault
    const vaultRes = await GET_VAULT();
    const vaultData = await parseResponse<{ docs: VaultDoc[]; stats: { docs: number } }>(vaultRes);
    expect(vaultData.docs.length).toBeGreaterThanOrEqual(2);

    // 5. Semantic Search Across Ingested Documents
    const searchPost = await POST_VAULT_SEARCH(createJsonRequest("http://localhost/api/vault/search", "POST", { query: "cloud migration", k: 3 }));
    expect(searchPost.status).toBe(200);
    const searchPostData = await parseResponse<{ hits: { text?: string; chunk?: string }[] }>(searchPost);
    expect(searchPostData.hits.length).toBeGreaterThan(0);

    const searchGet = await GET_VAULT_SEARCH(createUrlRequest("http://localhost/api/vault/search?q=Distributed&k=3"));
    expect(searchGet.status).toBe(200);
    const searchGetData = await parseResponse<{ hits: { text?: string; chunk?: string }[] }>(searchGet);
    expect(searchGetData.hits.length).toBeGreaterThan(0);

    // 6. Standalone Career Recommendations & Skill Roadmap
    const recsRes = await POST_GENERATE(createJsonRequest("http://localhost/api/generate", "POST", {
      type: "recommendations",
      profile: updatedProfile,
    }));
    expect(recsRes.status).toBe(200);

    const roadmapRes = await POST_GENERATE(createJsonRequest("http://localhost/api/generate", "POST", {
      type: "skill_roadmap",
      profile: updatedProfile,
      gaps: ["Rust", "Kubernetes"],
    }));
    expect(roadmapRes.status).toBe(200);
  });

  it("Journey 3: Multi-Document Resume Studio Versioning & Template Engine", async () => {
    // 1. Create Baseline Resume from scratch
    const createReq = createJsonRequest("http://localhost/api/resume", "PUT", {
      name: "Baseline ATS Resume",
      templateId: "classic-ats",
      profile: mockUserProfile,
    });
    const createRes = await PUT_RESUME(createReq);
    expect(createRes.status).toBe(200);
    const { doc: baselineDoc } = await parseResponse<{ doc: ResumeDoc }>(createRes);
    expect(baselineDoc.id).toBeDefined();

    // 2. Create Specialized Version for Frontend Architecture
    const customTexFrontend = sampleLatexResume.replace("Senior Full-Stack Engineer", "Principal Frontend Architect");
    const saveFrontendReq = createJsonRequest("http://localhost/api/resume", "POST", {
      name: "Frontend Architect Specialized Version",
      templateId: "modern-clean",
      tex: customTexFrontend,
      kind: "resume",
    });
    const saveFrontendRes = await POST_RESUME(saveFrontendReq);
    expect(saveFrontendRes.status).toBe(200);

    // 3. Compile LaTeX to PDF Token
    const compileRes = await POST_COMPILE(createJsonRequest("http://localhost/api/resume/compile", "POST", {
      tex: customTexFrontend,
    }));
    expect(compileRes.status).toBe(200);
    const { token } = await parseResponse<{ token: string }>(compileRes);
    expect(token).toBeDefined();

    // 4. Test Bi-directional SyncTeX Mapping
    const forwardRes = await POST_FORWARD(createJsonRequest("http://localhost/api/resume/synctex/forward", "POST", {
      token,
      line: 10,
      column: 1,
    }));
    expect([200, 422]).toContain(forwardRes.status);

    const reverseRes = await POST_REVERSE(createJsonRequest("http://localhost/api/resume/synctex/reverse", "POST", {
      token,
      page: 1,
      x: 100,
      y: 200,
    }));
    expect([200, 422]).toContain(reverseRes.status);

    // 5. ATS Scoring Comparison
    const atsRes = await POST_ATS(createJsonRequest("http://localhost/api/resume/ats", "POST", {
      tex: customTexFrontend,
      jobDescription: sampleJobDescription,
    }));
    expect(atsRes.status).toBe(200);

    // 6. List all created resume documents
    const listRes = await GET_RESUME();
    const listData = await parseResponse<{ docs: ResumeDoc[] }>(listRes);
    expect(listData.docs.length).toBeGreaterThanOrEqual(2);
  });

  it("Journey 4: Complete System Disaster Recovery, Backup & Restoration", async () => {
    // 1. Populate comprehensive multi-table dataset
    jobsRepo.removeAll(true);
    jobsRepo.upsert({ ...mockJobApplication1, id: "dr-job-1", screenshotUrl: "dr-shot.png" });
    jobsRepo.upsert({ ...mockJobApplication2, id: "dr-job-2" });
    jobsRepo.upsert({ ...mockJobApplication3, id: "dr-job-3" });
    contactsRepo.upsert({ ...mockContact, id: "dr-contact-1" });
    emailsRepo.upsert({ ...mockEmail, id: "dr-email-1", jobId: "dr-job-1" });
    interviewsRepo.upsert({ ...mockInterview, id: "dr-interview-1", jobId: "dr-job-1" });
    remindersRepo.upsert({ ...mockReminder, id: "dr-reminder-1", refId: "dr-job-1" });
    resumeRepo.upsert({ ...mockResumeDoc, id: "dr-resume-1" });
    notificationsRepo.add({ title: "DR Test Alert", message: "System operational", kind: "info" });
    memoryRepo.add({ kind: "decision", content: "DR Test Constraint: Remote Only", importance: 5, source: "user" });

    // 2. Export Complete Backup Snapshot
    const exportReq = createUrlRequest("http://localhost/api/data/export");
    const exportRes = await GET_EXPORT(exportReq);
    expect(exportRes.status).toBe(200);
    const snapshot = await parseResponse<{ app: string; data: Record<string, unknown[]> }>(exportRes);
    expect(snapshot.app).toBe("huntflow");
    expect(snapshot.data).toBeDefined();

    // 3. Trigger Complete Database Wipe
    const resetRes = await POST_RESET();
    expect(resetRes.status).toBe(200);

    // Verify wiped state
    expect(jobsRepo.get("dr-job-1")).toBeNull();
    expect(contactsRepo.get("dr-contact-1")).toBeNull();
    expect(resumeRepo.get("dr-resume-1")).toBeNull();

    // 4. Execute Full Disaster Recovery Restore
    const importReq = createJsonRequest("http://localhost/api/data/import", "POST", snapshot);
    const importRes = await POST_IMPORT(importReq);
    expect(importRes.status).toBe(200);

    // 5. Verify 100% Exact Fidelity Restoration
    expect(jobsRepo.get("dr-job-1")).not.toBeNull();
    expect(jobsRepo.get("dr-job-1")?.screenshotUrl).toBe("dr-shot.png");
    expect(jobsRepo.get("dr-job-2")).not.toBeNull();
    expect(contactsRepo.get("dr-contact-1")).not.toBeNull();
    expect(emailsRepo.get("dr-email-1")?.jobId).toBe("dr-job-1");
    expect(interviewsRepo.get("dr-interview-1")?.jobId).toBe("dr-job-1");
    expect(remindersRepo.get("dr-reminder-1")?.refId).toBe("dr-job-1");
    expect(resumeRepo.get("dr-resume-1")).not.toBeNull();
  });

  it("Journey 5: Autonomous Career Assistant & Semantic Memory Loop", async () => {
    // 1. Configure Provider Settings
    const settingsReq = createJsonRequest("http://localhost/api/data/settings", "POST", {
      llm_providers: JSON.stringify([
        {
          id: "openrouter",
          apiKey: "sk-journey-test-key",
          model: "anthropic/claude-3.5-sonnet",
        },
      ]),
    });
    await POST_SETTINGS(settingsReq, createRouteContext({ collection: "settings" }));

    // 2. Interactive Command Assistant Conversation
    const assistantReq = createJsonRequest("http://localhost/api/assistant", "POST", {
      message: "What are my upcoming scheduled interviews?",
      profile: mockUserProfile,
    });
    const assistantRes = await POST_ASSISTANT(assistantReq);
    expect(assistantRes.status).toBe(200);
    const assistantBody = await parseResponse<{ reply?: string; ok?: boolean }>(assistantRes);
    expect(assistantBody.reply || assistantBody.ok).toBeTruthy();

    // 3. User records Career Constraints into Memory
    const memoryReq = createJsonRequest("http://localhost/api/memory", "POST", {
      kind: "decision",
      content: "Do not apply to roles requiring on-site presence in New York. Target $175k+ compensation.",
      importance: 5,
    });
    const memoryRes = await POST_MEMORY(memoryReq);
    expect(memoryRes.status).toBe(200);

    // 4. Memory Querying & Filtering
    const getMemReq = createUrlRequest("http://localhost/api/memory?kind=decision");
    const getMemRes = await GET_MEMORY(getMemReq);
    expect(getMemRes.status).toBe(200);
    const memData = await parseResponse<{ memory: MemoryEntry[] }>(getMemRes);
    expect(memData.memory.some((m) => m.content.includes("New York"))).toBe(true);

    // 5. Standalone Recommendations incorporating Profile & Constraints
    const recsReq = createJsonRequest("http://localhost/api/generate", "POST", {
      type: "recommendations",
      profile: mockUserProfile,
    });
    const recsRes = await POST_GENERATE(recsReq);
    expect(recsRes.status).toBe(200);
    const recsData = await parseResponse<{ recommendations: unknown[] }>(recsRes);
    expect(recsData.recommendations.length).toBeGreaterThan(0);
  });
});
