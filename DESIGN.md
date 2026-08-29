# HUNTFLOW Design System

Codified from the live implementation (`src/lib/theme.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/*`). This document distinguishes observed conventions from the located exceptions under **Accepted Design Debt**. The shared palette flows through semantic tokens, shared primitives generally compose with `cn()` (`@/lib/utils` = `twMerge(clsx(...))`), DOM-ref primitives use `forwardRef` where needed, and lucide-react is the primary icon set. `rawPalette`/`:root` are the canonical literal-color sources; the Resume Studio document preview intentionally uses local paper colors, and remaining legacy raw-palette use is recorded as debt rather than presented as compliant.

Machine-checkable token identifiers appear in `token-inventory` fences below. `node scripts/validate-design-system.mjs` verifies every documented identifier against the live sources and fails naming any unknown token.

## 1. Product Design Principles

- **Command-center, not consumer app.** Dark ink surfaces, chartreuse signal color, mono data labels, uppercase tracking kickers. The UI reads as an operator console for a supervised job-search pipeline.
- **Local-first trust surface.** Trust-critical AI and agent-status surfaces expose provenance: `AIStatusBadge` distinguishes "Live AI" from "Deterministic rules", and the sidebar agent dot shows Scrapling online/offline. New trust-critical surfaces must not hide provenance.
- **Supervised automation.** Agent progress surfaces render visible stages/timelines with terminal outcome strips; the interaction contract requires explicit in-place confirmation for destructive or external actions.
- **Evidence over decoration.** Telemetry, counts, run IDs, and timestamps are first-class content (mono font, tabular numerals), not chrome.
- **One accent does the work.** Chartreuse is the primary active/success/signal accent; amber/coral/sky/violet are reserved semantic channels (warning/error/info/review). The global stylesheet adds two fixed body radial washes; `.laser-text` is a chartreuse-to-bright treatment scoped to the HUNTFLOW wordmark, and `.skeleton` is a stateful loading sweep. Feature-local gradients are implementation details, not automatically reusable design tokens.
- **Density with breathing room.** Compact text sizes (xs/sm) inside generously padded cards (`p-5`) separated by `space-y-4`–`space-y-6`; never cramped rows on dark backgrounds.

## 2. Semantic Color Tokens

Single source of truth: `src/lib/theme.ts` exports `rawPalette` (literal hex, for contexts that cannot resolve CSS variables such as canvas-confetti), `palette` (same keys mapped to `var(--kebab-case)` references), helper `tint(color, alpha)` → `color-mix(in srgb, … transparent)`, and type `PaletteKey`. `globals.css` mirrors every palette key as a `:root` custom property and re-exposes them through Tailwind 4's `@theme inline` as `--color-*` entries, so utilities like `bg-chartreuse`, `text-paper`, `border-line`, `text-dim` resolve to the same values. Keep both files in sync. This is the canonical palette contract, not a claim that the current tree contains no scoped document-simulation colors or legacy deviations.

| Role | Token | Notes |
| --- | --- | --- |
| App background / deepest layer | `ink`, `ink-deep` | body background is `var(--ink)` |
| Raised surfaces | `ink-soft`, `ink-card`, `ink-console`, `ink-leaf` | cards, menus, terminal panels |
| Primary text | `paper` | body color |
| Secondary text | `paper-dim` (aliased `dim`) | `.text-dim` / `text-dim` utilities |
| Signal accent (active/success/brand) | `chartreuse`, `chartreuse-bright` | CTAs, active nav, focus ring, selection |
| Warning | `amber` | warning kinds, manual-required states |
| Error/destructive | `coral` | danger buttons, rejected status, errors |
| Info/link | `sky` | info kind, "View details" links |
| Review/AI reasoning | `violet` | agent reasoning, review notifications, applied status |
| Hairline border | `line` | default card/divider border |
| Brand exception | `linkedin` | LinkedIn-specific surfaces only |

Status channel mapping (`StatusBadge.statusConfig`): wishlist→sky, applied→violet, interviewing→amber, offer→chartreuse, rejected→coral — each rendered as `bg-<c>/10 border-<c>/25 text-<c>` pill with an `h-1.5 w-1.5` solid dot. Notification kinds reuse the same channels plus violet for review. Score thresholds (`scoreColor`): ≥85 chartreuse, ≥70 amber, else coral.

