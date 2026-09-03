import { describe, it, expect, beforeEach } from "vitest";
import { GET as GET_DATA } from "@/app/api/data/route";
import { POST as POST_SETTINGS } from "@/app/api/data/[collection]/route";
import { POST as POST_ASSISTANT } from "@/app/api/assistant/route";
import {
  createJsonRequest,
  createRouteContext,
  parseResponse,
  resetTestDb,
  wipeAllTables,
  isSeeded,
  bootstrapSeed,
  settingsRepo,
  metaRepo,
  jobsRepo,
} from "../helpers/testHarness";
import { mockUserProfile } from "../helpers/testFixtures";

describe("Tier 1: Feature Coverage — Auth, Bootstrap & Settings Management", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("1. GET /api/data hydrates complete application register on cold boot", async () => {
    wipeAllTables();
    expect(jobsRepo.count()).toBe(0);

    const res = await GET_DATA();
    expect(res.status).toBe(200);

    const data = await parseResponse<{
      jobs: unknown[];
      contacts: unknown[];
      emails: unknown[];
      interviews: unknown[];
      reminders: unknown[];
      settings: Record<string, string>;
    }>(res);

    expect(Array.isArray(data.jobs)).toBe(true);
    expect(data.jobs.length).toBeGreaterThan(0);
    expect(typeof data.settings).toBe("object");
    expect(data.settings).toBeDefined();
  });

  it("2. isSeeded() returns true after bootstrap; seed_version is recorded in meta table", () => {
    bootstrapSeed();
    expect(isSeeded()).toBe(true);
    expect(metaRepo.get("seed_version")).toBe("1");
  });

  it("3. bootstrapSeed() is strictly idempotent across repeated invocations", () => {
    bootstrapSeed();
    const countFirst = jobsRepo.count();

    bootstrapSeed();
    bootstrapSeed();
    const countSecond = jobsRepo.count();

    expect(countSecond).toBe(countFirst);
    expect(isSeeded()).toBe(true);
  });

  it("4. Default user profile is created when cold-booting, preventing assistant 400 errors", () => {
    bootstrapSeed();
    const profileRaw = settingsRepo.get("profile");
    expect(profileRaw).toBeDefined();
    expect(profileRaw).not.toBeNull();

    const profile = JSON.parse(profileRaw!);
    expect(profile.name).toBeDefined();
    expect(profile.targetTitle).toBeDefined();
  });

  it("5. POST /api/data/settings updates candidate profile and persists to SQLite", async () => {
    const updatedProfile = {
      ...mockUserProfile,
      name: "Morgan Lead Engineer",
      targetTitle: "Director of Engineering",
    };

    const req = createJsonRequest("http://localhost/api/data/settings", "POST", {
      profile: JSON.stringify(updatedProfile),
    });

    const res = await POST_SETTINGS(req, createRouteContext({ collection: "settings" }));
    expect(res.status).toBe(200);

    const storedRaw = settingsRepo.get("profile");
    expect(storedRaw).toBeDefined();
    const stored = JSON.parse(storedRaw!);
    expect(stored.name).toBe("Morgan Lead Engineer");
    expect(stored.targetTitle).toBe("Director of Engineering");
  });

  it("6. Stored LLM provider API keys are masked with bullets when returned by GET /api/data", async () => {
    const secretKey = "sk-live-super-secret-key-123456789";
    settingsRepo.set(
      "llm_providers",
      JSON.stringify([
        {
          id: "openrouter",
          name: "OpenRouter",
          apiKey: secretKey,
          model: "anthropic/claude-3.5-sonnet",
          enabled: true,
        },
      ])
    );

    const res = await GET_DATA();
    expect(res.status).toBe(200);
    const data = await parseResponse<{ settings: Record<string, string> }>(res);

    const exposedProviders = JSON.parse(data.settings.llm_providers);
    expect(exposedProviders[0].apiKey).not.toBe(secretKey);
    expect(exposedProviders[0].apiKey).toContain("••");
  });

  it("7. Stored Mail SMTP/IMAP passwords are redacted when returned by GET /api/data", async () => {
    const rawPass = "super_secret_smtp_password_999";
    settingsRepo.set(
      "mail_settings",
      JSON.stringify({
        smtpHost: "smtp.example.com",
        smtpUser: "user@example.com",
        smtpPass: rawPass,
        imapHost: "imap.example.com",
        imapUser: "user@example.com",
        imapPass: rawPass,
      })
    );

    const res = await GET_DATA();
    const data = await parseResponse<{ settings: Record<string, string> }>(res);

    const exposedMail = JSON.parse(data.settings.mail_settings);
    expect(exposedMail.smtpPass).not.toBe(rawPass);
    expect(exposedMail.imapPass).not.toBe(rawPass);
    expect(exposedMail.smtpPass).toContain("••");
  });

  it("8. Gmail OAuth tokens (accessToken, refreshToken) are never leaked to client JSON", async () => {
    settingsRepo.set(
      "gmail_settings",
      JSON.stringify({
        connected: true,
        email: "user@gmail.com",
        accessToken: "ya29.secret-access-token-123",
        refreshToken: "1//secret-refresh-token-456",
        expiresAt: Date.now() + 3600000,
      })
    );

    const res = await GET_DATA();
    const data = await parseResponse<{ settings: Record<string, string> }>(res);

    if (data.settings.gmail_settings) {
      const parsed = JSON.parse(data.settings.gmail_settings);
      expect(parsed.accessToken).toBeUndefined();
      expect(parsed.refreshToken).toBeUndefined();
    }
  });

  it("9. Round-tripping masked API keys via POST /api/data/settings preserves the true stored secrets", async () => {
    const secretKey = "sk-ant-actual-secret-key-999888777";
    settingsRepo.set(
      "llm_providers",
      JSON.stringify([
        {
          id: "anthropic",
          name: "Anthropic",
          apiKey: secretKey,
          model: "claude-3-5-sonnet-20241022",
          enabled: true,
        },
      ])
    );

    // Frontend gets data with masked keys:
    const getRes = await GET_DATA();
    const getData = await parseResponse<{ settings: Record<string, string> }>(getRes);

    // Frontend posts back settings including masked keys:
    const postReq = createJsonRequest("http://localhost/api/data/settings", "POST", {
      llm_providers: getData.settings.llm_providers,
    });
    const postRes = await POST_SETTINGS(postReq, createRouteContext({ collection: "settings" }));
    expect(postRes.status).toBe(200);

    // Internal database must still retain the real secret:
    const stored = JSON.parse(settingsRepo.get("llm_providers")!);
    expect(stored[0].apiKey).toBe(secretKey);
  });

  it("10. Cloudinary settings round-trip securely with masked API secrets", async () => {
    const realApiSecret = "cloudinary_secret_key_abcdef123456";
    settingsRepo.set(
      "cloudinary_settings",
      JSON.stringify({
        cloudName: "my-huntflow-cloud",
        apiKey: "123456789012345",
        apiSecret: realApiSecret,
        concurrency: 4,
      })
    );

    const getRes = await GET_DATA();
    const getData = await parseResponse<{ settings: Record<string, string> }>(getRes);

    // Save back with masked secret
    const postReq = createJsonRequest("http://localhost/api/data/settings", "POST", {
      cloudinary_settings: getData.settings.cloudinary_settings,
    });
    const postRes = await POST_SETTINGS(postReq, createRouteContext({ collection: "settings" }));
    expect(postRes.status).toBe(200);

    const stored = JSON.parse(settingsRepo.get("cloudinary_settings")!);
    expect(stored.apiSecret).toBe(realApiSecret);
    expect(stored.concurrency).toBe(4);
  });

  it("11. Unconfigured provider state returns appropriate status flags without throwing unhandled exceptions", async () => {
    settingsRepo.set("llm_providers", "[]");
    const res = await GET_DATA();
    expect(res.status).toBe(200);
    const data = await parseResponse<{ settings: Record<string, string> }>(res);
    expect(data.settings).toBeDefined();
  });

  it("12. Assistant responds gracefully in cold-boot state without prior chat history", async () => {
    bootstrapSeed();
    const req = createJsonRequest("http://localhost/api/assistant", "POST", {
      message: "What is my current application pipeline status?",
      profile: mockUserProfile,
    });

    const res = await POST_ASSISTANT(req);
    expect(res.status).toBe(200);
    const body = await parseResponse<{ reply?: string; ok?: boolean }>(res);
    expect(body.reply || body.ok).toBeTruthy();
  });
});
