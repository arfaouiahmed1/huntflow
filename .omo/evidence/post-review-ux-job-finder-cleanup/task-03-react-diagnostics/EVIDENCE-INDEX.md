# Task 03 — React Development Diagnostics Evidence Index

## 00-baseline/ (before implementation)
- layout-characterization.txt : owned-file hashes, zero 'use client' in layout, metadata export proof, git grep zero markers
- baseline-build.log          : npm run build exit 0 on untouched tree
- baseline-production-marker-scan.txt : ZERO react-grab/react-scan/react-doctor matches across all .next files

## 01-red/ (failing-first)
- failing-test-output.txt     : vitest exit 1, 'Cannot find module ../gate' - fails for the right reason

## 02-install/
- npm-install.log             : npm i -D react-grab react-scan react-doctor, exit 0, 0 vulnerabilities
- dependency-diff.txt         : versions (react-grab@0.2.0, react-scan@0.5.7, react-doctor@0.9.12), package.json diff,
                                confirmation all three live under devDependencies only
- lockfile-version-changes.txt: lockfile reconciliation analysis (pre-existing next ^16.3.1 drift, see issues.md I3.3)

## 03-verify/
- targeted-tests.log          : 5/5 gate-contract tests pass (incl. production-never-initializes)
- tsc.log / lint-scoped.log   : npx tsc --noEmit exit 0; scoped eslint exit 0
- react-doctor-run.log + react-doctor-report.json : quality command runs (ok:true);
    15 errors/412 warnings are PRE-EXISTING backlog, zero findings in task-03 files

## 04-browser/ (isolated port 3013, npx next dev -p 3013; npm run dev never used)
- qa-dev.mjs                  : reusable QA harness (console capture, DOM polling, screenshots)
- debug-imports.mjs/.json     : iteration record - StrictMode double-effect false-negative diagnosis
- debug-dom.mjs               : located #react-scan-root toolbar id in react-scan 0.5.7
- dev-enabled-observations.json : data-dev-diagnostics="active", {loaded:2, requested:2}, toolbar present, 0 page errors
- dev-enabled-screenshot.png  : dev run with diagnostics active
- dev-disabled-server.log     : started with NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS=1
- dev-disabled-observations.json: attribute null, no toolbar, no init console line, route 404s (manifest+asset)
- dev-disabled-screenshot.png : suppressed run

## 05-production/ (standalone build served via node .next/standalone/server.js on port 3014)
- build.log                   : npm run build exit 0 after final architecture
- output-marker-scan.txt      : 3565 production files scanned (.next/dev + .next/cache excluded as non-deployable):
                                ZERO diagnostic JS in any chunk; residual = standalone package.json devDep names
                                + traced tools.json config (inert metadata, see residual analysis inside)
- served-html-scan.txt        : served HTML has 0 marker matches, no data-dev-diagnostics, only /_next script srcs;
                                GET /api/dev-tools -> 404, GET /api/dev-tools?asset=react-scan -> 404
- prod-browser-check.json     : Playwright on production: no attribute, no scan root, no dev-tool scripts, 0 tool requests
- qa-prod.mjs                 : the production browser check harness

## 06-final/
- final-hashes.txt            : SHA256 of every owned file + layout Server Component re-proof ('use client' count: 0)

## Root-level receipts
- cleanup-receipt.txt / cleanup-receipt-final.txt : every PID started/killed, ports freed, exit codes