Elevation/shadow tokens: `--glow` (24px chartreuse 30%), `--glow-strong` (40px chartreuse 45%), `--shadow-float` (32px black 35%).

```token-inventory
theme.export:rawPalette
theme.export:palette
theme.export:tint
theme.export:PaletteKey
palette.key:ink
palette.key:inkSoft
palette.key:inkCard
palette.key:inkDeep
palette.key:inkConsole
palette.key:inkLeaf
palette.key:paper
palette.key:paperDim
palette.key:chartreuse
palette.key:chartreuseBright
palette.key:amber
palette.key:coral
palette.key:sky
palette.key:violet
palette.key:linkedin
css.var:--ink
css.var:--ink-soft
css.var:--ink-card
css.var:--ink-deep
css.var:--ink-console
css.var:--ink-leaf
css.var:--paper
css.var:--paper-dim
css.var:--chartreuse
css.var:--chartreuse-bright
css.var:--amber
css.var:--coral
css.var:--sky
css.var:--violet
css.var:--linkedin
css.var:--line
css.var:--glow
css.var:--glow-strong
css.var:--shadow-float
tw.theme:color-background
tw.theme:color-foreground
tw.theme:color-ink
tw.theme:color-ink-soft
tw.theme:color-ink-card
tw.theme:color-ink-deep
tw.theme:color-ink-console
tw.theme:color-ink-leaf
tw.theme:color-paper
tw.theme:color-paper-dim
tw.theme:color-chartreuse
tw.theme:color-chartreuse-bright
tw.theme:color-amber
tw.theme:color-coral
tw.theme:color-sky
tw.theme:color-violet
tw.theme:color-line
tw.theme:color-linkedin
tw.theme:color-dim
```

## 3. Typography & Type Scale

Fonts load once in `src/app/layout.tsx` via `next/font/google` and surface as CSS variables: **Manrope** (`--font-manrope`; sans + display), **JetBrains Mono** (`--font-jetbrains`; data/metadata), **STIX Two Text** (`--font-document`; resume paper serif). Tailwind aliases: `--font-sans`/`--font-display` → Manrope, `--font-mono` → JetBrains Mono. Resume previews use `.document-paper` (falls back to Latin Modern Roman) or `.document-paper-sans`; the exported LaTeX PDF remains the typography source of truth.

| Level | Classes | Usage |
| --- | --- | --- |
| Kicker/eyebrow | `text-[10px] font-semibold uppercase tracking-[0.18em] text-dim` (brand uses `tracking-[0.22em]`) | section labels |
| Micro mono label | `text-[9px]`–`text-[10px] font-mono`, often `uppercase tracking-wider` / `tabular-nums` | metadata, run IDs, badges |
| Small | `text-xs` (+ `leading-relaxed` for prose) | list bodies, descriptions, toast text |
| Body | `text-sm font-medium/semibold` | nav items, card titles, md/lg buttons |
| Heading | `text-lg font-bold` / `text-xl`+ | page/section titles |
| Display | `font-display`; optional `laser-text` gradient | HUNTFLOW wordmark only for the gradient treatment |

`.markdown-body` fixes agent/markdown prose at `0.875rem` / 1.75 line-height with chartreuse headings and `▸` bullets.

```token-inventory
css.var:--font-sans
css.var:--font-display
css.var:--font-mono
css.font-ref:--font-manrope
css.font-ref:--font-document
css.font-ref:--font-jetbrains
utility:text-dim
utility:laser-text
utility:document-paper
utility:document-paper-sans
utility:markdown-body
```

## 4. Spacing, Layout & Breakpoints

