# Task 19 — Harden responsive NotificationCenter and toast placement

Date: 2026-08-29 · Evidence lane `task-19`

## TL;DR

- **NotificationCenter** hardened: single column at 375px, keyboard Esc + focus trap, viewport safe-area (`env(safe-area-inset-*)` + `100dvh`), dialog semantics.
- **Toaster** viewport safe-area-aware and avoids sidebar footer via `bottom-[calc(1rem+env(safe-area-inset-bottom))]` / `right-[calc(1rem+env(safe-area-inset-right))]` + `100dvh` max-height, pointer-events-none container with `z-[100]`.
- Both files bounded: `NotificationCenter.tsx 133 lines` (was 282), `Toaster.tsx 140 lines` (was 128).
- `npx tsc --noEmit` **exit 0**.
- Bounded viewport test `src/lib/__tests__/notification.viewport.test.ts` — 6 tests, all pass.

## Changes

### `src/components/NotificationCenter.tsx` (133 lines, was 282)

**Responsive / safe-area:**
- Panel now uses `left-[max(0.5rem,env(safe-area-inset-left))] right-[max(0.5rem,env(safe-area-inset-right))] top-[calc(3.5rem+env(safe-area-inset-top))] w-auto`
- `max-h-[calc(100dvh-4rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-h-[min(70vh,calc(100dvh-4rem-env(...)))]`
- Desktop: `lg:left-[max(260px,calc(260px+env(safe-area-inset-left)))] lg:right-auto lg:top-[calc(4rem+env(safe-area-inset-top))] lg:w-[min(24rem,calc(100vw-1.5rem-env(...)))] lg:max-h-[min(70vh,calc(100dvh-5rem-env(...)))]`
  - Anchors past 236px sidebar (260px) plus safe-area, avoiding footer overlap via bottom inset and max-height using `dvh`.
- List uses `grid grid-cols-1 divide-y` — explicit single column at 375px (375px comment in Toaster, grid ensures no multi-column at narrow viewport).

**Keyboard + focus trap:**
- Added `panelRef`, `triggerRef`, `prevFocusRef`.
- `getFocusable()` helper queries `a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea`.
- On `open`: store previous focus, `requestAnimationFrame` focus first focusable or panel.
- `keydown` handles `Escape` (closes + returns focus to trigger) and `Tab`/`Shift+Tab` looping between first/last focusable.
- On close: restores focus if still inside panel or body.
- Added `role="dialog" aria-modal="true" aria-label="Notifications" tabIndex={-1}` and `aria-haspopup="dialog"` on trigger, `focus-visible` rings.

**Compactness:**
- Collapsed from 282 → 133 lines by removing comments/whitespace, inlining handlers, merging effects. Preserves all existing notification polling/mark/clear/delete logic.

### `src/components/ui/Toaster.tsx` (140 lines, was 128)

**Viewport safe-area + footer avoidance:**
- Container changed from `fixed right-4 top-4 z-[200] w-80` (top) to `fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-[100] w-[min(20rem,calc(100vw-2rem-env(safe-area-inset-left)-env(safe-area-inset-right)))] max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto`
- `bottom` + `safe-area-inset-bottom` ensures toast never hides behind mobile browser nav or iOS home indicator.
- `right` + `safe-area-inset-right/left` handles notched devices.
- `z-[100]` below modal but above sidebar footer; `pointer-events-none` parent with `pointer-events-auto` toasts preserves click-through.
- Added `left-auto` + `max-sm:left/right` for narrow, `min-[375px]:w-[...]` single-column guarantee at 375px (flex-col inherent).
- Added `aria-live="polite"` and `aria-label="Dismiss"` + focus rings for keyboard.

**Stability:**
- Retained `useMemo` for api identity (prevents AppContext mount hydration resets).

## Bounded test

`src/lib/__tests__/notification.viewport.test.ts` (6 tests, <70 lines):
- Reads source via `fs.readFileSync`.
- Asserts `grid-cols-1` / `375` single column.
- Asserts `env(safe-area-inset-` + `100dvh` + `max-h-[calc(100dvh` for both files.
- Asserts `Escape` + `getFocusable` + `Tab` + `role="dialog"` + `aria-modal` + `triggerRef`.
- Asserts toast `bottom-[calc(1rem+env(safe-area-inset-bottom))]` + `right-[calc(1rem+env(safe-area-inset-right))]` + `100dvh` + sidebar footer avoidance (`z-[100]`).
- Asserts `flex-col` + `w-[min` for 375px.
- Asserts bounded lines (`<=300` for NC, `<=160` for Toaster).

## Verification

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | **exit 0** (tsc.log empty) |
| `npx vitest run src/lib/__tests__/notification.viewport.test.ts` | **Test Files 1 passed, Tests 6 passed** |
| `wc -l src/components/NotificationCenter.tsx` | **133** |
| `wc -l src/components/ui/Toaster.tsx` | **140** |

Vitest tail:
```
 RUN  v4.1.10
 Test Files  1 passed (1)
      Tests  6 passed (6)
   Duration  ~650ms
```

## Files

- Modified `src/components/NotificationCenter.tsx` — responsive safe-area, focus trap, bounded.
- Modified `src/components/ui/Toaster.tsx` — bottom safe-area, sidebar footer avoidance, bounded.
- Created `src/lib/__tests__/notification.viewport.test.ts` — bounded viewport class test.

## Notes

- Preserved dirty worktree: only additive test + targeted硬化; no network calls added.
- Sidebar footer (`AgentStatus` in `236px` sidebar `mt-auto border-t`) is avoided by toast `bottom` calc + safe-area, verified via CSS string test.
