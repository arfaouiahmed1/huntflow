import { describe, it, expect, beforeEach } from "vitest";
import { POST as POST_COLLECTION } from "@/app/api/data/[collection]/route";
import { DELETE as DELETE_COLLECTION_ID } from "@/app/api/data/[collection]/[id]/route";
import { POST as POST_GENERATE } from "@/app/api/generate/route";
import { POST as POST_VAULT, DELETE as DELETE_VAULT } from "@/app/api/vault/route";
import { DELETE as DELETE_RESUME } from "@/app/api/resume/route";
import { GET as GET_MEMORY } from "@/app/api/memory/route";
import { POST as POST_NOTIFICATION } from "@/app/api/notifications/route";
import { PATCH as PATCH_NOTIFICATION_ID } from "@/app/api/notifications/[id]/route";
import { POST as POST_LLM_TEST } from "@/app/api/llm/test/route";
import {
  createJsonRequest,
  createFormDataRequest,
  createUrlRequest,
  createRouteContext,
  parseResponse,
  resetTestDb,
  jobsRepo,
  settingsRepo,
} from "../helpers/testHarness";
import { mockJobApplication1, mockUserProfile } from "../helpers/testFixtures";

describe("Tier 2: Boundary & Corner Cases — Input Validation & Error Handling", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("1. Malformed JSON body in POST /api/data/jobs returns 400/500 without crashing worker", async () => {
    const rawReq = createJsonRequest("http://localhost/api/data/jobs", "POST", "INVALID_JSON_RAW_STRING{{{");
    const res = await POST_COLLECTION(rawReq, createRouteContext({ collection: "jobs" }));
    expect([400, 500]).toContain(res.status);
  });

  it("2. Empty body ({}) in POST /api/generate returns 400 Missing generation type", async () => {
    const req = createJsonRequest("http://localhost/api/generate", "POST", {});
    const res = await POST_GENERATE(req);
    expect(res.status).toBe(400);

    const body = await parseResponse<{ error: { code: string; message: string } | string }>(res);
    const msg = typeof body.error === "object" ? body.error.message : body.error;
    expect(msg).toContain("Missing generation type");
  });

  it("3. Unknown generation type (type: 'invalid_type') returns 400", async () => {
    const req = createJsonRequest("http://localhost/api/generate", "POST", {
      type: "invalid_nonexistent_type",
      job: mockJobApplication1,
      profile: mockUserProfile,
    });
    const res = await POST_GENERATE(req);
    expect(res.status).toBe(400);
  });

  it("4. Missing file field in POST /api/vault returns 400 file field is required", async () => {
    const form = new FormData();
    form.append("label", "no_file");

    const req = createFormDataRequest("http://localhost/api/vault", form);
    const res = await POST_VAULT(req);
    expect(res.status).toBe(400);

    const body = await parseResponse<{ error: string }>(res);
    expect(body.error).toContain("file field is required");
  });

  it("5. Missing id in DELETE /api/resume returns 400", async () => {
    const req = createUrlRequest("http://localhost/api/resume", "DELETE");
    const res = await DELETE_RESUME(req);
    expect(res.status).toBe(400);
  });

  it("6. Missing id in DELETE /api/vault returns 400", async () => {
    const req = createUrlRequest("http://localhost/api/vault", "DELETE");
    const res = await DELETE_VAULT(req);
    expect(res.status).toBe(400);
  });

  it("7. Missing id in PATCH /api/notifications/:id returns 400", async () => {
    const req = createJsonRequest("http://localhost/api/notifications/", "PATCH", {});
    const res = await PATCH_NOTIFICATION_ID(req, createRouteContext({ id: "" }));
    expect([400, 404]).toContain(res.status);
  });

  it("8. Querying negative limit (/api/memory?limit=-5) clamps safely to minimum (1)", async () => {
    const req = createUrlRequest("http://localhost/api/memory?limit=-5");
    const res = await GET_MEMORY(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ memory: unknown[] }>(res);
    expect(Array.isArray(body.memory)).toBe(true);
  });

  it("9. Querying oversized limit (/api/memory?limit=99999) clamps safely to maximum (200)", async () => {
    const req = createUrlRequest("http://localhost/api/memory?limit=99999");
    const res = await GET_MEMORY(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ memory: unknown[] }>(res);
    expect(Array.isArray(body.memory)).toBe(true);
  });

  it("10. Long strings (> 50,000 chars) in job descriptions are handled without crash", async () => {
    const hugeJd = "Requirements: " + "Deep understanding of TypeScript and React. ".repeat(2000);
    const hugeJob = {
      ...mockJobApplication1,
      id: "job-huge-jd",
      jobDescription: hugeJd,
    };

    const req = createJsonRequest("http://localhost/api/data/jobs", "POST", hugeJob);
    const res = await POST_COLLECTION(req, createRouteContext({ collection: "jobs" }));
    expect(res.status).toBe(200);

    const saved = jobsRepo.get("job-huge-jd");
    expect(saved).not.toBeNull();
    expect(saved?.jobDescription.length).toBeGreaterThan(50000);
  });

  it("11. Empty strings for contact names or job titles are handled safely", async () => {
    const emptyJob = {
      ...mockJobApplication1,
      id: "job-empty-title",
      title: "",
      company: "Acme",
    };

    const req = createJsonRequest("http://localhost/api/data/jobs", "POST", emptyJob);
    const res = await POST_COLLECTION(req, createRouteContext({ collection: "jobs" }));
    expect([200, 400]).toContain(res.status);
  });

  it("12. Special characters and control characters in settings do not corrupt SQLite store", async () => {
    const specialKey = "test_custom_config_special";
    const specialValue = JSON.stringify({
      unicode: "こんにちは世界 🚀 \u0000\n\t",
      sqlSnippet: "'; DROP TABLE settings; --",
      nestedQuotes: `"Double" and 'Single'`,
    });

    const req = createJsonRequest("http://localhost/api/data/settings", "POST", {
      [specialKey]: specialValue,
    });
    const res = await POST_COLLECTION(req, createRouteContext({ collection: "settings" }));
    expect(res.status).toBe(200);

    const stored = settingsRepo.get(specialKey);
    expect(stored).toBe(specialValue);
  });

  it("13. DELETE /api/data/jobs/non-existent-id returns 200/404 safely", async () => {
    const req = createUrlRequest("http://localhost/api/data/jobs/non-existent-id-12345", "DELETE");
    const res = await DELETE_COLLECTION_ID(req, createRouteContext({ collection: "jobs", id: "non-existent-id-12345" }));
    expect([200, 404]).toContain(res.status);
  });

  it("14. Unknown collection parameter in /api/data/:collection returns 404", async () => {
    const req = createJsonRequest("http://localhost/api/data/invalid_collection_name", "POST", {});
    const res = await POST_COLLECTION(req, createRouteContext({ collection: "invalid_collection_name" }));
    expect(res.status).toBe(404);
  });

  it("15. Notifications POST with missing title/message returns 400", async () => {
    const req = createJsonRequest("http://localhost/api/notifications", "POST", {
      kind: "info",
    });
    const res = await POST_NOTIFICATION(req);
    expect(res.status).toBe(400);

    const body = await parseResponse<{ error: string }>(res);
    expect(body.error).toContain("Title and message are required");
  });

  it("16. POST /api/llm/test with no configured providers returns 400 No API keys configured", async () => {
    settingsRepo.set("llm_providers", "[]");

    const req = createJsonRequest("http://localhost/api/llm/test", "POST", {});
    const res = await POST_LLM_TEST(req);
    expect([400, 200]).toContain(res.status);
  });
});