**App shell & scroll ownership (normative).** `html, body { height: 100% }`; `body` is `min-h-full` and owns the **only app-shell-level scroll** — pages normally scroll with the document rather than an inner page-scroll container. The desktop sidebar (`aside`, `fixed inset-y-0 left-0 w-[236px] z-40`, hidden below `lg`) stays pinned while the document scrolls; `main` offsets it with `lg:pl-[236px]` and centers content in `mx-auto max-w-[1400px] px-4 py-6 sm:px-8 lg:px-10`. The mobile top bar is `sticky top-0 z-40` (below `lg`) with horizontal icon nav. Representative nested owners include the sidebar nav column (`overflow-y-auto`), NotificationCenter dropdown (`max-h-[70vh] overflow-y-auto`), Select menus (`max-h-64 overflow-auto`), JobDetailView drawer subpanel (`flex-1 overflow-y-auto`), agent timeline (`max-h-56 overflow-y-auto`), and Resume Studio preview pane (`overflow-auto`). This list is descriptive, not exhaustive: feature-level panels may own local overflow, but each panel must name one owner and must not introduce another app-shell/document scroll container.

Spacing rhythm: Tailwind 4 default scale — card padding `p-5` (sections) / `p-3.5` (compact cards), grid gaps `gap-2`/`gap-3`, vertical flow `space-y-4`–`space-y-6`, control heights `h-10` (form inputs) / `h-9` (icon buttons).

Breakpoints (Tailwind defaults, no overrides): `sm` 640px, `md` 768px, `lg` 1024px (sidebar appears; mobile bar disappears), `xl` 1280px. Common content grids step `grid-cols-1 → sm:grid-cols-2 → lg:grid-cols-3` where the content density supports three columns.

**Required QA viewports:** **375×812** (phone: mobile top bar, single column, sheet overlays anchored `left-2 right-2 top-14`), **768×1024** (tablet portrait: still the mobile shell — the sidebar requires `lg`, so verify sticky bar + 2-col grids), **1280×800** (desktop: fixed 236px sidebar, `max-w-[1400px]` canvas, overlay anchoring past the rail at `lg:left-[260px] lg:top-16`).

## 5. Depth, Borders & Radii

- **Borders:** `border-line` hairlines are the default on dark app surfaces; accent borders are alpha steps of the channel color (`chartreuse/25`–`/50`, `coral/25`, `violet/20`–`/30`).
- **Surface ladder:** transparent → `bg-white/[0.02]` → `bg-white/[0.03]` (inputs/triggers) → `bg-white/[0.05]` (hover/active) → `bg-white/[0.06]` (segmented-control active) → `bg-black/10`–`/40` (inset wells) → `.glass` → `.card`.
- **`.glass`:** `color-mix(ink-card 72%, transparent)` + `backdrop-blur(14px)` + `border-line` — floating layers (toasts).
- **`.card`:** `1rem` radius, `border-line`, `color-mix(ink-card 70%, transparent)`; hover lifts border toward `chartreuse/26` plus `0 12px 36px black/22%`.
- **Radii scale:** `rounded-lg` (sm buttons, tabs, inputs, chips) → `rounded-xl` (md/lg buttons, cards, tiles, timeline panels) → `rounded-2xl` (page sections, notification panel) → `rounded-full` (status pills, badges, dots).
- **Shadows:** token glows for the primary CTA (`shadow-[var(--glow)]`); `shadow-2xl` for floating overlays (menus, toasts, drawer). Resume Studio is a scoped document-simulation island whose paper, neutral borders, status colors, and deep black-alpha shadows are intentionally local; those values are not reusable app-surface tokens.

```token-inventory
utility:glass
utility:card
```

## 6. Motion & Interaction States

CSS keyframes (`globals.css`): `fadeUp` (12px rise, 0.5s `cubic-bezier(0.22,1,0.36,1)`), `pulseDot` (1.6s ease-in-out infinite presence pulse), `shimmer` (1.4s skeleton sweep). Utilities: `.animate-fade-up`, `.animate-pulse-dot`, `.stagger` (children delayed 0.02s→0.3s), `.skeleton`.

Framer Motion conventions: route transitions in `PageShell` (`mode="wait"`, y 12→0→−8, 0.25s `[0.22,1,0.36,1]`); shared-layout active pills via `layoutId` springs (stiffness 350–400, damping 26–32); toasts spring 380/28 sliding from x:60 / scale 0.95; micro-reveals y 6–8 over 0.15–0.18s; sidebar hover nudge x:3.

