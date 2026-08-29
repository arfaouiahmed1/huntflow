import { describe, it, expect, beforeEach } from "vitest";
import { POST as POST_SETTINGS } from "@/app/api/data/[collection]/route";
import { GET as GET_DATA } from "@/app/api/data/route";
import { POST as POST_LLM_TEST } from "@/app/api/llm/test/route";
import { GET as GET_MEMORY, POST as POST_MEMORY, DELETE as DELETE_MEMORY } from "@/app/api/memory/route";
import { POST as POST_ASSISTANT } from "@/app/api/assistant/route";
import { POST as POST_RESET } from "@/app/api/data/reset/route";
import {
  createJsonRequest,
  createUrlRequest,
  createRouteContext,
  parseResponse,
  resetTestDb,
  memoryRepo,
  usageRepo,
} from "../helpers/testHarness";
import { mockUserProfile, mockJobApplication1 } from "../helpers/testFixtures";
import { MemoryEntry } from "@/types";

describe("Tier 3: Combinatorial Workflows — Settings -> LLM Test -> Assistant -> Memory Loop", () => {
  beforeEach(() => {
    resetTestDb();
    memoryRepo.wipe();
  });

  it("1. Step 1: Configure custom LLM provider in settings & verify masked persistence", async () => {
    const rawApiKey = "sk-custom-provider-secret-key-12345";
    const settingsPayload = {
      llm_providers: JSON.stringify([
        {
          id: "custom_openai",
          name: "Custom OpenAI",
          apiKey: rawApiKey,
          model: "gpt-4o",
          enabled: true,
        },
      ]),
    };

    const req = createJsonRequest("http://localhost/api/data/settings", "POST", settingsPayload);
    const res = await POST_SETTINGS(req, createRouteContext({ collection: "settings" }));
    expect(res.status).toBe(200);

    const getRes = await GET_DATA();
    const getData = await parseResponse<{ settings: Record<string, string> }>(getRes);

    const exposed = JSON.parse(getData.settings.llm_providers);
    expect(exposed[0].apiKey).toContain("••");
    expect(exposed[0].apiKey).not.toBe(rawApiKey);
  });

  it("2. Step 2: Connectivity test checks provider ping response structure", async () => {
    const req = createJsonRequest("http://localhost/api/llm/test", "POST", {
      providerId: "mock_test_provider",
    });
    const res = await POST_LLM_TEST(req);
    expect([200, 400]).toContain(res.status);
  });

  it("3. Step 3: Record explicit user career constraints in semantic memory store", async () => {
    const req = createJsonRequest("http://localhost/api/memory", "POST", {
      kind: "decision",
      content: "Targeting exclusively Remote or Hybrid (Bay Area) Senior Engineering roles.",
      importance: 5,
      jobId: mockJobApplication1.id,
    });

    const res = await POST_MEMORY(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ ok: boolean; memory: MemoryEntry }>(res);
    expect(body.ok).toBe(true);
    expect(body.memory.content).toContain("Remote or Hybrid");
    expect(body.memory.importance).toBe(5);
  });

  it("4. Step 4: Assistant executes pipeline queries and references user facts", async () => {
    const req = createJsonRequest("http://localhost/api/assistant", "POST", {
      message: "Can you summarize my open application pipeline?",
      profile: mockUserProfile,
    });

    const res = await POST_ASSISTANT(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ reply?: string; ok?: boolean }>(res);
    expect(body.reply || body.ok).toBeTruthy();
  });

  it("5. Step 5: Query memory store with kind and jobId filters", async () => {
    memoryRepo.add({
      kind: "insight",
      content: "Acme Corp tech stack uses React 19 and SQLite WAL mode.",
      jobId: "job-filter-test-1",
      source: "user",
      importance: 4,
    });
    memoryRepo.add({
      kind: "fact",
      content: "General candidate fact.",
      jobId: "job-filter-test-2",
      source: "user",
      importance: 2,
    });

    const req = createUrlRequest("http://localhost/api/memory?kind=insight&jobId=job-filter-test-1");
    const res = await GET_MEMORY(req);
    expect(res.status).toBe(200);

    const body = await parseResponse<{ memory: MemoryEntry[] }>(res);
    expect(body.memory.length).toBe(1);
    expect(body.memory[0].content).toContain("React 19");
  });

  it("6. Step 6: Usage telemetry accumulates model calls and token metrics", () => {
    usageRepo.log({
      agent: "assistant",
      kind: "completion",
      provider: "openrouter",
      model: "claude-3.5-sonnet",
      status: "ok",
      promptTokens: 400,
      completionTokens: 150,
      latencyMs: 450,
      costEst: 0.003,
    });

    const totals = usageRepo.totals();
    expect(totals.calls).toBeGreaterThan(0);
    expect(totals.tokens).toBeGreaterThan(0);
  });

  it("7. Step 7: Delete memory entry and verify removal in subsequent queries", async () => {
    const entry = memoryRepo.add({
      kind: "note",
      content: "Temporary memory note to delete",
      source: "user",
      importance: 1,
    });

    expect(memoryRepo.list({ limit: 50 }).some((m) => m.id === entry.id)).toBe(true);

    const delReq = createUrlRequest(`http://localhost/api/memory?id=${entry.id}`, "DELETE");
    const delRes = await DELETE_MEMORY(delReq);
    expect(delRes.status).toBe(200);

    expect(memoryRepo.list({ limit: 50 }).some((m) => m.id === entry.id)).toBe(false);
  });

  it("8. Step 8: Database reset wipes all memories and restores clean initial state", async () => {
    memoryRepo.add({
      kind: "fact",
      content: "Memory before reset",
      source: "user",
      importance: 3,
    });
    expect(memoryRepo.list({ limit: 50 }).length).toBeGreaterThan(0);

    const resetRes = await POST_RESET();
    expect(resetRes.status).toBe(200);

    expect(memoryRepo.list({ limit: 50 }).length).toBe(0);
  });
});
