/**
 * Single resolution point for Cloudinary credentials and crawler concurrency.
 *
 * Precedence: an explicit Settings-page value (the `cloudinary_settings` row in
 * SQLite) wins; blank fields fall back to the CLOUDINARY_* environment
 * variables from `.env` / docker-compose:
 *
 *   CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
 *
 * The Scrapling sidecar (scrapling-agent/server.py) reads the same env vars at
 * boot and accepts overrides via POST /config — this module feeds that sync so
 * both paths stay consistent. Values returned here are server-side only; never
 * send apiSecret to a client without masking (see redactSettings).
 */
import { settingsRepo } from "@/lib/db";

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** Stored crawler worker count, clamped to 1..16; 0 when unset. */
  concurrency: number;
}

interface StoredCloudinarySettings {
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
  concurrency?: number;
}

function readStored(): StoredCloudinarySettings {
  try {
    const raw = settingsRepo.get("cloudinary_settings");
    if (!raw) return {};
    return JSON.parse(raw) as StoredCloudinarySettings;
  } catch {
    return {};
  }
}

function firstNonEmpty(...values: (string | undefined)[]): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export function resolveCloudinaryConfig(): CloudinaryConfig {
  return withEnvFallback(readStored());
}

/** Fill blank fields of a partial settings payload from CLOUDINARY_* env vars. */
export function withEnvFallback(partial: StoredCloudinarySettings): CloudinaryConfig {
  const rawConcurrency = Number(partial.concurrency);
  return {
    cloudName: firstNonEmpty(partial.cloudName, process.env.CLOUDINARY_CLOUD_NAME),
    apiKey: firstNonEmpty(partial.apiKey, process.env.CLOUDINARY_API_KEY),
    apiSecret: firstNonEmpty(partial.apiSecret, process.env.CLOUDINARY_API_SECRET),
    concurrency: Number.isFinite(rawConcurrency) ? Math.min(Math.max(Math.trunc(rawConcurrency), 0), 16) : 0,
  };
}

export function isCloudinaryConfigured(config = resolveCloudinaryConfig()): boolean {
  return Boolean(config.cloudName && config.apiKey && config.apiSecret);
}