Common interaction states: hover brightens a border toward `chartreuse/50` or steps the background up one white-alpha level; focus-visible starts from the global `outline: 2px solid chartreuse@60%, offset 2px, radius 4px` (components may add `focus-visible:ring-2 ring-chartreuse/60`). Shared `Button` uses `scale-[0.97]` when active and `opacity-50 pointer-events-none` plus an inline spinner while disabled/loading; `Select` rotates its chevron 180° while open. These are component-specific observations, not guarantees for every control in the tree.

```token-inventory
keyframe:fadeUp
keyframe:pulseDot
keyframe:shimmer
utility:animate-fade-up
utility:animate-pulse-dot
utility:stagger
utility:skeleton
```

## 7. Accessibility, Focus & Safe Areas

- Global `:focus-visible` supplies the default chartreuse ring (60%, 2px, offset 2px). Mobile nav links and the notification bell have explicit accessible names; this baseline does not prove that every icon-only control is named, and the located gaps remain debt below.
- `Select` is a custom listbox-shaped disclosure: its trigger exposes `aria-haspopup="listbox"` and `aria-expanded`; its menu/options use `role="listbox"`, `role="option"`, and `aria-selected`; Escape and outside `mousedown` close it. It has no full-screen click-catcher and does not yet implement the complete APG keyboard/focus model.
- `NotificationCenter` is a bell-triggered popover, **not** a listbox: the trigger exposes `aria-label="Notifications"` and `aria-expanded`; Escape, outside `mousedown`, and an `aria-hidden` full-screen click-catcher close it. Its All/Unread controls are ordinary filter buttons rather than semantic tabs, and focus entry/return is not managed yet.
- `prefers-reduced-motion: reduce` collapses CSS animation and transition durations to 0.01ms. That rule does not by itself prove that JavaScript-driven Framer Motion transforms honor the preference; the missing shared reduced-motion policy is recorded below.
- `::selection` is chartreuse-on-ink; thin themed scrollbars keep long lists legible without layout shift.
- Small-screen overlay positioning provides viewport gutters, not device safe-area handling: sheets inset `left-2 right-2`, toasts clamp width to `min(20rem, calc(100vw - 2rem))`, and mobile nav scrolls within `max-w-[calc(100vw-12rem)]`. Content sits below the sticky mobile bar (`top-14`) and beside the fixed desktop rail (`lg:left-[260px]`), but no `env(safe-area-inset-*)` offsets exist today.
- Language (`lang="en"`), semantic landmarks (`aside`/`header`/`main`/`nav`), and `title` tooltips on provenance badges are part of the contract.

## 8. Reusable Component Contracts

The contracts below are descriptive snapshots of the named files. New work extends them rather than inventing parallel patterns. Target baseline: isolate hooks/motion in `"use client"` leaves, use `cn()` for composed classes, prefer lucide-react icons at `h-3 w-3`–`h-5 w-5`, use semantic app tokens, and merge `className` last on primitives that expose it. Located departures and missing interaction semantics are explicit debt, not hidden exceptions.

### SourceFilter (pattern of record: Discovery Control filter block, `src/app/(app)/jobs/page.tsx`)
Controlled multi-select source picker. Contract: kicker row ("Sources in this view" + mono selected-count); toggle buttons in `grid gap-2 sm:grid-cols-2 lg:grid-cols-3`; each toggle is a left-aligned `<button>` with `CircleCheck` when selected (`border-chartreuse/40 bg-chartreuse/5`) vs `CircleX` when not (`border-line bg-black/10 opacity-65 hover:opacity-100`), truncated name + mono uppercase meta line, `title` tooltip; empty state `text-xs text-dim` explaining the offline condition; companion filters are native `<select>` styled `h-10 rounded-xl border-line bg-ink px-3 text-sm`; primary action is `Button` with `Play` icon and `loading` bound to the async run. Selection state lives in the parent (`Set` of ids) — the filter is presentational.

### AgentTimeline (pattern of record: reasoning panel, `src/components/agent/AgentRunMonitor.tsx`)
Append-only decision log. Contract: violet-tinted panel (`border-violet/25 bg-violet/[0.04]`, header row `border-b border-violet/20`); header is mono uppercase `tracking-[0.2em]` label + count pill (`rounded-full border-violet/30 bg-violet/10 font-mono text-[9px]`); body `max-h-56 space-y-2 overflow-y-auto` with auto-scroll pinned to bottom (`ref.scrollTop = scrollHeight` on append); rows = mono `tabular-nums` timestamp + `BrainCircuit` violet icon + `text-xs leading-relaxed` message, revealed via `AnimatePresence initial={false}` y:6 / 0.18s; empty-state hint differs for running vs idle. The component scrolls rather than visually truncating the history it receives.

