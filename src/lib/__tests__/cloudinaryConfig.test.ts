import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { settingsRepo } from "@/lib/db";
import { withEnvFallback, resolveCloudinaryConfig, isCloudinaryConfigured } from "@/lib/cloudinaryConfig";

const KEY = "cloudinary_settings";

function setStored(v: Record<string, unknown> | null) {
  if (v === null) settingsRepo.set(KEY, "");
  else settingsRepo.set(KEY, JSON.stringify(v));
}

describe("cloudinaryConfig — Settings > env > local-only", () => {
  const envBackup = { ...process.env };
  beforeEach(() => {
    settingsRepo.set(KEY, "");
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    process.env = { ...envBackup };
    settingsRepo.set(KEY, "");
  });

  it("Settings row overrides env", () => {
    process.env.CLOUDINARY_CLOUD_NAME = "env-cloud";
    process.env.CLOUDINARY_API_KEY = "env-key";
    process.env.CLOUDINARY_API_SECRET = "env-secret";
    setStored({ cloudName: "settings-cloud", apiKey: "settings-key", apiSecret: "settings-secret" });
    const cfg = resolveCloudinaryConfig();
    expect(cfg.cloudName).toBe("settings-cloud");
    expect(cfg.apiKey).toBe("settings-key");
    expect(cfg.apiSecret).toBe("settings-secret");
  });

  it("Env fallback fills blank Settings fields", () => {
    process.env.CLOUDINARY_CLOUD_NAME = "env-cloud";
    process.env.CLOUDINARY_API_KEY = "env-key";
    process.env.CLOUDINARY_API_SECRET = "env-secret";
    setStored({ cloudName: " ", apiKey: "", apiSecret: undefined });
    const cfg = resolveCloudinaryConfig();
    expect(cfg.cloudName).toBe("env-cloud");
    expect(cfg.apiKey).toBe("env-key");
    expect(cfg.apiSecret).toBe("env-secret");
  });

  it("local-only when both missing — no network fallback fabricated", () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    setStored(null);
    const cfg = resolveCloudinaryConfig();
    expect(cfg.cloudName).toBe("");
    expect(isCloudinaryConfigured(cfg)).toBe(false);
  });

  it("withEnvFallback clamps concurrency and trims", () => {
    process.env.CLOUDINARY_CLOUD_NAME = "  env-cloud  ";
    const cfg = withEnvFallback({ cloudName: " ", concurrency: 99 });
    expect(cfg.cloudName).toBe("env-cloud");
    expect(cfg.concurrency).toBe(16);
    expect(withEnvFallback({ concurrency: -5 }).concurrency).toBe(0);
    expect(withEnvFallback({ concurrency: 0 }).concurrency).toBe(0);
  });
});
