# Learnings


## Task 5 (source taxonomy engine)
- L5.1: Node v24 in this environment strips TS types natively, so manual QA can import the real src/lib/sourceTaxonomy.ts directly from an out-of-worktree .mjs script — no vite-node/tsx install needed (vite-node is NOT present locally; npx would have downloaded it).
- L5.2: zod is 4.4.3 here: z.enum(<readonly tuple>) works directly with s const arrays; default z.object strips unknown keys (desired boundary behavior); issue paths join like existing alidation.ts.
- L5.3: Current CrawlerSource still lives inline in src/app/(app)/jobs/page.tsx:29 with old mixed category filters — Task 7 must swap it for this module's options + parsed sources.
- L5.4: vitest 4 warns about configLoader/native ESM but runs fine; red run must be captured before first implementation write or the "missing module" evidence is lost.

## Task 2 (design-system extraction)
- L2.1: The design system has exactly one source pair: `src/lib/theme.ts` (rawPalette/palette/tint/PaletteKey) + `src/app/globals.css` (:root vars, @theme inline aliases, 12 utility classes, 3 keyframes). 77 documented identifiers validate clean today.
- L2.2: `--font-manrope/-jetbrains/-document` are referenced by globals.css but defined by next/font in layout.tsx — the validator's `css.font-ref` kind checks references, not definitions; don't "fix" them into :root.
- L2.3: App-shell scroll ownership is document-level (html/body height:100%, no second app-shell page scroller); DESIGN.md §4 names representative nested owners without claiming an exhaustive allowlist. Sidebar is fixed at lg+ (236px rail), mobile bar sticky below lg — overlays anchor around both (`top-14` sheet vs `lg:left-[260px]`).
- L2.4: PdfPreview is a scoped document-simulation light island (#dfe3df plus paper/status colors), not a raw-color waiver for app chrome. AIStatusBadge is a confirmed legacy off-palette component (raw emerald/amber Tailwind colors), recorded as located debt without claiming it is the only deviation in the tree.
- L2.5: PowerShell double-quote escaping eats backticks when generating markdown fences from shell one-liners — a fence-less bad fixture made the validator vacuously pass (exit 0). Bad-path fixtures must be verified to actually fail before recording evidence; use literal here-strings for backtick content.

## Task 3 (React development diagnostics)
- L3.1: Turbopack (Next 16.3.1) follows every dynamic import() edge unconditionally when building the production module graph - compile-time-false process.env.NODE_ENV guards eliminate the call site but NOT the chunks. Verified twice: both an in-effect nested async import chain and a flat module-scope guarded import produced identical react-scan/react-grab orphan chunks in .next/static/chunks + .next/server/chunks/ssr. Webpack-era "guard the import behind NODE_ENV" folklore does not hold on Turbopack builds.
- L3.2: The only structural fix that keeps npm-installed diagnostic libs out of production output is to remove bundler-visible imports entirely: a dev-only route (/api/dev-tools) serves the packages' self-initializing dist/*.global.js bundles from node_modules, and the client leaf injects classic <script> tags from a runtime-fetched manifest. Zero tool-name literals and zero import() edges exist in shipped code; production answers 404 at three independent layers.
- L3.3: react-scan 0.5.x mounts its toolbar as #react-scan-root (older docs/versions used #react-scan-toolbar-root; the dist checks both ids). Its start() also self-disables when getIsProduction() unless dangerouslyForceRunInProduction - useful defense-in-depth, but never load-bearing for our gate.
- L3.4: React Scan's DevTools-hook instrumentation tolerates late attachment in Next dev (Next pre-creates __REACT_DEVTOOLS_GLOBAL_HOOK__), so post-hydration script injection still yields outlines + toolbar; the feared "[React Scan] Failed to load" 5s warning did not appear in any run.
- L3.5: React StrictMode double-effect + a module-level boolean init guard produces a false-negative report race: the second effect short-circuits to {false,false} while the first effect's result is discarded by cleanup. Share one module-level Promise instead of a boolean.
- L3.6: 
ext start refuses to serve an output: "standalone" build; production QA must run 
ode .next/standalone/server.js with PORT env instead.
- L3.7: Production marker scans must exclude .next/dev/** (Turbopack dev-server artifacts from QA runs) and .next/cache/** (persistent compiler caches); neither is deployable output. .next/standalone/package.json legitimately lists devDependency names - metadata, not code.
- L3.8: react-doctor 0.9.12 audits the whole repo (--json --json-out, --no-telemetry, default --blocking error exits non-zero on pre-existing findings). Current baseline: 15 errors / 412 warnings across 61 files, ZERO touching task-03 files - remediation belongs to F2, not Task 3.


## Task 4 — source contract

- Sidecar uv env has no httpx, so fastapi TestClient raises at import and adding it would violate the no-new-dependency constraint; a bounded isolated `uv run uvicorn server:app --port <ephemeral>` probed via Invoke-RestMethod gives equivalent HTTP-level evidence with deterministic cleanup.
- sources.json is CRLF: hashing via read_text() silently LF-translates and mismatches Get-FileHash baselines — byte-exact guards must use read_bytes().
- Text-level line-walk insertion anchored on each board's "workMode" line (non-_meta sections only) plus a deep pre-existing-values-unchanged guard makes a 30-board metadata edit provably bounded.
- git diff on this dirty tree compares against HEAD, not the Task 1 baseline; only baseline-hash comparison isolates worker deltas.