### DetailTabs (pattern of record: tab bars, `src/components/JobDetailView.tsx`)
Icon+label view switcher backed by exported `JobDetailTab` and `JOB_DETAIL_TABS` definitions; `initialTab` seeds local state and `onTabChange` observes selection. Drawer mode uses a horizontal overflow strip, an active `motion.span layoutId="drawer-tab-pill"` spring (400/32), and `AnimatePresence mode="wait"` for y 8→0→−8 panel swaps. Page mode uses a wrapping button group with a static chartreuse active treatment and `aria-pressed`; it does not use the sliding pill or animated panel swap. Both modes gate which subpanel renders and do not own data fetching. They are currently button-group view switchers rather than complete ARIA tabs; the missing `tablist`/`tab`/`tabpanel` relationships and arrow-key model are debt below.

### PdfPreview (pattern of record: Resume Studio preview pane, `src/app/(app)/resume/page.tsx`)
The scoped document-simulation light-mode island: previewing physical A4 justifies local `#dfe3df`, white/off-white paper, neutral text, document status colors, and black-alpha borders/shadows. These values model the artifact and are not a waiver for raw colors in app chrome. Contract: `select-text` is enabled, the preview pane owns `overflow-auto`, and mobile visibility follows `mobileTab === "preview"` (`hidden lg:flex` otherwise); toolbar buttons reuse `Button` (`variant="outline"`/`"ghost"`) with local paper-surface overrides; a disclaimer states the web preview approximates the template font and the exported PDF is the typography source of truth; compiled output renders in a `data-testid="compiled-pdf"` section with Download link and an amber "stale — recompile" pill whenever live TeX diverges from the compiled snapshot; zoom controls operate on the container ref; diff/SyncTeX affordances pin baselines and highlight changed sections rather than mutating the document silently.

### NotificationPanel (pattern of record: `src/components/NotificationCenter.tsx`)
Bell-triggered popover, distinct from `Select` and not modeled as a listbox. Contract: trigger is an `h-9 w-9 rounded-lg` icon button (`aria-label="Notifications"`, `aria-expanded`) with unread badge (`bg-chartreuse text-black font-mono text-[9px] font-bold rounded-full h-4 w-4`, capped at "9+"); panel is `fixed z-50 max-h-[70vh] overflow-y-auto rounded-2xl border-line bg-ink-card shadow-2xl backdrop-blur-xl`, anchored sheet-style below `lg` (`left-2 right-2 top-14`) and rail-aware at `lg+` (`lg:left-[260px] lg:right-auto lg:top-16 lg:w-[min(24rem,calc(100vw-1.5rem))]`); header holds title + "Mark all read"/clear actions; All/Unread are ordinary filter buttons with `bg-white/10 text-paper` when active and `text-dim hover:text-paper` otherwise; list rows `divide-y divide-line/40`, unread rows tinted `bg-chartreuse/[0.02]`, each with a kind chip from the fixed map info/success/warning/error/review → sky/chartreuse/amber/coral/violet (`bg-<c>/10 border-<c>/30` square-chip + icon); row actions update optimistically and report API failure through `toastError`; outside `mousedown`, Escape, and the click-catcher close the panel; data polls every 10s with cleanup. Focus management and several icon-button names remain debt below.

