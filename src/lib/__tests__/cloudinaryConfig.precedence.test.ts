import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { settingsRepo } from "@/lib/db";

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete (process.env as Record<string, string | undefined>)[name];
  else process.env[name] = value;
}

describe("Task 20 — Cloudinary precedence Settings > env > local-only", () => {
  const orig = { cloudName: process.env.CLOUDINARY_CLOUD_NAME, apiKey: process.env.CLOUDINARY_API_KEY, apiSecret: process.env.CLOUDINARY_API_SECRET };
  beforeEach(() => { settingsRepo.wipe(); vi.resetModules(); });
  afterEach(() => {
    setEnv("CLOUDINARY_CLOUD_NAME", orig.cloudName);
    setEnv("CLOUDINARY_API_KEY", orig.apiKey);
    setEnv("CLOUDINARY_API_SECRET", orig.apiSecret);
    settingsRepo.wipe();
  });

  it("Settings wins over env", async () => {
    setEnv("CLOUDINARY_CLOUD_NAME", "env-cloud");
    setEnv("CLOUDINARY_API_KEY", "env-key");
    setEnv("CLOUDINARY_API_SECRET", "env-secret");
    settingsRepo.set("cloudinary_settings", JSON.stringify({ cloudName: "settings-cloud", apiKey: "settings-key", apiSecret: "settings-secret", concurrency: 4 }));
    const { resolveCloudinaryConfig, isCloudinaryConfigured } = await import("@/lib/cloudinaryConfig");
    const cfg = resolveCloudinaryConfig();
    expect(cfg.cloudName).toBe("settings-cloud");
    expect(cfg.apiKey).toBe("settings-key");
    expect(cfg.apiSecret).toBe("settings-secret");
    expect(cfg.concurrency).toBe(4);
    expect(isCloudinaryConfigured(cfg)).toBe(true);
  });

  it("blank Settings field falls back to env (trim)", async () => {
    setEnv("CLOUDINARY_CLOUD_NAME", "env-cloud");
    setEnv("CLOUDINARY_API_KEY", "env-key");
    setEnv("CLOUDINARY_API_SECRET", "env-secret");
    settingsRepo.set("cloudinary_settings", JSON.stringify({ cloudName: "  ", apiKey: "", apiSecret: "   ", concurrency: 2 }));
    const { withEnvFallback } = await import("@/lib/cloudinaryConfig");
    const cfg = withEnvFallback({ cloudName: "  ", apiKey: "", apiSecret: "   ", concurrency: 2 });
    expect(cfg.cloudName).toBe("env-cloud");
    expect(cfg.apiKey).toBe("env-key");
    expect(cfg.apiSecret).toBe("env-secret");
  });

  it("partial Settings + env fallback per field", async () => {
    setEnv("CLOUDINARY_CLOUD_NAME", "env-cloud");
    setEnv("CLOUDINARY_API_KEY", "env-key");
    setEnv("CLOUDINARY_API_SECRET", undefined);
    const { withEnvFallback } = await import("@/lib/cloudinaryConfig");
    const cfg = withEnvFallback({ cloudName: "settings-cloud", apiKey: "", apiSecret: "" });
    expect(cfg.cloudName).toBe("settings-cloud");
    expect(cfg.apiKey).toBe("env-key");
    expect(cfg.apiSecret).toBe("");
  });

  it("local-only fallback when both missing -> not configured, no network", async () => {
    setEnv("CLOUDINARY_CLOUD_NAME", undefined);
    setEnv("CLOUDINARY_API_KEY", undefined);
    setEnv("CLOUDINARY_API_SECRET", undefined);
    settingsRepo.wipe();
    const { resolveCloudinaryConfig, isCloudinaryConfigured, withEnvFallback } = await import("@/lib/cloudinaryConfig");
    const cfg = resolveCloudinaryConfig();
    expect(cfg.cloudName).toBe("");
    expect(cfg.apiKey).toBe("");
    expect(cfg.apiSecret).toBe("");
    expect(cfg.concurrency).toBe(0);
    expect(isCloudinaryConfigured(cfg)).toBe(false);
    expect(isCloudinaryConfigured()).toBe(false);
    // withEnvFallback with empty partial also yields local-only
    expect(withEnvFallback({}).cloudName).toBe("");
    // prove no network call is made during config resolution (module has no fetch)
    const spy = vi.spyOn(globalThis, "fetch");
    resolveCloudinaryConfig();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("concurrency clamped 0..16 and env not used for concurrency", async () => {
    const { withEnvFallback } = await import("@/lib/cloudinaryConfig");
    expect(withEnvFallback({ concurrency: 99 }).concurrency).toBe(16);
    expect(withEnvFallback({ concurrency: -5 }).concurrency).toBe(0);
    expect(withEnvFallback({ concurrency: 0 }).concurrency).toBe(0);
    expect(withEnvFallback({ concurrency: 3 }).concurrency).toBe(3);
    expect(withEnvFallback({ concurrency: NaN }).concurrency).toBe(0);
  });

  it("bounded file", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/cloudinaryConfig.ts"), "utf-8");
    expect(src.split("\n").length).toBeLessThanOrEqual(80);
    expect(src).toContain("firstNonEmpty");
    expect(src).toContain("withEnvFallback");
  });
});
