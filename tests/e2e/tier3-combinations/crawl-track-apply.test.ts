import { describe, it, expect, beforeEach } from "vitest";
import { POST as POST_CRAWL } from "@/app/api/crawl/route";
import { POST as POST_COLLECTION } from "@/app/api/data/[collection]/route";
import { GET as GET_STATS } from "@/app/api/data/stats/route";
import { POST as POST_GENERATE } from "@/app/api/generate/route";
import { POST as POST_RESUME } from "@/app/api/resume/route";
import { POST as POST_ATS } from "@/app/api/resume/ats/route";
import { POST as POST_PARTIAL_PIPELINE } from "@/app/api/agent/partial-pipeline/route";
import { POST as POST_NOTIFICATION, GET as GET_NOTIFICATIONS } from "@/app/api/notifications/route";
import {
  createJsonRequest,
  createUrlRequest,
  createRouteContext,
  parseResponse,
  resetTestDb,
  jobsRepo,
} from "../helpers/testHarness";
import {
  mockJobApplication1,
  mockUserProfile,
  sampleJobDescription,
  sampleLatexResume,
} from "../helpers/testFixtures";
import { JobApplication, ResumeDoc, NotificationItem } from "@/types";

describe("Tier 3: Combinatorial Workflows — Crawl -> Track -> Fit -> Resume -> Agent -> Pipeline Stats", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("1. Step 1: Crawl Discovery & Opportunity Ingestion with screenshot proof", async () => {
    const crawlReq = createJsonRequest("http://localhost/api/crawl", "POST", {
      category: "frontend",
      keyword: "React",
      limit: 5,
    });
    const crawlRes = await POST_CRAWL(crawlReq);
    expect(crawlRes.status).toBe(200);

    const discoveredJob: JobApplication = {
      ...mockJobApplication1,
      id: "job-workflow-001",
      title: "Senior Full-Stack Cloud Architect",
      company: "Apex Cloud Innovations",
      screenshotUrl: "proof-apex-001.png",
      cloudinaryUrl: "https://res.cloudinary.com/huntflow/apex-shot.png",
      status: "wishlist",
    };

    const trackReq = createJsonRequest("http://localhost/api/data/jobs", "POST", discoveredJob);
    const trackRes = await POST_COLLECTION(trackReq, createRouteContext({ collection: "jobs" }));
    expect(trackRes.status).toBe(200);

    const saved = jobsRepo.get("job-workflow-001");
    expect(saved).not.toBeNull();
    expect(saved?.screenshotUrl).toBe("proof-apex-001.png");
    expect(saved?.cloudinaryUrl).toBe("https://res.cloudinary.com/huntflow/apex-shot.png");
  });

  it("2. Step 2: Deduplication Check prevents re-tracking already tracked jobs", async () => {
    jobsRepo.upsert({
      ...mockJobApplication1,
      id: "job-dedup-001",
      title: "Senior Staff Engineer",
      company: "UniqueCorp",
      url: "https://uniquecorp.example.com/jobs/123",
    });

    const initialCount = jobsRepo.count();
    // Re-upserting same ID
    jobsRepo.upsert({
      ...mockJobApplication1,
      id: "job-dedup-001",
      title: "Senior Staff Engineer",
      company: "UniqueCorp",
      url: "https://uniquecorp.example.com/jobs/123",
    });

    expect(jobsRepo.count()).toBe(initialCount);
  });

  it("3. Step 3: Opportunity Fit Analysis evaluates skills gap & returns match score", async () => {
    const trackedJob = { ...mockJobApplication1, id: "job-workflow-analysis" };
    jobsRepo.upsert(trackedJob);

    const genReq = createJsonRequest("http://localhost/api/generate", "POST", {
      type: "match_analysis",
      job: trackedJob,
      profile: mockUserProfile,
    });
    const genRes = await POST_GENERATE(genReq);
    expect(genRes.status).toBe(200);

    const data = await parseResponse<{ analysis: { matchScore: number; matchingSkills: string[] } }>(genRes);
    expect(data.analysis.matchScore).toBeGreaterThan(0);

    // Update job with match score in DB
    trackedJob.matchScore = data.analysis.matchScore;
    jobsRepo.upsert(trackedJob);

    expect(jobsRepo.get("job-workflow-analysis")?.matchScore).toBe(data.analysis.matchScore);
  });

  it("4. Step 4: Document Generation creates tailored resume and saves to Resume Studio", async () => {
    const docGenReq = createJsonRequest("http://localhost/api/generate", "POST", {
      type: "documents",
      job: mockJobApplication1,
      profile: mockUserProfile,
    });
    const docGenRes = await POST_GENERATE(docGenReq);
    expect(docGenRes.status).toBe(200);

    const docPayload = await parseResponse<{ documents: { tailoredResume: string; coverLetter: string } }>(docGenRes);
    expect(docPayload.documents.tailoredResume).toBeDefined();

    // Save tailored resume into resume_docs
    const newResume: Partial<ResumeDoc> = {
      name: `Tailored Resume — ${mockJobApplication1.company}`,
      templateId: "classic-ats",
      tex: sampleLatexResume,
      targetJobId: mockJobApplication1.id,
    };
    const saveReq = createJsonRequest("http://localhost/api/resume", "POST", newResume);
    const saveRes = await POST_RESUME(saveReq);
    expect(saveRes.status).toBe(200);

    const savedResume = await parseResponse<{ doc: ResumeDoc }>(saveRes);
    expect(savedResume.doc.targetJobId).toBe(mockJobApplication1.id);
  });

  it("5. Step 5: Resume ATS Scoring verifies score against target job description", async () => {
    const atsReq = createJsonRequest("http://localhost/api/resume/ats", "POST", {
      tex: sampleLatexResume,
      jobDescription: sampleJobDescription,
    });
    const atsRes = await POST_ATS(atsReq);
    expect(atsRes.status).toBe(200);

    const atsReport = await parseResponse<{ report: { score: number; matchingSkills: string[] } }>(atsRes);
    expect(atsReport.report.score).toBeGreaterThan(50);
  });

  it("6. Step 6: Multi-Agent Partial Pipeline executes up to tailor step and records history", async () => {
    jobsRepo.upsert(mockJobApplication1);

    const pipelineReq = createJsonRequest("http://localhost/api/agent/partial-pipeline", "POST", {
      jobId: mockJobApplication1.id,
      profile: mockUserProfile,
      targetRegion: "US",
      step: "tailor",
    });
    const pipelineRes = await POST_PARTIAL_PIPELINE(pipelineReq);
    expect(pipelineRes.status).toBe(200);

    const body = await parseResponse<{ success: boolean; data: Record<string, unknown> }>(pipelineRes);
    expect(body.success).toBe(true);
  });

  it("7. Step 7: Transition job status from wishlist -> applied and verify stats increment", async () => {
    jobsRepo.removeAll(true);
    jobsRepo.upsert({ ...mockJobApplication1, id: "job-workflow-stats", status: "wishlist" });

    let statsRes = await GET_STATS();
    let stats = await parseResponse<{ funnel: { status: string; count: number }[] }>(statsRes);
    let appliedCount = stats.funnel.find((f) => f.status === "applied")?.count ?? 0;
    expect(appliedCount).toBe(0);

    // Transition to applied
    const updateReq = createJsonRequest("http://localhost/api/data/jobs", "POST", {
      ...mockJobApplication1,
      id: "job-workflow-stats",
      status: "applied",
      appliedDate: "2026-08-18",
    });
    await POST_COLLECTION(updateReq, createRouteContext({ collection: "jobs" }));

    statsRes = await GET_STATS();
    stats = await parseResponse<{ funnel: { status: string; count: number }[] }>(statsRes);
    appliedCount = stats.funnel.find((f) => f.status === "applied")?.count ?? 0;
    expect(appliedCount).toBe(1);
  });

  it("8. Step 8: System creates notification upon application workflow completion", async () => {
    const notifReq = createJsonRequest("http://localhost/api/notifications", "POST", {
      title: "Application Logged",
      message: "Successfully applied to Senior Full-Stack Engineer at Acme Corp.",
      kind: "success",
      link: "/jobs/job-workflow-001",
    });
    const notifRes = await POST_NOTIFICATION(notifReq);
    expect(notifRes.status).toBe(200);

    const listRes = await GET_NOTIFICATIONS(createUrlRequest("http://localhost/api/notifications"));
    const listBody = await parseResponse<{ notifications: NotificationItem[] }>(listRes);
    expect(listBody.notifications.some((n) => n.title === "Application Logged")).toBe(true);
  });
});