### ToastViewport (pattern of record: `src/components/ui/Toaster.tsx`)
Context-driven toast stack. Contract: `ToasterProvider` mounts once in the root layout wrapping `AppProvider`; consumers call `useToast()` → `{ toast(kind, message), success, error, info, warn, celebrate }`; the context value MUST stay referentially stable (`useMemo`) — a fresh object per toast re-fires effects keyed on toast callbacks and resets in-flight optimistic state; kinds success/error/info/warning map to `CheckCircle2`/`XCircle`/`Info`/`AlertTriangle` colored chartreuse/coral/sky/amber; viewport is `fixed bottom-4 right-4 z-[100] pointer-events-none flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2`; cards are `.glass rounded-xl p-3.5 shadow-2xl pointer-events-auto` with icon + `text-xs leading-relaxed` message + dismiss `X`; entry/exit via `AnimatePresence` spring (380/28) sliding x:60 / scale 0.95; stack keeps at most 4 (`slice(-3)` before append); auto-dismiss after 4200ms plus manual dismiss; `celebrate()` lazy-loads canvas-confetti using `rawPalette` colors (the documented reason `rawPalette` exists).

### Accepted Design Debt

“Accepted” here means explicitly located and intentionally not changed by this extraction-only task; it is not a WCAG pass, a permanent waiver, or permission to repeat the pattern. Accessibility-significant rows remain open until product code is fixed and reverified.

| Debt | Location / current evidence | Affected users / risk | Remediation | Status |
| --- | --- | --- | --- | --- |
| Legacy raw palette outside the document island | `src/components/ui/AIStatusBadge.tsx` uses `emerald-*`, `amber-*`, and a raw emerald glow. Resume Studio's local paper palette is the intentional scoped exception described above. | Maintainers and users of future themes/high-contrast modes may see drift or unreviewed contrast. | Map badge states to semantic chartreuse/amber tokens and a declared glow; keep paper colors scoped to the preview. | Open design-system debt; deferred by the no-product-code scope. |
| Viewport gutters are not device safe areas | `NotificationCenter`, `ToastViewport`, and the mobile header use fixed Tailwind offsets; the source tree has no `env(safe-area-inset-*)`. | Users on notched, rounded-corner, standalone, or home-indicator devices may see controls too close to occluded edges. | Add logical safe-area offsets with viewport-gutter fallbacks, then verify 375px portrait/landscape and standalone display modes. | Open adaptive-layout debt; current gutters mitigate common browser viewports only. |
| Unnamed icon-only actions | Notification clear/delete controls and the toast dismiss `X` do not all expose stable accessible names. | Screen-reader and voice-control users cannot reliably discover or target the actions. | Add explicit `aria-label` values and verify accessible names plus keyboard activation. | Open accessibility debt; blocks an accessibility sign-off for these controls. |
| Incomplete custom Select keyboard/focus model | `src/components/ui/Select.tsx` exposes listbox/option roles but only click selection, Escape, and outside-click dismissal; it has no roving focus, arrow/Home/End handling, `aria-activedescendant`, or `aria-controls`. | Keyboard and screen-reader users receive listbox semantics without the expected navigation model. | Implement the APG select/listbox interaction model and restore focus to the trigger on close. | Open accessibility debt; existing mouse behavior is documented, not generalized. |
| Notification popover focus lifecycle | `NotificationCenter` closes on Escape/outside/click-catcher but does not move focus into the popover, trap it where appropriate, or explicitly return it to the bell. | Keyboard and screen-reader users can lose context when opening or closing the panel. | Define popover/dialog semantics, initial focus, close-button naming, and trigger focus return. | Open accessibility debt; distinct from the Select listbox debt. |
| Detail view switchers are not semantic tabs | Drawer buttons have the animated pill but no tab roles; page buttons expose `aria-pressed`; neither mode links `tablist`/`tab`/`tabpanel` or implements arrow-key tab navigation. | Keyboard and screen-reader users encounter inconsistent view-switcher semantics. | Choose one tabs contract for both modes, wire ids/relationships/selection, and implement orientation-appropriate arrow navigation. | Open accessibility debt; current click behavior remains supported. |
| CSS reduced-motion rule does not govern Framer Motion | Many routes/components import `framer-motion` directly; no shared `MotionConfig`/`useReducedMotion` policy is present, so inline transform/spring motion is not proven to honor `prefers-reduced-motion`. Full-package imports are also flagged by the current React diagnostics. | Motion-sensitive users may still receive route, pill, toast, or reveal motion; repeated imports add performance-review debt. | Add a shared reduced-motion policy, replace motion with immediate state changes when requested, then audit import strategy and rerun React/browser diagnostics. | Open motion-accessibility and performance debt; CSS animations alone are reduced today. |
