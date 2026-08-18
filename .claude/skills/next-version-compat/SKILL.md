---
name: next-version-compat
description: This bundled Next.js is a breaking-change version. Read the bundled docs (node_modules/next/dist/docs/) before writing or editing any app-router, route handler, server action, or configuration code; honor deprecation notices. Use whenever touching src/app, src/lib server code, or next.config.
metadata:
  type: reference
---

# Next.js 16 Version Compatibility

This project uses **Next.js 16.2.12** (see `package.json`), which the project's `AGENTS.md`
explicitly warns contains **breaking changes** relative to what Claude knows:

> "This is NOT the Next.js you know. APIs, conventions, and file structure may all differ
> from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before
> writing any code. Heed deprecation notices."

Do not rely on memory of Next.js 12–15 conventions. Verify against the bundled docs.

## When to invoke (Claude-auto)

Trigger automatically (Claude-only) whenever working with:

- Any file under `src/app/` (routes, layouts, server actions, `page.tsx`/`route.ts`/`layout.tsx`)
- Next.js config (`next.config.ts`)
- Server-side code in `src/lib/` that touches headers, cookies, dynamic rendering, caching, or revalidation
- Client vs server component boundaries, `'use client'`/`'use server'` directives

## Procedure

1. **Locate the relevant guide** under the bundled docs:
   ```bash
   ls node_modules/next/dist/docs/
   # App router lives under 01-app/, pages router under 02-pages/, config under 03-architecture/
   ```
2. **Open the specific section** for the API you're touching (e.g. `01-app/.../route.md`, `upgrading/`)
   rather than reading the whole tree — the docs are large.
3. **Heed deprecation notices.** If a guide marks an API deprecated or replaced, use the
   replacement and note the migration path in your change.
4. **Match file structure conventions** the docs describe exactly — route type files
   (`route.ts`, `page.tsx`, `route-handler`), async APIs, and parameter/context shapes
   may differ from legacy Next.js.
5. If a route handler or server action, confirm the web/search/cache contract (e.g. use of
   `cookies()`, `headers()`, `cacheTag`/`cacheLife`, `unstable_*` renames) before mocking or
   unit-testing it.

## Anti-patterns

- ✗ Assuming `getServerSideProps` / `getStaticProps` (pages router) exist for app-router routes.
- ✗ Writing a route handler from memory of `NextRequest`/`NextResponse` signatures — verify.
- ✗ Copying patterns from other repos on newer/older Next.js without checking this version.
- ✗ Ignoring a deprecation warning in the bundled docs because "it still builds."

## Related

- The LangGraph / LLM server routes under `src/app/api/` are the highest-risk for version
  drift — when editing those, always run this check.