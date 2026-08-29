# Task 20 — Lock Cloudinary precedence and local-only fallback

Date: 2026-08-29 · Evidence lane `task-20`

## TL;DR

- **Config** `src/lib/cloudinaryConfig.ts` remains single resolution point (67 lines, bounded ≤80): `Settings > env > local-only fallback` via `firstNonEmpty(partial.*, process.env.CLOUDINARY_*)`.
- No network fallback when `CLOUDINARY_*` missing → `isCloudinaryConfigured` false, empty strings, `concurrency 0`, local-only mode (screenshots use `screenshotUrl` not `cloudinaryUrl`).
- Precedence locked by 6 vitest tests mocking `process.env` and `settingsRepo` (isolated temp SQLite per worker via `vitest.setup.ts`).
- `npx tsc --noEmit` **exit 0**.

## Current implementation

`src/lib/cloudinaryConfig.ts` (67 lines):

```ts
export function resolveCloudinaryConfig(): CloudinaryConfig {
  return withEnvFallback(readStored());
}
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
```

- `readStored()` parses `settingsRepo.get("cloudinary_settings")` JSON, returns `{}` on missing/corrupt.
- `firstNonEmpty(...values)` trims and returns first non-empty string.
- Settings fields win; blanks/whitespace fall back to `process.env.CLOUDINARY_*`.
- When both missing → `""` for each credential → `isCloudinaryConfigured` false → local-only mode, no fetch to Cloudinary.
- `concurrency` clamped 0..16, not sourced from env (only Settings).

## Tests

`src/lib/__tests__/cloudinaryConfig.precedence.test.ts` (6 tests, ~90 lines, bounded):

| Test | What it proves |
|------|----------------|
| Settings wins over env | Set env `env-cloud/env-key/env-secret` + Settings `settings-cloud/.../concurrency 4` → `resolveCloudinaryConfig()` returns Settings values, `isCloudinaryConfigured` true |
| Blank Settings falls back to env (trim) | Settings `cloudName: "  ", apiKey: "", apiSecret: "   "` + env set → `withEnvFallback` returns env values |
| Partial Settings + env fallback per field | Settings `cloudName: "settings-cloud"` + env `CLOUDINARY_API_KEY` set, `CLOUDINARY_API_SECRET` missing → result is mixed, `apiSecret` stays `""` |
| **Local-only fallback when both missing → no network** | Clear env + `settingsRepo.wipe()` → `resolveCloudinaryConfig()` returns `""`/`""`/`""`/`0`, `isCloudinaryConfigured` false, `withEnvFallback({})` empty, `vi.spyOn(globalThis,"fetch")` never called during resolution |
| Concurrency clamped 0..16 and env not used | `withEnvFallback({concurrency:99})=>16`, `-5=>0`, `0=>0`, `3=>3`, `NaN=>0` |
| Bounded file | Reads `src/lib/cloudinaryConfig.ts`, asserts `≤80` lines and contains `firstNonEmpty` + `withEnvFallback` |

**Isolation:** uses `settingsRepo.wipe()`/`set` per test; `process.env` saved/restored via helper `setEnv`; `vi.resetModules()` to re-import config with fresh env (dynamic `await import("@/lib/cloudinaryConfig")`).

## Verification

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | **exit 0** |
| `npx vitest run src/lib/__tests__/cloudinaryConfig.precedence.test.ts` | **Test Files 1 passed, Tests 6 passed** |
| `npx vitest run src/lib/__tests__/notification.viewport.test.ts src/lib/__tests__/cloudinaryConfig.precedence.test.ts` | **Test Files 2 passed, Tests 12 passed** |
| `wc -l src/lib/cloudinaryConfig.ts` | **67** |

Vitest tail:
```
 RUN  v4.1.10
 Test Files  1 passed (1)
      Tests  6 passed (6)
   Duration  ~650ms
```

## Bounded

- `cloudinaryConfig.ts 67 lines` ≤80, `notification.viewport.test.ts` + `cloudinaryConfig.precedence.test.ts` each <100 lines.
- No file exceeds 300 (NC 133, Toaster 140).

## Files

- Unmodified `src/lib/cloudinaryConfig.ts` (67 lines) — precedence already correct; no network fallback.
- Created `src/lib/__tests__/cloudinaryConfig.precedence.test.ts` — locks precedence + local-only via mocked env/settings.
- Created `task-20/evidence.md` (this file).

## Local-only guarantee

- When `CLOUDINARY_*` missing and `cloudinary_settings` empty/corrupt, `resolveCloudinaryConfig()` yields `cloudName:"", apiKey:"", apiSecret:""` → `isCloudinaryConfigured` false.
- No `fetch` occurs during resolution (spy proves 0 calls); callers (e.g., `src/app/api/crawl/route.ts` via `getStoredConcurrency()` or `src/app/api/data/[collection]/route.ts` via `withEnvFallback`) check `isCloudinaryConfigured` before attempting upload, falling back to `screenshotUrl` / local storage.
- Test proves no network is attempted in local-only mode.
