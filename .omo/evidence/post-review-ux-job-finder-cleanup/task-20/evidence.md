# Task 20 — Evidence: Lock Cloudinary precedence and local-only fallback

**Date:** 2026-08-29
**Scope:** `src/lib/cloudinaryConfig.ts` (67 lines) + `src/lib/__tests__/cloudinaryConfig.test.ts` (new)

## Implementation

- Precedence locked in `src/lib/cloudinaryConfig.ts`:
  ```ts
  export function resolveCloudinaryConfig(): CloudinaryConfig
  export function withEnvFallback(partial: StoredCloudinarySettings): CloudinaryConfig
  // Stored Settings row (cloudinary_settings) wins; blank fields fall back to CLOUDINARY_* env vars.
  // resolve → withEnvFallback(readStored()) → merges, trims, defaults.
  ```
  - `readStored()` reads `settingsRepo.get("cloudinary_settings")` JSON row.
  - `withEnvFallback` fills blank `cloudName/apiKey/apiSecret` from `process.env.CLOUDINARY_*`; `concurrency` defaults to 1 via `|| 1`.
- Local-only fallback: when both Settings row and env vars are empty, `isCloudinaryConfigured()` returns false and no network credential is fabricated — caller treats as local-only mode.

## Verification

- Created `src/lib/__tests__/cloudinaryConfig.test.ts` (3 cases):
  - Settings row overrides env (`cloudName` from Settings wins even if env differs).
  - Env fallback fills blanks when Settings row has empty strings.
  - Local-only when both missing (`isCloudinaryConfigured() === false`, no fetch).
- `npx vitest run src/lib/__tests__/cloudinaryConfig.test.ts` → 3/3 pass (isolated DB, mocked `process.env`).
- `npx tsc --noEmit` 0.
- Bounded: `cloudinaryConfig.ts` 67 lines.

## Files

- Reuse `src/lib/cloudinaryConfig.ts`
- Create `src/lib/__tests__/cloudinaryConfig.test.ts`

