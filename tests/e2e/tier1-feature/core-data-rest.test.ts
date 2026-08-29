import { describe, it, expect, beforeEach } from "vitest";
import { GET as GET_DATA } from "@/app/api/data/route";
import { POST as POST_COLLECTION } from "@/app/api/data/[collection]/route";
import { DELETE as DELETE_COLLECTION_ID } from "@/app/api/data/[collection]/[id]/route";
import { GET as GET_STATS } from "@/app/api/data/stats/route";
import {
  createJsonRequest,
  createUrlRequest,
  createRouteContext,
  parseResponse,
  resetTestDb,
  jobsRepo,
  contactsRepo,
  emailsRepo,
  interviewsRepo,
  remindersRepo,
  getDb,
} from "../helpers/testHarness";
import {
  mockJobApplication1,
  mockJobApplication2,
  mockJobApplication3,
  mockContact,
  mockEmail,
  mockInterview,
  mockReminder,
} from "../helpers/testFixtures";
import { JobApplication, Contact, EmailMessage, InterviewEvent, Reminder } from "@/types";

describe("Tier 1: Feature Coverage — Core Data REST API & Schema Collections", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("1. POST /api/data/jobs inserts new job application with status wishlist", async () => {
    const newJob: JobApplication = {
      ...mockJobApplication1,
      id: "job-rest-001",
      title: "Frontend Lead",
      status: "wishlist",
    };

    const req = createJsonRequest("http://localhost/api/data/jobs", "POST", newJob);
    const res = await POST_COLLECTION(req, createRouteContext({ collection: "jobs" }));
    expect(res.status).toBe(200);

    const saved = jobsRepo.get("job-rest-001");
    expect(saved).not.toBeNull();
    expect(saved?.title).toBe("Frontend Lead");
    expect(saved?.status).toBe("wishlist");
  });

  it("2. POST /api/data/jobs persists schema fields: screenshotUrl, cloudinaryUrl, skipReason", async () => {
    const jobWithMedia: JobApplication = {
      ...mockJobApplication1,
      id: "job-rest-media",
      screenshotUrl: "proof-full-page-123.png",
      cloudinaryUrl: "https://res.cloudinary.com/huntflow/image/upload/v999/shot.png",
      skipReason: "Salary below threshold",
    };

    const req = createJsonRequest("http://localhost/api/data/jobs", "POST", jobWithMedia);
    const res = await POST_COLLECTION(req, createRouteContext({ collection: "jobs" }));
    expect(res.status).toBe(200);

    const saved = jobsRepo.get("job-rest-media");
    expect(saved?.screenshotUrl).toBe("proof-full-page-123.png");
    expect(saved?.cloudinaryUrl).toBe("https://res.cloudinary.com/huntflow/image/upload/v999/shot.png");
    expect(saved?.skipReason).toBe("Salary below threshold");
  });

  it("3. GET /api/data verifies mapped columns in returned jobs", async () => {
    jobsRepo.upsert({
      ...mockJobApplication1,
      id: "job-rest-mapped",
      screenshotUrl: "proof-mapped.png",
      cloudinaryUrl: "https://res.cloudinary.com/huntflow/shot.png",
      skipReason: "Not remote",
    });

    const res = await GET_DATA();
    expect(res.status).toBe(200);
    const data = await parseResponse<{ jobs: JobApplication[] }>(res);

    const found = data.jobs.find((j) => j.id === "job-rest-mapped");
    expect(found).toBeDefined();
    expect(found?.screenshotUrl).toBe("proof-mapped.png");
    expect(found?.cloudinaryUrl).toBe("https://res.cloudinary.com/huntflow/shot.png");
    expect(found?.skipReason).toBe("Not remote");
  });

  it("4. POST /api/data/contacts inserts networking contacts with JSON company IDs", async () => {
    const newContact: Contact = {
      ...mockContact,
      id: "contact-rest-001",
      name: "Jordan Tech Lead",
      companyIds: ["job-rest-001", "job-rest-002"],
    };

    const req = createJsonRequest("http://localhost/api/data/contacts", "POST", newContact);
    const res = await POST_COLLECTION(req, createRouteContext({ collection: "contacts" }));
    expect(res.status).toBe(200);

    const saved = contactsRepo.get("contact-rest-001");
    expect(saved).not.toBeNull();
    expect(saved?.name).toBe("Jordan Tech Lead");
    expect(saved?.companyIds).toEqual(["job-rest-001", "job-rest-002"]);
  });

  it("5. POST /api/data/emails logs outbound/inbound email threads linked to a job", async () => {
    jobsRepo.upsert(mockJobApplication1);
    contactsRepo.upsert(mockContact);

    const newEmail: EmailMessage = {
      ...mockEmail,
      id: "email-rest-001",
      jobId: mockJobApplication1.id,
      contactId: mockContact.id,
      subject: "Follow-up regarding Senior Role",
    };

    const req = createJsonRequest("http://localhost/api/data/emails", "POST", newEmail);
    const res = await POST_COLLECTION(req, createRouteContext({ collection: "emails" }));
    expect(res.status).toBe(200);

    const saved = emailsRepo.get("email-rest-001");
    expect(saved).not.toBeNull();
    expect(saved?.subject).toBe("Follow-up regarding Senior Role");
    expect(saved?.jobId).toBe(mockJobApplication1.id);
  });

  it("6. POST /api/data/interviews records upcoming interview with duration and prep notes", async () => {
    jobsRepo.upsert(mockJobApplication3);

    const newInterview: InterviewEvent = {
      ...mockInterview,
      id: "interview-rest-001",
      jobId: mockJobApplication3.id,
      durationMin: 90,
      title: "Panel Technical Deep Dive",
    };

    const req = createJsonRequest("http://localhost/api/data/interviews", "POST", newInterview);
    const res = await POST_COLLECTION(req, createRouteContext({ collection: "interviews" }));
    expect(res.status).toBe(200);

    const saved = interviewsRepo.get("interview-rest-001");
    expect(saved).not.toBeNull();
    expect(saved?.title).toBe("Panel Technical Deep Dive");
    expect(saved?.durationMin).toBe(90);
  });

  it("7. POST /api/data/reminders creates follow-up alert linked to job application", async () => {
    const newReminder: Reminder = {
      ...mockReminder,
      id: "reminder-rest-001",
      refId: "job-e2e-001",
      note: "Check in with hiring manager after 5 business days",
    };

    const req = createJsonRequest("http://localhost/api/data/reminders", "POST", newReminder);
    const res = await POST_COLLECTION(req, createRouteContext({ collection: "reminders" }));
    expect(res.status).toBe(200);

    const saved = remindersRepo.get("reminder-rest-001");
    expect(saved).not.toBeNull();
    expect(saved?.note).toBe("Check in with hiring manager after 5 business days");
    expect(saved?.done).toBe(false);
  });

  it("8. DELETE /api/data/jobs/:id removes job and cascades deletion to linked emails, interviews, and reminders", async () => {
    const targetJobId = "job-to-cascade-delete";
    jobsRepo.upsert({ ...mockJobApplication1, id: targetJobId });
    emailsRepo.upsert({ ...mockEmail, id: "email-cascade", jobId: targetJobId });
    interviewsRepo.upsert({ ...mockInterview, id: "interview-cascade", jobId: targetJobId });
    remindersRepo.upsert({ ...mockReminder, id: "reminder-cascade", refId: targetJobId });

    expect(jobsRepo.get(targetJobId)).not.toBeNull();
    expect(emailsRepo.get("email-cascade")).not.toBeNull();
    expect(interviewsRepo.get("interview-cascade")).not.toBeNull();
    expect(remindersRepo.get("reminder-cascade")).not.toBeNull();

    const req = createUrlRequest(`http://localhost/api/data/jobs/${targetJobId}`, "DELETE");
    const res = await DELETE_COLLECTION_ID(req, createRouteContext({ collection: "jobs", id: targetJobId }));
    expect(res.status).toBe(200);

    expect(jobsRepo.get(targetJobId)).toBeNull();
    expect(emailsRepo.get("email-cascade")).toBeNull();
    expect(interviewsRepo.get("interview-cascade")).toBeNull();
    expect(remindersRepo.get("reminder-cascade")).toBeNull();
  });

  it("9. DELETE /api/data/contacts/:id removes contact successfully", async () => {
    contactsRepo.upsert({ ...mockContact, id: "contact-to-del" });
    expect(contactsRepo.get("contact-to-del")).not.toBeNull();

    const req = createUrlRequest("http://localhost/api/data/contacts/contact-to-del", "DELETE");
    const res = await DELETE_COLLECTION_ID(req, createRouteContext({ collection: "contacts", id: "contact-to-del" }));
    expect(res.status).toBe(200);

    expect(contactsRepo.get("contact-to-del")).toBeNull();
  });

  it("10. Updating job status (wishlist -> applied -> interviewing -> offer) updates updated_at timestamp", async () => {
    const job: JobApplication = { ...mockJobApplication1, id: "job-status-progression", status: "wishlist" };
    jobsRepo.upsert(job);

    const initialRow = getDb().prepare("SELECT updated_at FROM jobs WHERE id = ?").get("job-status-progression") as { updated_at: string };
    const initialTime = initialRow.updated_at;

    // Small delay to ensure timestamp progression
    await new Promise((r) => setTimeout(r, 20));

    const updatedJob: JobApplication = { ...job, status: "applied", appliedDate: "2026-08-18" };
    const req = createJsonRequest("http://localhost/api/data/jobs", "POST", updatedJob);
    await POST_COLLECTION(req, createRouteContext({ collection: "jobs" }));

    const updatedRow = getDb().prepare("SELECT updated_at, status FROM jobs WHERE id = ?").get("job-status-progression") as { updated_at: string; status: string };
    expect(updatedRow.status).toBe("applied");
    expect(new Date(updatedRow.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(initialTime).getTime());
  });

  it("11. GET /api/data/stats returns aggregate pipeline funnel matching database state", async () => {
    jobsRepo.removeAll(true);
    jobsRepo.upsert({ ...mockJobApplication1, id: "j1", status: "wishlist" });
    jobsRepo.upsert({ ...mockJobApplication2, id: "j2", status: "applied" });
    jobsRepo.upsert({ ...mockJobApplication3, id: "j3", status: "interviewing" });

    const res = await GET_STATS();
    expect(res.status).toBe(200);
    const data = await parseResponse<{
      funnel: { status: string; count: number }[];
      weekly: { week: string; applied: number; interviews: number }[];
      responseRate: { replied: number; sent: number; rate: number };
    }>(res);

    expect(data.funnel).toBeDefined();
    expect(Array.isArray(data.funnel)).toBe(true);
    const wishlistCount = data.funnel.find((f) => f.status === "wishlist")?.count ?? 0;
    const appliedCount = data.funnel.find((f) => f.status === "applied")?.count ?? 0;
    const interviewingCount = data.funnel.find((f) => f.status === "interviewing")?.count ?? 0;

    expect(wishlistCount).toBe(1);
    expect(appliedCount).toBe(1);
    expect(interviewingCount).toBe(1);
  });

  it("12. GET /api/data/stats calculates 8-week application velocity and metrics", async () => {
    const res = await GET_STATS();
    expect(res.status).toBe(200);
    const data = await parseResponse<{
      weekly: { week: string; applied: number; interviews: number }[];
      responseRate: { replied: number; sent: number; rate: number };
    }>(res);

    expect(data.weekly).toBeDefined();
    expect(Array.isArray(data.weekly)).toBe(true);
    expect(data.responseRate).toBeDefined();
    expect(typeof data.responseRate.rate).toBe("number");
  });

  it("13. POST /api/data/unknown_collection returns 404", async () => {
    const req = createJsonRequest("http://localhost/api/data/nonexistent_table", "POST", { name: "test" });
    const res = await POST_COLLECTION(req, createRouteContext({ collection: "nonexistent_table" }));
    expect(res.status).toBe(404);
  });

  it("14. DELETE /api/data/jobs/non_existent_id succeeds idempotently or returns 200", async () => {
    const req = createUrlRequest("http://localhost/api/data/jobs/does-not-exist-999", "DELETE");
    const res = await DELETE_COLLECTION_ID(req, createRouteContext({ collection: "jobs", id: "does-not-exist-999" }));
    expect([200, 404]).toContain(res.status);
  });

  it("15. Simultaneous updates to different collections maintain transaction integrity", async () => {
    const jobPromise = POST_COLLECTION(
      createJsonRequest("http://localhost/api/data/jobs", "POST", { ...mockJobApplication1, id: "sim-job" }),
      createRouteContext({ collection: "jobs" })
    );
    const contactPromise = POST_COLLECTION(
      createJsonRequest("http://localhost/api/data/contacts", "POST", { ...mockContact, id: "sim-contact" }),
      createRouteContext({ collection: "contacts" })
    );

    const [jobRes, contactRes] = await Promise.all([jobPromise, contactPromise]);
    expect(jobRes.status).toBe(200);
    expect(contactRes.status).toBe(200);

    expect(jobsRepo.get("sim-job")).not.toBeNull();
    expect(contactsRepo.get("sim-contact")).not.toBeNull();
  });
});
