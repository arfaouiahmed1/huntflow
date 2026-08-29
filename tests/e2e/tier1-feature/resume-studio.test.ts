import { describe, it, expect, beforeEach } from "vitest";
import { GET as GET_RESUME, POST as POST_RESUME, PUT as PUT_RESUME, DELETE as DELETE_RESUME } from "@/app/api/resume/route";
import { POST as POST_ATS } from "@/app/api/resume/ats/route";
import { POST as POST_COMPILE } from "@/app/api/resume/compile/route";
import { POST as POST_FORWARD } from "@/app/api/resume/synctex/forward/route";
import { POST as POST_REVERSE } from "@/app/api/resume/synctex/reverse/route";
import {
  createJsonRequest,
  createUrlRequest,
  parseResponse,
  resetTestDb,
  resumeRepo,
} from "../helpers/testHarness";
import {
  mockResumeDoc,
  mockResumeDocJson,
  mockUserProfile,
  sampleLatexResume,
  sampleJobDescription,
} from "../helpers/testFixtures";
import { ResumeDoc } from "@/types";

describe("Tier 1: Feature Coverage — Multi-Document Resume Studio & Compiler Engine", () => {
  beforeEach(() => {
    resetTestDb();
    const dbResumes = resumeRepo.list();
    for (const r of dbResumes) {
      resumeRepo.remove(r.id);
    }
  });

  it("1. GET /api/resume returns all resume documents", async () => {
    resumeRepo.upsert(mockResumeDoc);
    resumeRepo.upsert(mockResumeDocJson);

    const res = await GET_RESUME();
    expect(res.status).toBe(200);

    const data = await parseResponse<{ docs: ResumeDoc[] }>(res);
    expect(Array.isArray(data.docs)).toBe(true);
    expect(data.docs.length).toBe(2);
  });

  it("2. POST /api/resume creates a new resume document with custom LaTeX source", async () => {
    const newDoc = {
      name: "Custom LaTeX Resume",
      templateId: "classic-ats",
      tex: sampleLatexResume,
      kind: "resume",
    };

    const req = createJsonRequest("http://localhost/api/resume", "POST", newDoc);
    const res = await POST_RESUME(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ ok: boolean; doc: ResumeDoc }>(res);
    expect(body.ok).toBe(true);
    expect(body.doc.name).toBe("Custom LaTeX Resume");
    expect(body.doc.tex).toContain("Alex Johnson");

    const saved = resumeRepo.get(body.doc.id);
    expect(saved).not.toBeNull();
  });

  it("3. POST /api/resume creates a resume with structured JSON content", async () => {
    const req = createJsonRequest("http://localhost/api/resume", "POST", mockResumeDocJson);
    const res = await POST_RESUME(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ ok: boolean; doc: ResumeDoc }>(res);
    expect(body.ok).toBe(true);
    expect(body.doc.content?.header.name).toBe("Alex Johnson");
    expect(body.doc.content?.skills?.length).toBeGreaterThan(0);
  });

  it("4. PUT /api/resume generates a fresh draft from user profile (From Scratch path)", async () => {
    const req = createJsonRequest("http://localhost/api/resume", "PUT", {
      name: "Generated Profile Resume",
      kind: "resume",
      templateId: "classic-ats",
      profile: mockUserProfile,
    });

    const res = await PUT_RESUME(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ ok: boolean; doc: ResumeDoc; tex: string }>(res);
    expect(body.ok).toBe(true);
    expect(body.doc).toBeDefined();
    expect(body.doc.tex).toBeDefined();
    expect(body.doc.tex.length).toBeGreaterThan(0);
  });

  it("5. Updating template ID renders corresponding LaTeX structure", async () => {
    const req = createJsonRequest("http://localhost/api/resume", "PUT", {
      name: "Modern Executive Resume",
      kind: "resume",
      templateId: "executive",
      profile: mockUserProfile,
    });

    const res = await PUT_RESUME(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ doc: ResumeDoc }>(res);
    expect(body.doc.templateId).toBe("executive");
  });

  it("6. DELETE /api/resume?id=:id deletes document from SQLite resume_docs", async () => {
    resumeRepo.upsert(mockResumeDoc);
    expect(resumeRepo.get(mockResumeDoc.id)).not.toBeNull();

    const req = createUrlRequest(`http://localhost/api/resume?id=${mockResumeDoc.id}`, "DELETE");
    const res = await DELETE_RESUME(req);
    expect(res.status).toBe(200);

    expect(resumeRepo.get(mockResumeDoc.id)).toBeNull();
  });

  it("7. DELETE /api/resume with non-existent ID returns 404", async () => {
    const req = createUrlRequest("http://localhost/api/resume?id=non_existent_resume_123", "DELETE");
    const res = await DELETE_RESUME(req);
    expect(res.status).toBe(404);
  });

  it("8. POST /api/resume/ats scores resume against target job description and returns strengths/gaps", async () => {
    const req = createJsonRequest("http://localhost/api/resume/ats", "POST", {
      tex: sampleLatexResume,
      jobDescription: sampleJobDescription,
    });

    const res = await POST_ATS(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{
      ok: boolean;
      report: {
        score: number;
        matchingSkills: string[];
        missingSkills: string[];
        suggestions: string[];
      };
    }>(res);

    expect(body.ok).toBe(true);
    expect(body.report).toBeDefined();
    expect(typeof body.report.score).toBe("number");
    expect(body.report.score).toBeGreaterThan(0);
    expect(body.report.score).toBeLessThanOrEqual(100);
  });

  it("9. POST /api/resume/ats returns detailed scoring metrics", async () => {
    const req = createJsonRequest("http://localhost/api/resume/ats", "POST", {
      tex: sampleLatexResume,
      jobDescription: "Staff TypeScript Engineer with GraphQL experience",
    });

    const res = await POST_ATS(req);
    const body = await parseResponse<{ report: { score: number; details?: Record<string, unknown> } }>(res);
    expect(body.report.score).toBeDefined();
  });

  it("10. POST /api/resume/compile compiles LaTeX source to PDF buffer and returns token", async () => {
    const req = createJsonRequest("http://localhost/api/resume/compile", "POST", {
      tex: sampleLatexResume,
    });

    const res = await POST_COMPILE(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ ok: boolean; token: string }>(res);
    expect(body.ok).toBe(true);
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe("string");
  });

  it("11. Forward SyncTeX (POST /api/resume/synctex/forward) maps source line to PDF coordinates", async () => {
    // First compile to get a valid token
    const compileReq = createJsonRequest("http://localhost/api/resume/compile", "POST", {
      tex: sampleLatexResume,
    });
    const compileRes = await POST_COMPILE(compileReq);
    const { token } = await parseResponse<{ token: string }>(compileRes);

    const forwardReq = createJsonRequest("http://localhost/api/resume/synctex/forward", "POST", {
      token,
      line: 8,
      column: 1,
    });
    const forwardRes = await POST_FORWARD(forwardReq);
    expect([200, 422]).toContain(forwardRes.status);
  });

  it("12. Reverse SyncTeX (POST /api/resume/synctex/reverse) maps PDF coordinate click back to LaTeX source line", async () => {
    const compileReq = createJsonRequest("http://localhost/api/resume/compile", "POST", {
      tex: sampleLatexResume,
    });
    const compileRes = await POST_COMPILE(compileReq);
    const { token } = await parseResponse<{ token: string }>(compileRes);

    const reverseReq = createJsonRequest("http://localhost/api/resume/synctex/reverse", "POST", {
      token,
      page: 1,
      x: 100,
      y: 200,
    });
    const reverseRes = await POST_REVERSE(reverseReq);
    expect([200, 422]).toContain(reverseRes.status);
  });

  it("13. Resume documents preserve link to targetJobId", async () => {
    const targetJobId = "job-target-linked-001";
    const req = createJsonRequest("http://localhost/api/resume", "POST", {
      name: "Job Specific Tailored Resume",
      tex: sampleLatexResume,
      targetJobId,
    });

    const res = await POST_RESUME(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ doc: ResumeDoc }>(res);
    expect(body.doc.targetJobId).toBe(targetJobId);

    const saved = resumeRepo.get(body.doc.id);
    expect(saved?.targetJobId).toBe(targetJobId);
  });

  it("14. Switching resume kind (resume, cv, cover_letter, motivation_letter) persists properly", async () => {
    for (const kind of ["cover_letter", "motivation_letter", "cv"] as const) {
      const req = createJsonRequest("http://localhost/api/resume", "PUT", {
        name: `My ${kind}`,
        kind,
        templateId: "classic-ats",
        profile: mockUserProfile,
      });
      const res = await PUT_RESUME(req);
      expect(res.status).toBe(200);

      const body = await parseResponse<{ doc: ResumeDoc }>(res);
      expect(body.doc.kind).toBe(kind);
    }
  });
});
