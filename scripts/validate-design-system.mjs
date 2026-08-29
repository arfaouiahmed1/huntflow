#!/usr/bin/env node
/**
 * validate-design-system.mjs — HUNTFLOW design-system token gate.
 *
 * Compares every documented token identifier in DESIGN.md (`token-inventory`
 * fenced blocks) against the live exports in src/lib/theme.ts and the CSS
 * identifiers in src/app/globals.css.
 *
 * Kinds:
 *   theme.export:<name>   top-level export in theme.ts
 *   palette.key:<key>     key of rawPalette in theme.ts
 *   css.var:--name        custom property DEFINED in globals.css (:root / @theme)
 *   css.font-ref:--name   custom property REFERENCED via var() in globals.css
 *                         (next/font variables are defined in layout.tsx)
 *   utility:.name         class selector defined in globals.css
 *   keyframe:name         @keyframes name defined in globals.css
 *   tw.theme:color-x      Tailwind alias -> requires `--color-x` (or --<id>) defined
 *
 * Exit codes: 0 = all documented tokens exist; 1 = unknown tokens found or
 * structural failure (missing files, no inventory blocks). Unknown tokens are
 * named explicitly on stderr and in JSON output.
 *
 * Usage:
 *   node scripts/validate-design-system.mjs [--design <path>] [--json]
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");

// --- args ------------------------------------------------------------------
const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}
const hasFlag = (f) => args.includes(f);
const asJson = hasFlag("--json");
const designPath = resolve(root, argValue("--design") ?? "DESIGN.md");
const themePath = resolve(root, "src/lib/theme.ts");
const cssPath = resolve(root, "src/app/globals.css");

// --- load sources ----------------------------------------------------------
let themeSource;
let cssSource;
let designSource;
try {
  themeSource = readFileSync(themePath, "utf8");
} catch {
  fail(`Cannot read ${themePath}`);
}
try {
  cssSource = readFileSync(cssPath, "utf8");
} catch {
  fail(`Cannot read ${cssPath}`);
}
try {
  designSource = readFileSync(designPath, "utf8");
} catch {
  fail(`Cannot read design doc at ${designPath}`);
}

function fail(message) {
  if (asJson) {
    console.log(JSON.stringify({ ok: false, error: message, unknown: [] }, null, 2));
  } else {
    console.error(`✗ ${message}`);
  }
  process.exit(1);
}

// --- extract live identifiers ----------------------------------------------
const themeExports = new Set(
  [...themeSource.matchAll(/export\s+(?:const|function|type)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1])
);
const rawStart = themeSource.indexOf("rawPalette");
const rawEnd = themeSource.indexOf("} as const", rawStart);
if (rawStart === -1 || rawEnd === -1) fail("rawPalette object not found in theme.ts");
const paletteKeys = new Set(
  [...themeSource.slice(rawStart, rawEnd).matchAll(/^\s{2}([A-Za-z_$][\w$]*):/gm)].map((m) => m[1])
);
const cssDefined = new Set(
  [...cssSource.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1])
);
const cssReferenced = new Set(
  [...cssSource.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1])
);
const cssClasses = new Set(
  [...cssSource.matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1])
);
const cssKeyframes = new Set(
  [...cssSource.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1])
);

// --- extract documented tokens from token-inventory fences -----------------
const KINDS = ["theme.export", "palette.key", "css.var", "css.font-ref", "utility", "keyframe", "tw.theme"];
const fenceRe = /```token-inventory\s*\n([\s\S]*?)```/g;
const documented = [];
for (const fence of designSource.matchAll(fenceRe)) {
  for (const line of fence[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf(":");
    if (sep === -1) continue;
    const kind = trimmed.slice(0, sep);
    const id = trimmed.slice(sep + 1).trim();
    if (!KINDS.includes(kind) || !id) continue;
    documented.push({ kind, id });
  }
}
if (documented.length === 0) {
  fail(`No token-inventory entries found in ${designPath} — refusing vacuous pass`);
}

// --- verify -----------------------------------------------------------------
const checkers = {
  "theme.export": (id) => themeExports.has(id),
  "palette.key": (id) => paletteKeys.has(id),
  "css.var": (id) => cssDefined.has(id),
  "css.font-ref": (id) => cssReferenced.has(id),
  utility: (id) => cssClasses.has(id),
  keyframe: (id) => cssKeyframes.has(id),
  "tw.theme": (id) => cssDefined.has(`--${id}`),
};

const seen = new Set();
const unknown = [];
for (const { kind, id } of documented) {
  const key = `${kind}:${id}`;
  if (seen.has(key)) continue;
  seen.add(key);
  if (!checkers[kind](id)) unknown.push({ kind, id });
}

const result = {
  ok: unknown.length === 0,
  design: designPath,
  checked: seen.size,
  unknown,
  liveCounts: {
    themeExports: themeExports.size,
    paletteKeys: paletteKeys.size,
    cssDefinedVars: cssDefined.size,
    cssReferencedVars: cssReferenced.size,
    utilityClasses: cssClasses.size,
    keyframes: cssKeyframes.size,
  },
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.ok) {
  console.log(`✓ Design system OK — ${seen.size} documented tokens verified against theme.ts + globals.css`);
} else {
  console.error(`✗ ${unknown.length} unknown token(s) in ${designPath}:`);
  for (const u of unknown) console.error(`  UNKNOWN [${u.kind}] ${u.id}`);
}
process.exit(result.ok ? 0 : 1);
